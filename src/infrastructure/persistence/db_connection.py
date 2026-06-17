"""
MongoDB connection with pool tuning and retries.
Single client per process; use get_db_dla() / get_fs() for access.
"""

import gridfs
from pymongo import MongoClient

from infrastructure.config.config import config

_client: MongoClient | None = None
_db_dla = None
_fs_medias = None


def get_mongo_client() -> MongoClient:
    """Return the singleton MongoClient (creates on first call)."""
    global _client
    if _client is None:
        _client = MongoClient(
            config.mongodb_url,
            maxPoolSize=config.mongodb_max_pool_size,
            minPoolSize=config.mongodb_min_pool_size,
            serverSelectionTimeoutMS=config.mongodb_server_selection_timeout_ms,
            retryWrites=config.mongodb_retry_writes,
        )
    return _client


def get_db_dla():
    """Return the main app database (datalabellingapp)."""
    global _db_dla
    if _db_dla is None:
        client = get_mongo_client()
        _db_dla = client[config.mongodb_db_name]
    return _db_dla


def get_fs():
    """Return GridFS for medias (database 'medias')."""
    global _fs_medias
    if _fs_medias is None:
        client = get_mongo_client()
        _fs_medias = gridfs.GridFS(client[config.mongodb_medias_db])
    return _fs_medias


def ensure_indexes(db=None):
    """
    Create indexes required for performance. Safe to call on every startup.
    Pass db or use get_db_dla().
    """
    if db is None:
        db = get_db_dla()

    # Users: login and lookups
    db.users.create_index("email", unique=True)
    db.users.create_index("role")
    db.users.create_index("classes")
    db.users.create_index("class_id")

    # Datasets: lookups by user and type
    db.datasets.create_index("task_type")
    db.datasets.create_index("user_id")

    # Media: list by dataset, lookup by file_id
    db.media.create_index("dataset_id")
    db.media.create_index("file_id")
    db.media.create_index([("dataset_id", 1), ("media_name", 1)])
    db.media.create_index([("dataset_id", 1), ("file_id", 1)])

    # COCO annotations (detection)
    db.coco_annotations.create_index("dataset_id")
    db.coco_annotations.create_index("file_id")
    db.coco_annotations.create_index([("dataset_id", 1), ("file_id", 1)])

    # YOLO segmentations
    db.yolo_segmentations.create_index("dataset_id")
    db.yolo_segmentations.create_index("file_id")
    db.yolo_segmentations.create_index([("dataset_id", 1), ("file_id", 1)])

    # Labelled (classification)
    db.labelled.create_index("dataset_id")
    db.labelled.create_index("file_id")
    db.labelled.create_index("filename")
    db.labelled.create_index([("dataset_id", 1), ("file_id", 1)])
    db.labelled.create_index([("dataset_id", 1), ("filename", 1)])

    # Exercises
    db.exercises.create_index("class")
    db.exercises.create_index("dataset")
    db.exercises.create_index("user_id")
    db.exercises.create_index([("class", 1), ("dataset", 1)])

    # Submissions
    db.exercises_submissions.create_index("exerciseId")
    db.exercises_submissions.create_index("userId")
    db.exercises_submissions.create_index(
        [("exerciseId", 1), ("userId", 1)], unique=True
    )

    # Reports
    db.reports.create_index("exercise_id")
    db.reports.create_index("user_id")

    # Actions (audit log)
    db.user_actions.create_index("user_id")
    db.user_actions.create_index([("user_id", 1), ("created_at", -1)])

    # Classes
    db.classes.create_index("code", unique=True, sparse=True)

    return db


def ping_mongodb() -> bool:
    """Return True if MongoDB is reachable."""
    try:
        get_mongo_client().admin.command("ping")
        return True
    except Exception:
        return False
