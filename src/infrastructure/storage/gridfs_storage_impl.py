import uuid

from bson import ObjectId
from flask import Response, abort, jsonify, stream_with_context
from gridfs import NoFile
from werkzeug.utils import secure_filename

from infrastructure.config.s3_config import S3_STORAGE_ENABLED
from infrastructure.persistence.db_connection import get_fs
from infrastructure.persistence.service_media import link_file_id_to_dataset_id

CHUNK_SIZE = 8192
MAX_FILE_SIZE = 25 * 1024 * 1024
MAX_FILES_PER_UPLOAD = 500
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".webp"}


def _fs():
    return get_fs()


def _allowed_extension(filename: str) -> bool:
    name = (filename or "").lower()
    return any(name.endswith(ext) for ext in ALLOWED_IMAGE_EXTENSIONS)


def _file_size(file) -> int:
    if hasattr(file, "content_length") and file.content_length:
        return file.content_length
    file.seek(0, 2)
    size = file.tell()
    file.seek(0)
    return size


def _validate_image_file(file, *, check_size: bool = True) -> str | None:
    if not file or file.filename == "":
        return "Nenhum arquivo encontrado"
    if not _allowed_extension(file.filename):
        return (
            f"Arquivo {file.filename} tem extensão inválida. "
            f"Permitidas: {', '.join(ALLOWED_IMAGE_EXTENSIONS)}"
        )
    if check_size and _file_size(file) > MAX_FILE_SIZE:
        return f"Arquivo {file.filename} excede o tamanho máximo de 25MB"
    return None


def _upload_to_s3(file, filename: str) -> str:
    from infrastructure.storage.s3_storage_impl import ensure_bucket_exists, upload_file

    ensure_bucket_exists()
    file_id = uuid.uuid4().hex
    data = file.read()
    content_type = getattr(file, "content_type", None) or "application/octet-stream"
    if not upload_file(
        file_id, data, content_type=content_type, metadata={"filename": filename}
    ):
        raise RuntimeError("S3 upload failed")
    return file_id


def _upload_to_gridfs(file, filename: str):
    return _fs().put(file.read(), filename=filename)


def _read_bytes_from_s3(file_id_str: str):
    from infrastructure.storage.s3_storage_impl import get_file

    result = get_file(file_id_str)
    if result is None:
        return None
    body_stream, content_type, _ = result
    return body_stream.read(), content_type or "image/jpeg"


def _read_bytes_from_gridfs(file_id_str: str):
    try:
        oid = ObjectId(file_id_str)
    except Exception:
        return None
    try:
        grid_out = _fs().get(oid)
        return grid_out.read(), grid_out.content_type or "image/jpeg"
    except NoFile:
        return None


def _stream_chunks(read_fn):
    def generate():
        while True:
            chunk = read_fn(CHUNK_SIZE)
            if not chunk:
                break
            yield chunk

    return generate


def _streaming_response(content_type: str, content_length: int, disposition: str, read_fn):
    return Response(
        stream_with_context(_stream_chunks(read_fn)()),
        mimetype=content_type,
        headers={
            "Content-Length": str(content_length),
            "Content-Disposition": disposition,
        },
    )


def load_image_from_grid_fs(file_id):
    grid_out = _fs().get(file_id)
    if not grid_out:
        abort(404, description="File not found")
    return grid_out


def get_image_bytes(file_id: str):
    """Return (bytes, content_type) for an image by file_id, or (None, None) if not found."""
    file_id_str = str(file_id).strip()

    if S3_STORAGE_ENABLED:
        result = _read_bytes_from_s3(file_id_str)
        return result if result is not None else (None, None)

    result = _read_bytes_from_gridfs(file_id_str)
    return result if result is not None else (None, None)


def upload_image_on_grid_fs(file, filename):
    """Store image in GridFS or S3 (MinIO), depending on S3_STORAGE_ENABLED."""
    if S3_STORAGE_ENABLED:
        return _upload_to_s3(file, filename)
    return _upload_to_gridfs(file, filename)


def _get_upload_file(request):
    if "file" not in request.files:
        return None
    file = request.files["file"]
    if file.filename == "":
        return None
    return file


def process_file_to_upload(request):
    file = _get_upload_file(request)
    if file is None:
        return jsonify({"error": "Nenhum arquivo encontrado"}), 400

    filename = secure_filename(file.filename)
    file_id = upload_image_on_grid_fs(file, filename)
    return (
        jsonify({"message": "Arquivo armazenado com sucesso", "file_id": str(file_id)}),
        201,
    )


def upload_content_image(request, base_url_path: str = "/api/gridfs"):
    """
    Upload a single image for use in rich content (e.g. exercise didactic detailing).
    Does not link to any dataset. Returns file_id and url for embedding in markdown.
    """
    file = _get_upload_file(request)
    if file is None:
        return None, "Nenhum arquivo encontrado"

    if not _allowed_extension(file.filename):
        return None, "Extensão não permitida. Use: jpg, png, gif, bmp, tiff, webp"
    if _file_size(file) > MAX_FILE_SIZE:
        return None, "Arquivo excede 25MB"

    filename = secure_filename(f"{uuid.uuid4()}_{file.filename or 'image'}")
    file_id = upload_image_on_grid_fs(file, filename)
    url = f"{base_url_path.rstrip('/')}/image/{file_id}"
    return {"file_id": str(file_id), "url": url}, None


def _upload_batch_files(files: list):
    file_ids = []
    for file in files:
        if file.filename == "":
            continue

        error = _validate_image_file(file)
        if error:
            return None, (jsonify({"error": error}), 400)

        file_id = upload_image_on_grid_fs(file, secure_filename(str(uuid.uuid4())))
        file_ids.append(str(file_id))

    if not file_ids:
        return None, (jsonify({"error": "Arquivos inválidos"}), 400)

    return file_ids, None


def process_multiple_files_to_upload(request, user_id_from_token=None):
    """Process multiple file uploads with validation."""
    dataset_id = request.form.get("datasetId")
    user_id = user_id_from_token or request.form.get("userId")
    media_name = request.form.get("mediaName")

    if "file" not in request.files:
        return jsonify({"error": "Nenhum arquivo encontrado"}), 400

    files = request.files.getlist("file")
    if not files:
        return jsonify({"error": "Nenhum arquivo encontrado"}), 400
    if len(files) > MAX_FILES_PER_UPLOAD:
        return jsonify({"error": "Máximo de 500 arquivos por envio permitidos"}), 400

    file_ids, error = _upload_batch_files(files)
    if error:
        return error

    link_file_id_to_dataset_id(file_ids, media_name, dataset_id, user_id)
    return (
        jsonify({"message": "Arquivos armazenados com sucesso", "file_ids": file_ids}),
        201,
    )


def _stream_from_s3(file_id_str: str) -> Response | None:
    from infrastructure.storage.s3_storage_impl import get_file

    result = get_file(file_id_str)
    if result is None:
        return None

    body_stream, content_type, content_length = result
    return _streaming_response(
        content_type,
        content_length,
        f'inline; filename="{file_id_str}"',
        body_stream.read,
    )


def _stream_from_gridfs(file_id_str: str) -> Response:
    try:
        oid = ObjectId(file_id_str)
    except Exception:
        abort(404, description="File not found")

    try:
        grid_out = _fs().get(oid)
    except NoFile:
        abort(404, description="File not found")

    return _streaming_response(
        grid_out.content_type or "application/octet-stream",
        grid_out.length,
        f'inline; filename="{grid_out.filename}"',
        grid_out.read,
    )


def load_image_gridfs(file_id: str | ObjectId) -> Response:
    """Stream a file from S3 (MinIO) first, then GridFS for backward compatibility."""
    file_id_str = str(file_id).strip()

    if S3_STORAGE_ENABLED:
        response = _stream_from_s3(file_id_str)
        if response is not None:
            return response

    return _stream_from_gridfs(file_id_str)
