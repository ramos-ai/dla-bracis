"""
DTOs for Exercise operations
"""

from datetime import datetime

from .base_dto import BaseDTO


class ExerciseCreateDTO(BaseDTO):
    """DTO for creating an exercise"""

    def __init__(self, data: dict):
        self.title = self.validate_card_name(data.get("title", ""), "title")
        self.didactic_detailing = self.validate_string_length(
            data.get("didactic_detailing", ""),
            "didactic_detailing",
            min_length=10,
            max_length=100000,
        )
        self.do_date = self.validate_date(data.get("do_date"))
        self.class_id = self.validate_object_id(data.get("class", ""), "class")
        self.score = self.validate_score(data.get("score", 0))
        self.dataset = self.validate_object_id(data.get("dataset", ""), "dataset")
        self.user_id = self.validate_object_id(data.get("user_id", ""), "user_id")
        self.whole_dataset = self.validate_boolean(data.get("whole_dataset", False))
        self.supervised_practice = self.validate_list_length(
            data.get("supervised_practice", []),
            "supervised_practice",
            min_length=0,
            max_length=100,
        )
        self.unsupervised_practice = self.validate_list_length(
            data.get("unsupervised_practice", []),
            "unsupervised_practice",
            min_length=0,
            max_length=100,
        )
        if "iou_threshold" in data:
            self.iou_threshold = self.validate_iou_threshold(data.get("iou_threshold"))
        if "detection_score_mode" in data:
            self.detection_score_mode = self.validate_score_mode(
                data.get("detection_score_mode"), "detection_score_mode"
            )
        if "segmentation_iou_threshold" in data:
            self.segmentation_iou_threshold = self.validate_iou_threshold(
                data.get("segmentation_iou_threshold")
            )
        if "segmentation_score_mode" in data:
            self.segmentation_score_mode = self.validate_score_mode(
                data.get("segmentation_score_mode"), "segmentation_score_mode"
            )

    @staticmethod
    def validate_date(date_value: any) -> datetime:
        """Validate date field - accepts ISO format or HTML date input format (YYYY-MM-DD)"""
        if isinstance(date_value, str):
            try:
                if "T" in date_value or "+" in date_value or "Z" in date_value:
                    return datetime.fromisoformat(date_value.replace("Z", "+00:00"))
                elif len(date_value) == 10 and date_value.count("-") == 2:
                    return datetime.strptime(date_value, "%Y-%m-%d").replace(
                        hour=23, minute=59, second=59
                    )
                else:
                    return datetime.fromisoformat(date_value.replace("Z", "+00:00"))
            except ValueError as e:
                raise ValueError(
                    f"do_date must be a valid date string (ISO format or YYYY-MM-DD). Error: {str(e)}"
                )
        elif isinstance(date_value, datetime):
            return date_value
        else:
            raise ValueError("do_date must be a datetime or date string")

    @staticmethod
    def validate_score(score: any) -> float:
        """Validate score field"""
        try:
            score_float = float(score)
            if score_float < 0 or score_float > 100:
                raise ValueError("score must be between 0 and 100")
            return score_float
        except (ValueError, TypeError):
            raise ValueError("score must be a number between 0 and 100")

    @staticmethod
    def validate_boolean(value: any) -> bool:
        """Validate boolean field"""
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.lower() in ("true", "1", "yes")
        return bool(value)

    @staticmethod
    def validate_iou_threshold(value: any) -> float:
        """Validate IoU threshold field (0.0 to 1.0)"""
        try:
            threshold = float(value) if value is not None else 0.85
            if threshold < 0.0 or threshold > 1.0:
                raise ValueError("iou_threshold must be between 0.0 and 1.0")
            return threshold
        except (ValueError, TypeError):
            raise ValueError("iou_threshold must be a number between 0.0 and 1.0")

    @staticmethod
    def validate_score_mode(value: any, field_name: str = "score_mode") -> str:
        """Validate score_mode field ('recall' or 'f1')"""
        if not isinstance(value, str):
            raise ValueError(f"{field_name} must be a string")
        v = value.strip().lower()
        if v not in ("recall", "f1"):
            raise ValueError(f"{field_name} must be 'recall' or 'f1'")
        return v


class ExerciseUpdateDTO(BaseDTO):
    """DTO for updating an exercise"""

    def __init__(self, data: dict):
        self.exercise_id = self.validate_object_id(data.get("_id", ""), "_id")
        self.title = self.validate_card_name(data.get("title", ""), "title")
        self.didactic_detailing = self.validate_string_length(
            data.get("didactic_detailing", ""),
            "didactic_detailing",
            min_length=10,
            max_length=100000,
        )
        self.do_date = self.validate_date(data.get("do_date"))
        self.class_id = self.validate_object_id(data.get("class", ""), "class")
        self.score = self.validate_score(data.get("score", 0))
        self.dataset = self.validate_object_id(data.get("dataset", ""), "dataset")
        self.user_id = self.validate_object_id(data.get("user_id", ""), "user_id")
        self.whole_dataset = self.validate_boolean(data.get("whole_dataset", False))

        self.supervised_practice = self.validate_list_length(
            data.get("supervised_practice", []),
            "supervised_practice",
            min_length=0,
            max_length=100,
        )
        self.unsupervised_practice = self.validate_list_length(
            data.get("unsupervised_practice", []),
            "unsupervised_practice",
            min_length=0,
            max_length=100,
        )
        if "iou_threshold" in data:
            self.iou_threshold = ExerciseUpdateDTO.validate_iou_threshold(
                data.get("iou_threshold")
            )
        if "detection_score_mode" in data:
            self.detection_score_mode = ExerciseUpdateDTO.validate_score_mode(
                data.get("detection_score_mode"), "detection_score_mode"
            )
        if "segmentation_iou_threshold" in data:
            self.segmentation_iou_threshold = ExerciseUpdateDTO.validate_iou_threshold(
                data.get("segmentation_iou_threshold")
            )
        if "segmentation_score_mode" in data:
            self.segmentation_score_mode = ExerciseUpdateDTO.validate_score_mode(
                data.get("segmentation_score_mode"), "segmentation_score_mode"
            )

    @staticmethod
    def validate_iou_threshold(value: any) -> float:
        """Validate IoU threshold field (0.0 to 1.0)"""
        try:
            threshold = float(value) if value is not None else 0.85
            if threshold < 0.0 or threshold > 1.0:
                raise ValueError("iou_threshold must be between 0.0 and 1.0")
            return threshold
        except (ValueError, TypeError):
            raise ValueError("iou_threshold must be a number between 0.0 and 1.0")

    @staticmethod
    def validate_score_mode(value: any, field_name: str = "score_mode") -> str:
        """Validate score_mode field ('recall' or 'f1')"""
        if not isinstance(value, str):
            raise ValueError(f"{field_name} must be a string")
        v = value.strip().lower()
        if v not in ("recall", "f1"):
            raise ValueError(f"{field_name} must be 'recall' or 'f1'")
        return v

    @staticmethod
    def validate_date(date_value: any) -> datetime:
        """Validate date field - accepts ISO format or HTML date input format (YYYY-MM-DD)"""
        if isinstance(date_value, str):
            try:
                if "T" in date_value or "+" in date_value or "Z" in date_value:
                    return datetime.fromisoformat(date_value.replace("Z", "+00:00"))
                elif len(date_value) == 10 and date_value.count("-") == 2:
                    return datetime.strptime(date_value, "%Y-%m-%d").replace(
                        hour=23, minute=59, second=59
                    )
                else:
                    return datetime.fromisoformat(date_value.replace("Z", "+00:00"))
            except ValueError as e:
                raise ValueError(
                    f"do_date must be a valid date string (ISO format or YYYY-MM-DD). Error: {str(e)}"
                )
        elif isinstance(date_value, datetime):
            return date_value
        else:
            raise ValueError("do_date must be a datetime or date string")

    @staticmethod
    def validate_score(score: any) -> float:
        """Validate score field"""
        try:
            score_float = float(score)
            if score_float < 0 or score_float > 100:
                raise ValueError("score must be between 0 and 100")
            return score_float
        except (ValueError, TypeError):
            raise ValueError("score must be a number between 0 and 100")

    @staticmethod
    def validate_boolean(value: any) -> bool:
        """Validate boolean field"""
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.lower() in ("true", "1", "yes")
        return bool(value)
