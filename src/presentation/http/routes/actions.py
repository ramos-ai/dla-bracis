
from flasgger import swag_from
from flask import Blueprint, g, jsonify, request

from domain.exceptions import DatabaseError, NotFoundError, ValidationError
from infrastructure.persistence.service_actions import (
    delete_action,
    delete_all_user_actions,
    get_all_user_actions,
    get_user_actions,
    save_action,
)
from presentation.http.dependencies.auth_dependency import token_required
from shared.logger import get_logger

logger = get_logger(__name__)

actions_blueprint = Blueprint("actions", __name__)


@actions_blueprint.route("/save", methods=["POST"])
@token_required
@swag_from(
    {
        "tags": ["actions"],
        "summary": "Save a user action",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {
                "name": "body",
                "in": "body",
                "required": True,
                "schema": {
                    "type": "object",
                    "required": ["action_type", "description"],
                    "properties": {
                        "action_type": {"type": "string"},
                        "description": {"type": "string"},
                        "metadata": {"type": "object"},
                    },
                },
            }
        ],
        "responses": {
            200: {"description": "Action saved successfully"},
            400: {"description": "Validation error"},
        },
    }
)
def save_action_route():
    """Save a user action."""
    try:
        user_id = g.current_user_id
        data = request.json

        if not data:
            raise ValidationError("Request body is required")

        action_type = data.get("action_type")
        description = data.get("description")
        metadata = data.get("metadata", {})

        if not action_type or not description:
            raise ValidationError("action_type and description are required")

        action_id = save_action(user_id, action_type, description, metadata)

        if action_id:
            return jsonify({"success": True, "action_id": action_id}), 200
        else:
            raise DatabaseError("Error saving action", "save_action")
    except ValidationError:
        raise
    except Exception as e:
        logger.exception("Error in save_action_route")
        raise DatabaseError(f"Error saving action: {str(e)}", "save_action")


@actions_blueprint.route("/recent", methods=["GET"])
@token_required
@swag_from(
    {
        "tags": ["actions"],
        "summary": "Get recent user actions",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {
                "name": "limit",
                "in": "query",
                "type": "integer",
                "default": 10,
                "description": "Maximum number of actions to return",
            }
        ],
        "responses": {200: {"description": "Actions returned successfully"}},
    }
)
def get_recent_actions_route():
    """Get recent user actions."""
    try:
        user_id = str(g.current_user_id)
        limit = request.args.get("limit", 10, type=int)

        actions = get_user_actions(user_id, limit)
        return jsonify({"actions": actions}), 200
    except Exception as e:
        logger.exception("Error in get_recent_actions_route")
        raise DatabaseError(f"Error getting actions: {str(e)}", "get_actions")


@actions_blueprint.route("/all", methods=["GET"])
@token_required
@swag_from(
    {
        "tags": ["actions"],
        "summary": "Get all user actions",
        "security": [{"BearerAuth": []}],
        "responses": {200: {"description": "Actions returned successfully"}},
    }
)
def get_all_actions_route():
    """Get all user actions."""
    try:
        user_id = str(g.current_user_id)

        actions = get_all_user_actions(user_id)
        return jsonify({"actions": actions}), 200
    except Exception as e:
        logger.exception("Error in get_all_actions_route")
        raise DatabaseError(f"Error getting all actions: {str(e)}", "get_all_actions")


@actions_blueprint.route("/<action_id>", methods=["DELETE"])
@token_required
@swag_from(
    {
        "tags": ["actions"],
        "summary": "Remove a notification (action) from the user",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {"name": "action_id", "in": "path", "type": "string", "required": True}
        ],
        "responses": {
            200: {"description": "Removida com sucesso"},
            404: {"description": "Action not found or does not belong to the user"},
        },
    }
)
def delete_action_route(action_id):
    """Remove a user action (only the user's own)."""
    try:
        user_id = str(g.current_user_id)
        removed = delete_action(action_id, user_id)
        if not removed:
            raise NotFoundError("Action", action_id)
        return jsonify({"success": True}), 200
    except NotFoundError:
        raise
    except Exception as e:
        logger.exception("Error in delete_action_route")
        raise DatabaseError(f"Error deleting action: {str(e)}", "delete_action")


@actions_blueprint.route("/clear", methods=["POST"])
@token_required
@swag_from(
    {
        "tags": ["actions"],
        "summary": "Remove all notifications (actions) from the user",
        "security": [{"BearerAuth": []}],
        "responses": {200: {"description": "Quantidade removida"}},
    }
)
def clear_all_actions_route():
    """Remove all actions for the user."""
    try:
        user_id = str(g.current_user_id)
        deleted_count = delete_all_user_actions(user_id)
        return jsonify({"success": True, "deleted_count": deleted_count}), 200
    except Exception as e:
        logger.exception("Error in clear_all_actions_route")
        raise DatabaseError(f"Error clearing actions: {str(e)}", "clear_actions")
