"""Teacher dashboard aggregate statistics."""

from ._report_queries import (
    count_finalized,
    exercise_max_scores,
    load_submissions_for_exercises,
    load_teacher_exercises,
    score_distribution,
    score_to_percentage,
    submissions_for_exercise,
)
from ._shared import is_submission_finalized
from .dashboard_analytics import (
    calculate_confusion_matrix,
    calculate_label_distribution,
    calculate_label_performance,
    calculate_student_evolution,
    generate_insights,
)


def get_teacher_dashboard_stats(teacher_id: str, class_id: str = None) -> dict:
    """Return statistics for a teacher's exercises. If class_id provided, filter by class."""
    try:
        teacher_exercises = load_teacher_exercises(teacher_id, class_id)
        if not teacher_exercises:
            return empty_dashboard()

        all_submissions = load_submissions_for_exercises(teacher_exercises)
        max_scores = exercise_max_scores(teacher_exercises)

        core = _aggregate_core_stats(teacher_exercises, all_submissions, max_scores)
        confusion_matrix = calculate_confusion_matrix(teacher_exercises, all_submissions)
        student_evolution = calculate_student_evolution(all_submissions, max_scores)
        label_distribution = calculate_label_distribution(teacher_exercises, all_submissions)

        insights = generate_insights(
            core.pop("exercises_stats_full"),
            core.pop("percentages"),
            confusion_matrix,
            label_distribution,
            student_evolution,
            core["total_submissions"],
            core["total_finalized"],
        )
        core.pop("total_finalized")

        return {
            **core,
            "confusion_matrix": confusion_matrix,
            "student_evolution": student_evolution,
            "label_distribution": label_distribution,
            "label_performance": calculate_label_performance(confusion_matrix),
            "insights": insights,
        }
    except Exception:
        return empty_dashboard()


def _aggregate_core_stats(
    teacher_exercises: list, all_submissions: list, max_scores: dict[str, float]
) -> dict:
    unique_students: set = set()
    percentages: list[float] = []
    exercises_stats: list[dict] = []
    submissions_by_exercise: dict[str, dict] = {}

    for exercise in teacher_exercises:
        exercise_id = str(exercise["_id"])
        exercise_stats = _exercise_stats(
            exercise,
            exercise_id,
            all_submissions,
            max_scores.get(exercise_id, 100.0),
            unique_students,
            percentages,
        )
        exercises_stats.append(exercise_stats)
        submissions_by_exercise[exercise_id] = {
            "title": exercise.get("title", "Sem título"),
            "count": exercise_stats["total_submissions"],
            "finalized": exercise_stats["finalized_submissions"],
        }

    total_finalized = count_finalized(all_submissions)
    total_submissions = len(all_submissions)
    exercises_stats.sort(key=lambda item: item["total_submissions"], reverse=True)

    return {
        "total_exercises": len(teacher_exercises),
        "total_submissions": total_submissions,
        "total_students": len(unique_students),
        "average_score": round(sum(percentages) / len(percentages), 2) if percentages else 0,
        "exercises_stats": exercises_stats[:10],
        "exercises_stats_full": exercises_stats,
        "score_distribution": score_distribution(percentages),
        "submissions_by_exercise": sorted(
            submissions_by_exercise.values(), key=lambda item: item["count"], reverse=True
        )[:5],
        "completion_rate": round(
            (total_finalized / total_submissions * 100) if total_submissions > 0 else 0, 2
        ),
        "percentages": percentages,
        "total_finalized": total_finalized,
    }


def _exercise_stats(
    exercise: dict,
    exercise_id: str,
    all_submissions: list,
    max_score: float,
    unique_students: set,
    percentages: list[float],
) -> dict:
    exercise_submissions = submissions_for_exercise(
        all_submissions, exercise_id, exercise["_id"]
    )
    finalized_count = sum(
        1 for submission in exercise_submissions if is_submission_finalized(submission)
    )
    total_count = len(exercise_submissions)

    exercise_percentages: list[float] = []
    for submission in exercise_submissions:
        unique_students.add(submission.get("userId"))
        pct = score_to_percentage(submission.get("supervisedScore"), max_score)
        if pct is not None:
            exercise_percentages.append(pct)
            percentages.append(pct)

    average_score = (
        sum(exercise_percentages) / len(exercise_percentages)
        if exercise_percentages
        else 0
    )

    return {
        "exercise_id": exercise_id,
        "title": exercise.get("title", "Sem título"),
        "total_submissions": total_count,
        "finalized_submissions": finalized_count,
        "average_score": round(average_score, 2),
        "completion_rate": round(
            (finalized_count / total_count * 100) if total_count > 0 else 0, 2
        ),
    }


def empty_dashboard() -> dict:
    return {
        "total_exercises": 0,
        "total_submissions": 0,
        "total_students": 0,
        "average_score": 0,
        "exercises_stats": [],
        "score_distribution": [],
        "submissions_by_exercise": [],
        "completion_rate": 0,
        "confusion_matrix": {"labels": [], "matrix": [], "total": 0},
        "student_evolution": [],
        "label_distribution": [],
        "label_performance": [],
        "insights": [],
    }
