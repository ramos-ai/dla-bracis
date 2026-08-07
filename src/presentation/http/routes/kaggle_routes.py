"""
Kaggle API routes: credential management and dataset export to Kaggle.
"""

from flasgger import swag_from
from flask import Blueprint, g, jsonify, request

from application.kaggle import (
    check_has_credentials,
    delete_kaggle_credentials,
    save_kaggle_credentials,
    validate_kaggle_credentials,
)
from domain.exceptions import ValidationError
from infrastructure.celery.jobs.kaggle import upload_kaggle_task
from infrastructure.celery.task_status import init_task
from presentation.http.dependencies.auth_dependency import token_required
from shared.logger import get_logger

logger = get_logger(__name__)

kaggle_blueprint = Blueprint("kaggle", __name__)


@kaggle_blueprint.route("/credentials", methods=["POST"])
@token_required
@swag_from(
    {
        "tags": ["kaggle"],
        "summary": "Save Kaggle API credentials",
        "description": "Store encrypted Kaggle credentials for the authenticated user.",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {
                "name": "body",
                "in": "body",
                "required": True,
                "schema": {
                    "type": "object",
                    "required": ["username", "api_key"],
                    "properties": {
                        "username": {
                            "type": "string",
                            "description": "Kaggle username",
                        },
                        "api_key": {
                            "type": "string",
                            "description": "Kaggle API token",
                        },
                    },
                },
            }
        ],
        "responses": {
            200: {"description": "Credentials saved successfully"},
            400: {"description": "Invalid request"},
            401: {"description": "Unauthorized"},
        },
    }
)
def save_credentials_route():
    """Save Kaggle credentials for the authenticated user."""
    user_id = getattr(g, "current_user_id", None)
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    username = data.get("username", "").strip()
    api_key = data.get("api_key", "").strip()

    if not username or not api_key:
        return jsonify({"error": "Username and API key are required"}), 400

    try:
        save_kaggle_credentials(user_id, username, api_key)
        return jsonify({"message": "Credentials saved successfully"}), 200
    except ValidationError as e:
        return jsonify({"error": str(e), "code": getattr(e, "code", None)}), 400
    except Exception as e:
        return jsonify({"error": f"Failed to save credentials: {str(e)}"}), 500


@kaggle_blueprint.route("/credentials/status", methods=["GET"])
@token_required
@swag_from(
    {
        "tags": ["kaggle"],
        "summary": "Check if user has Kaggle credentials",
        "security": [{"BearerAuth": []}],
        "responses": {
            200: {
                "description": "Credentials status",
                "schema": {
                    "type": "object",
                    "properties": {
                        "has_credentials": {"type": "boolean"},
                    },
                },
            },
            401: {"description": "Unauthorized"},
        },
    }
)
def credentials_status_route():
    """Check if the authenticated user has stored Kaggle credentials."""
    user_id = getattr(g, "current_user_id", None)
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    has_creds = check_has_credentials(user_id)
    return jsonify({"has_credentials": has_creds}), 200


@kaggle_blueprint.route("/credentials", methods=["DELETE"])
@token_required
@swag_from(
    {
        "tags": ["kaggle"],
        "summary": "Delete Kaggle credentials",
        "security": [{"BearerAuth": []}],
        "responses": {
            200: {"description": "Credentials deleted"},
            401: {"description": "Unauthorized"},
        },
    }
)
def delete_credentials_route():
    """Delete stored Kaggle credentials for the authenticated user."""
    user_id = getattr(g, "current_user_id", None)
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    deleted = delete_kaggle_credentials(user_id)
    if deleted:
        return jsonify({"message": "Credentials deleted successfully"}), 200
    return jsonify({"message": "No credentials found to delete"}), 200


@kaggle_blueprint.route("/credentials/validate", methods=["POST"])
@token_required
@swag_from(
    {
        "tags": ["kaggle"],
        "summary": "Validate stored Kaggle credentials",
        "description": "Test if stored credentials work with Kaggle API.",
        "security": [{"BearerAuth": []}],
        "responses": {
            200: {
                "description": "Validation result",
                "schema": {
                    "type": "object",
                    "properties": {
                        "valid": {"type": "boolean"},
                    },
                },
            },
            400: {"description": "Validation failed"},
            401: {"description": "Unauthorized"},
        },
    }
)
def validate_credentials_route():
    """Validate stored Kaggle credentials against the API."""
    user_id = getattr(g, "current_user_id", None)
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        is_valid = validate_kaggle_credentials(user_id)
        return jsonify({"valid": is_valid}), 200
    except ValidationError as e:
        return jsonify({
            "valid": False,
            "error": str(e),
            "code": getattr(e, "code", None),
        }), 400
    except Exception as e:
        return jsonify({
            "valid": False,
            "error": f"Validation failed: {str(e)}",
        }), 500


@kaggle_blueprint.route("/dataset/<dataset_id>/export", methods=["POST"])
@token_required
@swag_from(
    {
        "tags": ["kaggle"],
        "summary": "Export dataset to Kaggle (async)",
        "description": "Start async upload to Kaggle. Poll /api/tasks/{task_id} for progress.",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {
                "name": "dataset_id",
                "in": "path",
                "type": "string",
                "required": True,
                "description": "Dataset ID to export",
            },
            {
                "name": "body",
                "in": "body",
                "required": True,
                "schema": {
                    "type": "object",
                    "required": ["title"],
                    "properties": {
                        "title": {
                            "type": "string",
                            "description": "Dataset title for Kaggle",
                        },
                        "description": {
                            "type": "string",
                            "description": "Dataset description",
                        },
                        "is_private": {
                            "type": "boolean",
                            "description": "Whether dataset should be private",
                            "default": True,
                        },
                        "export_config": {
                            "type": "object",
                            "description": "Export configuration",
                        },
                    },
                },
            },
        ],
        "responses": {
            202: {
                "description": "Task started",
                "schema": {
                    "type": "object",
                    "properties": {
                        "success": {"type": "boolean"},
                        "task_id": {"type": "string"},
                    },
                },
            },
            400: {"description": "Invalid request"},
            401: {"description": "Unauthorized"},
        },
    }
)
def export_to_kaggle_route(dataset_id: str):
    """Export a dataset to Kaggle asynchronously."""
    user_id = getattr(g, "current_user_id", None)
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    title = data.get("title", "").strip()
    description = data.get("description", "").strip()
    is_private = data.get("is_private", True)
    export_config = data.get("export_config")

    if not title:
        return jsonify({
            "success": False,
            "error": {"code": "MISSING_TITLE", "message": "Dataset title is required"},
        }), 400

    if len(title) < 3:
        return jsonify({
            "success": False,
            "error": {"code": "INVALID_TITLE", "message": "Title must be at least 3 characters"},
        }), 400

    task = upload_kaggle_task.delay(
        dataset_id=dataset_id,
        user_id=user_id,
        title=title,
        description=description,
        is_private=is_private,
        export_config=export_config,
    )
    init_task(task.id, user_id)

    return jsonify({"success": True, "task_id": task.id}), 202
