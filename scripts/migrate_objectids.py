#!/usr/bin/env python3
"""
Migration script to convert string IDs to ObjectId in MongoDB.
Safe to run multiple times (idempotent).

This script converts reference fields from string to ObjectId:
- datasets.user_id
- media.dataset_id, media.insert_user
- labelled.dataset_id, labelled.update_user
- coco_annotations.dataset_id, coco_annotations.update_user
- yolo_segmentations.dataset_id, yolo_segmentations.update_user
- exercises.class, exercises.dataset, exercises.user_id
- exercises_submissions.exerciseId, exercises_submissions.userId
- user_actions.user_id
- kaggle_credentials.user_id
"""

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT / "src"))

from bson import ObjectId

from infrastructure.persistence.db_connection import get_db_dla


def is_valid_objectid_string(value):
    """Check if value is a 24-char hex string (valid ObjectId format)."""
    if not isinstance(value, str):
        return False
    if len(value) != 24:
        return False
    try:
        ObjectId(value)
        return True
    except Exception:
        return False


def migrate_field(db, collection_name: str, field: str):
    """Convert a field from string to ObjectId where applicable."""
    collection = db[collection_name]

    # Find documents where field is a string (not ObjectId)
    query = {
        field: {"$exists": True, "$type": "string"}
    }

    count = 0
    for doc in collection.find(query):
        value = doc.get(field)
        if is_valid_objectid_string(value):
            collection.update_one(
                {"_id": doc["_id"]},
                {"$set": {field: ObjectId(value)}}
            )
            count += 1

    if count > 0:
        print(f"  {collection_name}.{field}: converted {count} documents")
    return count


def migrate_array_field(db, collection_name: str, field: str):
    """Convert array elements from string to ObjectId."""
    collection = db[collection_name]

    count = 0
    for doc in collection.find({field: {"$exists": True, "$type": "array"}}):
        arr = doc.get(field, [])
        new_arr = []
        changed = False
        for item in arr:
            if is_valid_objectid_string(item):
                new_arr.append(ObjectId(item))
                changed = True
            else:
                new_arr.append(item)

        if changed:
            collection.update_one(
                {"_id": doc["_id"]},
                {"$set": {field: new_arr}}
            )
            count += 1

    if count > 0:
        print(f"  {collection_name}.{field}[]: converted {count} documents")
    return count


def run_migration():
    """Run all migrations."""
    db = get_db_dla()
    total = 0

    print("Starting ObjectId migration...")

    # datasets
    total += migrate_field(db, "datasets", "user_id")

    # media
    total += migrate_field(db, "media", "dataset_id")
    total += migrate_field(db, "media", "insert_user")

    # labelled (classification)
    total += migrate_field(db, "labelled", "dataset_id")
    total += migrate_field(db, "labelled", "update_user")

    # coco_annotations (detection)
    total += migrate_field(db, "coco_annotations", "dataset_id")
    total += migrate_field(db, "coco_annotations", "update_user")

    # yolo_segmentations
    total += migrate_field(db, "yolo_segmentations", "dataset_id")
    total += migrate_field(db, "yolo_segmentations", "update_user")

    # exercises
    total += migrate_field(db, "exercises", "class")
    total += migrate_field(db, "exercises", "dataset")
    total += migrate_field(db, "exercises", "user_id")
    total += migrate_array_field(db, "exercises", "supervised_practice")
    total += migrate_array_field(db, "exercises", "unsupervised_practice")

    # exercises_submissions
    total += migrate_field(db, "exercises_submissions", "exerciseId")
    total += migrate_field(db, "exercises_submissions", "userId")

    # user_actions
    total += migrate_field(db, "user_actions", "user_id")

    # kaggle_credentials
    total += migrate_field(db, "kaggle_credentials", "user_id")

    # users.classes array and class_id
    total += migrate_array_field(db, "users", "classes")
    total += migrate_field(db, "users", "class_id")

    print(f"Migration complete. Total documents updated: {total}")
    return total


if __name__ == "__main__":
    run_migration()
