"""
Use case: list exercises, get by id, get by class, list submissions.
"""

from bson import ObjectId
from flask import jsonify

from infrastructure.persistence.object_id_utils import to_object_id

from ._shared import enrich_exercise_with_task_type, get_db, normalize_submission

_ID_FILTER_KEYS = frozenset({"class", "user_id", "dataset", "exerciseId", "userId"})
_EMPTY_SUBMISSION = {
    "isFinalized": False,
    "finalizedAt": None,
    "finalized": False,
    "supervisedScore": None,
    "finalScore": None,
    "hasManualCorrection": False,
}


def _convert_objectid_fields(doc: dict) -> dict:
    if doc is None:
        return doc
    for key in list(doc.keys()):
        if isinstance(doc[key], ObjectId):
            doc[key] = str(doc[key])
    return doc


def _normalize_filter_criteria(filter_criteria: dict) -> dict:
    if not filter_criteria:
        return {}

    normalized = {}
    for key, value in filter_criteria.items():
        if key not in _ID_FILTER_KEYS:
            normalized[key] = value
            continue

        if isinstance(value, str):
            oid = to_object_id(value)
            normalized[key] = {"$in": [oid, value]} if oid else value
            continue

        if isinstance(value, dict) and "$in" in value:
            expanded = []
            for item in value["$in"]:
                expanded.append(item)
                oid = to_object_id(item)
                if oid and oid not in expanded:
                    expanded.append(oid)
            normalized[key] = {"$in": expanded}
            continue

        normalized[key] = value

    return normalized


def _resolve_class_name(class_id: str) -> str | None:
    if not class_id or not ObjectId.is_valid(class_id):
        return None

    from infrastructure.persistence.service_classes import get_class_by_id

    class_doc = get_class_by_id(class_id)
    return class_doc.get("name") if class_doc else None


def _resolve_user_name(user_id: str) -> str | None:
    if not user_id or not ObjectId.is_valid(user_id):
        return None

    from application.auth.auth_service import get_user_by_id

    try:
        user = get_user_by_id(user_id)
        return user.get("name") if user else None
    except Exception:
        return None


def _enrich_exercise_doc(doc: dict, include_user: bool = True) -> dict:
    doc = _convert_objectid_fields(doc)
    doc["class_name"] = _resolve_class_name(doc.get("class") or "")

    if include_user:
        doc["user_name"] = _resolve_user_name(doc.get("user_id") or "")

    return enrich_exercise_with_task_type(doc)


def _exercises_response(raw_exercises: list, include_user: bool = True):
    exercises = [_enrich_exercise_doc(doc, include_user=include_user) for doc in raw_exercises]
    return jsonify({"exercises": exercises})


def get_exercises(filter_criteria=None):
    """List exercises with optional filter. Returns Flask response."""
    filter_criteria = _normalize_filter_criteria(filter_criteria or {})
    raw = list(get_db().exercises.find(filter_criteria))
    return _exercises_response(raw)


def get_exercise_by_id(exercise_id: str):
    """Get single exercise by id. Returns (response, status) or (response, None)."""
    from ._shared import get_exercise_dict_by_id

    exercise = get_exercise_dict_by_id(exercise_id)
    if exercise is None:
        return jsonify({"error": "Exercise not found"}), 404
    return jsonify({"exercise": exercise})


def get_exercises_by_dataset(dataset_id: str):
    """List exercises that use this dataset. Returns Flask response (same shape as get_exercises)."""
    if not dataset_id:
        return jsonify({"exercises": []})

    dataset_oid = to_object_id(dataset_id)
    if dataset_oid:
        return get_exercises({"dataset": {"$in": [dataset_oid, dataset_id]}})
    return get_exercises({"dataset": dataset_id})


def get_exercises_by_class(class_id: str):
    """List exercises for a class. Returns Flask response."""
    class_oid = to_object_id(class_id)
    query = (
        {"$or": [{"class": class_oid}, {"class": class_id}]}
        if class_oid
        else {"class": class_id}
    )
    raw = list(get_db().exercises.find(query))
    return _exercises_response(raw, include_user=False)


def _attach_student_info(submission: dict) -> dict:
    submission = _convert_objectid_fields(submission)
    user_id = submission.get("userId")

    if not user_id:
        submission["studentName"] = "User ID not available"
        submission["studentEmail"] = "Email not available"
        return submission

    from application.auth.auth_service import get_user_by_id

    try:
        user = get_user_by_id(user_id)
        if not user:
            submission["studentName"] = "User not found"
            submission["studentEmail"] = "Email not available"
            return submission

        submission["studentName"] = user.get("name", "Name not available")
        submission["studentEmail"] = user.get("email", "Email not available")
    except Exception:
        submission["studentName"] = "Error fetching name"
        submission["studentEmail"] = "Error fetching email"

    return submission


def get_submissions_by_exercise(exercise_id: str):
    """Return submissions for an exercise with student info. Returns Flask response."""
    exercise_oid = to_object_id(exercise_id)
    query = (
        {"$or": [{"exerciseId": exercise_oid}, {"exerciseId": exercise_id}]}
        if exercise_oid
        else {"exerciseId": exercise_id}
    )
    submissions = [
        _attach_student_info(submission)
        for submission in get_db().exercises_submissions.find(query)
    ]
    return jsonify({"submissions": submissions})


def get_submissions():
    """Return all submissions as list (no Flask response)."""
    submissions = list(get_db().exercises_submissions.find())
    for submission in submissions:
        _convert_objectid_fields(submission)
        submission.setdefault("supervisedScore", None)
    return submissions


def get_submission_by_user_and_exercise(user_id: str, exercise_id: str):
    """Return normalized submission or default dict."""
    user_oid = to_object_id(user_id)
    exercise_oid = to_object_id(exercise_id)

    query = {
        "$or": [
            {"userId": user_oid, "exerciseId": exercise_oid},
            {"userId": user_id, "exerciseId": exercise_id},
            {"userId": user_oid, "exerciseId": exercise_id},
            {"userId": user_id, "exerciseId": exercise_oid},
        ]
    }
    submission = get_db().exercises_submissions.find_one(query)
    if submission:
        return normalize_submission(submission)
    return dict(_EMPTY_SUBMISSION)


def get_aggregated_annotations(exercise_id: str):
    """
    Aggregate student annotations by image for overlay visualization.
    Only available for detection and segmentation exercises.
    """
    context = _load_aggregation_context(exercise_id)
    images_map = _init_images_map(context["exercise"])
    submissions = _load_submissions_for_exercise(exercise_id, context["exercise_oid"])

    for submission in submissions:
        _merge_submission_annotations(
            submission, images_map, context["task_type"]
        )

    return {
        "task_type": context["task_type"],
        "labels": context["labels"],
        "images": _images_with_annotations(images_map),
    }


def _load_aggregation_context(exercise_id: str) -> dict:
    from domain.exceptions import NotFoundError, ValidationError

    exercise_oid = to_object_id(exercise_id)
    if not exercise_oid:
        raise NotFoundError("Exercise not found")

    exercise = get_db().exercises.find_one({"_id": exercise_oid})
    if not exercise:
        raise NotFoundError("Exercise not found")

    dataset_id = exercise.get("dataset")
    if not dataset_id:
        raise ValidationError("Exercise has no dataset")

    dataset_oid = to_object_id(dataset_id)
    dataset = get_db().datasets.find_one({"_id": dataset_oid}) if dataset_oid else None
    if not dataset:
        raise NotFoundError("Dataset not found")

    task_type = (dataset.get("task_type") or "classification").lower()
    if task_type not in ("detection", "segmentation"):
        raise ValidationError(
            "Aggregated annotations only available for detection/segmentation "
            f"exercises, not {task_type}"
        )

    return {
        "exercise": exercise,
        "exercise_oid": exercise_oid,
        "task_type": task_type,
        "labels": dataset.get("labels") or [],
    }


def _init_images_map(exercise: dict) -> dict[str, dict]:
    supervised = exercise.get("supervised_practice") or []
    unsupervised = exercise.get("unsupervised_practice") or []
    media_ids = set(supervised + unsupervised)

    return {
        media_id: {"image_id": media_id, "annotations": []}
        for media_id in media_ids
    }


def _load_submissions_for_exercise(exercise_id: str, exercise_oid: ObjectId) -> list:
    query = (
        {"$or": [{"exerciseId": exercise_oid}, {"exerciseId": exercise_id}]}
        if exercise_oid
        else {"exerciseId": exercise_id}
    )
    return list(get_db().exercises_submissions.find(query))


def _merge_submission_annotations(
    submission: dict, images_map: dict[str, dict], task_type: str
) -> None:
    user_id = submission.get("userId")
    if isinstance(user_id, ObjectId):
        user_id = str(user_id)

    labelled = submission.get("labelledAnswers") or []
    unlabelled = submission.get("unlabelledAnswers") or []

    for answer in labelled + unlabelled:
        media_id = answer.get("mediaId")
        if not media_id or media_id not in images_map:
            continue

        for annotation in answer.get("annotations") or []:
            overlay = _to_overlay_annotation(annotation, task_type, user_id)
            if overlay is not None:
                images_map[media_id]["annotations"].append(overlay)


def _to_overlay_annotation(
    annotation: dict, task_type: str, user_id: str
) -> dict | None:
    if task_type == "detection":
        return _detection_overlay(annotation, user_id)
    if task_type == "segmentation":
        return _segmentation_overlay(annotation, user_id)
    return None


def _detection_overlay(annotation: dict, user_id: str) -> dict | None:
    bbox = annotation.get("bbox")
    if not bbox:
        return None

    category_id = annotation.get("category_id", 0)
    label_index = category_id - 1 if category_id > 0 else 0
    return {
        "user_id": user_id,
        "type": "bbox",
        "label_index": label_index,
        "bbox": bbox,
    }


def _segmentation_overlay(annotation: dict, user_id: str) -> dict | None:
    polygon = _extract_polygon(annotation)
    if not polygon:
        return None

    class_id = annotation.get("class_id")
    if class_id is None:
        class_id = annotation.get("category_id", 1) - 1
    label_index = class_id if class_id is not None else 0

    return {
        "user_id": user_id,
        "type": "polygon",
        "label_index": label_index,
        "polygon": polygon,
    }


def _extract_polygon(annotation: dict) -> list | None:
    polygon = annotation.get("polygon")
    if polygon:
        return polygon

    segmentation = annotation.get("segmentation")
    if not segmentation or not isinstance(segmentation, list) or not segmentation:
        return None

    first = segmentation[0]
    return first if isinstance(first, list) else segmentation


def _images_with_annotations(images_map: dict[str, dict]) -> list[dict]:
    return [
        image_data
        for image_data in images_map.values()
        if image_data["annotations"]
    ]
