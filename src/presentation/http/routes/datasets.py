from bson import ObjectId
from flasgger import swag_from
from flask import Blueprint, g, jsonify, request

from application.datasets import (
    create_dataset as uc_create_dataset,
)
from application.datasets import (
    delete_dataset as uc_delete_dataset,
)
from application.datasets import (
    get_dataset_by_id,
)
from application.datasets import (
    get_dataset_labels as uc_get_dataset_labels,
)
from application.datasets import (
    list_datasets as uc_list_datasets,
)
from application.datasets import (
    update_dataset as uc_update_dataset,
)
from application.datasets import (
    update_dataset_labels as uc_update_dataset_labels,
)
from domain.exceptions import DatabaseError, NotFoundError, ValidationError
from infrastructure.cache import cache
from infrastructure.cache.cache_invalidation import invalidate_dataset_caches
from infrastructure.cache.cache_keys import CacheKeys
from infrastructure.persistence.service_actions import save_action
from infrastructure.persistence.service_media import (
    delete_media_from_dataset,
)
from presentation.http.dependencies.auth_dependency import (
    teacher_or_admin_required,
    token_required,
)
from presentation.http.schemas import DatasetCreateDTO, DatasetUpdateDTO
from shared.logger import get_logger

logger = get_logger(__name__)

datasets_blueprint = Blueprint("datasets", __name__)


@datasets_blueprint.route("/list", methods=["GET"])
@token_required
@swag_from(
    {
        "tags": ["datasets"],
        "summary": "List all datasets",
        "security": [{"BearerAuth": []}],
        "responses": {
            200: {
                "description": "List of datasets returned successfully",
                "schema": {
                    "type": "object",
                    "properties": {
                        "datasets": {"type": "array", "items": {"type": "object"}}
                    },
                },
            }
        },
    }
)
def list_datasets_route():
    """List datasets. Optional ?page= & ?per_page= for pagination (response then includes total, page, per_page)."""
    try:
        class_id = request.args.get("class_id")
        user_id = getattr(g, "current_user_id", None)
        user_role = getattr(g, "current_user_role", None)
        page = request.args.get("page", type=int)
        per_page = request.args.get("per_page", type=int)

        cache_key = CacheKeys.dataset_list(user_id, user_role, class_id, page)
        cached = cache.get(cache_key)
        if cached is not None:
            return jsonify(cached)

        datasets, total, p, pp = uc_list_datasets(
            class_id=class_id,
            user_id=user_id,
            user_role=user_role,
            page=page,
            per_page=per_page,
        )
        if total is not None:
            result = {"datasets": datasets, "total": total, "page": p, "per_page": pp}
        else:
            result = {"datasets": datasets}

        cache.set(cache_key, result, timeout=CacheKeys.TTL_MEDIUM)
        return jsonify(result)
    except Exception as e:
        raise DatabaseError(f"Error listing datasets: {str(e)}", "list_datasets")


@datasets_blueprint.route("/<string:dataset_id>", methods=["GET"])
@token_required
@swag_from(
    {
        "tags": ["datasets"],
        "summary": "Get a dataset by ID",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {
                "name": "dataset_id",
                "in": "path",
                "type": "string",
                "required": True,
                "description": "Dataset ID",
            }
        ],
        "responses": {
            200: {
                "description": "Dataset found",
                "schema": {
                    "type": "object",
                    "properties": {"dataset": {"type": "object"}},
                },
            },
            404: {"description": "Dataset not found"},
        },
    }
)
def get_dataset_route(dataset_id):
    """Get a specific dataset by ID."""
    try:
        if not ObjectId.is_valid(dataset_id):
            raise ValidationError("Invalid dataset ID format", "dataset_id")

        cache_key = CacheKeys.dataset(dataset_id)
        cached = cache.get(cache_key)
        if cached is not None:
            return jsonify({"dataset": cached})

        dataset = get_dataset_by_id(dataset_id)
        if dataset is None:
            raise NotFoundError("Dataset", dataset_id)

        cache.set(cache_key, dataset, timeout=CacheKeys.TTL_VERY_LONG)
        return jsonify({"dataset": dataset})
    except (ValidationError, NotFoundError):
        raise
    except Exception as e:
        raise DatabaseError(f"Error getting dataset: {str(e)}", "get_dataset")


@datasets_blueprint.route("/dataset_labels/<string:dataset_id>", methods=["GET"])
def get_dataset_labels_route(dataset_id):
    try:
        cache_key = CacheKeys.dataset_labels(dataset_id)
        cached = cache.get(cache_key)
        if cached is not None:
            return jsonify({"labels": cached})

        labels_list = uc_get_dataset_labels(dataset_id)
        if labels_list is not None:
            cache.set(cache_key, labels_list, timeout=CacheKeys.TTL_VERY_LONG)
            return jsonify({"labels": labels_list})
        dataset = get_dataset_by_id(dataset_id)
        if dataset is None:
            return jsonify({"mensagem": "Dataset not found"}), 404
        return jsonify({"mensagem": 'Field "labels" not found'}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@datasets_blueprint.route("/save", methods=["POST"])
@token_required
@swag_from(
    {
        "tags": ["datasets"],
        "summary": "Create a new dataset",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {
                "name": "body",
                "in": "body",
                "required": True,
                "schema": {
                    "type": "object",
                    "required": [
                        "dataset_name",
                        "description",
                        "task_type",
                        "labels",
                        "user_id",
                        "visibility",
                    ],
                    "properties": {
                        "dataset_name": {
                            "type": "string",
                            "description": "Dataset name (3-100 characters)",
                            "minLength": 3,
                            "maxLength": 100,
                        },
                        "description": {
                            "type": "string",
                            "description": "Dataset description (10-1000 characters)",
                            "minLength": 10,
                            "maxLength": 1000,
                        },
                        "task_type": {
                            "type": "string",
                            "description": "Task type (2-50 characters)",
                            "minLength": 2,
                            "maxLength": 50,
                        },
                        "labels": {
                            "type": "array",
                            "description": "List of labels (1-50 items)",
                            "items": {"type": "string"},
                            "minItems": 1,
                            "maxItems": 50,
                        },
                        "user_id": {"type": "string", "description": "Creator user ID"},
                        "visibility": {
                            "type": "string",
                            "enum": ["private", "public", "shared"],
                            "description": "Dataset visibility",
                        },
                    },
                },
            }
        ],
        "responses": {
            201: {
                "description": "Dataset created successfully",
                "schema": {
                    "type": "object",
                    "properties": {
                        "Message": {"type": "string"},
                        "id": {"type": "string"},
                    },
                },
            },
            400: {"description": "Validation error"},
        },
    }
)
def save_dataset_route():
    """Create a new dataset with validations."""
    try:
        data = request.json
        if not data:
            raise ValidationError("Request body is required")
        user_id = g.current_user_id
        if not user_id:
            raise ValidationError("User ID not found in token", "user_id")
        data["user_id"] = user_id
        dto = DatasetCreateDTO(data)
        inserted_id = uc_create_dataset(
            dataset_name=dto.dataset_name,
            description=dto.description,
            task_type=dto.task_type,
            labels=dto.labels,
            user_id=dto.user_id,
            visibility=dto.visibility,
        )
        from infrastructure.cache.cache_invalidation import invalidate_cache_patterns

        invalidate_cache_patterns([CacheKeys.dataset_list_pattern()])
        try:
            save_action(
                user_id=user_id,
                action_type="dataset_created",
                description=f"Dataset '{dto.dataset_name}' criado",
                metadata={"dataset_id": inserted_id},
            )
        except Exception:
            logger.warning(
                "Failed to save dataset_created action user_id=%s dataset_id=%s",
                user_id,
                inserted_id,
                exc_info=True,
            )
        return jsonify({"Message": "Insert success!", "id": inserted_id}), 201
    except ValidationError:
        raise
    except Exception as e:
        raise DatabaseError(f"Error creating dataset: {str(e)}", "save_dataset")


@datasets_blueprint.route("/edit/<string:dataset_id>", methods=["PUT"])
@token_required
@swag_from(
    {
        "tags": ["datasets"],
        "summary": "Update an existing dataset",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {
                "name": "dataset_id",
                "in": "path",
                "type": "string",
                "required": True,
                "description": "Dataset ID",
            },
            {
                "name": "body",
                "in": "body",
                "required": True,
                "schema": {
                    "type": "object",
                    "required": [
                        "dataset_name",
                        "description",
                        "task_type",
                        "user_id",
                        "visibility",
                    ],
                    "properties": {
                        "dataset_name": {
                            "type": "string",
                            "description": "Dataset name (3-100 characters)",
                            "minLength": 3,
                            "maxLength": 100,
                        },
                        "description": {
                            "type": "string",
                            "description": "Dataset description (10-1000 characters)",
                            "minLength": 10,
                            "maxLength": 1000,
                        },
                        "task_type": {
                            "type": "string",
                            "description": "Task type (2-50 characters)",
                            "minLength": 2,
                            "maxLength": 50,
                        },
                        "user_id": {
                            "type": "string",
                            "description": "User ID",
                        },
                        "visibility": {
                            "type": "string",
                            "enum": ["private", "public", "shared"],
                            "description": "Dataset visibility",
                        },
                    },
                },
            },
        ],
        "responses": {
            200: {
                "description": "Dataset updated successfully",
                "schema": {
                    "type": "object",
                    "properties": {
                        "Message": {"type": "string"},
                        "id": {"type": "string"},
                    },
                },
            },
            400: {"description": "Validation error"},
            404: {"description": "Dataset not found"},
        },
    }
)
def edit_dataset_route(dataset_id):
    """Update an existing dataset with validations."""
    try:
        data = request.json
        if not data:
            raise ValidationError("Request body is required")
        user_id = g.current_user_id
        if not user_id:
            raise ValidationError("User ID not found in token", "user_id")
        dto = DatasetUpdateDTO(data, dataset_id)
        data_to_update = {
            "dataset_name": dto.dataset_name,
            "description": dto.description,
            "task_type": dto.task_type,
            "user_id": dto.user_id,
            "visibility": dto.visibility,
        }
        uc_update_dataset(dataset_id, data_to_update, user_id)
        invalidate_dataset_caches(dataset_id)
        return jsonify({"Message": "Update success!", "id": dataset_id})
    except (ValidationError, NotFoundError):
        raise
    except Exception as e:
        raise DatabaseError(f"Error updating dataset: {str(e)}", "edit_dataset")


@datasets_blueprint.route("/<string:dataset_id>/labels", methods=["PUT"])
@token_required
@teacher_or_admin_required
@swag_from(
    {
        "tags": ["datasets"],
        "summary": "Update dataset labels",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {
                "name": "dataset_id",
                "in": "path",
                "type": "string",
                "required": True,
                "description": "Dataset ID",
            },
            {
                "name": "body",
                "in": "body",
                "required": True,
                "schema": {
                    "type": "object",
                    "required": ["labels"],
                    "properties": {
                        "labels": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "List of labels (1-50 items)",
                            "minItems": 1,
                            "maxItems": 50,
                        }
                    },
                },
            },
        ],
        "responses": {
            200: {
                "description": "Labels updated successfully",
                "schema": {
                    "type": "object",
                    "properties": {"Message": {"type": "string"}},
                },
            },
            400: {"description": "Validation error"},
            404: {"description": "Dataset not found"},
        },
    }
)
def update_dataset_labels_route(dataset_id):
    """Update only the labels of a dataset."""
    try:
        if not ObjectId.is_valid(dataset_id):
            raise ValidationError("Invalid dataset ID format", "dataset_id")

        data = request.json
        if not data:
            raise ValidationError("Request body is required")

        labels = data.get("labels")
        if not labels or not isinstance(labels, list):
            raise ValidationError("labels must be a non-empty array", "labels")

        if len(labels) < 1 or len(labels) > 50:
            raise ValidationError("labels must have between 1 and 50 items", "labels")
        uc_update_dataset_labels(dataset_id, labels)
        from infrastructure.cache.cache_invalidation import invalidate_cache_patterns

        invalidate_cache_patterns([
            CacheKeys.dataset_labels(dataset_id),
            CacheKeys.dataset(dataset_id),
        ])
        return jsonify({"Message": "Labels updated successfully!"}), 200
    except (ValidationError, NotFoundError):
        raise
    except Exception as e:
        raise DatabaseError(f"Error updating labels: {str(e)}", "update_labels")


@datasets_blueprint.route(
    "/<string:dataset_id>/media/<string:file_id>", methods=["DELETE"]
)
@token_required
@teacher_or_admin_required
@swag_from(
    {
        "tags": ["datasets"],
        "summary": "Remove an image from the dataset",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {"name": "dataset_id", "in": "path", "type": "string", "required": True},
            {"name": "file_id", "in": "path", "type": "string", "required": True},
            {
                "name": "confirm",
                "in": "query",
                "type": "boolean",
                "description": "If true, remove even if the image is used in exercises",
            },
        ],
        "responses": {
            200: {"description": "OK (deleted or in_exercises for confirmation)"},
            404: {"description": "Dataset not found"},
        },
    }
)
def delete_dataset_media_route(dataset_id: str, file_id: str):
    """Remove an image from the dataset. If the image is in exercises, returns in_exercises and list of exercises; client should ask for confirmation and call again with confirm=true."""
    try:
        if not ObjectId.is_valid(dataset_id):
            raise ValidationError("Invalid dataset ID format", "dataset_id")
        if get_dataset_by_id(dataset_id) is None:
            raise NotFoundError("Dataset", dataset_id)
        confirm = request.args.get("confirm", "false").lower() in ("1", "true", "yes")
        result = delete_media_from_dataset(dataset_id, file_id, confirm=confirm)
        if result.get("deleted"):
            from infrastructure.cache.cache_invalidation import (
                invalidate_annotation_caches,
            )

            invalidate_annotation_caches(dataset_id, file_id)
        return jsonify(result), 200
    except (ValidationError, NotFoundError):
        raise
    except Exception as e:
        raise DatabaseError(f"Error deleting media: {str(e)}", "delete_dataset_media")


@datasets_blueprint.route("/<string:dataset_id>", methods=["DELETE"])
@token_required
@teacher_or_admin_required
@swag_from(
    {
        "tags": ["datasets"],
        "summary": "Delete a dataset and its related exercises",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {
                "name": "dataset_id",
                "in": "path",
                "type": "string",
                "required": True,
                "description": "Dataset ID",
            }
        ],
        "responses": {
            200: {
                "description": "Dataset and related exercises deleted successfully",
                "schema": {
                    "type": "object",
                    "properties": {
                        "Message": {"type": "string"},
                        "deleted_exercises_count": {"type": "integer"},
                    },
                },
            },
            404: {"description": "Dataset not found"},
        },
    }
)
def delete_dataset_route(dataset_id):
    """Delete a dataset and all related exercises."""
    try:
        if not ObjectId.is_valid(dataset_id):
            raise ValidationError("Invalid dataset ID format", "dataset_id")
        deleted_count = uc_delete_dataset(dataset_id)
        invalidate_dataset_caches(dataset_id)
        return (
            jsonify(
                {
                    "Message": "Dataset and related exercises deleted successfully!",
                    "deleted_exercises_count": deleted_count,
                }
            ),
            200,
        )
    except (ValidationError, NotFoundError):
        raise
    except Exception as e:
        raise DatabaseError(f"Error deleting dataset: {str(e)}", "delete_dataset")
