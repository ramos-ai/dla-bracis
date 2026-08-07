from datetime import datetime

from infrastructure.persistence.db_connection import get_db_dla


def _db():
    return get_db_dla()


def get_media_metadata_by_id(media_id):
    labelled_document = _db().labelled.find_one({"filename": media_id})
    return labelled_document


def get_labelled_by_media_path_filename(media_path: str, filename: str):
    """Legacy: find labelled doc by media_path and filename. Returns dict or None."""
    doc = _db().labelled.find_one(
        {"media_path": media_path, "filename": filename}, {"_id": 0}
    )
    return doc


def get_labelled_by_dataset_file(dataset_id: str, file_id: str):
    """Find labelled doc by dataset_id and file_id. Returns dict or None (without _id)."""
    from infrastructure.persistence.object_id_utils import to_object_id

    dataset_oid = to_object_id(dataset_id)
    if dataset_oid:
        doc = _db().labelled.find_one(
            {
                "$or": [
                    {"dataset_id": dataset_oid, "file_id": file_id},
                    {"dataset_id": dataset_id, "file_id": file_id},
                ]
            },
            {"_id": 0},
        )
    else:
        doc = _db().labelled.find_one(
            {"dataset_id": dataset_id, "file_id": file_id}, {"_id": 0}
        )
    return doc


def upsert_labelled_legacy(
    media_path: str, filename: str, labels: list, update_user: str
):
    """Legacy schema: upsert by media_path + filename. Returns True."""

    result = _db().labelled.update_one(
        {"media_path": media_path, "filename": filename},
        {
            "$set": {
                "labels": labels,
                "media_path": media_path,
                "filename": filename,
                "last_update": datetime.now(),
                "update_user": update_user,
            },
            "$setOnInsert": {"insert_date": datetime.now()},
        },
        upsert=True,
    )
    return result.upserted_id is not None or result.modified_count > 0


def upsert_labelled(dataset_id: str, file_id: str, labels: list, update_user: str):
    """Upsert labels by dataset_id + file_id. Returns True."""
    from infrastructure.persistence.object_id_utils import to_object_id

    dataset_oid = to_object_id(dataset_id)
    user_oid = to_object_id(update_user)

    if dataset_oid:
        filter_criteria = {
            "$or": [
                {"dataset_id": dataset_oid, "file_id": file_id},
                {"dataset_id": dataset_id, "file_id": file_id},
            ]
        }
    else:
        filter_criteria = {"dataset_id": dataset_id, "file_id": file_id}

    result = _db().labelled.update_one(
        filter_criteria,
        {
            "$set": {
                "labels": labels,
                "dataset_id": dataset_oid if dataset_oid else dataset_id,
                "file_id": file_id,
                "last_update": datetime.now(),
                "update_user": user_oid if user_oid else update_user,
            },
            "$setOnInsert": {"insert_date": datetime.now()},
        },
        upsert=True,
    )
    return result.upserted_id is not None or result.modified_count > 0


def insert_labelled_legacy_many(docs: list):
    """Insert many legacy labelled docs (media_path, filename, insert_date, insert_user)."""
    if not docs:
        return
    _db().labelled.insert_many(docs)


def legacy_upload_write_and_insert(
    absolute_base_path: str, media_path: str, insert_user: str, files_list: list
):
    """
    Legacy upload: write files to absolute_base_path/media_path with unique names, insert labelled docs.
    files_list: list of (original_filename, file_stream with .read()).
    Returns (list of saved unique filenames,).
    """
    import os
    import uuid

    target_dir = os.path.join(absolute_base_path, media_path)
    if not os.path.exists(target_dir):
        os.makedirs(target_dir)
    saved_filenames = []
    stack_to_insert = []
    for file_tuple in files_list:
        if len(file_tuple) < 2:
            continue
        original_name = file_tuple[0]
        file_stream = file_tuple[1]
        unique_name = str(uuid.uuid4()) + "_" + (original_name or "file")
        file_path = os.path.join(target_dir, unique_name)
        try:
            if hasattr(file_stream, "save"):
                file_stream.save(file_path)
            else:
                data = (
                    file_stream.read()
                    if hasattr(file_stream, "read")
                    else file_tuple[1]
                )
                with open(file_path, "wb") as f:
                    f.write(data)
        except Exception:
            continue
        saved_filenames.append(unique_name)
        stack_to_insert.append(
            {
                "media_path": media_path,
                "filename": unique_name,
                "insert_date": datetime.now(),
                "insert_user": insert_user,
            }
        )
    if stack_to_insert:
        insert_labelled_legacy_many(stack_to_insert)
    return saved_filenames
