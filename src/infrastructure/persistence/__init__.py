"""Persistence: MongoDB, GridFS, ObjectId utilities."""

from infrastructure.persistence.db_connection import (
    ensure_indexes,
    get_db_dla,
    get_fs,
    get_mongo_client,
)
from infrastructure.persistence.object_id_utils import (
    doc_id_to_str,
    doc_to_json_serializable,
    docs_id_to_str,
    docs_to_json_serializable,
    is_valid_object_id,
    to_object_id,
    to_object_id_strict,
)

__all__ = [
    "get_db_dla",
    "get_fs",
    "get_mongo_client",
    "ensure_indexes",
    "to_object_id",
    "to_object_id_strict",
    "is_valid_object_id",
    "doc_id_to_str",
    "docs_id_to_str",
    "doc_to_json_serializable",
    "docs_to_json_serializable",
]
