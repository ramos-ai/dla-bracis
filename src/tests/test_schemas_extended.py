"""Extended tests for presentation schemas (DTOs)."""

from datetime import datetime

import pytest

from presentation.http.schemas import (
    DatasetUpdateDTO,
    ExerciseCreateDTO,
    ExerciseUpdateDTO,
    UserUpdateDTO,
)
from presentation.http.schemas.base_dto import BaseDTO


class TestExerciseCreateDTO:
    def test_create_without_optional_iou(self):
        data = {
            "title": "Test",
            "didactic_detailing": "x" * 10,
            "do_date": datetime.now().isoformat(),
            "class": "507f1f77bcf86cd799439011",
            "score": 50,
            "dataset": "507f1f77bcf86cd799439011",
            "user_id": "507f1f77bcf86cd799439011",
            "whole_dataset": True,
            "supervised_practice": [],
            "unsupervised_practice": [],
        }
        dto = ExerciseCreateDTO(data)
        assert dto.title == "Test"
        assert dto.score == 50

    def test_iou_threshold_valid(self):
        data = {
            "title": "Test",
            "didactic_detailing": "x" * 10,
            "do_date": datetime.now().isoformat(),
            "class": "507f1f77bcf86cd799439011",
            "score": 50,
            "dataset": "507f1f77bcf86cd799439011",
            "user_id": "507f1f77bcf86cd799439011",
            "whole_dataset": True,
            "supervised_practice": [],
            "unsupervised_practice": [],
            "iou_threshold": 0.75,
        }
        dto = ExerciseCreateDTO(data)
        assert dto.iou_threshold == 0.75

    def test_iou_threshold_invalid_range(self):
        data = {
            "title": "Test",
            "didactic_detailing": "x" * 10,
            "do_date": datetime.now().isoformat(),
            "class": "507f1f77bcf86cd799439011",
            "score": 50,
            "dataset": "507f1f77bcf86cd799439011",
            "user_id": "507f1f77bcf86cd799439011",
            "whole_dataset": True,
            "supervised_practice": [],
            "unsupervised_practice": [],
            "iou_threshold": 1.5,
        }
        with pytest.raises(ValueError, match="iou_threshold"):
            ExerciseCreateDTO(data)

    def test_detection_score_mode_valid(self):
        data = {
            "title": "Test",
            "didactic_detailing": "x" * 10,
            "do_date": datetime.now().isoformat(),
            "class": "507f1f77bcf86cd799439011",
            "score": 50,
            "dataset": "507f1f77bcf86cd799439011",
            "user_id": "507f1f77bcf86cd799439011",
            "whole_dataset": True,
            "supervised_practice": [],
            "unsupervised_practice": [],
            "detection_score_mode": "f1",
        }
        dto = ExerciseCreateDTO(data)
        assert dto.detection_score_mode == "f1"

    def test_segmentation_iou_threshold_valid(self):
        data = {
            "title": "Test",
            "didactic_detailing": "x" * 10,
            "do_date": datetime.now().isoformat(),
            "class": "507f1f77bcf86cd799439011",
            "score": 50,
            "dataset": "507f1f77bcf86cd799439011",
            "user_id": "507f1f77bcf86cd799439011",
            "whole_dataset": True,
            "supervised_practice": [],
            "unsupervised_practice": [],
            "segmentation_iou_threshold": 0.65,
        }
        dto = ExerciseCreateDTO(data)
        assert dto.segmentation_iou_threshold == 0.65

    def test_segmentation_score_mode_valid(self):
        data = {
            "title": "Test",
            "didactic_detailing": "x" * 10,
            "do_date": datetime.now().isoformat(),
            "class": "507f1f77bcf86cd799439011",
            "score": 50,
            "dataset": "507f1f77bcf86cd799439011",
            "user_id": "507f1f77bcf86cd799439011",
            "whole_dataset": True,
            "supervised_practice": [],
            "unsupervised_practice": [],
            "segmentation_score_mode": "recall",
        }
        dto = ExerciseCreateDTO(data)
        assert dto.segmentation_score_mode == "recall"

    def test_validate_date_iso_format(self):
        result = ExerciseCreateDTO.validate_date("2024-01-15T10:30:00+00:00")
        assert isinstance(result, datetime)

    def test_validate_date_html_format(self):
        result = ExerciseCreateDTO.validate_date("2024-01-15")
        assert isinstance(result, datetime)
        assert result.hour == 23
        assert result.minute == 59

    def test_validate_date_with_z_suffix(self):
        result = ExerciseCreateDTO.validate_date("2024-01-15T10:30:00Z")
        assert isinstance(result, datetime)

    def test_validate_date_datetime_object(self):
        dt = datetime.now()
        result = ExerciseCreateDTO.validate_date(dt)
        assert result == dt

    def test_validate_date_invalid_type(self):
        with pytest.raises(ValueError, match="datetime or date string"):
            ExerciseCreateDTO.validate_date(12345)

    def test_validate_date_invalid_format(self):
        with pytest.raises(ValueError, match="valid date string"):
            ExerciseCreateDTO.validate_date("not-a-date")

    def test_validate_score_valid(self):
        assert ExerciseCreateDTO.validate_score(50) == 50.0
        assert ExerciseCreateDTO.validate_score("75.5") == 75.5

    def test_validate_score_out_of_range(self):
        with pytest.raises(ValueError, match="between 0 and 100"):
            ExerciseCreateDTO.validate_score(150)
        with pytest.raises(ValueError, match="between 0 and 100"):
            ExerciseCreateDTO.validate_score(-10)

    def test_validate_score_invalid_type(self):
        with pytest.raises(ValueError, match="must be a number"):
            ExerciseCreateDTO.validate_score("not-a-number")

    def test_validate_boolean_true_values(self):
        assert ExerciseCreateDTO.validate_boolean(True) is True
        assert ExerciseCreateDTO.validate_boolean("true") is True
        assert ExerciseCreateDTO.validate_boolean("1") is True
        assert ExerciseCreateDTO.validate_boolean("yes") is True

    def test_validate_boolean_false_values(self):
        assert ExerciseCreateDTO.validate_boolean(False) is False
        assert ExerciseCreateDTO.validate_boolean("false") is False
        assert ExerciseCreateDTO.validate_boolean(0) is False

    def test_validate_iou_threshold_none_default(self):
        result = ExerciseCreateDTO.validate_iou_threshold(None)
        assert result == 0.85

    def test_validate_iou_threshold_invalid_type(self):
        with pytest.raises(ValueError, match="must be a number"):
            ExerciseCreateDTO.validate_iou_threshold("not-a-number")

    def test_validate_score_mode_invalid_type(self):
        with pytest.raises(ValueError, match="must be a string"):
            ExerciseCreateDTO.validate_score_mode(123, "mode")

    def test_validate_score_mode_invalid_value(self):
        with pytest.raises(ValueError, match="must be 'recall' or 'f1'"):
            ExerciseCreateDTO.validate_score_mode("invalid", "mode")

    def test_validate_score_mode_case_insensitive(self):
        assert ExerciseCreateDTO.validate_score_mode("RECALL", "mode") == "recall"
        assert ExerciseCreateDTO.validate_score_mode("F1", "mode") == "f1"


class TestExerciseUpdateDTO:
    def test_update_valid(self):
        data = {
            "_id": "507f1f77bcf86cd799439011",
            "title": "Updated",
            "didactic_detailing": "x" * 10,
            "do_date": datetime.now().isoformat(),
            "class": "507f1f77bcf86cd799439011",
            "score": 70,
            "dataset": "507f1f77bcf86cd799439011",
            "user_id": "507f1f77bcf86cd799439011",
            "whole_dataset": False,
            "supervised_practice": [],
            "unsupervised_practice": [],
        }
        dto = ExerciseUpdateDTO(data)
        assert dto.exercise_id == "507f1f77bcf86cd799439011"
        assert dto.score == 70

    def test_update_with_iou_threshold(self):
        data = {
            "_id": "507f1f77bcf86cd799439011",
            "title": "Updated",
            "didactic_detailing": "x" * 10,
            "do_date": datetime.now().isoformat(),
            "class": "507f1f77bcf86cd799439011",
            "score": 70,
            "dataset": "507f1f77bcf86cd799439011",
            "user_id": "507f1f77bcf86cd799439011",
            "whole_dataset": False,
            "supervised_practice": [],
            "unsupervised_practice": [],
            "iou_threshold": 0.9,
        }
        dto = ExerciseUpdateDTO(data)
        assert dto.iou_threshold == 0.9

    def test_update_with_detection_score_mode(self):
        data = {
            "_id": "507f1f77bcf86cd799439011",
            "title": "Updated",
            "didactic_detailing": "x" * 10,
            "do_date": datetime.now().isoformat(),
            "class": "507f1f77bcf86cd799439011",
            "score": 70,
            "dataset": "507f1f77bcf86cd799439011",
            "user_id": "507f1f77bcf86cd799439011",
            "whole_dataset": False,
            "supervised_practice": [],
            "unsupervised_practice": [],
            "detection_score_mode": "f1",
        }
        dto = ExerciseUpdateDTO(data)
        assert dto.detection_score_mode == "f1"

    def test_update_with_segmentation_options(self):
        data = {
            "_id": "507f1f77bcf86cd799439011",
            "title": "Updated",
            "didactic_detailing": "x" * 10,
            "do_date": datetime.now().isoformat(),
            "class": "507f1f77bcf86cd799439011",
            "score": 70,
            "dataset": "507f1f77bcf86cd799439011",
            "user_id": "507f1f77bcf86cd799439011",
            "whole_dataset": False,
            "supervised_practice": [],
            "unsupervised_practice": [],
            "segmentation_iou_threshold": 0.8,
            "segmentation_score_mode": "recall",
        }
        dto = ExerciseUpdateDTO(data)
        assert dto.segmentation_iou_threshold == 0.8
        assert dto.segmentation_score_mode == "recall"

    def test_validate_date_html_format(self):
        result = ExerciseUpdateDTO.validate_date("2024-06-20")
        assert isinstance(result, datetime)
        assert result.hour == 23

    def test_validate_date_invalid_type(self):
        with pytest.raises(ValueError, match="datetime or date string"):
            ExerciseUpdateDTO.validate_date([2024, 1, 15])

    def test_validate_score_boundary(self):
        assert ExerciseUpdateDTO.validate_score(0) == 0.0
        assert ExerciseUpdateDTO.validate_score(100) == 100.0

    def test_validate_boolean_numeric(self):
        assert ExerciseUpdateDTO.validate_boolean(1) is True
        assert ExerciseUpdateDTO.validate_boolean(0) is False

    def test_validate_iou_threshold_boundary(self):
        assert ExerciseUpdateDTO.validate_iou_threshold(0.0) == 0.0
        assert ExerciseUpdateDTO.validate_iou_threshold(1.0) == 1.0

    def test_validate_iou_threshold_out_of_range(self):
        with pytest.raises(ValueError, match="between 0.0 and 1.0"):
            ExerciseUpdateDTO.validate_iou_threshold(-0.1)

    def test_validate_score_mode_with_whitespace(self):
        assert ExerciseUpdateDTO.validate_score_mode("  recall  ", "mode") == "recall"


class TestDatasetUpdateDTO:
    def test_update_valid(self):
        data = {
            "dataset_name": "Updated Dataset",
            "description": "Updated desc",
            "task_type": "detection",
            "labels": ["a", "b"],
            "visibility": "private",
            "user_id": "507f1f77bcf86cd799439011",
        }
        dto = DatasetUpdateDTO(data, "507f1f77bcf86cd799439011")
        assert dto.dataset_id == "507f1f77bcf86cd799439011"
        assert dto.dataset_name == "Updated Dataset"


class TestUserUpdateDTO:
    def test_update_valid(self):
        data = {
            "id": "507f1f77bcf86cd799439011",
            "name": "Updated Name",
            "email": "updated@example.com",
            "role": "teacher",
        }
        dto = UserUpdateDTO(data)
        assert dto.user_id == "507f1f77bcf86cd799439011"
        assert dto.name == "Updated Name"
        assert dto.email == "updated@example.com"
        assert dto.role == "teacher"


class TestBaseDTO:
    def test_validate_card_name_invalid_chars(self):
        with pytest.raises(ValueError, match="invalid characters"):
            BaseDTO.validate_card_name("Test@#$", "name")

    def test_validate_object_id_optional_empty(self):
        assert BaseDTO.validate_object_id("", "id", optional=True) is None

    def test_validate_list_length(self):
        assert BaseDTO.validate_list_length(
            [1, 2, 3], "items", min_length=1, max_length=10
        ) == [1, 2, 3]
        with pytest.raises(ValueError, match="at least"):
            BaseDTO.validate_list_length([], "items", min_length=1)

    def test_validate_image_count(self):
        assert BaseDTO.validate_image_count(5) == 5
        with pytest.raises(ValueError, match="at least"):
            BaseDTO.validate_image_count(0)

    def test_to_dict(self):
        class DummyDTO(BaseDTO):
            def __init__(self):
                self.a = 1
                self.b = None
                self.c = "x"

        d = DummyDTO()
        assert d.to_dict() == {"a": 1, "c": "x"}

    def test_validate_string_length(self):
        assert (
            BaseDTO.validate_string_length("hello", "x", min_length=1, max_length=10)
            == "hello"
        )
        with pytest.raises(ValueError, match="at least"):
            BaseDTO.validate_string_length("", "x", min_length=1)

    def test_validate_file_id_objectid(self):
        assert (
            BaseDTO.validate_file_id("507f1f77bcf86cd799439011", "fid")
            == "507f1f77bcf86cd799439011"
        )

    def test_validate_file_id_uuid_hex(self):
        assert BaseDTO.validate_file_id("a" * 32, "fid") == "a" * 32
