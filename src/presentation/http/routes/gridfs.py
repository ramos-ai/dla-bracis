from bson import ObjectId
from flasgger import swag_from
from flask import Blueprint, Response, abort, jsonify, request

from domain.exceptions import DatabaseError, ValidationError
from infrastructure.storage.gridfs_storage_impl import (
    load_image_from_grid_fs,
    load_image_gridfs,
    process_file_to_upload,
    process_multiple_files_to_upload,
    upload_content_image,
)
from presentation.http.dependencies.auth_dependency import token_required
from presentation.http.schemas import MediaUploadDTO
from shared.logger import get_logger

logger = get_logger(__name__)

gridfs_blueprint = Blueprint("gridfs", __name__)


@gridfs_blueprint.route("/upload", methods=["POST"])
@token_required
def upload_file_route():
    result = process_file_to_upload(request)
    return result


@gridfs_blueprint.route("/upload_content_image", methods=["POST"])
@token_required
def upload_content_image_route():
    """Upload a single image for use in rich content (e.g. exercise didactic detailing). Returns file_id and url for markdown."""
    data, err = upload_content_image(request, base_url_path="/api/gridfs")
    if err:
        return jsonify({"error": err}), 400
    return jsonify(data), 201


@gridfs_blueprint.route("/upload_images", methods=["POST"])
@token_required
@swag_from(
    {
        "tags": ["gridfs"],
        "summary": "Upload multiple images",
        "security": [{"BearerAuth": []}],
        "consumes": ["multipart/form-data"],
        "parameters": [
            {
                "name": "datasetId",
                "in": "formData",
                "type": "string",
                "required": True,
                "description": "ID do dataset",
            },
            {
                "name": "userId",
                "in": "formData",
                "type": "string",
                "required": True,
                "description": "User ID",
            },
            {
                "name": "mediaName",
                "in": "formData",
                "type": "string",
                "required": True,
                "description": "Media name (3-100 characters)",
                "minLength": 3,
                "maxLength": 100,
            },
            {
                "name": "file",
                "in": "formData",
                "type": "file",
                "required": True,
                "description": "Image files (1-50 files, max 10MB each)",
                "collectionFormat": "multi",
            },
        ],
        "responses": {
            201: {
                "description": "Imagens enviadas com sucesso",
                "schema": {
                    "type": "object",
                    "properties": {
                        "message": {"type": "string"},
                        "file_ids": {"type": "array", "items": {"type": "string"}},
                    },
                },
            },
            400: {"description": "Validation error"},
        },
    }
)
def upload_files_route():
    """Upload multiple images with validations."""
    try:
        from flask import g

        user_id = g.current_user_id
        if not user_id:
            raise ValidationError("User ID not found in token", "userId")

        from werkzeug.datastructures import MultiDict

        form_data = MultiDict(request.form)
        form_data["userId"] = user_id

        files = request.files.getlist("file")
        MediaUploadDTO(form_data, files)

        result = process_multiple_files_to_upload(request, user_id)
        return result
    except ValidationError:
        raise
    except Exception as e:
        raise DatabaseError(f"Error uploading images: {str(e)}", "upload_images")


@gridfs_blueprint.route("/image_old/<file_id>", methods=["GET"])
def serve_image_old_route(file_id):
    try:
        file_id = ObjectId(file_id)
    except Exception:
        abort(400, description="Invalid file ID")

    grid_out = load_image_from_grid_fs(file_id)

    return Response(grid_out.read(), mimetype=grid_out.content_type)


@gridfs_blueprint.route("/image/<file_id>", methods=["GET"])
def serve_image_route(file_id):
    return load_image_gridfs(file_id)
