"""Reports use cases."""

from application.reports.reports_service import (
    get_reports_by_exercise,
    get_reports_by_teacher,
    mark_all_reports_dismissed_for_teacher,
    save_report,
    update_report_status,
)

__all__ = [
    "save_report",
    "get_reports_by_exercise",
    "get_reports_by_teacher",
    "update_report_status",
    "mark_all_reports_dismissed_for_teacher",
]
