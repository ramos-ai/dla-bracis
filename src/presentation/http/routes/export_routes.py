"""
Export routes: dataset ZIP (JSON + images + labels + data.yaml), JSON-only, and admin response export.
"""

from flasgger import swag_from
from flask import Blueprint, g, jsonify, request, send_file

from application.datasets import (
    export_dataset_json as get_dataset_json,
)
from application.datasets import (
    export_dataset_zip as build_dataset_zip,
)
from application.datasets.export_config import ExportConfig
from application.datasets.export_dataset_zip import export_dataset_zip_with_config
from application.exercises.facade import get_responses_export
from domain.exceptions import NotFoundError, ValidationError
from infrastructure.cache import cache
from infrastructure.cache.cache_keys import CacheKeys
from infrastructure.celery.jobs.export import export_dataset_task
from infrastructure.celery.task_status import init_task
from infrastructure.persistence.service_media import get_dataset_export_stats
from presentation.http.dependencies.auth_dependency import (
from shared.logger import get_logger

logger = get_logger(__name__)
    admin_required,
    token_required,
)

export_blueprint = Blueprint("export", __name__)


@export_blueprint.route("/dataset/<dataset_id>/json", methods=["GET"])
@token_required
@swag_from(
    {
        "tags": ["export"],
        "summary": "Export dataset as JSON only (same content as dataset.json inside the ZIP)",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {"name": "dataset_id", "in": "path", "type": "string", "required": True}
        ],
        "responses": {
            200: {"description": "JSON (dataset.json content)"},
            400: {"description": "Invalid dataset_id"},
            404: {"description": "Dataset not found"},
        },
    }
)
def export_dataset_json_route(dataset_id: str):
    """Return only the dataset JSON (for download as .json). Same structure as inside the full ZIP."""
    try:
        data = get_dataset_json(dataset_id)
        return jsonify(data), 200
    except ValidationError as e:
        return jsonify({"message": str(e)}), 400
    except NotFoundError as e:
        return jsonify({"message": str(e)}), 404
    except Exception as e:
        return jsonify({"message": f"Error building export: {str(e)}"}), 500


@export_blueprint.route("/dataset/<dataset_id>", methods=["GET"])
@token_required
@swag_from(
    {
        "tags": ["export"],
        "summary": "Export dataset as ZIP (dataset.json, images/, labels/, data.yaml)",
        "description": "Returns a single ZIP with: dataset.json, images (JPG max 1024px, id in filename), "
        "labels/ for YOLO segmentation, data.yaml. Classification: folders by label; "
        "Detection: COCO; Segmentation: YOLO.",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {"name": "dataset_id", "in": "path", "type": "string", "required": True}
        ],
        "responses": {
            200: {"description": "ZIP file (dataset_<id>.zip)"},
            400: {"description": "Invalid dataset_id"},
            404: {"description": "Dataset not found"},
        },
    }
)
def export_dataset_route(dataset_id: str):
    """GET: simple export (66/34 split). Backward compatible."""
    try:
        buf = build_dataset_zip(dataset_id)
        return send_file(
            buf,
            mimetype="application/zip",
            as_attachment=True,
            download_name=f"dataset_{dataset_id}.zip",
        )
    except ValidationError as e:
        return jsonify({"message": str(e)}), 400
    except NotFoundError as e:
        return jsonify({"message": str(e)}), 404
    except Exception as e:
        return jsonify({"message": f"Error building export: {str(e)}"}), 500


@export_blueprint.route("/dataset/<dataset_id>/stats", methods=["GET"])
@token_required
def export_dataset_stats_route(dataset_id: str):
    """GET: return {total, labelled, unlabelled} for export config modal."""
    try:
        from bson import ObjectId

        if not dataset_id or not ObjectId.is_valid(dataset_id):
            return jsonify({"message": "Invalid dataset_id"}), 400

        cache_key = CacheKeys.export_stats(dataset_id)
        cached = cache.get(cache_key)
        if cached is not None:
            return jsonify(cached), 200

        stats = get_dataset_export_stats(dataset_id)
        cache.set(cache_key, stats, timeout=CacheKeys.TTL_MEDIUM)
        return jsonify(stats), 200
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@export_blueprint.route("/dataset/<dataset_id>/configured", methods=["POST"])
@token_required
@swag_from(
    {
        "tags": ["export"],
        "summary": "Export dataset with custom configuration",
        "description": "POST JSON body with export config (split, format, image options). Returns ZIP.",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {"name": "dataset_id", "in": "path", "type": "string", "required": True},
            {
                "name": "body",
                "in": "body",
                "required": True,
                "schema": {
                    "type": "object",
                    "properties": {
                        "mode": {"type": "string", "enum": ["simple", "custom"]},
                        "split_mode": {"type": "string", "enum": ["auto", "manual"]},
                        "train_pct": {"type": "number"},
                        "val_pct": {"type": "number"},
                        "test_pct": {"type": "number"},
                        "include_train": {"type": "boolean"},
                        "include_val": {"type": "boolean"},
                        "include_test": {"type": "boolean"},
                        "manual_splits": {
                            "type": "object",
                            "properties": {
                                "train": {"type": "array", "items": {"type": "string"}},
                                "val": {"type": "array", "items": {"type": "string"}},
                                "test": {"type": "array", "items": {"type": "string"}},
                            },
                        },
                        "max_width": {"type": "integer"},
                        "jpeg_quality": {"type": "integer"},
                        "keep_original_resolution": {"type": "boolean"},
                        "seed": {"type": "integer"},
                    },
                },
            },
        ],
        "responses": {
            200: {"description": "ZIP file"},
            400: {"description": "Invalid config"},
            404: {"description": "Dataset not found"},
        },
    }
)
def export_dataset_configured_route(dataset_id: str):
    """POST: export with configurable split, format, image options."""
    try:
        data = request.get_json(silent=True) or {}
        config = ExportConfig.from_dict(data)
        buf = export_dataset_zip_with_config(dataset_id, config)
        return send_file(
            buf,
            mimetype="application/zip",
            as_attachment=True,
            download_name=f"dataset_{dataset_id}.zip",
        )
    except ValidationError as e:
        return jsonify({"message": str(e)}), 400
    except NotFoundError as e:
        return jsonify({"message": str(e)}), 404
    except Exception as e:
        return jsonify({"message": f"Error building export: {str(e)}"}), 500


@export_blueprint.route("/dataset/<dataset_id>/async", methods=["POST"])
@token_required
@swag_from(
    {
        "tags": ["export"],
        "summary": "Export dataset asynchronously",
        "description": "Start async export task. Poll /api/tasks/{task_id} for progress.",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {"name": "dataset_id", "in": "path", "type": "string", "required": True},
            {
                "name": "body",
                "in": "body",
                "required": False,
                "schema": {
                    "type": "object",
                    "properties": {
                        "mode": {"type": "string", "enum": ["simple", "custom"]},
                        "train_pct": {"type": "number"},
                        "val_pct": {"type": "number"},
                        "test_pct": {"type": "number"},
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
            400: {"description": "Invalid dataset_id"},
        },
    }
)
def export_dataset_async_route(dataset_id: str):
    """POST: start async export task."""
    from bson import ObjectId

    if not dataset_id or not ObjectId.is_valid(dataset_id):
        return jsonify({"success": False, "message": "Invalid dataset_id"}), 400

    user_id = getattr(g, "current_user_id", None)
    config = request.get_json(silent=True) or {}

    task = export_dataset_task.delay(dataset_id, config, user_id)
    init_task(task.id, user_id)

    return jsonify({"success": True, "task_id": task.id}), 202


@export_blueprint.route("/download/<task_id>", methods=["GET"])
@token_required
@swag_from(
    {
        "tags": ["export"],
        "summary": "Download exported ZIP by task ID",
        "description": "Download the ZIP file generated by an async export task.",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {"name": "task_id", "in": "path", "type": "string", "required": True}
        ],
        "responses": {
            200: {"description": "ZIP file"},
            404: {"description": "File not found or expired"},
        },
    }
)
def download_export_route(task_id: str):
    """GET: download exported ZIP by task ID (for local storage mode)."""
    import os
    import tempfile

    export_dir = os.path.join(tempfile.gettempdir(), "dla_exports")

    for filename in os.listdir(export_dir) if os.path.exists(export_dir) else []:
        if task_id in filename and filename.endswith(".zip"):
            filepath = os.path.join(export_dir, filename)
            if os.path.exists(filepath):
                dataset_id = filename.split("_")[0] if "_" in filename else "dataset"
                return send_file(
                    filepath,
                    mimetype="application/zip",
                    as_attachment=True,
                    download_name=f"dataset_{dataset_id}.zip",
                )

    return jsonify({"message": "Export file not found or expired"}), 404


@export_blueprint.route("/responses", methods=["GET"])
@token_required
@admin_required
@swag_from(
    {
        "tags": ["export"],
        "summary": "[Admin] Exportar respostas (assistidas e/ou livres) com filtros em JSON",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {
                "name": "dataset_ids",
                "in": "query",
                "type": "string",
                "description": "Comma-separated dataset IDs (optional)",
            },
            {
                "name": "task_type",
                "in": "query",
                "type": "string",
                "enum": ["classification", "detection", "segmentation"],
                "description": "Filtrar por tipo de dataset (opcional)",
            },
            {
                "name": "include_labelled",
                "in": "query",
                "type": "boolean",
                "description": "Include supervised practice answers (default: true)",
            },
            {
                "name": "include_unlabelled",
                "in": "query",
                "type": "boolean",
                "description": "Include unsupervised practice answers (default: true)",
            },
        ],
        "responses": {
            200: {"description": "JSON with export data"},
            403: {"description": "Apenas administrador"},
        },
    }
)
def export_responses_route():
    """Return JSON payload for download: responses grouped by dataset, with filters."""
    dataset_ids_param = request.args.get("dataset_ids", "").strip()
    dataset_ids = (
        [x.strip() for x in dataset_ids_param.split(",") if x.strip()]
        if dataset_ids_param
        else None
    )
    task_type = request.args.get("task_type", "").strip() or None
    include_labelled = request.args.get("include_labelled", "true").lower() in (
        "true",
        "1",
        "yes",
    )
    include_unlabelled = request.args.get("include_unlabelled", "true").lower() in (
        "true",
        "1",
        "yes",
    )
    payload = get_responses_export(
        dataset_ids=dataset_ids,
        task_type=task_type,
        include_labelled=include_labelled,
        include_unlabelled=include_unlabelled,
    )
    return jsonify(payload), 200
