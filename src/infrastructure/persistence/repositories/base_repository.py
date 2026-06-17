"""
Base repository class following Repository pattern.

All IDs are stored as ObjectId in MongoDB.
Conversion to string happens only at API boundary.
"""

from abc import ABC
from typing import Any

from bson import ObjectId

from infrastructure.persistence.object_id_utils import (
    doc_to_json_serializable,
    docs_to_json_serializable,
    is_valid_object_id,
    to_object_id,
)


class BaseRepository(ABC):
    """Base repository interface"""

    def __init__(self, collection):
        self.collection = collection

    def find_by_id(self, id: str | ObjectId) -> dict[str, Any] | None:
        """Find document by ID. Returns doc with all ObjectIds as strings."""
        oid = to_object_id(id)
        if oid is None:
            return None
        doc = self.collection.find_one({"_id": oid})
        return doc_to_json_serializable(doc)

    def find_all(self, filter: dict | None = None) -> list[dict[str, Any]]:
        """Find all documents matching filter. Returns docs with all ObjectIds as strings."""
        filter = filter or {}
        docs = list(self.collection.find(filter))
        return docs_to_json_serializable(docs)

    def create(self, data: dict[str, Any]) -> str:
        """Create a new document. Returns inserted_id as string."""
        result = self.collection.insert_one(data)
        return str(result.inserted_id)

    def update(self, id: str | ObjectId, data: dict[str, Any]) -> bool:
        """Update a document by ID."""
        oid = to_object_id(id)
        if oid is None:
            return False
        result = self.collection.update_one({"_id": oid}, {"$set": data})
        return result.matched_count > 0

    def delete(self, id: str | ObjectId) -> bool:
        """Delete a document by ID."""
        oid = to_object_id(id)
        if oid is None:
            return False
        result = self.collection.delete_one({"_id": oid})
        return result.deleted_count > 0

    def exists(self, id: str | ObjectId) -> bool:
        """Check if document exists."""
        if not is_valid_object_id(id):
            return False
        oid = to_object_id(id)
        return self.collection.count_documents({"_id": oid}) > 0
