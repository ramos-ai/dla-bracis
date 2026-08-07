"""
Service for handling COCO format annotations.
"""

from datetime import datetime, timezone

from bson import ObjectId

from infrastructure.persistence.db_connection import get_db_dla
from infrastructure.persistence.object_id_utils import to_object_id
from shared.logger import get_logger

logger = get_logger(__name__)


def _db():
    return get_db_dla()


def _coco_doc_filter(dataset_id: str, file_id: str) -> dict:
    dataset_oid = to_object_id(dataset_id)
    return {
        "$or": [
            {"dataset_id": dataset_oid, "file_id": file_id},
            {"dataset_id": dataset_id, "file_id": file_id},
        ]
    }


def _dataset_docs_filter(dataset_id: str) -> dict:
    dataset_oid = to_object_id(dataset_id)
    return {"$or": [{"dataset_id": dataset_oid}, {"dataset_id": dataset_id}]}


def calculate_polygon_area(segmentation) -> float:
    """Calculate area of a polygon using shoelace formula."""
    if not segmentation or len(segmentation) < 6:
        return 0.0

    points = [
        (segmentation[i], segmentation[i + 1])
        for i in range(0, len(segmentation) - 1, 2)
    ]
    if len(points) < 3:
        return 0.0

    area = sum(
        points[i][0] * points[(i + 1) % len(points)][1]
        - points[(i + 1) % len(points)][0] * points[i][1]
        for i in range(len(points))
    )
    return abs(area) / 2.0


def calculate_bbox(segmentation) -> list:
    """Calculate bounding box from polygon coordinates [x_min, y_min, w, h]."""
    if not segmentation or len(segmentation) < 6:
        return [0, 0, 0, 0]

    x_coords = segmentation[0::2]
    y_coords = segmentation[1::2]
    min_x, max_x = min(x_coords), max(x_coords)
    min_y, max_y = min(y_coords), max(y_coords)
    return [min_x, min_y, max_x - min_x, max_y - min_y]


def _extract_polygon(segmentation) -> list | None:
    if not isinstance(segmentation, list) or not segmentation:
        return None

    first = segmentation[0]
    return first if isinstance(first, list) else segmentation


def _enrich_annotation(annotation: dict) -> dict:
    processed = annotation.copy()
    polygon = _extract_polygon(annotation.get("segmentation"))

    if polygon:
        if not processed.get("area"):
            processed["area"] = calculate_polygon_area(polygon)
        if not processed.get("bbox"):
            processed["bbox"] = calculate_bbox(polygon)

    processed["iscrowd"] = processed.get("iscrowd", 0)
    return processed


def _process_annotations(annotations: list) -> list:
    return [_enrich_annotation(annotation) for annotation in annotations]


def _delete_empty_annotation(filter_criteria: dict) -> dict:
    result = _db().coco_annotations.delete_one(filter_criteria)
    return {
        "success": True,
        "message": "COCO annotation deleted (empty annotations)",
        "deleted": result.deleted_count > 0,
    }


def save_coco_annotation(data: dict):
    """Save COCO format annotation with version tracking."""
    try:
        dataset_id = data["dataset_id"]
        file_id = data["file_id"]
        processed = _process_annotations(data["annotations"])
        filter_criteria = _coco_doc_filter(dataset_id, file_id)

        if not processed:
            return _delete_empty_annotation(filter_criteria)

        dataset_oid = to_object_id(dataset_id)
        user_oid = to_object_id(data["update_user"])
        now = datetime.now(timezone.utc)

        result = _db().coco_annotations.update_one(
            filter_criteria,
            {
                "$set": {
                    "dataset_id": dataset_oid or dataset_id,
                    "file_id": file_id,
                    "annotations": processed,
                    "update_user": user_oid or data["update_user"],
                    "last_update": now,
                },
                "$inc": {"version": 1},
                "$setOnInsert": {"insert_date": now},
            },
            upsert=True,
        )

        from infrastructure.persistence.dataset_version import increment_dataset_version

        increment_dataset_version(dataset_id)

        return {
            "success": True,
            "message": "COCO annotation saved successfully",
            "inserted": result.upserted_id is not None,
            "modified": result.modified_count > 0,
        }
    except Exception as error:
        logger.exception("Error saving COCO annotation")
        return {"success": False, "message": f"Error saving COCO annotation: {error}"}


def get_coco_annotation(dataset_id: str, file_id: str):
    """Get COCO annotation for a specific file. Returns dict."""
    try:
        annotation_doc = _db().coco_annotations.find_one(
            _coco_doc_filter(dataset_id, file_id)
        )
        if not annotation_doc:
            return {"annotations": [], "message": "No annotations found"}

        return {
            "annotations": annotation_doc.get("annotations", []),
            "dataset_id": str(annotation_doc.get("dataset_id")),
            "file_id": annotation_doc.get("file_id"),
        }
    except Exception as error:
        logger.exception("Error getting COCO annotation")
        return {"error": str(error), "annotations": []}


def get_coco_annotations_by_dataset(dataset_id: str):
    """Get all COCO annotations for a dataset in COCO format. Returns dict."""
    try:
        return get_coco_annotations_dict(dataset_id, for_export=False)
    except Exception as error:
        return {"error": str(error)}


def _fetch_annotation_docs(dataset_id: str) -> list:
    return list(_db().coco_annotations.find(_dataset_docs_filter(dataset_id)))


def _load_dataset_labels(dataset_id: str, dataset_oid: ObjectId | None) -> list:
    if dataset_oid:
        dataset_doc = _db().datasets.find_one({"_id": dataset_oid})
    elif ObjectId.is_valid(dataset_id):
        dataset_doc = _db().datasets.find_one({"_id": ObjectId(dataset_id)})
    else:
        dataset_doc = None
    return dataset_doc.get("labels", []) if dataset_doc else []


def _build_categories(dataset_labels: list, categories_set: set) -> list:
    return [
        {"id": index + 1, "name": label}
        for index, label in enumerate(dataset_labels)
        if (index + 1) in categories_set
    ]


def _register_image(
    file_id,
    media_doc: dict,
    image_id_map: dict,
    images: list,
    next_image_id: int,
    for_export: bool,
) -> tuple[dict, list, int]:
    if file_id in image_id_map:
        return image_id_map, images, next_image_id

    image_id_map[file_id] = next_image_id
    file_name = (
        f"{file_id}.jpg"
        if for_export
        else media_doc.get("media_name", f"image_{file_id}.jpg")
    )
    images.append({"id": next_image_id, "file_id": str(file_id), "file_name": file_name})
    return image_id_map, images, next_image_id + 1


def _build_images_index(
    annotation_docs: list, for_export: bool
) -> tuple[list, dict, set]:
    images = []
    image_id_map = {}
    categories_set = set()
    next_image_id = 1
    media_collection = _db().media

    for doc in annotation_docs:
        file_id = doc.get("file_id")
        if not file_id:
            continue

        media_doc = media_collection.find_one({"file_id": file_id})
        if not media_doc:
            continue

        image_id_map, images, next_image_id = _register_image(
            file_id, media_doc, image_id_map, images, next_image_id, for_export
        )

        for annotation in doc.get("annotations", []):
            category_id = annotation.get("category_id")
            if category_id is not None:
                categories_set.add(category_id)

    return images, image_id_map, categories_set


def _build_coco_annotations(annotation_docs: list, image_id_map: dict) -> list:
    annotations = []
    next_ann_id = 1

    for doc in annotation_docs:
        file_id = doc.get("file_id")
        if file_id not in image_id_map:
            continue

        image_id = image_id_map[file_id]
        for annotation in doc.get("annotations", []):
            annotations.append(
                {
                    "id": next_ann_id,
                    "image_id": image_id,
                    "category_id": annotation.get("category_id"),
                    "segmentation": annotation.get("segmentation", []),
                    "area": annotation.get("area", 0),
                    "bbox": annotation.get("bbox", [0, 0, 0, 0]),
                    "iscrowd": annotation.get("iscrowd", 0),
                }
            )
            next_ann_id += 1

    return annotations


def get_coco_annotations_dict(dataset_id: str, for_export: bool = False):
    """Get COCO structure as dict (images, annotations, categories)."""
    annotation_docs = _fetch_annotation_docs(dataset_id)
    images, image_id_map, categories_set = _build_images_index(annotation_docs, for_export)
    dataset_labels = _load_dataset_labels(dataset_id, to_object_id(dataset_id))

    return {
        "images": images,
        "annotations": _build_coco_annotations(annotation_docs, image_id_map),
        "categories": _build_categories(dataset_labels, categories_set),
    }


def delete_coco_annotation(dataset_id: str, file_id: str):
    """Delete COCO annotation for a specific file."""
    try:
        result = _db().coco_annotations.delete_one(_coco_doc_filter(dataset_id, file_id))
        if result.deleted_count > 0:
            return {"success": True, "message": "Annotation deleted successfully"}
        return {"success": False, "message": "Annotation not found"}
    except Exception as error:
        logger.exception("Error deleting COCO annotation")
        return {"success": False, "message": f"Error deleting annotation: {error}"}
