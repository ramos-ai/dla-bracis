from datetime import datetime, timezone

from bson import ObjectId
from flask import jsonify

from infrastructure.persistence.db_connection import get_db_dla
from infrastructure.persistence.object_id_utils import to_object_id

UNKNOWN_LABEL = "Sem rótulo / desconhecido"
MEDIA_LIST_MAX_ALL = 2000


def _db():
    return get_db_dla()


def _dataset_query(dataset_id: str) -> dict:
    dataset_oid = to_object_id(dataset_id)
    if dataset_oid:
        return {"$or": [{"dataset_id": dataset_oid}, {"dataset_id": dataset_id}]}
    return {"dataset_id": dataset_id}


def _annotations_collection(task_type: str):
    if task_type == "detection":
        return _db().coco_annotations
    if task_type == "segmentation":
        return _db().yolo_segmentations
    return _db().labelled


def _get_task_type(dataset_id: str) -> str:
    oid = to_object_id(dataset_id)
    if not oid:
        return "classification"
    doc = _db().datasets.find_one({"_id": oid}, {"task_type": 1})
    return (doc.get("task_type") or "classification") if doc else "classification"


def _is_valid_labelled_doc(doc: dict, task_type: str) -> bool:
    file_id = doc.get("file_id")
    if not file_id:
        return False

    if task_type in ("detection", "segmentation"):
        return bool(doc.get("annotations"))

    labels = doc.get("labels") or []
    return bool(labels) and any(label != UNKNOWN_LABEL for label in labels)


def _dedupe_labelled_docs(cursor, task_type: str) -> list:
    seen: set[str] = set()
    docs = []
    for doc in cursor:
        if not _is_valid_labelled_doc(doc, task_type):
            continue
        file_id_str = str(doc["file_id"])
        if file_id_str in seen:
            continue
        seen.add(file_id_str)
        docs.append(doc)
    return docs


def _labelled_file_ids(
    dataset_id: str,
    task_type: str,
    *,
    max_limit: int | None = None,
    match_filter=None,
) -> list[str]:
    query = _dataset_query(dataset_id)
    collection = _annotations_collection(task_type)
    cursor = collection.find(query, {"file_id": 1, "annotations": 1, "labels": 1})
    if max_limit is not None and task_type == "detection":
        cursor = cursor.limit(max_limit)

    file_ids: list[str] = []
    seen: set[str] = set()

    for doc in cursor:
        if not _is_valid_labelled_doc(doc, task_type):
            continue
        if match_filter is not None and not match_filter(doc):
            continue

        file_id_str = str(doc["file_id"])
        if file_id_str in seen:
            continue

        seen.add(file_id_str)
        file_ids.append(file_id_str)

        if max_limit is not None and len(file_ids) >= max_limit:
            break

    return file_ids[:max_limit] if max_limit is not None else file_ids


def _labelled_file_id_set(dataset_id: str, task_type: str) -> set[str]:
    return set(_labelled_file_ids(dataset_id, task_type))


def _paginate(items: list, page: int, per_page: int) -> tuple[list, int]:
    total = len(items)
    skip = (page - 1) * per_page
    return items[skip : skip + per_page], total


def _clamp_per_page(per_page: int, maximum: int = 500) -> int:
    return min(max(1, per_page), maximum)


def _file_id_in_list(file_ids: list) -> list:
    in_list: list = []
    for file_id in file_ids:
        value = str(file_id)
        in_list.append(value)
        if ObjectId.is_valid(value):
            in_list.append(ObjectId(value))
    return in_list


def _invalidate_media_caches(dataset_id: str) -> None:
    from infrastructure.cache.cache_invalidation import invalidate_cache_patterns
    from infrastructure.cache.cache_keys import CacheKeys

    invalidate_cache_patterns([
        CacheKeys.medias_metadata(dataset_id),
        f"medias:labelled:{dataset_id}:*",
        f"medias:unlabelled:{dataset_id}:*",
        CacheKeys.export_stats(dataset_id),
    ])


def link_file_id_to_dataset_id(file_ids, media_name, dataset_id, insert_user):
    stack_to_insert = []
    inserted_ids = []
    skipped_files = []

    dataset_oid = to_object_id(dataset_id)
    user_oid = to_object_id(insert_user)

    try:
        existing_media = _db().media.find(
            {
                "$or": [
                    {"dataset_id": dataset_oid, "media_name": media_name},
                    {"dataset_id": dataset_id, "media_name": media_name},
                ]
            }
        )
        existing_file_ids = {str(item.get("file_id", "")) for item in existing_media}

        for file in file_ids:
            file_str = str(file)
            if file_str in existing_file_ids:
                skipped_files.append(file_str)
                continue

            stack_to_insert.append(
                {
                    "file_id": file,
                    "media_name": media_name,
                    "dataset_id": dataset_oid or dataset_id,
                    "insert_date": datetime.now(timezone.utc),
                    "insert_user": user_oid or insert_user,
                }
            )
            inserted_ids.append(file)

        if stack_to_insert:
            _db().media.insert_many(stack_to_insert)

            from infrastructure.persistence.dataset_version import increment_dataset_version

            increment_dataset_version(dataset_id)
            _invalidate_media_caches(dataset_id)

        message = "Upload successful!"
        if skipped_files:
            message += (
                f" {len(skipped_files)} arquivo(s) já existente(s) foram ignorados "
                "para prevenir sobrescrita."
            )

        return jsonify(
            {
                "message": message,
                "saved_files": inserted_ids,
                "skipped_files": skipped_files,
            }
        )
    except Exception as error:
        return jsonify({"error": str(error)}), 500


def get_media_ids_by_dataset_id(dataset_id, max_limit=None):
    """Return list of file_id (str) for dataset. If max_limit set, return at most that many."""
    cursor = _db().media.find(_dataset_query(dataset_id), {"file_id": 1})
    if max_limit is not None and max_limit > 0:
        cursor = cursor.limit(max_limit)
    return [str(image["file_id"]) for image in cursor if image.get("file_id")]


def get_media_ids_by_dataset_id_paginated(dataset_id, page=1, per_page=30):
    """Return (list of file_ids for the page, total count)."""
    from infrastructure.persistence.repositories.media_repository import MediaRepository

    return MediaRepository().get_file_ids_by_dataset_paginated(
        dataset_id, page=page, per_page=per_page
    )


def get_media_page_with_names(dataset_id, page=1, per_page=30):
    """Return (list of { file_id, media_name } for the page, total count)."""
    from infrastructure.persistence.repositories.media_repository import MediaRepository

    return MediaRepository().get_media_page_with_names(
        dataset_id, page=page, per_page=per_page
    )


def _file_id_to_media_name(dataset_id, file_ids):
    """Return dict file_id -> media_name for given file_ids in dataset."""
    if not file_ids:
        return {}

    query = {
        **_dataset_query(dataset_id),
        "file_id": {"$in": _file_id_in_list(file_ids)},
    }
    return {
        str(doc["file_id"]): doc.get("media_name") or str(doc["file_id"])
        for doc in _db().media.find(query, {"file_id": 1, "media_name": 1})
        if doc.get("file_id") is not None
    }


def _media_items_with_names(dataset_id: str, file_ids: list[str]) -> list[dict]:
    name_map = _file_id_to_media_name(dataset_id, file_ids)
    return [
        {"file_id": file_id, "media_name": name_map.get(file_id, file_id)}
        for file_id in file_ids
    ]


def get_labelled_medias_paginated(dataset_id, page=1, per_page=30):
    """Return (list of { file_id, media_name }, total) for labelled medias (paginated)."""
    task_type = _get_task_type(dataset_id)
    per_page = _clamp_per_page(per_page)

    cursor = _annotations_collection(task_type).find(
        _dataset_query(dataset_id),
        {"file_id": 1, "annotations": 1, "labels": 1},
    )
    docs = _dedupe_labelled_docs(cursor, task_type)
    page_docs, total = _paginate(docs, page, per_page)
    file_ids = [str(doc["file_id"]) for doc in page_docs]
    return _media_items_with_names(dataset_id, file_ids), total


def get_unlabelled_medias_paginated(dataset_id, page=1, per_page=30):
    """Return (list of { file_id, media_name }, total) for unlabelled medias (paginated)."""
    task_type = _get_task_type(dataset_id)
    per_page = _clamp_per_page(per_page)
    labelled_set = _labelled_file_id_set(dataset_id, task_type)

    unlabelled = [
        {"file_id": file_id_str, "media_name": media.get("media_name") or file_id_str}
        for media in _db().media.find(
            _dataset_query(dataset_id), {"file_id": 1, "media_name": 1}
        ).sort("_id", 1)
        if (file_id := media.get("file_id")) is not None
        and (file_id_str := str(file_id)) not in labelled_set
    ]

    page_items, total = _paginate(unlabelled, page, per_page)
    return page_items, total


def _class_filter(task_type: str, class_indices: list | None, dataset_id: str):
    if not class_indices:
        return lambda _doc: True

    if task_type == "detection":
        return lambda doc: all(
            (index + 1) in {ann.get("category_id") for ann in (doc.get("annotations") or [])}
            for index in class_indices
        )

    if task_type == "segmentation":
        return lambda doc: all(
            (index + 1) in {ann.get("class_id") for ann in (doc.get("annotations") or [])}
            for index in class_indices
        )

    dataset_oid = to_object_id(dataset_id)
    dataset_doc = (
        _db().datasets.find_one({"_id": dataset_oid}, {"labels": 1}) if dataset_oid else None
    )
    dataset_labels = dataset_doc.get("labels", []) if dataset_doc else []
    required = {dataset_labels[index] for index in class_indices if index < len(dataset_labels)}

    return lambda doc: bool(required) and required.issubset(set(doc.get("labels") or []))


def get_medias_filtered_by_classes(
    dataset_id,
    task_type,
    split,
    include_unlabelled,
    class_indices,
    max_limit=MEDIA_LIST_MAX_ALL,
):
    """Return file_ids for export picker, optionally filtered by class."""
    match_filter = _class_filter(task_type, class_indices or None, dataset_id)
    labelled_ids = _labelled_file_ids(
        dataset_id, task_type, max_limit=max_limit, match_filter=match_filter
    )

    if split == "train" or not include_unlabelled:
        return labelled_ids[:max_limit]

    labelled_set = set(labelled_ids)
    unlabelled = []
    for media in _db().media.find(_dataset_query(dataset_id), {"file_id": 1}).sort("_id", 1):
        file_id = str(media.get("file_id", ""))
        if file_id and file_id not in labelled_set:
            unlabelled.append(file_id)
            if len(labelled_ids) + len(unlabelled) >= max_limit:
                break

    return (labelled_ids + unlabelled)[:max_limit]


def get_labelled_file_ids_all(dataset_id, max_limit=MEDIA_LIST_MAX_ALL):
    """Return full list of labelled file_id (str). Capped by max_limit."""
    task_type = _get_task_type(dataset_id)
    return _labelled_file_ids(dataset_id, task_type, max_limit=max_limit)


def get_dataset_export_stats(dataset_id: str) -> dict:
    """Return {total, labelled, unlabelled} for export config UI."""
    total = _db().media.count_documents(_dataset_query(dataset_id))
    task_type = _get_task_type(dataset_id)
    labelled = len(_labelled_file_id_set(dataset_id, task_type))
    return {"total": total, "labelled": labelled, "unlabelled": max(0, total - labelled)}


def get_unlabelled_file_ids_all(dataset_id, max_limit=MEDIA_LIST_MAX_ALL):
    """Return full list of unlabelled file_id (str). Capped by max_limit."""
    task_type = _get_task_type(dataset_id)
    labelled_set = _labelled_file_id_set(dataset_id, task_type)
    query = _dataset_query(dataset_id)

    unlabelled = []
    for media in (
        _db().media.find(query, {"file_id": 1})
        .sort("_id", 1)
        .limit(max_limit + len(labelled_set) + 1000)
    ):
        file_id = media.get("file_id")
        if file_id is None:
            continue
        file_id_str = str(file_id)
        if file_id_str not in labelled_set:
            unlabelled.append(file_id_str)
            if len(unlabelled) >= max_limit:
                break

    return unlabelled


def _exercises_using_file_query(dataset_id: str, file_id_str: str) -> dict:
    dataset_oid = to_object_id(dataset_id)
    practice_filter = {
        "$or": [
            {"supervised_practice": file_id_str},
            {"unsupervised_practice": file_id_str},
        ]
    }

    if dataset_oid:
        return {
            "$and": [
                {"$or": [{"dataset": dataset_oid}, {"dataset": dataset_id}]},
                practice_filter,
            ]
        }

    return {"dataset": dataset_id, **practice_filter}


def get_exercises_using_file_id(dataset_id: str, file_id: str):
    """Return exercises that use this image. Each item: { id, title }."""
    exercises = list(
        _db().exercises.find(
            _exercises_using_file_query(dataset_id, str(file_id)),
            {"_id": 1, "title": 1},
        )
    )
    return [{"id": str(exercise["_id"]), "title": exercise.get("title", "")} for exercise in exercises]


def _pull_file_from_exercises(exercises_using: list, file_id_str: str) -> None:
    for exercise in exercises_using:
        exercise_oid = (
            ObjectId(exercise["id"])
            if ObjectId.is_valid(exercise["id"])
            else exercise["id"]
        )
        _db().exercises.update_one(
            {"_id": exercise_oid},
            {
                "$pull": {
                    "supervised_practice": file_id_str,
                    "unsupervised_practice": file_id_str,
                }
            },
        )


def _delete_media_records(dataset_id: str, file_id_str: str) -> None:
    dataset_query = _dataset_query(dataset_id)
    if ObjectId.is_valid(file_id_str):
        _db().media.delete_many(
            {
                **dataset_query,
                "$or": [{"file_id": file_id_str}, {"file_id": ObjectId(file_id_str)}],
            }
        )
        return

    _db().media.delete_many({**dataset_query, "file_id": file_id_str})


def _delete_labelled_records(dataset_id: str, file_id_str: str) -> None:
    dataset_oid = to_object_id(dataset_id)
    if dataset_oid:
        _db().labelled.delete_many(
            {
                "$or": [
                    {"dataset_id": dataset_oid, "file_id": file_id_str},
                    {"dataset_id": dataset_id, "file_id": file_id_str},
                ]
            }
        )
        return

    _db().labelled.delete_many({"dataset_id": dataset_id, "file_id": file_id_str})


def _delete_annotation_records(dataset_id: str, file_id_str: str) -> None:
    from infrastructure.persistence.repositories.segmentation_repository import (
        SegmentationRepository,
    )
    from infrastructure.persistence.service_coco import delete_coco_annotation

    delete_coco_annotation(dataset_id, file_id_str)
    SegmentationRepository().delete_by_dataset_and_file(dataset_id, file_id_str)


def delete_media_from_dataset(dataset_id: str, file_id: str, confirm: bool = False):
    """
    Remove an image from a dataset.

    If the image is assigned to exercises and confirm=False, returns in_exercises and
    the exercise list so the client can ask for confirmation.
    If confirm=True or the image is not in any exercise, removes it from media,
    labelled, coco_annotations, yolo_segmentations, and exercise media arrays.
    """
    file_id_str = str(file_id)
    exercises_using = get_exercises_using_file_id(dataset_id, file_id_str)

    if exercises_using and not confirm:
        return {
            "deleted": False,
            "in_exercises": True,
            "exercises": exercises_using,
            "message": (
                "A imagem está atribuída a um ou mais exercícios. Confirme para removê-la "
                "do dataset e desses exercícios."
            ),
        }

    _pull_file_from_exercises(exercises_using, file_id_str)
    _delete_media_records(dataset_id, file_id_str)
    _delete_labelled_records(dataset_id, file_id_str)
    _delete_annotation_records(dataset_id, file_id_str)

    return {
        "deleted": True,
        "message": "Imagem removida do dataset e dos exercícios em que estava atribuída.",
    }
