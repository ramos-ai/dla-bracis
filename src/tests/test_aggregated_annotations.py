"""Tests for application/exercises/list_exercises.get_aggregated_annotations (teacher overlay tab)."""

from unittest.mock import MagicMock, patch

from bson import ObjectId


class TestGetAggregatedAnnotations:
    @patch("application.exercises.list_exercises.get_db")
    def test_merges_annotation_when_media_id_is_objectid_in_exercise(self, mock_get_db):
        """supervised_practice/unsupervised_practice can hold ObjectId-typed media ids
        (legacy migration), while a submission's mediaId is always a plain string.
        The image (and its annotations) must not be silently dropped because of that
        type mismatch."""
        from application.exercises.list_exercises import get_aggregated_annotations

        exercise_oid = ObjectId()
        media_oid = ObjectId()
        dataset_oid = ObjectId()

        mock_dla = MagicMock()
        mock_get_db.return_value = mock_dla
        mock_dla.exercises.find_one.return_value = {
            "_id": exercise_oid,
            "dataset": dataset_oid,
            "supervised_practice": [media_oid],
            "unsupervised_practice": [],
        }
        mock_dla.datasets.find_one.return_value = {
            "_id": dataset_oid,
            "task_type": "detection",
            "labels": ["cat", "dog"],
        }
        mock_dla.exercises_submissions.find.return_value = [
            {
                "userId": "507f1f77bcf86cd799439011",
                "labelledAnswers": [
                    {
                        "mediaId": str(media_oid),
                        "annotations": [
                            {"bbox": [1, 2, 3, 4], "category_id": 1},
                        ],
                    }
                ],
                "unlabelledAnswers": [],
            }
        ]

        result = get_aggregated_annotations(str(exercise_oid))

        assert len(result["images"]) == 1
        assert result["images"][0]["image_id"] == str(media_oid)
        assert len(result["images"][0]["annotations"]) == 1
        assert result["images"][0]["annotations"][0]["bbox"] == [1, 2, 3, 4]
