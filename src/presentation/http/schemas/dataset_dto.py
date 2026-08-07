"""
DTOs for Dataset operations
"""

from .base_dto import BaseDTO


class DatasetCreateDTO(BaseDTO):
    """DTO for creating a dataset"""

    def __init__(self, data: dict):
        self.dataset_name = self.validate_card_name(
            data.get("dataset_name", ""), "dataset_name"
        )
        self.description = self.validate_string_length(
            data.get("description", ""), "description", min_length=10, max_length=1000
        )
        self.task_type = self.validate_string_length(
            data.get("task_type", ""), "task_type", min_length=2, max_length=50
        )
        self.labels = self.validate_list_length(
            data.get("labels", []), "labels", min_length=1, max_length=50
        )
        self.user_id = self.validate_object_id(data.get("user_id", ""), "user_id")
        self.visibility = self.validate_visibility(data.get("visibility", "private"))

    @staticmethod
    def validate_visibility(visibility: str) -> str:
        """Validate visibility field"""
        valid_values = ["private", "public", "shared"]
        if visibility not in valid_values:
            raise ValueError(f"visibility must be one of: {', '.join(valid_values)}")
        return visibility


class DatasetUpdateDTO(BaseDTO):
    """DTO for updating a dataset"""

    def __init__(self, data: dict, dataset_id: str):
        self.dataset_id = self.validate_object_id(dataset_id, "dataset_id")
        self.dataset_name = self.validate_card_name(
            data.get("dataset_name", ""), "dataset_name"
        )
        self.description = self.validate_string_length(
            data.get("description", ""), "description", min_length=10, max_length=1000
        )
        self.task_type = self.validate_string_length(
            data.get("task_type", ""), "task_type", min_length=2, max_length=50
        )
        self.user_id = self.validate_object_id(data.get("user_id", ""), "user_id")
        self.visibility = self.validate_visibility(data.get("visibility", "private"))

    @staticmethod
    def validate_visibility(visibility: str) -> str:
        """Validate visibility field"""
        valid_values = ["private", "public", "shared"]
        if visibility not in valid_values:
            raise ValueError(f"visibility must be one of: {', '.join(valid_values)}")
        return visibility
