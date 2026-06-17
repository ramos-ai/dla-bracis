"""
Repository for YOLO segmentation annotations (yolo_segmentations collection).
"""

from datetime import datetime, timezone
from typing import Any

from infrastructure.persistence.db_connection import get_db_dla
from infrastructure.persistence.object_id_utils import (
    doc_to_json_serializable,
    docs_to_json_serializable,
    to_object_id,
)

from .base_repository import BaseRepository


class SegmentationRepository(BaseRepository):
    """Repository for yolo_segmentations collection.
    Document: { dataset_id, file_id, annotations: [{ class_id, polygon, area?, update_user, last_update }], version }
    """

    def __init__(self):
        db = get_db_dla()
        super().__init__(db.yolo_segmentations)

    def find_by_dataset_and_file(
        self, dataset_id: str, file_id: str
    ) -> dict[str, Any] | None:
        """Find one document by dataset_id and file_id."""
        dataset_oid = to_object_id(dataset_id)

        doc = self.collection.find_one(
            {
                "$or": [
                    {"dataset_id": dataset_oid, "file_id": file_id},
                    {"dataset_id": dataset_id, "file_id": file_id},
                ]
            }
        )
        return doc_to_json_serializable(doc)

    def upsert(
        self,
        dataset_id: str,
        file_id: str,
        annotations: list[dict[str, Any]],
        update_user: str,
    ) -> bool:
        """Insert or replace annotations for a given dataset_id + file_id."""
        dataset_oid = to_object_id(dataset_id)
        user_oid = to_object_id(update_user)
        now = datetime.now(timezone.utc)

        filter_criteria = {
            "$or": [
                {"dataset_id": dataset_oid, "file_id": file_id},
                {"dataset_id": dataset_id, "file_id": file_id},
            ]
        }

        update_data = {
            "dataset_id": dataset_oid if dataset_oid else dataset_id,
            "file_id": file_id,
            "annotations": annotations,
            "update_user": user_oid if user_oid else update_user,
            "last_update": now,
        }

        result = self.collection.update_one(
            filter_criteria,
            {
                "$set": update_data,
                "$inc": {"version": 1},
                "$setOnInsert": {"insert_date": now},
            },
            upsert=True,
        )

        if result.upserted_id is not None or result.modified_count > 0:
            from infrastructure.persistence.dataset_version import increment_dataset_version

            increment_dataset_version(dataset_id)

        return result.upserted_id is not None or result.modified_count > 0

    def delete_by_dataset_and_file(self, dataset_id: str, file_id: str) -> bool:
        """Delete annotations for a given dataset_id + file_id."""
        dataset_oid = to_object_id(dataset_id)

        result = self.collection.delete_one(
            {
                "$or": [
                    {"dataset_id": dataset_oid, "file_id": file_id},
                    {"dataset_id": dataset_id, "file_id": file_id},
                ]
            }
        )
        return result.deleted_count > 0

    def find_all_by_dataset(self, dataset_id: str) -> list[dict[str, Any]]:
        """Find all segmentation documents for a dataset."""
        dataset_oid = to_object_id(dataset_id)

        docs = list(
            self.collection.find(
                {"$or": [{"dataset_id": dataset_oid}, {"dataset_id": dataset_id}]}
            )
        )
        return docs_to_json_serializable(docs)
