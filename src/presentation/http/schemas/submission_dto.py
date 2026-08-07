"""
DTOs for Submission operations
"""

from typing import Any, Dict, List

from .base_dto import BaseDTO


class SubmissionSaveDTO(BaseDTO):
    """DTO for saving exercise submissions"""

    def __init__(self, data: dict):
        self.user_id = self.validate_object_id(data.get("userId", ""), "userId")
        self.exercise_id = self.validate_object_id(
            data.get("exerciseId", ""), "exerciseId"
        )

        if "labelledAnswers" in data:
            self.labelled_answers = self.validate_answers(
                data.get("labelledAnswers", []), "labelledAnswers"
            )
        if "unlabelledAnswers" in data:
            self.unlabelled_answers = self.validate_answers(
                data.get("unlabelledAnswers", []), "unlabelledAnswers"
            )

        if "dataset_id" in data:
            self.dataset_id = self.validate_object_id(
                data.get("dataset_id", ""), "dataset_id", optional=True
            )

        if "finalized" in data:
            self.finalized = bool(data.get("finalized", False))

    @staticmethod
    def validate_answers(answers: List, field_name: str) -> List[Dict[str, Any]]:
        """Validate answer structure"""
        if not isinstance(answers, list):
            raise ValueError(f"{field_name} must be a list")

        if len(answers) > 1000:
            raise ValueError(f"{field_name} cannot exceed 1000 items")

        validated_answers = []
        for answer in answers:
            if not isinstance(answer, dict):
                raise ValueError(f"Each item in {field_name} must be a dictionary")

            if "mediaId" not in answer:
                raise ValueError(
                    f"Each answer in {field_name} must have a 'mediaId' field"
                )
            BaseDTO.validate_file_id(answer["mediaId"], f"{field_name}[].mediaId")

            if "labels" in answer:
                if not isinstance(answer["labels"], list):
                    raise ValueError(f"labels in {field_name} must be a list")
                if len(answer["labels"]) > 20:
                    raise ValueError(f"labels in {field_name} cannot exceed 20 items")

            validated_answers.append(answer)

        return validated_answers
