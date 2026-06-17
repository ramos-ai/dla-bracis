"""
Task status routes - polling endpoint for async task progress.
"""

import os
import tempfile

from flasgger import swag_from
from flask import Blueprint, jsonify, send_file

from infrastructure.celery.task_status import get_task_status
from presentation.http.dependencies.auth_dependency import token_required
from shared.logger import get_logger

logger = get_logger(__name__)

tasks_blueprint = Blueprint("tasks", __name__)


@tasks_blueprint.route("/<task_id>", methods=["GET"])
@token_required
@swag_from(
    {
        "tags": ["tasks"],
        "summary": "Get task status",
        "description": "Poll for async task progress and result.",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {
                "name": "task_id",
                "in": "path",
                "type": "string",
                "required": True,
                "description": "Task ID returned from async operation",
            }
        ],
        "responses": {
            200: {
                "description": "Task status",
                "schema": {
                    "type": "object",
                    "properties": {
                        "status": {
                            "type": "string",
                            "enum": ["PENDING", "PROCESSING", "DONE", "FAILED"],
                        },
                        "progress": {"type": "integer", "minimum": 0, "maximum": 100},
                        "result": {"type": "object"},
                        "error": {"type": "string"},
                    },
                },
            },
            404: {"description": "Task not found"},
        },
    }
)
def get_task_status_route(task_id: str):
    """Get status of an async task."""
    status = get_task_status(task_id)

    if not status:
        return jsonify({"error": "Task not found"}), 404

    return jsonify({
        "status": status.get("status", "PENDING"),
        "progress": status.get("progress", 0),
        "result": status.get("result"),
        "error": status.get("error"),
    }), 200


@tasks_blueprint.route("/download/<task_id>", methods=["GET"])
@token_required
def download_export_route(task_id: str):
    """Download exported file for a completed task."""
    status = get_task_status(task_id)

    if not status:
        return jsonify({"error": "Task not found"}), 404

    if status.get("status") != "DONE":
        return jsonify({"error": "Export not ready"}), 400

    result = status.get("result", {})
    dataset_id = result.get("dataset_id")

    if not dataset_id:
        return jsonify({"error": "Invalid export result"}), 400

    export_dir = os.path.join(tempfile.gettempdir(), "dla_exports")
    filename = f"{dataset_id}_{task_id}.zip"
    filepath = os.path.join(export_dir, filename)

    if not os.path.exists(filepath):
        return jsonify({"error": "Export file not found"}), 404

    return send_file(
        filepath,
        mimetype="application/zip",
        as_attachment=True,
        download_name=f"dataset_{dataset_id}.zip",
    )
