"""Tests for application/exercises/submit_exercise."""

from unittest.mock import MagicMock, patch

from bson import ObjectId


class TestSaveSubmission:
    @patch("application.exercises.submit_exercise.get_db")
    def test_upsert_uses_dual_type_filter_and_sets_ids(self, mock_get_db):
        user_id = "507f1f77bcf86cd799439011"
        exercise_id = "507f1f77bcf86cd799439012"

        mock_dla = MagicMock()
        mock_get_db.return_value = mock_dla
        mock_dla.exercises_submissions.find_one.side_effect = [
            None,
            {"_id": ObjectId(), "supervisedScore": None},
        ]

        from application.exercises.submit_exercise import save_submission

        result = save_submission({"userId": user_id, "exerciseId": exercise_id})

        assert result["success"] is True

        update_call = mock_dla.exercises_submissions.update_one.call_args
        filter_arg, update_arg = update_call[0][0], update_call[0][1]

        assert "$or" in filter_arg
        assert {"userId": ObjectId(user_id), "exerciseId": ObjectId(exercise_id)} in filter_arg["$or"]
        assert {"userId": user_id, "exerciseId": exercise_id} in filter_arg["$or"]

        assert update_arg["$set"]["userId"] == ObjectId(user_id)
        assert update_arg["$set"]["exerciseId"] == ObjectId(exercise_id)
        assert update_call[1]["upsert"] is True
