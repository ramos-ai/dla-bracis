"""
Unit tests for DTOs
"""

import pytest

from presentation.http.schemas import (
    DatasetCreateDTO,
    ExerciseCreateDTO,
    LabellingSaveDTO,
    SubmissionSaveDTO,
    UserCreateDTO,
)


class TestDatasetDTO:
    """Tests for Dataset DTOs"""

    def test_dataset_create_dto_valid(self):
        """Test valid dataset creation"""
        data = {
            "dataset_name": "Test Dataset",
            "description": "This is a test dataset description",
            "task_type": "classification",
            "labels": ["label1", "label2"],
            "user_id": "507f1f77bcf86cd799439011",
            "visibility": "public",
        }
        dto = DatasetCreateDTO(data)
        assert dto.dataset_name == "Test Dataset"
        assert dto.description == "This is a test dataset description"
        assert len(dto.labels) == 2

    def test_dataset_create_dto_invalid_name_too_short(self):
        """Test dataset creation with name too short"""
        data = {
            "dataset_name": "AB",
            "description": "This is a test dataset description",
            "task_type": "classification",
            "labels": ["label1"],
            "user_id": "507f1f77bcf86cd799439011",
            "visibility": "public",
        }
        with pytest.raises(
            ValueError, match="dataset_name must be at least 3 characters"
        ):
            DatasetCreateDTO(data)

    def test_dataset_create_dto_invalid_labels_empty(self):
        """Test dataset creation with empty labels"""
        data = {
            "dataset_name": "Test Dataset",
            "description": "This is a test dataset description",
            "task_type": "classification",
            "labels": [],
            "user_id": "507f1f77bcf86cd799439011",
            "visibility": "public",
        }
        with pytest.raises(ValueError, match="labels must have at least 1 items"):
            DatasetCreateDTO(data)

    def test_dataset_create_dto_invalid_visibility(self):
        """Test dataset creation with invalid visibility"""
        data = {
            "dataset_name": "Test Dataset",
            "description": "This is a test dataset description",
            "task_type": "classification",
            "labels": ["label1"],
            "user_id": "507f1f77bcf86cd799439011",
            "visibility": "invalid",
        }
        with pytest.raises(ValueError):
            DatasetCreateDTO(data)


class TestExerciseDTO:
    """Tests for Exercise DTOs"""

    def test_exercise_create_dto_valid(self):
        """Test valid exercise creation"""
        from datetime import datetime

        data = {
            "title": "Test Exercise",
            "didactic_detailing": "This is a detailed description of the exercise",
            "do_date": datetime.now().isoformat(),
            "class": "507f1f77bcf86cd799439011",
            "score": 85.5,
            "dataset": "507f1f77bcf86cd799439011",
            "user_id": "507f1f77bcf86cd799439011",
            "whole_dataset": True,
            "supervised_practice": [],
            "unsupervised_practice": [],
        }
        dto = ExerciseCreateDTO(data)
        assert dto.title == "Test Exercise"
        assert dto.score == 85.5

    def test_exercise_create_dto_invalid_score(self):
        """Test exercise creation with invalid score"""
        from datetime import datetime

        data = {
            "title": "Test Exercise",
            "didactic_detailing": "This is a detailed description",
            "do_date": datetime.now().isoformat(),
            "class": "507f1f77bcf86cd799439011",
            "score": 150,  # Invalid score
            "dataset": "507f1f77bcf86cd799439011",
            "user_id": "507f1f77bcf86cd799439011",
            "whole_dataset": True,
            "supervised_practice": [],
            "unsupervised_practice": [],
        }
        with pytest.raises(ValueError, match="score must be .* 0 and 100"):
            ExerciseCreateDTO(data)


class TestMediaDTO:
    """Tests for Media DTOs"""

    def test_labelling_save_dto_valid(self):
        """Test valid labelling save"""
        data = {
            "dataset_id": "507f1f77bcf86cd799439011",
            "file_id": "507f1f77bcf86cd799439011",
            "labels": ["label1", "label2"],
            "update_user": "507f1f77bcf86cd799439011",
        }
        dto = LabellingSaveDTO(data)
        assert len(dto.labels) == 2

    def test_labelling_save_dto_empty_labels(self):
        """Test labelling save with empty labels"""
        data = {
            "dataset_id": "507f1f77bcf86cd799439011",
            "file_id": "507f1f77bcf86cd799439011",
            "labels": [],
            "update_user": "507f1f77bcf86cd799439011",
        }
        with pytest.raises(ValueError, match="labels cannot be empty"):
            LabellingSaveDTO(data)


class TestAuthDTO:
    """Tests for Auth DTOs"""

    def test_user_create_dto_valid(self):
        """Test valid user creation"""
        data = {
            "name": "John Doe",
            "email": "john.doe@example.com",
            "password": "Password123",
        }
        dto = UserCreateDTO(data)
        assert dto.name == "John Doe"
        assert dto.email == "john.doe@example.com"

    def test_user_create_dto_invalid_email(self):
        """Test user creation with invalid email"""
        data = {
            "name": "John Doe",
            "email": "invalid-email",
            "password": "Password123",
        }
        with pytest.raises(ValueError, match="email must be a valid email address"):
            UserCreateDTO(data)

    def test_user_create_dto_invalid_role(self):
        """Test user creation with invalid role"""
        data = {
            "name": "John Doe",
            "email": "john.doe@example.com",
            "password": "Password123",
            "role": "invalid_role",
        }
        with pytest.raises(ValueError, match="role must be one of"):
            UserCreateDTO(data)


class TestSubmissionDTO:
    """Tests for Submission DTOs"""

    def test_submission_save_dto_valid(self):
        """Test valid submission save"""
        data = {
            "userId": "507f1f77bcf86cd799439011",
            "exerciseId": "507f1f77bcf86cd799439011",
            "labelledAnswers": [
                {"mediaId": "507f1f77bcf86cd799439011", "labels": ["label1"]}
            ],
            "unlabelledAnswers": [{"mediaId": "507f1f77bcf86cd799439011"}],
        }
        dto = SubmissionSaveDTO(data)
        assert len(dto.labelled_answers) == 1
        assert len(dto.unlabelled_answers) == 1

    def test_submission_with_dataset_id_and_finalized(self):
        data = {
            "userId": "507f1f77bcf86cd799439011",
            "exerciseId": "507f1f77bcf86cd799439011",
            "dataset_id": "507f1f77bcf86cd799439012",
            "finalized": True,
        }
        dto = SubmissionSaveDTO(data)
        assert dto.dataset_id == "507f1f77bcf86cd799439012"
        assert dto.finalized is True

    def test_submission_answers_invalid_not_dict(self):
        data = {
            "userId": "507f1f77bcf86cd799439011",
            "exerciseId": "507f1f77bcf86cd799439011",
            "labelledAnswers": ["not-a-dict"],
        }
        with pytest.raises(ValueError, match="must be a dictionary"):
            SubmissionSaveDTO(data)

    def test_submission_answers_missing_media_id(self):
        data = {
            "userId": "507f1f77bcf86cd799439011",
            "exerciseId": "507f1f77bcf86cd799439011",
            "labelledAnswers": [{"labels": ["x"]}],
        }
        with pytest.raises(ValueError, match="mediaId"):
            SubmissionSaveDTO(data)
