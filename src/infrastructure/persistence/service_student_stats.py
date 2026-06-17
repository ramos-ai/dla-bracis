"""Student statistics and dashboard persistence."""

from infrastructure.persistence.db_connection import get_db_dla
from infrastructure.persistence.exercise_enrichment import enrich_exercise_with_task_type
from infrastructure.persistence.object_id_utils import to_object_id
from shared.logger import get_logger
from shared.submission_utils import is_submission_finalized

logger = get_logger(__name__)

def _db():
    return get_db_dla()


_EMPTY_STATS = {"total_completed": 0, "average_score": 0, "total_submissions": 0}


def _user_query(user_id: str, field: str = "userId") -> dict:
    user_oid = to_object_id(user_id)
    if user_oid:
        return {"$or": [{field: user_oid}, {field: user_id}]}
    return {field: user_id}


def _class_exercises_query(class_id) -> dict:
    class_oid = to_object_id(class_id) if isinstance(class_id, str) else class_id
    class_id_str = str(class_id)
    if class_oid:
        return {"$or": [{"class": class_oid}, {"class": class_id_str}]}
    return {"class": class_id_str}


def _load_exercise_max_scores(exercise_ids: set) -> dict[str, float]:
    oids = []
    for exercise_id in exercise_ids:
        oid = to_object_id(str(exercise_id)) if exercise_id else None
        if oid:
            oids.append(oid)

    if not oids:
        return {}

    scores: dict[str, float] = {}
    for exercise in _db().exercises.find({"_id": {"$in": oids}}, {"score": 1}):
        raw = exercise.get("score")
        max_score = float(raw) if raw is not None and float(raw) > 0 else 100.0
        scores[str(exercise["_id"])] = max_score
    return scores


def _submission_percentage(submission: dict, max_scores: dict[str, float]) -> float | None:
    raw = submission.get("supervisedScore")
    if raw is None:
        return None

    exercise_id = str(submission.get("exerciseId"))
    max_score = max_scores.get(exercise_id, 100.0)
    pct = (float(raw) / max_score) * 100.0
    return max(0.0, min(100.0, pct))


def _average_percentage(finalized_submissions: list, max_scores: dict[str, float]) -> float:
    percentages = [
        pct
        for submission in finalized_submissions
        if (pct := _submission_percentage(submission, max_scores)) is not None
    ]
    if not percentages:
        return 0.0
    return round(sum(percentages) / len(percentages), 2)


def get_student_stats(student_id: str):
    """Return statistics for a student. average_score is percentage (0-100) using each exercise weight."""
    try:
        all_submissions = list(_db().exercises_submissions.find(_user_query(student_id)))
        if not all_submissions:
            return dict(_EMPTY_STATS)

        finalized = [
            submission
            for submission in all_submissions
            if is_submission_finalized(submission)
        ]
        exercise_ids = {
            submission.get("exerciseId")
            for submission in finalized
            if submission.get("exerciseId")
        }
        max_scores = _load_exercise_max_scores(exercise_ids)

        return {
            "total_completed": len(finalized),
            "average_score": _average_percentage(finalized, max_scores),
            "total_submissions": len(all_submissions),
        }
    except Exception as error:
        logger.exception("Error in get_student_stats")
        return dict(_EMPTY_STATS)


def _get_student_class_id(student_id: str):
    student_oid = to_object_id(student_id)
    if not student_oid:
        return None
    user = _db().users.find_one({"_id": student_oid})
    if not user:
        return None
    return user.get("class_id") or user.get("classId")


def _submissions_by_exercise(student_id: str) -> dict[str, dict]:
    submissions = {}
    for submission in _db().exercises_submissions.find(_user_query(student_id)):
        exercise_id = submission.get("exerciseId")
        if exercise_id:
            submissions[str(exercise_id)] = submission
    return submissions


def _format_do_date(value) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _pending_exercise_item(exercise: dict, submissions_by_exercise: dict[str, dict]) -> dict | None:
    exercise_id = str(exercise["_id"])
    submission = submissions_by_exercise.get(exercise_id)
    if submission and is_submission_finalized(submission):
        return None

    enriched = enrich_exercise_with_task_type(dict(exercise))
    return {
        "_id": exercise_id,
        "title": exercise.get("title", ""),
        "task_type": enriched.get("task_type", "classification"),
        "do_date": _format_do_date(exercise.get("do_date")),
    }


def _fetch_pending_exercises(student_id: str) -> list[dict]:
    class_id = _get_student_class_id(student_id)
    if not class_id:
        return []

    exercises = list(_db().exercises.find(_class_exercises_query(class_id)))
    submissions_by_exercise = _submissions_by_exercise(student_id)

    pending = [
        item
        for exercise in exercises
        if (item := _pending_exercise_item(exercise, submissions_by_exercise)) is not None
    ]
    pending.sort(key=lambda entry: entry["do_date"] or "9999")
    return pending


def get_student_dashboard(student_id: str):
    """Return stats and pending exercises for the student dashboard."""
    stats = get_student_stats(student_id)

    try:
        student_oid = to_object_id(student_id)
        if not student_oid:
            return {"stats": stats, "pending_exercises": []}

        pending = _fetch_pending_exercises(student_id)
    except Exception as error:
        logger.exception("Error in get_student_dashboard pending")
        pending = []

    return {"stats": stats, "pending_exercises": pending}
