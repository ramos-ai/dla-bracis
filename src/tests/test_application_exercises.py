"""Tests for application/exercises use cases (with mocked DB)."""

from unittest.mock import MagicMock, patch


class TestGetExerciseDictById:
    def test_returns_none_for_invalid_id(self):
        from application.exercises._shared import get_exercise_dict_by_id

        assert get_exercise_dict_by_id("") is None
        assert get_exercise_dict_by_id("invalid") is None

    def test_returns_exercise_when_found(self):
        with patch("application.exercises._shared.get_db") as mock_get_db:
            mock_dla = MagicMock()
            from bson import ObjectId

            mock_dla.exercises.find_one.return_value = {
                "_id": ObjectId("507f1f77bcf86cd799439011"),
                "title": "Test",
                "dataset": "ds123",
            }
            mock_get_db.return_value = mock_dla

            from application.exercises._shared import get_exercise_dict_by_id

            result = get_exercise_dict_by_id("507f1f77bcf86cd799439011")
            assert result is not None
            assert result["title"] == "Test"
            assert result["_id"] == "507f1f77bcf86cd799439011"
