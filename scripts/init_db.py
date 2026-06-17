#!/usr/bin/env python3
"""
Initialize DB: create indexes for MongoDB collections; migrate ObjectIds;
create S3 bucket when S3 enabled; ensure default admin user when DEFAULT_ADMIN_EMAIL is set.
Run on startup (e.g. docker command) or manually. Safe to run repeatedly.
"""

import os
import sys
from datetime import datetime, timezone
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT / "src"))

from infrastructure.persistence.db_connection import ensure_indexes, get_db_dla


def migrate_objectids(db):
    """Convert string IDs to ObjectId where applicable. Idempotent."""
    from bson import ObjectId

    def is_valid_oid_string(value):
        if not isinstance(value, str) or len(value) != 24:
            return False
        try:
            ObjectId(value)
            return True
        except Exception:
            return False

    def migrate_field(collection_name: str, field: str):
        collection = db[collection_name]
        query = {field: {"$exists": True, "$type": "string"}}
        count = 0
        for doc in collection.find(query):
            value = doc.get(field)
            if is_valid_oid_string(value):
                collection.update_one(
                    {"_id": doc["_id"]}, {"$set": {field: ObjectId(value)}}
                )
                count += 1
        return count

    def migrate_array_field(collection_name: str, field: str):
        collection = db[collection_name]
        count = 0
        for doc in collection.find({field: {"$exists": True, "$type": "array"}}):
            arr = doc.get(field, [])
            new_arr = []
            changed = False
            for item in arr:
                if is_valid_oid_string(item):
                    new_arr.append(ObjectId(item))
                    changed = True
                else:
                    new_arr.append(item)
            if changed:
                collection.update_one({"_id": doc["_id"]}, {"$set": {field: new_arr}})
                count += 1
        return count

    total = 0
    # datasets
    total += migrate_field("datasets", "user_id")
    # media
    total += migrate_field("media", "dataset_id")
    total += migrate_field("media", "insert_user")
    # labelled
    total += migrate_field("labelled", "dataset_id")
    total += migrate_field("labelled", "update_user")
    # coco_annotations
    total += migrate_field("coco_annotations", "dataset_id")
    total += migrate_field("coco_annotations", "update_user")
    # yolo_segmentations
    total += migrate_field("yolo_segmentations", "dataset_id")
    total += migrate_field("yolo_segmentations", "update_user")
    # exercises
    total += migrate_field("exercises", "class")
    total += migrate_field("exercises", "dataset")
    total += migrate_field("exercises", "user_id")
    total += migrate_array_field("exercises", "supervised_practice")
    total += migrate_array_field("exercises", "unsupervised_practice")
    # exercises_submissions
    total += migrate_field("exercises_submissions", "exerciseId")
    total += migrate_field("exercises_submissions", "userId")
    # user_actions
    total += migrate_field("user_actions", "user_id")
    # kaggle_credentials
    total += migrate_field("kaggle_credentials", "user_id")
    # users
    total += migrate_array_field("users", "classes")
    total += migrate_field("users", "class_id")

    if total > 0:
        print(f"ObjectId migration: {total} documents updated.")
    return total


def ensure_versioning(db):
    """Add version field to datasets and annotations that don't have it."""
    now = datetime.now(timezone.utc)
    total = 0

    # Datasets: add version=1 if missing
    result = db.datasets.update_many(
        {"version": {"$exists": False}}, {"$set": {"version": 1, "updated_at": now}}
    )
    total += result.modified_count

    # COCO annotations
    result = db.coco_annotations.update_many(
        {"version": {"$exists": False}}, {"$set": {"version": 1}}
    )
    total += result.modified_count

    # YOLO segmentations
    result = db.yolo_segmentations.update_many(
        {"version": {"$exists": False}}, {"$set": {"version": 1}}
    )
    total += result.modified_count

    # Labelled (classification)
    result = db.labelled.update_many(
        {"version": {"$exists": False}}, {"$set": {"version": 1}}
    )
    total += result.modified_count

    if total > 0:
        print(f"Versioning: {total} documents updated with version=1.")
    return total


def ensure_default_admin():
    """Create default admin user if DEFAULT_ADMIN_EMAIL is set and user does not exist."""
    email = (os.getenv("DEFAULT_ADMIN_EMAIL") or "").strip().lower()
    if not email:
        return
    password = (os.getenv("DEFAULT_ADMIN_PASSWORD") or "").strip()
    if not password:
        print(
            "DEFAULT_ADMIN_EMAIL set but DEFAULT_ADMIN_PASSWORD empty; skipping admin creation."
        )
        return
    name = (os.getenv("DEFAULT_ADMIN_NAME") or "Admin DLA").strip()

    db = get_db_dla()
    if db.users.find_one({"email": email}):
        return

    from application.auth.auth_service import get_password_hash

    now = datetime.now(timezone.utc)
    hashed = get_password_hash(password)
    db.users.insert_one(
        {
            "name": name,
            "email": email,
            "password": hashed,
            "role": "admin",
            "created_at": now,
            "updated_at": now,
            "is_active": True,
        }
    )
    print(f"Default admin user created: {email}")


if __name__ == "__main__":
    try:
        db = get_db_dla()
        ensure_indexes(db)
        print("MongoDB indexes ensured.")
    except Exception as e:
        print(f"init_db error: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        migrate_objectids(db)
    except Exception as e:
        print(f"ObjectId migration (non-fatal): {e}", file=sys.stderr)

    try:
        ensure_versioning(db)
    except Exception as e:
        print(f"Versioning init (non-fatal): {e}", file=sys.stderr)

    try:
        ensure_default_admin()
    except Exception as e:
        print(f"Default admin init (non-fatal): {e}", file=sys.stderr)

    try:
        from infrastructure.config.s3_config import S3_STORAGE_ENABLED

        if S3_STORAGE_ENABLED:
            from infrastructure.storage.s3_storage_impl import ensure_bucket_exists

            ensure_bucket_exists()
            print("S3 bucket ensured.")
    except Exception as e:
        print(f"S3 bucket init (non-fatal): {e}", file=sys.stderr)
