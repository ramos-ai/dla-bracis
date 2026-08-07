"""
Thin facade: delegates to application/exercises use cases.
Keeps routes and other callers unchanged (same public API).
"""

from application.exercises import (
    calculate_supervised_score,
    delete_exercise,
    finalize_submission_on_report,
    get_exercise_by_id,
    get_exercise_common_errors,
    get_exercises,
    get_exercises_by_class,
    get_exercises_by_dataset,
    get_ranking,
    get_responses_export,
    get_submission_by_user_and_exercise,
    get_submissions,
    get_submissions_by_exercise,
    get_teacher_dashboard_stats,
    save_exercise,
    save_manual_correction,
    save_submission,
)

__all__ = [
    "get_exercises",
    "get_exercise_by_id",
    "get_exercises_by_class",
    "get_exercises_by_dataset",
    "get_submissions_by_exercise",
    "get_submissions",
    "get_submission_by_user_and_exercise",
    "save_exercise",
    "calculate_supervised_score",
    "save_submission",
    "get_teacher_dashboard_stats",
    "get_ranking",
    "get_exercise_common_errors",
    "get_responses_export",
    "finalize_submission_on_report",
    "save_manual_correction",
    "delete_exercise",
]
