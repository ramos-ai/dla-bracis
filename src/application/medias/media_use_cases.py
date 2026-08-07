"""
Media use cases: all media/labelled read-write orchestration. No DB access in presentation layer.
"""

from infrastructure.persistence.service_labelled import (
    get_labelled_by_dataset_file,
    get_labelled_by_media_path_filename,
    get_media_metadata_by_id,
    legacy_upload_write_and_insert,
    upsert_labelled,
    upsert_labelled_legacy,
)
from infrastructure.persistence.service_media import (
    MEDIA_LIST_MAX_ALL,
    get_labelled_file_ids_all,
    get_labelled_medias_paginated,
    get_media_ids_by_dataset_id,
    get_media_page_with_names,
    get_medias_filtered_by_classes,
    get_unlabelled_file_ids_all,
    get_unlabelled_medias_paginated,
)


def get_images_with_metadata(dataset_id: str):
    """
    Return list of {media_id, labels?, update_user?, last_update?} or {media_id} for each media in dataset.
    Capped at MEDIA_LIST_MAX_ALL to avoid unbounded responses.
    """
    media_ids = get_media_ids_by_dataset_id(dataset_id, max_limit=MEDIA_LIST_MAX_ALL)
    result = []
    for mid in media_ids:
        info = get_media_metadata_by_id(mid)
        if info and info.get("labels") is not None:
            result.append(
                {
                    "media_id": mid,
                    "labels": info.get("labels"),
                    "update_user": info.get("update_user"),
                    "last_update": info.get("last_update"),
                }
            )
        else:
            result.append({"media_id": mid})
    return result


def get_images_by_dataset_id(dataset_id: str, page: int | None, per_page: int | None):
    """
    If page and per_page are valid: return (file_ids, items, total, page, per_page) for paginated response.
    Else: return (media_ids, None, None, None, None) with media_ids capped at MEDIA_LIST_MAX_ALL.
    """
    if page is not None and per_page is not None and page >= 1 and per_page >= 1:
        per_page = min(per_page, 500)
        items, total = get_media_page_with_names(
            dataset_id, page=page, per_page=per_page
        )
        file_ids = [it["file_id"] for it in items]
        return {
            "file_ids": file_ids,
            "items": items,
            "total": total,
            "page": page,
            "per_page": per_page,
        }
    media_ids = get_media_ids_by_dataset_id(dataset_id, max_limit=MEDIA_LIST_MAX_ALL)
    return {
        "file_ids": media_ids,
        "items": None,
        "total": None,
        "page": None,
        "per_page": None,
    }


def get_image_metadata_by_path_filename(path: str, filename: str):
    """Legacy: labelled doc by media_path and filename. Returns dict or None (route returns [] if none)."""
    return get_labelled_by_media_path_filename(path, filename)


def get_labelled_medias_response(
    dataset_id: str, page: int | None, per_page: int | None
):
    """
    If page and per_page valid: return dict with file_ids, items, total, page, per_page.
    Else: return list of file_id (str), capped at MEDIA_LIST_MAX_ALL.
    """
    if page is not None and per_page is not None and page >= 1 and per_page >= 1:
        per_page = min(per_page, 500)
        items, total = get_labelled_medias_paginated(
            dataset_id, page=page, per_page=per_page
        )
        return {
            "file_ids": [it["file_id"] for it in items],
            "items": items,
            "total": total,
            "page": page,
            "per_page": per_page,
        }
    file_ids = get_labelled_file_ids_all(dataset_id, max_limit=MEDIA_LIST_MAX_ALL)
    return file_ids


def get_unlabelled_medias_response(
    dataset_id: str, page: int | None, per_page: int | None
):
    """Same shape as get_labelled_medias_response."""
    if page is not None and per_page is not None and page >= 1 and per_page >= 1:
        per_page = min(per_page, 500)
        items, total = get_unlabelled_medias_paginated(
            dataset_id, page=page, per_page=per_page
        )
        return {
            "file_ids": [it["file_id"] for it in items],
            "items": items,
            "total": total,
            "page": page,
            "per_page": per_page,
        }
    file_ids = get_unlabelled_file_ids_all(dataset_id, max_limit=MEDIA_LIST_MAX_ALL)
    return file_ids


def get_image_metadata_by_dataset_file(dataset_id: str, file_id: str):
    """Labelled doc by dataset_id and file_id. Returns dict or None (route returns [] if none)."""
    return get_labelled_by_dataset_file(dataset_id, file_id)


def get_labels_for_file(dataset_id: str, file_id: str):
    """Return {labels: [...]} for the file; labels = [] if not found."""
    doc = get_labelled_by_dataset_file(dataset_id, file_id)
    if doc and "labels" in doc:
        return {"labels": doc["labels"]}
    return {"labels": []}


def get_medias_filtered_for_export_picker(
    dataset_id: str,
    task_type: str,
    split: str,
    include_unlabelled: bool,
    class_indices: list[int] | None,
) -> list[str]:
    """Return file_ids for export picker, filtered by class when class_indices provided."""
    from infrastructure.persistence.service_media import _get_task_type

    tt = task_type or _get_task_type(dataset_id)
    indices = list(class_indices) if class_indices else []
    return get_medias_filtered_by_classes(
        dataset_id, tt, split, include_unlabelled, indices, max_limit=MEDIA_LIST_MAX_ALL
    )


def upload_files_legacy(
    media_path: str, insert_user: str, files_list: list, absolute_image_path: str
):
    """
    Legacy upload: write files to disk and insert labelled docs.
    files_list: list of (original_filename, file_obj with .save or .read).
    Returns {"message": str, "saved_files": list of filenames}.
    """
    saved = legacy_upload_write_and_insert(
        absolute_image_path, media_path, insert_user, files_list
    )
    msg = "Upload successful!"
    return {"message": msg, "saved_files": saved}


def labelling_save_legacy(
    media_path: str, filename: str, labels: list, update_user: str
):
    """Legacy: upsert labelled by media_path + filename."""
    upsert_labelled_legacy(media_path, filename, labels, update_user)
    return {"message": "Success!"}


def labelling_save(dataset_id: str, file_id: str, labels: list, update_user: str):
    """Upsert labels by dataset_id + file_id."""
    upsert_labelled(dataset_id, file_id, labels, update_user)
    return {"message": "Success!"}
