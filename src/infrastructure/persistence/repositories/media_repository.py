"""
Repository for Media operations
"""

from typing import Any, Dict, List, Optional, Tuple

from infrastructure.persistence.db_connection import get_db_dla
from infrastructure.persistence.object_id_utils import to_object_id

from .base_repository import BaseRepository


class MediaRepository(BaseRepository):
    """Repository for media data access"""

    def __init__(self):
        db = get_db_dla()
        super().__init__(db.media)

    def find_by_dataset_id(self, dataset_id: str) -> List[Dict[str, Any]]:
        """Find all media by dataset ID"""
        dataset_oid = to_object_id(dataset_id)
        if dataset_oid:
            return self.find_all({"$or": [{"dataset_id": dataset_oid}, {"dataset_id": dataset_id}]})
        return self.find_all({"dataset_id": dataset_id})

    def get_file_ids_by_dataset(self, dataset_id: str) -> List[str]:
        """Get file IDs for a dataset"""
        medias = self.find_by_dataset_id(dataset_id)
        return [str(media.get("file_id")) for media in medias if media.get("file_id")]

    def get_file_ids_by_dataset_paginated(
        self, dataset_id: str, page: int = 1, per_page: int = 30
    ) -> Tuple[List[str], int]:
        """Get file IDs for a dataset with pagination. Returns (ids for page, total count)."""
        dataset_oid = to_object_id(dataset_id)
        if dataset_oid:
            filter_query = {"$or": [{"dataset_id": dataset_oid}, {"dataset_id": dataset_id}]}
        else:
            filter_query = {"dataset_id": dataset_id}
        total = self.collection.count_documents(filter_query)
        skip = (page - 1) * per_page
        cursor = self.collection.find(filter_query, {"file_id": 1}).skip(skip).limit(per_page)
        ids = [str(doc["file_id"]) for doc in cursor if doc.get("file_id")]
        return ids, total

    def get_media_page_with_names(
        self, dataset_id: str, page: int = 1, per_page: int = 30
    ) -> Tuple[List[Dict[str, Any]], int]:
        """Get a page of media with file_id and media_name (for pickers). Returns (items, total)."""
        dataset_oid = to_object_id(dataset_id)
        if dataset_oid:
            filter_query = {"$or": [{"dataset_id": dataset_oid}, {"dataset_id": dataset_id}]}
        else:
            filter_query = {"dataset_id": dataset_id}
        total = self.collection.count_documents(filter_query)
        skip = (page - 1) * per_page
        cursor = (
            self.collection.find(filter_query, {"file_id": 1, "media_name": 1})
            .skip(skip)
            .limit(per_page)
        )
        items = []
        for doc in cursor:
            fid = doc.get("file_id")
            if fid is None:
                continue
            items.append(
                {
                    "file_id": str(fid),
                    "media_name": doc.get("media_name") or str(fid),
                }
            )
        return items, total


class LabelledRepository(BaseRepository):
    """Repository for labelled media data access"""

    def __init__(self):
        db = get_db_dla()
        super().__init__(db.labelled)

    def find_by_dataset_id(self, dataset_id: str) -> List[Dict[str, Any]]:
        """Find all labelled media by dataset ID"""
        dataset_oid = to_object_id(dataset_id)
        if dataset_oid:
            return self.find_all({"$or": [{"dataset_id": dataset_oid}, {"dataset_id": dataset_id}]})
        return self.find_all({"dataset_id": dataset_id})

    def find_by_file_id(
        self, file_id: str, dataset_id: str
    ) -> Optional[Dict[str, Any]]:
        """Find labelled media by file ID and dataset ID"""
        dataset_oid = to_object_id(dataset_id)
        if dataset_oid:
            doc = self.collection.find_one({
                "$or": [
                    {"file_id": file_id, "dataset_id": dataset_oid},
                    {"file_id": file_id, "dataset_id": dataset_id},
                ]
            })
        else:
            doc = self.collection.find_one({"file_id": file_id, "dataset_id": dataset_id})
        if doc:
            doc["_id"] = str(doc["_id"])
        return doc

    def upsert_labels(
        self, dataset_id: str, file_id: str, labels: List, update_user: str
    ) -> bool:
        """Upsert labels for a media file"""
        from datetime import datetime

        dataset_oid = to_object_id(dataset_id)
        user_oid = to_object_id(update_user)

        result = self.collection.update_one(
            {"dataset_id": dataset_oid if dataset_oid else dataset_id, "file_id": file_id},
            {
                "$set": {
                    "labels": labels,
                    "dataset_id": dataset_oid if dataset_oid else dataset_id,
                    "file_id": file_id,
                    "last_update": datetime.now(),
                    "update_user": user_oid if user_oid else update_user,
                },
                "$setOnInsert": {"insert_date": datetime.now()},
            },
            upsert=True,
        )
        return result.upserted_id is not None or result.modified_count > 0
