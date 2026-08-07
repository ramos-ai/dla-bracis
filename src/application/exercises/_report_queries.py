"""Shared queries and helpers for teacher dashboard and exercise reports."""

from datetime import datetime, timedelta
from typing import Any

from infrastructure.persistence.object_id_utils import to_object_id

from infrastructure.persistence.labelled_queries import find_labelled_reference

from ._shared import get_db, is_submission_finalized

UNKNOWN_LABEL = "Sem rótulo"
DISCARDED_LABEL = "Sem rótulo / desconhecido"

SCORE_BINS = ("0-20", "21-40", "41-60", "61-80", "81-100")
DATE_FORMATS = ("%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d")


def teacher_exercises_query(teacher_id: str, class_id: str | None) -> dict:
    teacher_oid = to_object_id(teacher_id)
    query = (
        {"$or": [{"user_id": teacher_oid}, {"user_id": teacher_id}]}
        if teacher_oid
        else {"user_id": teacher_id}
    )
    if not class_id:
        return query

    class_oid = to_object_id(class_id)
    if class_oid:
        return {"$and": [query, {"$or": [{"class": class_oid}, {"class": class_id}]}]}
    return {**query, "class": class_id}


def load_teacher_exercises(teacher_id: str, class_id: str | None = None) -> list:
    return list(get_db().exercises.find(teacher_exercises_query(teacher_id, class_id)))


def load_submissions_for_exercises(exercises: list) -> list:
    exercise_ids = [str(ex["_id"]) for ex in exercises]
    exercise_oids = [ex["_id"] for ex in exercises]
    if not exercise_ids:
        return []

    return list(
        get_db().exercises_submissions.find(
            {
                "$or": [
                    {"exerciseId": {"$in": exercise_ids}},
                    {"exerciseId": {"$in": exercise_oids}},
                ]
            }
        )
    )


def exercise_max_score(exercise: dict) -> float:
    raw = (
        float(exercise.get("score", 100.0))
        if exercise.get("score") is not None
        else 100.0
    )
    if raw <= 0:
        return 100.0
    return raw


def exercise_max_scores(exercises: list) -> dict[str, float]:
    return {str(ex["_id"]): exercise_max_score(ex) for ex in exercises}


def submissions_for_exercise(
    submissions: list, exercise_id: str, exercise_oid: Any
) -> list:
    return [
        submission
        for submission in submissions
        if str(submission.get("exerciseId")) == exercise_id
        or submission.get("exerciseId") == exercise_oid
    ]


def score_to_percentage(raw: Any, max_score: float) -> float | None:
    if raw is None or max_score <= 0:
        return None
    pct = (float(raw) / max_score) * 100.0
    return max(0.0, min(100.0, pct))


def parse_submission_date(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if not isinstance(value, str):
        return None

    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None


def week_start_key(date: datetime) -> str:
    week_start = date - timedelta(days=date.weekday())
    return week_start.strftime("%Y-%m-%d")


def count_finalized(submissions: list) -> int:
    return sum(1 for submission in submissions if is_submission_finalized(submission))


def score_distribution(percentages: list[float]) -> list[dict]:
    bins = {label: 0 for label in SCORE_BINS}
    for pct in percentages:
        if pct <= 20:
            bins["0-20"] += 1
        elif pct <= 40:
            bins["21-40"] += 1
        elif pct <= 60:
            bins["41-60"] += 1
        elif pct <= 80:
            bins["61-80"] += 1
        else:
            bins["81-100"] += 1
    return [{"range": label, "count": count} for label, count in bins.items()]


def empty_confusion_matrix() -> dict:
    return {"labels": [], "matrix": [], "total": 0}
