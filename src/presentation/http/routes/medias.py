import os

from flasgger import swag_from
from flask import Blueprint, g, jsonify, request

from application.medias import (
    get_image_metadata_by_dataset_file,
    get_image_metadata_by_path_filename,
    get_images_by_dataset_id,
    get_images_with_metadata,
    get_labelled_medias_response,
    get_labels_for_file,
    get_medias_filtered_for_export_picker,
    get_unlabelled_medias_response,
    labelling_save,
    labelling_save_legacy,
    upload_files_legacy,
)
from domain.exceptions import DatabaseError, ValidationError
from infrastructure.cache import cache
from infrastructure.cache.cache_invalidation import invalidate_annotation_caches
from infrastructure.cache.cache_keys import CacheKeys
from infrastructure.config.settings import Settings
from presentation.http.dependencies.auth_dependency import token_required
from presentation.http.schemas import LabellingSave2DTO
from shared.logger import get_logger

logger = get_logger(__name__)

medias_blueprint = Blueprint("medias", __name__)


def get_image_directory(path):
    settings = Settings()
    absolute_image_path = settings.get_absolute_image_path()
    return os.path.join(absolute_image_path, path)


@medias_blueprint.route("/images_with_metadata", methods=["GET"])
def get_images_with_metadata_route():
    dataset_id = request.args.get("dataset_id")

    cache_key = CacheKeys.medias_metadata(dataset_id)
    cached = cache.get(cache_key)
    if cached is not None:
        return jsonify(cached)

    medias_metadata = get_images_with_metadata(dataset_id)
    cache.set(cache_key, medias_metadata, timeout=CacheKeys.TTL_MEDIUM)
    return jsonify(medias_metadata)


@medias_blueprint.route("/images_by_dataset_id", methods=["GET"])
@token_required
def get_images_by_dataset_id_route():
    """Get image IDs by dataset (requires authentication).
    With pagination: ?dataset_id=...&page=1&per_page=30 (response includes total, page, per_page, items with file_id and media_name).
    Without page/per_page returns up to 2000 IDs (capped for performance)."""
    dataset_id = request.args.get("dataset_id")
    page = request.args.get("page", type=int)
    per_page = request.args.get("per_page", type=int)
    out = get_images_by_dataset_id(dataset_id, page, per_page)
    if out.get("total") is not None:
        return jsonify(
            {
                "file_ids": out["file_ids"],
                "items": out["items"],
                "total": out["total"],
                "page": out["page"],
                "per_page": out["per_page"],
            }
        )
    return jsonify(out["file_ids"])


@medias_blueprint.route("/image_metadata/<path:path>/<filename>", methods=["GET"])
def get_image_metadata_route(filename, path):
    try:
        labelled_data = get_image_metadata_by_path_filename(path, filename)
        return jsonify(labelled_data if labelled_data else [])
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@medias_blueprint.route("/medias/labelled_medias/<dataset_id>", methods=["GET"])
@token_required
def get_labelled_medias_by_dataset_route(dataset_id):
    try:
        page = request.args.get("page", type=int)
        per_page = request.args.get("per_page", type=int)

        cache_key = CacheKeys.medias_labelled(dataset_id, page)
        cached = cache.get(cache_key)
        if cached is not None:
            return jsonify(cached)

        out = get_labelled_medias_response(dataset_id, page, per_page)
        cache.set(cache_key, out, timeout=CacheKeys.TTL_MEDIUM)
        if isinstance(out, dict):
            return jsonify(out)
        return jsonify(out)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@medias_blueprint.route("/medias/export_picker_medias/<dataset_id>", methods=["GET"])
@token_required
def get_export_picker_medias_route(dataset_id):
    """Get file_ids for export manual split picker, optionally filtered by class.
    Query params: split (train|val|test), include_unlabelled (bool), task_type, class_indices (comma-separated 0-based indices).
    """
    try:
        split = request.args.get("split", "train")
        include_unlabelled = request.args.get("include_unlabelled", "false").lower() in ("true", "1")
        task_type = request.args.get("task_type", "")
        raw_indices = request.args.get("class_indices", "")
        class_indices = None
        if raw_indices:
            try:
                class_indices = [int(x.strip()) for x in raw_indices.split(",") if x.strip()]
            except ValueError:
                class_indices = []
        ids = get_medias_filtered_for_export_picker(
            dataset_id, task_type, split, include_unlabelled, class_indices
        )
        return jsonify({"file_ids": ids})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@medias_blueprint.route("/medias/unlabelled_medias/<dataset_id>", methods=["GET"])
@token_required
def get_unlabelled_medias_by_dataset_route(dataset_id):
    try:
        page = request.args.get("page", type=int)
        per_page = request.args.get("per_page", type=int)

        cache_key = CacheKeys.medias_unlabelled(dataset_id, page)
        cached = cache.get(cache_key)
        if cached is not None:
            return jsonify(cached)

        out = get_unlabelled_medias_response(dataset_id, page, per_page)
        cache.set(cache_key, out, timeout=CacheKeys.TTL_MEDIUM)
        if isinstance(out, dict):
            return jsonify(out)
        return jsonify(out)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@medias_blueprint.route("/image_metadata2/<path:path>/<file_id>", methods=["GET"])
def get_image_metadata2_route(file_id, path):
    try:
        labelled_data = get_image_metadata_by_dataset_file(path, file_id)
        return jsonify(labelled_data if labelled_data else [])
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@medias_blueprint.route("/training/labels", methods=["GET"])
@token_required
def get_labels_for_file_route():
    """Get labels for a specific media item."""
    try:
        dataset_id = request.args.get("dataset_id")
        file_id = request.args.get("file_id")
        if not dataset_id or not file_id:
            return jsonify({"error": "dataset_id and file_id are required"}), 400
        result = get_labels_for_file(dataset_id, file_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@medias_blueprint.route("/training/labels/batch", methods=["POST"])
@token_required
def get_labels_batch_route():
    """Get labels for multiple media items at once. Returns {file_id: labels[]} map."""
    try:
        data = request.json
        if not data:
            return jsonify({"error": "Request body is required"}), 400
        dataset_id = data.get("dataset_id")
        file_ids = data.get("file_ids", [])
        if not dataset_id:
            return jsonify({"error": "dataset_id is required"}), 400
        if not file_ids or not isinstance(file_ids, list):
            return jsonify({"error": "file_ids must be a non-empty array"}), 400
        if len(file_ids) > 500:
            return jsonify({"error": "Maximum 500 file_ids per request"}), 400

        from application.medias import get_labels_for_file

        result = {}
        for fid in file_ids:
            try:
                labels_data = get_labels_for_file(dataset_id, str(fid))
                result[str(fid)] = labels_data.get("labels", [])
            except Exception:
                result[str(fid)] = []
        return jsonify({"labels_map": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@medias_blueprint.route("/upload", methods=["POST"])
def upload_files_route():
    try:
        media_path = request.form.get("media_path")
        insert_user = request.form.get("insert_user")
        if not media_path:
            return jsonify({"error": "media_path is required"}), 400
        absolute_image_path = Settings().get_absolute_image_path()
        files_list = [(f.filename, f) for f in request.files.getlist("media")]
        result = upload_files_legacy(
            media_path, insert_user or "", files_list, absolute_image_path
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@medias_blueprint.route("media/training/save", methods=["POST"])
def labelling_save_route():
    data = request.json
    required_fields = ["media_path", "filename", "labels"]
    for field in required_fields:
        if field not in data:
            return jsonify({"mensagem": f"O campo {field} é obrigatório."}), 400
    result = labelling_save_legacy(
        data["media_path"],
        data["filename"],
        data["labels"],
        data.get("update_user", ""),
    )
    return jsonify(result)


@medias_blueprint.route("/training/save", methods=["POST", "OPTIONS"])
@token_required
@swag_from(
    {
        "tags": ["medias"],
        "summary": "Save labels for a media item",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {
                "name": "body",
                "in": "body",
                "required": True,
                "schema": {
                    "type": "object",
                    "required": ["dataset_id", "file_id", "labels", "update_user"],
                    "properties": {
                        "dataset_id": {"type": "string"},
                        "file_id": {"type": "string"},
                        "labels": {
                            "type": "array",
                            "items": {"type": "string"},
                            "minItems": 0,
                            "maxItems": 20,
                        },
                        "update_user": {"type": "string"},
                    },
                },
            }
        ],
        "responses": {
            200: {"description": "Labels salvos com sucesso"},
            400: {"description": "Validation error"},
        },
    }
)
def labelling_save2_route():
    """Save labels for a media item with validations."""
    try:
        data = request.json
        if not data:
            raise ValidationError("Request body is required")
        user_id = g.current_user_id
        if not user_id:
            raise ValidationError("User ID not found in token", "update_user")
        data["update_user"] = user_id
        dto = LabellingSave2DTO(data)
        labelling_save(dto.dataset_id, dto.file_id, dto.labels, dto.update_user)
        invalidate_annotation_caches(dto.dataset_id, dto.file_id)
        return jsonify({"message": "Success!"})
    except ValidationError:
        raise
    except Exception as e:
        raise DatabaseError(f"Error saving labels: {str(e)}", "labelling_save2")
