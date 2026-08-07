"""
Use case: finalize student submission when sending a report (remove reported image from grading).
"""

from typing import Any

from shared.date_utils import utc_now
from shared.logger import get_logger

from ._shared import get_db, get_exercise_dict_by_id
from .supervised_scoring import recompute_supervised_score

logger = get_logger(__name__)


def finalize_submission_on_report(
    user_id: str, exercise_id: str, media_id: str = None
) -> dict:
    """
    Finalize the student submission when sending a report: remove the reported image
    from answers and mark the exercise as finalized.
    """
    submission = _find_submission(user_id, exercise_id)
    if submission is None:
        return {"success": False, "message": "Submission not found"}

    doc = _prepare_submission_doc(submission)
    if media_id:
        _remove_media_from_answers(doc, media_id)

    exercise = get_exercise_dict_by_id(exercise_id) if exercise_id else None
    dataset_id = _resolve_dataset_id(doc, exercise)
    recompute_supervised_score(doc, exercise, dataset_id)
    _mark_finalized(doc)
    _log_report_finalize_action(user_id, exercise_id, media_id, doc.get("supervisedScore"))

    return _persist_submission(user_id, exercise_id, doc)


def _find_submission(user_id: str, exercise_id: str) -> dict | None:
    return get_db().exercises_submissions.find_one(
        {"userId": user_id, "exerciseId": exercise_id}
    )


def _prepare_submission_doc(submission: dict) -> dict:
    doc = dict(submission)
    doc.setdefault("labelledAnswers", [])
    doc.setdefault("unlabelledAnswers", [])
    return doc


def _remove_media_from_answers(doc: dict, media_id: str) -> None:
    doc["labelledAnswers"] = [
        answer for answer in doc["labelledAnswers"] if answer.get("mediaId") != media_id
    ]
    doc["unlabelledAnswers"] = [
        answer for answer in doc["unlabelledAnswers"] if answer.get("mediaId") != media_id
    ]


def _resolve_dataset_id(doc: dict, exercise: dict | None) -> str | None:
    if doc.get("dataset_id"):
        return doc["dataset_id"]
    if not exercise:
        return None
    return exercise.get("dataset_id") or exercise.get("dataset")


def _mark_finalized(doc: dict) -> None:
    doc["finalizedAt"] = utc_now()
    doc["finalized"] = True


def _log_report_finalize_action(
    user_id: str,
    exercise_id: str,
    media_id: str | None,
    score: float | None,
) -> None:
    try:
        from infrastructure.persistence.service_actions import save_action

        exercise = get_exercise_dict_by_id(exercise_id)
        title = exercise.get("title", "Exercício") if exercise else "Exercício"
        save_action(
            user_id=str(user_id),
            action_type="exercise_completed",
            description=f"Exercício '{title}' finalizado (reporte enviado)",
            metadata={
                "exercise_id": str(exercise_id),
                "score": score,
                "reported_media_id": media_id,
            },
        )
    except Exception:
        logger.warning(
            "Failed to log report finalize action user_id=%s exercise_id=%s",
            user_id,
            exercise_id,
            exc_info=True,
        )


def _persist_submission(user_id: str, exercise_id: str, doc: dict) -> dict:
    result = get_db().exercises_submissions.update_one(
        {"userId": user_id, "exerciseId": exercise_id},
        {
            "$set": {
                "labelledAnswers": doc["labelledAnswers"],
                "unlabelledAnswers": doc["unlabelledAnswers"],
                "finalizedAt": doc["finalizedAt"],
                "finalized": True,
                "supervisedScore": doc.get("supervisedScore"),
            }
        },
    )

    if result.modified_count == 0 and result.matched_count == 0:
        return {"success": False, "message": "Submission not found"}

    return {"success": True, "message": "Submission finalized due to report"}
