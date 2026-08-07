"""Helpers for export and segmentation: dataset/media lookups. Used by presentation layer."""

import os

from bson import ObjectId

from domain.exceptions import NotFoundError, ValidationError
from infrastructure.persistence.db_connection import get_db_dla


def ensure_segmentation_dataset(dataset_id: str) -> None:
    """Raise ValidationError or NotFoundError if dataset does not exist or task_type != 'segmentation'."""
    if not dataset_id or not ObjectId.is_valid(dataset_id):
        raise ValidationError("Valid dataset_id is required")
    db = get_db_dla()
    dataset_doc = db.datasets.find_one({"_id": ObjectId(dataset_id)})
    if not dataset_doc:
        raise NotFoundError("Dataset", dataset_id)
    if (dataset_doc.get("task_type") or "classification") != "segmentation":
        raise ValidationError(
            "Dataset task_type must be 'segmentation' for YOLO segmentation export"
        )


def file_id_to_basename(dataset_id: str, file_id: str) -> str:
    """Return label file basename (no extension) for a file_id. Uses media_name if available."""
    db = get_db_dla()
    fid = str(file_id)
    q = {"dataset_id": dataset_id}
    if ObjectId.is_valid(fid):
        q["$or"] = [{"file_id": fid}, {"file_id": ObjectId(fid)}]
    else:
        q["file_id"] = fid
    media = db.media.find_one(q)
    if media and media.get("media_name"):
        return os.path.splitext(media["media_name"])[0]
    return fid
