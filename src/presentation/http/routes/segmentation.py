
from flasgger import swag_from
from flask import Blueprint, jsonify, request

from domain.evaluation import evaluate_segmentation
from domain.exceptions import (
    DatabaseError,
    NotFoundError,
    UnauthorizedError,
    ValidationError,
)
from infrastructure.cache import cache
from infrastructure.cache.cache_invalidation import invalidate_annotation_caches
from infrastructure.cache.cache_keys import CacheKeys
from infrastructure.persistence.export_helpers import ensure_segmentation_dataset
from infrastructure.persistence.service_segmentation import (
    clear_segmentation,
    get_segmentation_by_media,
    save_segmentation,
)
from presentation.http.dependencies.auth_dependency import (
    get_current_user_id,
    token_required,
)
from presentation.http.schemas import SegmentationSaveDTO
from shared.logger import get_logger

logger = get_logger(__name__)

segmentation_blueprint = Blueprint("segmentation", __name__)


@segmentation_blueprint.route("/save", methods=["POST"])
@token_required
@swag_from(
    {
        "tags": ["segmentation"],
        "summary": "Save YOLO segmentation annotations for a file",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {
                "name": "body",
                "in": "body",
                "required": True,
                "schema": {
                    "type": "object",
                    "required": ["dataset_id", "file_id", "annotations", "update_user"],
                    "properties": {
                        "dataset_id": {"type": "string"},
                        "file_id": {"type": "string"},
                        "annotations": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "class_id": {"type": "integer"},
                                    "polygon": {
                                        "type": "array",
                                        "items": {"type": "number"},
                                    },
                                },
                            },
                        },
                        "update_user": {"type": "string"},
                    },
                },
            }
        ],
        "responses": {
            200: {"description": "Segmentation saved"},
            400: {"description": "Validation error or wrong task_type"},
            401: {"description": "Not authenticated"},
        },
    }
)
def save_segmentation_route():
    try:
        user_id = get_current_user_id()
        data = request.json
        if not data:
            raise ValidationError("Request body is required")
        data["update_user"] = user_id
        dto = SegmentationSaveDTO(data)
        ensure_segmentation_dataset(dto.dataset_id)
        result = save_segmentation(
            {
                "dataset_id": dto.dataset_id,
                "file_id": dto.file_id,
                "annotations": dto.annotations,
                "update_user": dto.update_user,
            }
        )
        if result.get("success"):
            invalidate_annotation_caches(dto.dataset_id, dto.file_id)
            return jsonify(result), 200
        raise DatabaseError(result.get("message", "Save failed"), "save_segmentation")
    except (ValidationError, NotFoundError, UnauthorizedError):
        raise
    except ValueError as e:
        logger.exception("Validation error in save_segmentation_route")
        raise ValidationError(str(e))
    except Exception as e:
        logger.exception("Error in save_segmentation_route")
        raise DatabaseError(f"Error saving segmentation: {str(e)}", "save_segmentation")


@segmentation_blueprint.route("/evaluate", methods=["POST"])
@token_required
@swag_from(
    {
        "tags": ["segmentation"],
        "summary": "Evaluate student segmentation vs reference (for professor panel)",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {
                "name": "body",
                "in": "body",
                "required": True,
                "schema": {
                    "type": "object",
                    "required": ["dataset_id", "file_id", "student_annotations"],
                    "properties": {
                        "dataset_id": {"type": "string"},
                        "file_id": {"type": "string"},
                        "student_annotations": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "class_id": {"type": "integer"},
                                    "polygon": {
                                        "type": "array",
                                        "items": {"type": "number"},
                                    },
                                },
                            },
                        },
                        "iou_threshold": {"type": "number", "default": 0.75},
                        "score_mode": {
                            "type": "string",
                            "enum": ["recall", "f1"],
                            "default": "recall",
                        },
                    },
                },
            }
        ],
        "responses": {
            200: {"description": "Score and matches returned"},
            400: {"description": "Validation error"},
            401: {"description": "Not authenticated"},
        },
    }
)
def evaluate_segmentation_route():
    try:
        data = request.json
        if not data:
            raise ValidationError("Request body is required")
        dataset_id = data.get("dataset_id")
        file_id = data.get("file_id")
        if not dataset_id or not file_id:
            raise ValidationError("dataset_id and file_id are required")
        ensure_segmentation_dataset(dataset_id)
        correct_data = get_segmentation_by_media(dataset_id, file_id)
        correct_annotations = correct_data.get("annotations", [])
        student_annotations = data.get("student_annotations", [])
        if not isinstance(student_annotations, list):
            raise ValidationError("student_annotations must be a list")
        iou_threshold = float(data.get("iou_threshold", 0.75))
        score_mode = data.get("score_mode", "recall") or "recall"
        if score_mode not in ("recall", "f1"):
            score_mode = "recall"
        result = evaluate_segmentation(
            student_annotations=student_annotations,
            correct_annotations=correct_annotations,
            iou_threshold=iou_threshold,
            score_mode=score_mode,
        )
        return jsonify(result), 200
    except (ValidationError, NotFoundError, UnauthorizedError):
        raise
    except Exception as e:
        logger.exception("Error in evaluate_segmentation_route")
        raise DatabaseError(
            f"Error evaluating segmentation: {str(e)}", "evaluate_segmentation"
        )


@segmentation_blueprint.route("/by_media", methods=["GET"])
@token_required
@swag_from(
    {
        "tags": ["segmentation"],
        "summary": "Get segmentation annotations for a file",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {"name": "dataset_id", "in": "query", "type": "string", "required": True},
            {"name": "file_id", "in": "query", "type": "string", "required": True},
        ],
        "responses": {
            200: {"description": "Annotations returned"},
            400: {"description": "Validation error or wrong task_type"},
            401: {"description": "Not authenticated"},
        },
    }
)
def get_segmentation_by_media_route():
    try:
        dataset_id = request.args.get("dataset_id")
        file_id = request.args.get("file_id")
        if not dataset_id or not file_id:
            raise ValidationError("dataset_id and file_id are required")

        cache_key = CacheKeys.segmentation(dataset_id, file_id)
        cached = cache.get(cache_key)
        if cached is not None:
            return jsonify(cached), 200

        ensure_segmentation_dataset(dataset_id)
        result = get_segmentation_by_media(dataset_id, file_id)
        cache.set(cache_key, result, timeout=CacheKeys.TTL_SHORT)
        return jsonify(result), 200
    except (ValidationError, NotFoundError, UnauthorizedError):
        raise
    except Exception as e:
        logger.exception("Error in get_segmentation_by_media_route")
        raise DatabaseError(
            f"Error getting segmentation: {str(e)}", "get_segmentation_by_media"
        )


@segmentation_blueprint.route("/clear", methods=["DELETE"])
@token_required
@swag_from(
    {
        "tags": ["segmentation"],
        "summary": "Clear segmentation annotations for a file",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {"name": "dataset_id", "in": "query", "type": "string", "required": True},
            {"name": "file_id", "in": "query", "type": "string", "required": True},
        ],
        "responses": {
            200: {"description": "Segmentation cleared"},
            400: {"description": "Validation error or wrong task_type"},
            401: {"description": "Not authenticated"},
        },
    }
)
def clear_segmentation_route():
    try:
        dataset_id = request.args.get("dataset_id")
        file_id = request.args.get("file_id")
        if not dataset_id or not file_id:
            raise ValidationError("dataset_id and file_id are required")
        ensure_segmentation_dataset(dataset_id)
        result = clear_segmentation(dataset_id, file_id)
        invalidate_annotation_caches(dataset_id, file_id)
        return jsonify(result), 200
    except (ValidationError, NotFoundError, UnauthorizedError):
        raise
    except Exception as e:
        logger.exception("Error in clear_segmentation_route")
        raise DatabaseError(
            f"Error clearing segmentation: {str(e)}", "clear_segmentation"
        )


@segmentation_blueprint.route("/batch", methods=["POST"])
@token_required
def get_segmentation_batch_route():
    """Get segmentation status for multiple files at once. Returns {file_id: has_annotations} map."""
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
                seg_data = get_segmentation_by_media(dataset_id, str(fid))
                annotations = seg_data.get("annotations", [])
                result[str(fid)] = len(annotations) > 0
            except Exception:
                result[str(fid)] = False
        return jsonify({"annotations_map": result})
    except ValidationError:
        raise
    except Exception as e:
        logger.exception("Error in get_segmentation_batch_route")
        raise DatabaseError(
            f"Error getting segmentation batch: {str(e)}",
            "get_segmentation_batch",
        )
