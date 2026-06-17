"""
Exercise use cases. Each module is a cohesive use case (~100-250 lines).
"""

from .calculate_supervised_score import calculate_supervised_score
from .create_exercise import save_exercise
from .delete_exercise import delete_exercise
from .export_responses import get_responses_export
from .finalize_submission_on_report import finalize_submission_on_report
from .exercise_ranking import get_exercise_common_errors, get_ranking
from .teacher_dashboard import get_teacher_dashboard_stats
from .list_exercises import (
    get_exercise_by_id,
    get_exercises,
    get_exercises_by_class,
    get_exercises_by_dataset,
    get_submission_by_user_and_exercise,
    get_submissions,
    get_submissions_by_exercise,
)
from .manual_correction import save_manual_correction
from .submit_exercise import save_submission

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
