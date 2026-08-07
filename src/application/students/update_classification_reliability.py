"""
Recompute global classification reliability for a student from supervised history.
"""

from __future__ import annotations

from domain.evaluation.annotator_weight import compute_annotator_reliability
from infrastructure.persistence.db_connection import get_db_dla
from infrastructure.persistence.labelled_queries import find_labelled_reference
from infrastructure.persistence.object_id_utils import to_object_id
from infrastructure.persistence.service_student_reliability import set_reliability
from shared.date_utils import utc_now
from shared.logger import get_logger

logger = get_logger(__name__)

_UNKNOWN = "Sem rótulo"


def _db():
    return get_db_dla()


def _dataset_task_type(dataset_id: str) -> str:
    dataset_oid = to_object_id(dataset_id)
    if dataset_oid is None:
        return "classification"
    doc = _db().datasets.find_one({"_id": dataset_oid}, {"task_type": 1})
    if not doc:
        return "classification"
    return doc.get("task_type") or "classification"


def _submissions_for_user(user_id: str) -> list[dict]:
    user_oid = to_object_id(user_id)
    query = (
        {"$or": [{"userId": user_oid}, {"userId": user_id}]}
        if user_oid
        else {"userId": user_id}
    )
    return list(
        _db().exercises_submissions.find(
            query,
            {"labelledAnswers": 1, "exerciseId": 1},
        )
    )


def _exercise_dataset_id(exercise_id) -> str | None:
    exercise_oid = to_object_id(exercise_id)
    if exercise_oid is None and not exercise_id:
        return None
    query = (
        {"_id": exercise_oid}
        if exercise_oid is not None
        else {"_id": exercise_id}
    )
    exercise = _db().exercises.find_one(query, {"dataset": 1})
    if not exercise:
        return None
    dataset = exercise.get("dataset")
    return str(dataset) if dataset is not None else None


def _pairs_from_submissions(submissions: list[dict]) -> list[tuple[str, str]]:
    labelled_collection = _db().labelled
    pairs: list[tuple[str, str]] = []
    dataset_type_cache: dict[str, str] = {}

    for submission in submissions:
        dataset_id = _exercise_dataset_id(submission.get("exerciseId"))
        if not dataset_id:
            continue

        if dataset_id not in dataset_type_cache:
            dataset_type_cache[dataset_id] = _dataset_task_type(dataset_id)
        if dataset_type_cache[dataset_id] != "classification":
            continue

        for answer in submission.get("labelledAnswers") or []:
            media_id = answer.get("mediaId")
            student_labels = answer.get("labels") or []
            if not media_id or not student_labels:
                continue

            correct = find_labelled_reference(
                labelled_collection, dataset_id, str(media_id)
            )
            if not correct or "labels" not in correct:
                continue

            correct_labels = correct.get("labels") or []
            predicted = student_labels[0] if student_labels else _UNKNOWN
            actual = correct_labels[0] if correct_labels else _UNKNOWN
            pairs.append((str(actual), str(predicted)))

    return pairs


def update_classification_reliability(
    user_id: str,
    dataset_id: str | None = None,
) -> dict | None:
    """
    Full recompute of classification reliability for the student.

    If dataset_id is provided and is not classification, returns None (no-op).
    """
    if not user_id:
        return None

    if dataset_id and _dataset_task_type(dataset_id) != "classification":
        return None

    try:
        submissions = _submissions_for_user(user_id)
        pairs = _pairs_from_submissions(submissions)
        result = compute_annotator_reliability(pairs)
        payload = {
            **result,
            "updated_at": utc_now().isoformat(),
        }
        set_reliability(user_id, payload)
        return payload
    except Exception:
        logger.exception(
            "Failed to update classification reliability user_id=%s", user_id
        )
        return None
