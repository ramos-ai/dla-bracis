"""
Application service for YOLO segmentation annotations and persistence.
Scoring and IoU logic are delegated to domain.evaluation.
"""

from shared.date_utils import utc_now
from typing import Any, Dict

from domain.evaluation import (
    polygon_area,
    validate_and_normalize_polygon,
)
from domain.evaluation.constants import MIN_POLYGON_AREA
from infrastructure.persistence.repositories.segmentation_repository import (
    SegmentationRepository,
)


def save_segmentation(data: dict) -> Dict[str, Any]:
    """Save YOLO segmentation for a file. Expects dataset_id, file_id, annotations, update_user."""
    repo = SegmentationRepository()
    dataset_id = data["dataset_id"]
    file_id = data["file_id"]
    update_user = data["update_user"]
    raw_annotations = data.get("annotations", [])

    processed = []
    for ann in raw_annotations:
        poly = ann.get("polygon", [])
        if not poly or len(poly) < 6 or len(poly) % 2 != 0:
            continue
        class_id = ann.get("class_id")
        if class_id is None:
            continue
        try:
            cid = int(class_id)
        except (ValueError, TypeError):
            continue
        if cid < 0:
            continue
        normalized = validate_and_normalize_polygon(poly)
        if not normalized:
            continue
        area = polygon_area(normalized)
        if area < MIN_POLYGON_AREA:
            continue
        processed.append(
            {
                "class_id": cid,
                "polygon": normalized,
                "area": area,
                "update_user": update_user,
                "last_update": utc_now(),
            }
        )

    if not processed:
        repo.delete_by_dataset_and_file(dataset_id, file_id)
        return {
            "success": True,
            "message": "Segmentation cleared (no valid annotations)",
            "deleted": True,
        }

    repo.upsert(dataset_id, file_id, processed, update_user)
    return {
        "success": True,
        "message": "Segmentation saved",
        "annotations_count": len(processed),
    }


def get_segmentation_by_media(dataset_id: str, file_id: str) -> Dict[str, Any]:
    """Get segmentation for one file. Returns { annotations: [...] } or empty."""
    repo = SegmentationRepository()
    doc = repo.find_by_dataset_and_file(dataset_id, file_id)
    if not doc:
        return {"annotations": [], "dataset_id": dataset_id, "file_id": file_id}
    return {
        "annotations": doc.get("annotations", []),
        "dataset_id": doc.get("dataset_id"),
        "file_id": doc.get("file_id"),
    }


def clear_segmentation(dataset_id: str, file_id: str) -> Dict[str, Any]:
    """Delete segmentation for one file."""
    repo = SegmentationRepository()
    deleted = repo.delete_by_dataset_and_file(dataset_id, file_id)
    return {
        "success": True,
        "deleted": deleted,
        "message": "Segmentation cleared" if deleted else "Nothing to clear",
    }
