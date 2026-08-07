"""Tests for application/datasets/export_dataset_zip."""

from unittest.mock import MagicMock, patch

from bson import ObjectId


class TestGetClassificationFileIdsWithLabels:
    @patch("application.datasets.export_dataset_zip.get_db_dla")
    def test_builds_dual_type_filter_for_valid_object_id(self, mock_get_db_dla):
        from application.datasets.export_dataset_zip import (
            _get_classification_file_ids_with_labels,
        )

        dataset_id = "507f1f77bcf86cd799439011"
        mock_db = MagicMock()
        mock_get_db_dla.return_value = mock_db
        mock_db.labelled.find.return_value.limit.return_value = []

        _get_classification_file_ids_with_labels(dataset_id)

        query = mock_db.labelled.find.call_args[0][0]
        assert "$or" in query
        assert {"dataset_id": dataset_id} in query["$or"]
        assert {"dataset_id": ObjectId(dataset_id)} in query["$or"]

    @patch("application.datasets.export_dataset_zip.get_db_dla")
    def test_falls_back_to_plain_filter_for_invalid_object_id(self, mock_get_db_dla):
        from application.datasets.export_dataset_zip import (
            _get_classification_file_ids_with_labels,
        )

        mock_db = MagicMock()
        mock_get_db_dla.return_value = mock_db
        mock_db.labelled.find.return_value.limit.return_value = []

        _get_classification_file_ids_with_labels("not-an-object-id")

        query = mock_db.labelled.find.call_args[0][0]
        assert query == {"dataset_id": "not-an-object-id"}
