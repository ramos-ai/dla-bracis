"""Student ranking and per-exercise error analysis."""

from application.auth.auth_service import get_user_by_id
from infrastructure.persistence.object_id_utils import to_object_id
from infrastructure.persistence.service_classes import get_class_by_id

from ._report_queries import (
    exercise_max_scores,
    find_labelled_reference,
    load_submissions_for_exercises,
    load_teacher_exercises,
    score_to_percentage,
)
from ._shared import get_db, is_submission_finalized


def get_ranking(teacher_id: str, top_n: int = 50, class_id: str = None) -> dict:
    """Student ranking by score (global and by class). Only finalized submissions."""
    try:
        teacher_exercises = load_teacher_exercises(teacher_id, class_id)
        if not teacher_exercises:
            return {"global": [], "by_class": []}

        all_submissions = load_submissions_for_exercises(teacher_exercises)
        max_scores = exercise_max_scores(teacher_exercises)
        student_averages = _student_average_scores(all_submissions, max_scores)

        return _build_ranking(student_averages, top_n)
    except Exception:
        return {"global": [], "by_class": []}


def _student_average_scores(
    submissions: list, max_scores: dict[str, float]
) -> dict[str, float]:
    student_scores: dict[str, list[float]] = {}

    for submission in submissions:
        if not is_submission_finalized(submission):
            continue

        user_id = submission.get("userId")
        if not user_id:
            continue

        pct = score_to_percentage(
            submission.get("supervisedScore"),
            max_scores.get(str(submission.get("exerciseId")), 100.0) or 100.0,
        )
        if pct is None:
            continue

        student_scores.setdefault(str(user_id), []).append(pct)

    return {
        user_id: round(sum(scores) / len(scores), 2)
        for user_id, scores in student_scores.items()
    }


def _build_ranking(student_averages: dict[str, float], top_n: int) -> dict:
    by_class: dict[str, dict] = {}
    global_list: list[dict] = []

    for user_id, average in student_averages.items():
        user = get_user_by_id(user_id)
        name = (user.get("name") or user.get("email") or user_id) if user else user_id
        class_id = (user.get("classId") or user.get("class_id")) if user else None

        entry = {"user_id": user_id, "name": name, "average_score": average}
        global_list.append(entry)

        if not class_id:
            continue

        if class_id not in by_class:
            cls = get_class_by_id(class_id)
            by_class[class_id] = {
                "class_id": class_id,
                "class_name": (cls.get("name") or class_id) if cls else class_id,
                "students": [],
            }
        by_class[class_id]["students"].append(entry)

    global_list.sort(key=lambda item: item["average_score"], reverse=True)
    global_list = _assign_ranks(global_list[:top_n])

    by_class_list = []
    for data in by_class.values():
        students = sorted(data["students"], key=lambda item: item["average_score"], reverse=True)
        data["students"] = _assign_ranks(students[:top_n])
        by_class_list.append(data)

    return {"global": global_list, "by_class": by_class_list}


def _assign_ranks(entries: list[dict]) -> list[dict]:
    for index, entry in enumerate(entries, start=1):
        entry["rank"] = index
    return entries


def get_exercise_common_errors(exercise_id: str) -> dict:
    """Return most frequent errors for an exercise (classification: wrong/missing labels)."""
    try:
        exercise = _load_exercise(exercise_id)
        if exercise is None:
            return {"errors": [], "message": "Exercise not found"}

        dataset_id = exercise.get("dataset")
        if not dataset_id:
            return {"errors": [], "message": "Exercise has no associated dataset"}

        submissions = _load_exercise_submissions(exercise_id)
        if not submissions:
            return {"errors": [], "message": "No submissions found for this exercise"}

        error_counts = _collect_label_errors(submissions, dataset_id)
        return _format_error_report(error_counts, len(submissions))
    except Exception as error:
        return {"errors": [], "message": f"Error calculating errors: {error}"}


def _load_exercise(exercise_id: str) -> dict | None:
    exercise_oid = to_object_id(exercise_id)
    if exercise_oid is None:
        return None
    return get_db().exercises.find_one({"_id": exercise_oid})


def _load_exercise_submissions(exercise_id: str) -> list:
    exercise_oid = to_object_id(exercise_id)
    return list(
        get_db().exercises_submissions.find(
            {"$or": [{"exerciseId": exercise_oid}, {"exerciseId": exercise_id}]}
        )
    )


def _collect_label_errors(submissions: list, dataset_id: str) -> dict[str, dict]:
    labelled_collection = get_db().labelled
    error_counts: dict[str, dict] = {}

    for submission in submissions:
        for answer in submission.get("labelledAnswers", []):
            media_id = answer.get("mediaId")
            if not media_id:
                continue

            correct_data = find_labelled_reference(
                labelled_collection, str(dataset_id), str(media_id)
            )
            if not correct_data or "labels" not in correct_data:
                continue

            student_labels = set(answer.get("labels", []))
            correct_labels = set(correct_data["labels"])
            _count_wrong_labels(error_counts, student_labels, correct_labels, media_id)
            _count_missing_labels(error_counts, student_labels, correct_labels, media_id)

    return error_counts


def _count_wrong_labels(
    error_counts: dict,
    student_labels: set,
    correct_labels: set,
    media_id: str,
) -> None:
    for wrong_label in student_labels - correct_labels:
        key = f"wrong_{wrong_label}_{media_id}"
        if key not in error_counts:
            error_counts[key] = {
                "error_type": "wrong_label",
                "label": wrong_label,
                "media_id": str(media_id),
                "frequency": 0,
            }
        error_counts[key]["frequency"] += 1


def _count_missing_labels(
    error_counts: dict,
    student_labels: set,
    correct_labels: set,
    media_id: str,
) -> None:
    for missing_label in correct_labels - student_labels:
        key = f"missing_{missing_label}_{media_id}"
        if key not in error_counts:
            error_counts[key] = {
                "error_type": "missing_label",
                "label": missing_label,
                "media_id": str(media_id),
                "frequency": 0,
            }
        error_counts[key]["frequency"] += 1


def _format_error_report(error_counts: dict[str, dict], total_submissions: int) -> dict:
    errors_list = []
    for error in error_counts.values():
        error["percentage"] = round((error["frequency"] / total_submissions) * 100, 2)
        errors_list.append(error)

    errors_list.sort(key=lambda item: item["frequency"], reverse=True)
    return {"errors": errors_list[:20], "total_submissions": total_submissions}
