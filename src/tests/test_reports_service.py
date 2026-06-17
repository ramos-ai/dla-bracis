"""Tests for application/reports/reports_service."""

from unittest.mock import MagicMock, patch

from bson import ObjectId


class TestTeacherOwnsExercise:
    def test_returns_false_for_invalid_exercise_id(self):
        from application.reports.reports_service import _teacher_owns_exercise

        assert _teacher_owns_exercise("invalid", "507f1f77bcf86cd799439011") is False

    @patch("application.reports.reports_service._db")
    def test_matches_user_id_stored_as_objectid(self, mock_db):
        teacher_id = "507f1f77bcf86cd799439011"
        exercise_id = "507f1f77bcf86cd799439012"
        teacher_oid = ObjectId(teacher_id)
        exercise_oid = ObjectId(exercise_id)

        mock_dla = MagicMock()
        mock_db.return_value = mock_dla
        mock_dla.exercises.find_one.return_value = {
            "_id": exercise_oid,
            "user_id": teacher_oid,
        }

        from application.reports.reports_service import _teacher_owns_exercise

        result = _teacher_owns_exercise(exercise_id, teacher_id)
        assert result is True

        call_query = mock_dla.exercises.find_one.call_args[0][0]
        assert call_query["_id"] == exercise_oid
        assert "$or" in call_query
        assert {"user_id": teacher_oid} in call_query["$or"]
        assert {"user_id": teacher_id} in call_query["$or"]

    @patch("application.reports.reports_service._db")
    def test_returns_false_when_exercise_not_found(self, mock_db):
        mock_dla = MagicMock()
        mock_db.return_value = mock_dla
        mock_dla.exercises.find_one.return_value = None

        from application.reports.reports_service import _teacher_owns_exercise

        assert (
            _teacher_owns_exercise(
                "507f1f77bcf86cd799439012", "507f1f77bcf86cd799439011"
            )
            is False
        )
