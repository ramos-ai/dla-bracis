"""
DTOs for Report operations
"""

from .base_dto import BaseDTO


class ReportCreateDTO(BaseDTO):
    """DTO for creating a report"""

    def __init__(self, data: dict):
        self.exercise_id = self.validate_object_id(
            data.get("exerciseId", ""), "exerciseId"
        )
        self.user_id = self.validate_object_id(data.get("userId", ""), "userId")
        self.report_type = self.validate_report_type(data.get("reportType", ""))
        self.description = self.validate_string_length(
            data.get("description", ""), "description", min_length=10, max_length=1000
        )
        self.media_id = data.get("mediaId", None)
        self.status = data.get("status", "pending")

    @staticmethod
    def validate_report_type(report_type: str) -> str:
        """Validate report type"""
        valid_types = ["error", "unlabelled"]
        if report_type not in valid_types:
            raise ValueError(f"reportType must be one of: {', '.join(valid_types)}")
        return report_type
