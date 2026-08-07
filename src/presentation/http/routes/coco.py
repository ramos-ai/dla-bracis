
from flasgger import swag_from
from flask import Blueprint, jsonify, request

from domain.exceptions import (
    DatabaseError,
    UnauthorizedError,
    ValidationError,
)
from infrastructure.cache import cache
from infrastructure.cache.cache_invalidation import invalidate_annotation_caches
from infrastructure.cache.cache_keys import CacheKeys
from infrastructure.persistence.service_coco import (
    delete_coco_annotation,
    get_coco_annotation,
    get_coco_annotations_by_dataset,
    save_coco_annotation,
)
from presentation.http.dependencies.auth_dependency import (
    get_current_user_id,
    token_required,
)
from presentation.http.schemas import COCOAnnotationDTO
from shared.logger import get_logger

logger = get_logger(__name__)

coco_blueprint = Blueprint("coco", __name__)


@coco_blueprint.route("/save", methods=["POST"])
@token_required
@swag_from(
    {
        "tags": ["coco"],
        "summary": "Save annotation in COCO format",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {
                "name": "body",
                "in": "body",
                "required": True,
                "schema": {
                    "type": "object",
                    "required": ["dataset_id", "file_id", "annotations"],
                    "properties": {
                        "dataset_id": {"type": "string"},
                        "file_id": {"type": "string"},
                        "annotations": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "category_id": {"type": "integer"},
                                    "segmentation": {
                                        "type": "array",
                                        "items": {
                                            "type": "array",
                                            "items": {"type": "number"},
                                        },
                                    },
                                    "area": {"type": "number"},
                                    "bbox": {
                                        "type": "array",
                                        "items": {"type": "number"},
                                    },
                                    "iscrowd": {"type": "integer"},
                                },
                            },
                        },
                    },
                },
            }
        ],
        "responses": {
            200: {"description": "Annotation saved successfully"},
            400: {"description": "Validation error"},
            401: {"description": "Not authenticated"},
        },
    }
)
def save_coco_annotation_route():
    """Save annotation in COCO format."""
    try:
        user_id = get_current_user_id()
        data = request.json

        if not data:
            raise ValidationError("Request body is required")

        data["update_user"] = user_id
        dto = COCOAnnotationDTO(data)

        result = save_coco_annotation(
            {
                "dataset_id": dto.dataset_id,
                "file_id": dto.file_id,
                "annotations": dto.annotations,
                "update_user": dto.update_user,
            }
        )

        if result["success"]:
            invalidate_annotation_caches(dto.dataset_id, dto.file_id)
            return jsonify(result), 200
        else:
            raise DatabaseError(result["message"], "save_coco_annotation")
    except (ValidationError, UnauthorizedError):
        raise
    except Exception as e:
        logger.exception("Error in save_coco_annotation_route")
        raise DatabaseError(
            f"Error saving COCO annotation: {str(e)}", "save_coco_annotation"
        )


@coco_blueprint.route("/get", methods=["GET"])
@token_required
@swag_from(
    {
        "tags": ["coco"],
        "summary": "Get COCO annotation for a file",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {"name": "dataset_id", "in": "query", "type": "string", "required": True},
            {"name": "file_id", "in": "query", "type": "string", "required": True},
        ],
        "responses": {
            200: {"description": "Annotation returned"},
            400: {"description": "Validation error"},
            401: {"description": "Not authenticated"},
        },
    }
)
def get_coco_annotation_route():
    """Get COCO annotation for a file."""
    try:
        dataset_id = request.args.get("dataset_id")
        file_id = request.args.get("file_id")

        if not dataset_id or not file_id:
            raise ValidationError("dataset_id and file_id are required")

        cache_key = CacheKeys.coco_annotation(dataset_id, file_id)
        cached = cache.get(cache_key)
        if cached is not None:
            return jsonify(cached)

        result = get_coco_annotation(dataset_id, file_id)
        cache.set(cache_key, result, timeout=CacheKeys.TTL_SHORT)
        return jsonify(result)
    except ValidationError:
        raise
    except Exception as e:
        logger.exception("Error in get_coco_annotation_route")
        raise DatabaseError(
            f"Error getting COCO annotation: {str(e)}", "get_coco_annotation"
        )


@coco_blueprint.route("/dataset/<dataset_id>", methods=["GET"])
@token_required
@swag_from(
    {
        "tags": ["coco"],
        "summary": "Get all COCO annotations for a dataset",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {"name": "dataset_id", "in": "path", "type": "string", "required": True}
        ],
        "responses": {
            200: {"description": "Annotations in COCO format"},
            401: {"description": "Not authenticated"},
        },
    }
)
def get_dataset_coco_annotations_route(dataset_id: str):
    """Get all COCO annotations for a dataset."""
    try:
        cache_key = CacheKeys.coco_dataset(dataset_id)
        cached = cache.get(cache_key)
        if cached is not None:
            return jsonify(cached)

        result = get_coco_annotations_by_dataset(dataset_id)
        cache.set(cache_key, result, timeout=CacheKeys.TTL_LONG)
        return jsonify(result)
    except Exception as e:
        logger.exception("Error in get_dataset_coco_annotations_route")
        raise DatabaseError(
            f"Error getting dataset COCO annotations: {str(e)}",
            "get_dataset_coco_annotations",
        )


@coco_blueprint.route("/delete", methods=["DELETE"])
@token_required
@swag_from(
    {
        "tags": ["coco"],
        "summary": "Delete COCO annotation for a file",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {"name": "dataset_id", "in": "query", "type": "string", "required": True},
            {"name": "file_id", "in": "query", "type": "string", "required": True},
        ],
        "responses": {
            200: {"description": "Annotation deleted"},
            400: {"description": "Validation error"},
            401: {"description": "Not authenticated"},
        },
    }
)
def delete_coco_annotation_route():
    """Delete COCO annotation for a file."""
    try:
        dataset_id = request.args.get("dataset_id")
        file_id = request.args.get("file_id")

        if not dataset_id or not file_id:
            raise ValidationError("dataset_id and file_id are required")

        result = delete_coco_annotation(dataset_id, file_id)

        if result["success"]:
            invalidate_annotation_caches(dataset_id, file_id)
            return jsonify(result), 200
        else:
            raise DatabaseError(result["message"], "delete_coco_annotation")
    except (ValidationError, UnauthorizedError):
        raise
    except Exception as e:
        logger.exception("Error in delete_coco_annotation_route")
        raise DatabaseError(
            f"Error deleting COCO annotation: {str(e)}", "delete_coco_annotation"
        )


@coco_blueprint.route("/batch", methods=["POST"])
@token_required
def get_coco_annotations_batch_route():
    """Get COCO annotations for multiple files at once. Returns {file_id: has_annotations} map."""
    try:
        data = request.json
        if not data:
            raise ValidationError("Request body is required")
        dataset_id = data.get("dataset_id")
        file_ids = data.get("file_ids", [])
        if not dataset_id:
            raise ValidationError("dataset_id is required")
        if not file_ids or not isinstance(file_ids, list):
            raise ValidationError("file_ids must be a non-empty array")
        if len(file_ids) > 500:
            raise ValidationError("Maximum 500 file_ids per request")

        result = {}
        for fid in file_ids:
            try:
                ann_data = get_coco_annotation(dataset_id, str(fid))
                annotations = ann_data.get("annotations", [])
                result[str(fid)] = len(annotations) > 0
            except Exception:
                result[str(fid)] = False
        return jsonify({"annotations_map": result})
    except ValidationError:
        raise
    except Exception as e:
        logger.exception("Error in get_coco_annotations_batch_route")
        raise DatabaseError(
            f"Error getting COCO annotations batch: {str(e)}",
            "get_coco_annotations_batch",
        )
