"""
ObjectId utilities for consistent ID handling across the application.

Rules:
- All IDs stored in MongoDB should be ObjectId (not strings)
- API layer receives/returns strings (JSON serialization)
- Conversion happens at repository boundary
"""

from typing import Union

from bson import ObjectId
from bson.errors import InvalidId


def to_object_id(value: Union[str, ObjectId, None]) -> ObjectId | None:
    """
    Convert a value to ObjectId.
    Returns None if value is None or invalid.
    """
    if value is None:
        return None
    if isinstance(value, ObjectId):
        return value
    if isinstance(value, str):
        try:
            return ObjectId(value)
        except (InvalidId, TypeError):
            return None
    return None


def to_object_id_strict(value: Union[str, ObjectId]) -> ObjectId:
    """
    Convert a value to ObjectId.
    Raises ValueError if invalid.
    """
    if isinstance(value, ObjectId):
        return value
    if isinstance(value, str):
        try:
            return ObjectId(value)
        except (InvalidId, TypeError) as e:
            raise ValueError(f"Invalid ObjectId: {value}") from e
    raise ValueError(f"Cannot convert {type(value).__name__} to ObjectId")


def is_valid_object_id(value: Union[str, ObjectId, None]) -> bool:
    """Check if value is a valid ObjectId or can be converted to one."""
    if value is None:
        return False
    if isinstance(value, ObjectId):
        return True
    if isinstance(value, str):
        return ObjectId.is_valid(value)
    return False


def ensure_object_id_in_doc(doc: dict, field: str) -> dict:
    """
    Ensure a field in a document is an ObjectId.
    Modifies doc in place and returns it.
    """
    if field in doc and doc[field] is not None:
        oid = to_object_id(doc[field])
        if oid is not None:
            doc[field] = oid
    return doc


def ensure_object_ids_in_doc(doc: dict, fields: list[str]) -> dict:
    """
    Ensure multiple fields in a document are ObjectIds.
    Modifies doc in place and returns it.
    """
    for field in fields:
        ensure_object_id_in_doc(doc, field)
    return doc


def doc_id_to_str(doc: dict | None) -> dict | None:
    """Convert _id field to string for API response."""
    if doc is None:
        return None
    if "_id" in doc and isinstance(doc["_id"], ObjectId):
        doc["_id"] = str(doc["_id"])
    return doc


def doc_to_json_serializable(doc: dict | None) -> dict | None:
    """
    Convert all ObjectId fields in a document to strings for JSON serialization.
    Handles nested dicts and lists.
    """
    if doc is None:
        return None
    return _convert_objectids_to_str(doc)


def docs_to_json_serializable(docs: list[dict]) -> list[dict]:
    """Convert all ObjectId fields in all docs to strings for JSON serialization."""
    return [_convert_objectids_to_str(doc) for doc in docs]


def _convert_objectids_to_str(obj):
    """Recursively convert ObjectIds to strings."""
    if isinstance(obj, ObjectId):
        return str(obj)
    if isinstance(obj, dict):
        return {k: _convert_objectids_to_str(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_convert_objectids_to_str(item) for item in obj]
    return obj


def docs_id_to_str(docs: list[dict]) -> list[dict]:
    """Convert _id field to string for all docs in list."""
    for doc in docs:
        doc_id_to_str(doc)
    return docs
