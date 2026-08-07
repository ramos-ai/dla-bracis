"""
DTOs for Media operations
"""

from typing import List

from .base_dto import BaseDTO


class MediaUploadDTO(BaseDTO):
    """DTO for uploading media files"""

    def __init__(self, form_data: dict, files: List):
        self.dataset_id = self.validate_object_id(
            form_data.get("datasetId", ""), "datasetId"
        )
        self.user_id = self.validate_object_id(form_data.get("userId", ""), "userId")
        self.media_name = self.validate_card_name(
            form_data.get("mediaName", ""), "mediaName"
        )
        self.files = self.validate_files(files)

    @staticmethod
    def validate_files(files: List) -> List:
        """Validate uploaded files"""
        if not isinstance(files, list):
            raise ValueError("files must be a list")

        BaseDTO.validate_image_count(len(files), min_count=1, max_count=50)

        allowed_extensions = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".webp"}
        max_file_size = 25 * 1024 * 1024  # 25MB

        for file in files:
            if not hasattr(file, "filename") or not file.filename:
                raise ValueError("All files must have a valid filename")

            filename_lower = file.filename.lower()
            if not any(filename_lower.endswith(ext) for ext in allowed_extensions):
                raise ValueError(
                    f"File {file.filename} has invalid extension. Allowed: {', '.join(allowed_extensions)}"
                )

            if hasattr(file, "content_length") and file.content_length:
                if file.content_length > max_file_size:
                    raise ValueError(
                        f"File {file.filename} exceeds maximum size of 25MB"
                    )

        return files


class LabellingSaveDTO(BaseDTO):
    """DTO for saving labels. file_id accepts ObjectId or UUID hex (S3)."""

    def __init__(self, data: dict):
        self.dataset_id = self.validate_object_id(
            data.get("dataset_id", ""), "dataset_id"
        )
        self.file_id = self.validate_file_id(data.get("file_id", ""), "file_id")
        self.labels = self.validate_labels(data.get("labels", []))
        self.update_user = self.validate_object_id(
            data.get("update_user", ""), "update_user"
        )
        if "filename" in data:
            self.filename = data.get("filename")
        if "media_path" in data:
            self.media_path = data.get("media_path")

    @staticmethod
    def validate_labels(labels: List) -> List:
        """Validate labels structure"""
        if not isinstance(labels, list):
            raise ValueError("labels must be a list")
        if len(labels) == 0:
            raise ValueError("labels cannot be empty")
        if len(labels) > 20:
            raise ValueError("labels cannot exceed 20 items")

        for label in labels:
            if not isinstance(label, (str, dict)):
                raise ValueError("Each label must be a string or dictionary")
            if isinstance(label, str):
                if len(label.strip()) == 0:
                    raise ValueError("Label strings cannot be empty")
                if len(label) > 100:
                    raise ValueError("Label strings cannot exceed 100 characters")

        return labels


class LabellingSave2DTO(BaseDTO):
    """DTO for saving labels (alternative format). file_id accepts ObjectId or UUID hex (S3)."""

    def __init__(self, data: dict):
        self.dataset_id = self.validate_object_id(
            data.get("dataset_id", ""), "dataset_id"
        )
        self.file_id = self.validate_file_id(data.get("file_id", ""), "file_id")
        self.labels = self.validate_labels(data.get("labels", []))
        self.update_user = self.validate_object_id(
            data.get("update_user", ""), "update_user"
        )

    @staticmethod
    def validate_labels(labels: List) -> List:
        """Validate labels structure - allows empty list to clear labels"""
        if not isinstance(labels, list):
            raise ValueError("labels must be a list")

        if len(labels) == 0:
            return []
        if len(labels) > 20:
            raise ValueError("labels cannot exceed 20 items")

        for label in labels:
            if not isinstance(label, (str, dict)):
                raise ValueError("Each label must be a string or dictionary")
            if isinstance(label, str):
                if len(label.strip()) == 0:
                    raise ValueError("Label strings cannot be empty")
                if len(label) > 100:
                    raise ValueError("Label strings cannot exceed 100 characters")

        return labels
