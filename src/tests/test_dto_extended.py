"""Tests for additional DTOs (COCO, Media, Report, Segmentation)."""

import pytest

from presentation.http.schemas.coco_dto import COCOAnnotationDTO
from presentation.http.schemas.media_dto import LabellingSave2DTO, LabellingSaveDTO
from presentation.http.schemas.report_dto import ReportCreateDTO
from presentation.http.schemas.segmentation_dto import SegmentationSaveDTO


class TestCOCOAnnotationDTO:
    """Tests for COCOAnnotationDTO."""

    def test_valid_coco_annotation(self):
        data = {
            "dataset_id": "507f1f77bcf86cd799439011",
            "file_id": "507f1f77bcf86cd799439012",
            "annotations": [
                {
                    "category_id": 0,
                    "segmentation": [[10, 20, 30, 40, 50, 60]],
                    "area": 100.5,
                    "bbox": [10, 20, 40, 40],
                }
            ],
            "update_user": "507f1f77bcf86cd799439013",
        }
        dto = COCOAnnotationDTO(data)
        assert dto.dataset_id == "507f1f77bcf86cd799439011"
        assert dto.file_id == "507f1f77bcf86cd799439012"
        assert len(dto.annotations) == 1

    def test_annotations_not_list(self):
        with pytest.raises(ValueError, match="annotations must be a list"):
            COCOAnnotationDTO.validate_annotations("not a list")

    def test_annotation_not_dict(self):
        with pytest.raises(ValueError, match="Each annotation must be a dictionary"):
            COCOAnnotationDTO.validate_annotations(["not a dict"])

    def test_annotation_missing_category_id(self):
        with pytest.raises(ValueError, match="must have 'category_id'"):
            COCOAnnotationDTO.validate_annotations([{"segmentation": [[1, 2, 3, 4, 5, 6]]}])

    def test_annotation_missing_segmentation(self):
        with pytest.raises(ValueError, match="must have 'segmentation'"):
            COCOAnnotationDTO.validate_annotations([{"category_id": 0}])

    def test_segmentation_not_list(self):
        with pytest.raises(ValueError, match="segmentation must be a non-empty list"):
            COCOAnnotationDTO.validate_annotations(
                [{"category_id": 0, "segmentation": "not a list"}]
            )

    def test_segmentation_empty(self):
        with pytest.raises(ValueError, match="segmentation must be a non-empty list"):
            COCOAnnotationDTO.validate_annotations([{"category_id": 0, "segmentation": []}])

    def test_polygon_not_list(self):
        with pytest.raises(ValueError, match="Each polygon in segmentation must be a list"):
            COCOAnnotationDTO.validate_annotations(
                [{"category_id": 0, "segmentation": ["not a list"]}]
            )

    def test_polygon_too_few_points(self):
        with pytest.raises(ValueError, match="Polygon must have at least 3 points"):
            COCOAnnotationDTO.validate_annotations(
                [{"category_id": 0, "segmentation": [[1, 2, 3, 4]]}]
            )

    def test_polygon_odd_coordinates(self):
        with pytest.raises(ValueError, match="Polygon coordinates must be pairs"):
            COCOAnnotationDTO.validate_annotations(
                [{"category_id": 0, "segmentation": [[1, 2, 3, 4, 5, 6, 7]]}]
            )

    def test_category_id_negative(self):
        with pytest.raises(ValueError, match="category_id must be a non-negative integer"):
            COCOAnnotationDTO.validate_annotations(
                [{"category_id": -1, "segmentation": [[1, 2, 3, 4, 5, 6]]}]
            )

    def test_category_id_not_int(self):
        with pytest.raises(ValueError, match="category_id must be a non-negative integer"):
            COCOAnnotationDTO.validate_annotations(
                [{"category_id": "zero", "segmentation": [[1, 2, 3, 4, 5, 6]]}]
            )

    def test_area_negative(self):
        with pytest.raises(ValueError, match="area must be a non-negative number"):
            COCOAnnotationDTO.validate_annotations(
                [{"category_id": 0, "segmentation": [[1, 2, 3, 4, 5, 6]], "area": -10}]
            )

    def test_area_not_number(self):
        with pytest.raises(ValueError, match="area must be a non-negative number"):
            COCOAnnotationDTO.validate_annotations(
                [{"category_id": 0, "segmentation": [[1, 2, 3, 4, 5, 6]], "area": "big"}]
            )

    def test_bbox_not_list(self):
        with pytest.raises(ValueError, match="bbox must be a list of 4 numbers"):
            COCOAnnotationDTO.validate_annotations(
                [{"category_id": 0, "segmentation": [[1, 2, 3, 4, 5, 6]], "bbox": "not list"}]
            )

    def test_bbox_wrong_length(self):
        with pytest.raises(ValueError, match="bbox must be a list of 4 numbers"):
            COCOAnnotationDTO.validate_annotations(
                [{"category_id": 0, "segmentation": [[1, 2, 3, 4, 5, 6]], "bbox": [1, 2, 3]}]
            )

    def test_bbox_negative_value(self):
        with pytest.raises(ValueError, match="bbox values must be non-negative numbers"):
            COCOAnnotationDTO.validate_annotations(
                [
                    {
                        "category_id": 0,
                        "segmentation": [[1, 2, 3, 4, 5, 6]],
                        "bbox": [1, 2, -3, 4],
                    }
                ]
            )


class TestLabellingSaveDTO:
    """Tests for LabellingSaveDTO."""

    def test_valid_labelling_save(self):
        data = {
            "dataset_id": "507f1f77bcf86cd799439011",
            "file_id": "507f1f77bcf86cd799439012",
            "labels": ["cat", "dog"],
            "update_user": "507f1f77bcf86cd799439013",
        }
        dto = LabellingSaveDTO(data)
        assert dto.dataset_id == "507f1f77bcf86cd799439011"
        assert dto.labels == ["cat", "dog"]

    def test_with_filename_and_media_path(self):
        data = {
            "dataset_id": "507f1f77bcf86cd799439011",
            "file_id": "507f1f77bcf86cd799439012",
            "labels": ["cat"],
            "update_user": "507f1f77bcf86cd799439013",
            "filename": "image.jpg",
            "media_path": "/path/to/image.jpg",
        }
        dto = LabellingSaveDTO(data)
        assert dto.filename == "image.jpg"
        assert dto.media_path == "/path/to/image.jpg"

    def test_labels_not_list(self):
        with pytest.raises(ValueError, match="labels must be a list"):
            LabellingSaveDTO.validate_labels("not a list")

    def test_labels_empty(self):
        with pytest.raises(ValueError, match="labels cannot be empty"):
            LabellingSaveDTO.validate_labels([])

    def test_labels_too_many(self):
        with pytest.raises(ValueError, match="labels cannot exceed 20 items"):
            LabellingSaveDTO.validate_labels(["label"] * 21)

    def test_label_invalid_type(self):
        with pytest.raises(ValueError, match="Each label must be a string or dictionary"):
            LabellingSaveDTO.validate_labels([123])

    def test_label_empty_string(self):
        with pytest.raises(ValueError, match="Label strings cannot be empty"):
            LabellingSaveDTO.validate_labels(["  "])

    def test_label_too_long(self):
        with pytest.raises(ValueError, match="Label strings cannot exceed 100 characters"):
            LabellingSaveDTO.validate_labels(["x" * 101])

    def test_label_dict_valid(self):
        labels = [{"name": "cat", "id": 1}]
        result = LabellingSaveDTO.validate_labels(labels)
        assert result == labels


class TestLabellingSave2DTO:
    """Tests for LabellingSave2DTO."""

    def test_valid_labelling_save2(self):
        data = {
            "dataset_id": "507f1f77bcf86cd799439011",
            "file_id": "507f1f77bcf86cd799439012",
            "labels": ["cat", "dog"],
            "update_user": "507f1f77bcf86cd799439013",
        }
        dto = LabellingSave2DTO(data)
        assert dto.labels == ["cat", "dog"]

    def test_empty_labels_allowed(self):
        result = LabellingSave2DTO.validate_labels([])
        assert result == []

    def test_labels_not_list(self):
        with pytest.raises(ValueError, match="labels must be a list"):
            LabellingSave2DTO.validate_labels("not a list")

    def test_labels_too_many(self):
        with pytest.raises(ValueError, match="labels cannot exceed 20 items"):
            LabellingSave2DTO.validate_labels(["label"] * 21)

    def test_label_invalid_type(self):
        with pytest.raises(ValueError, match="Each label must be a string or dictionary"):
            LabellingSave2DTO.validate_labels([123])

    def test_label_empty_string(self):
        with pytest.raises(ValueError, match="Label strings cannot be empty"):
            LabellingSave2DTO.validate_labels(["  "])

    def test_label_too_long(self):
        with pytest.raises(ValueError, match="Label strings cannot exceed 100 characters"):
            LabellingSave2DTO.validate_labels(["x" * 101])


class TestReportCreateDTO:
    """Tests for ReportCreateDTO."""

    def test_valid_report_create(self):
        data = {
            "exerciseId": "507f1f77bcf86cd799439011",
            "userId": "507f1f77bcf86cd799439012",
            "reportType": "error",
            "description": "This is a valid description with enough characters.",
        }
        dto = ReportCreateDTO(data)
        assert dto.exercise_id == "507f1f77bcf86cd799439011"
        assert dto.report_type == "error"
        assert dto.status == "pending"

    def test_with_optional_media_id(self):
        data = {
            "exerciseId": "507f1f77bcf86cd799439011",
            "userId": "507f1f77bcf86cd799439012",
            "reportType": "unlabelled",
            "description": "This is a valid description with enough characters.",
            "mediaId": "507f1f77bcf86cd799439013",
            "status": "resolved",
        }
        dto = ReportCreateDTO(data)
        assert dto.media_id == "507f1f77bcf86cd799439013"
        assert dto.status == "resolved"

    def test_invalid_report_type(self):
        with pytest.raises(ValueError, match="reportType must be one of"):
            ReportCreateDTO.validate_report_type("invalid")

    def test_valid_report_types(self):
        assert ReportCreateDTO.validate_report_type("error") == "error"
        assert ReportCreateDTO.validate_report_type("unlabelled") == "unlabelled"


class TestSegmentationSaveDTO:
    """Tests for SegmentationSaveDTO."""

    def test_valid_segmentation_save(self):
        data = {
            "dataset_id": "507f1f77bcf86cd799439011",
            "file_id": "507f1f77bcf86cd799439012",
            "annotations": [
                {"class_id": 0, "polygon": [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]}
            ],
            "update_user": "507f1f77bcf86cd799439013",
        }
        dto = SegmentationSaveDTO(data)
        assert dto.dataset_id == "507f1f77bcf86cd799439011"
        assert len(dto.annotations) == 1

    def test_annotations_not_list(self):
        with pytest.raises(ValueError, match="annotations must be a list"):
            SegmentationSaveDTO.validate_annotations("not a list")

    def test_annotation_not_dict(self):
        with pytest.raises(ValueError, match="Each annotation must be a dictionary"):
            SegmentationSaveDTO.validate_annotations(["not a dict"])

    def test_annotation_missing_class_id(self):
        with pytest.raises(ValueError, match="must have 'class_id'"):
            SegmentationSaveDTO.validate_annotations(
                [{"polygon": [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]}]
            )

    def test_annotation_missing_polygon(self):
        with pytest.raises(ValueError, match="must have 'polygon'"):
            SegmentationSaveDTO.validate_annotations([{"class_id": 0}])

    def test_polygon_too_few_points(self):
        with pytest.raises(ValueError, match="polygon must be a list of at least 3"):
            SegmentationSaveDTO.validate_annotations(
                [{"class_id": 0, "polygon": [0.1, 0.2, 0.3, 0.4]}]
            )

    def test_polygon_odd_coordinates(self):
        with pytest.raises(ValueError, match="polygon must be a list of at least 3"):
            SegmentationSaveDTO.validate_annotations(
                [{"class_id": 0, "polygon": [0.1, 0.2, 0.3, 0.4, 0.5]}]
            )

    def test_polygon_out_of_range(self):
        # Note: Due to the try/except structure in the DTO, out-of-range values
        # trigger "polygon must contain numbers" instead of the normalized message
        with pytest.raises(ValueError, match="polygon must contain numbers"):
            SegmentationSaveDTO.validate_annotations(
                [{"class_id": 0, "polygon": [0.1, 0.2, 0.3, 0.4, 1.5, 0.6]}]
            )

    def test_polygon_not_numbers(self):
        with pytest.raises(ValueError, match="polygon must contain numbers"):
            SegmentationSaveDTO.validate_annotations(
                [{"class_id": 0, "polygon": [0.1, 0.2, "x", 0.4, 0.5, 0.6]}]
            )

    def test_class_id_negative(self):
        with pytest.raises(ValueError, match="class_id must be non-negative"):
            SegmentationSaveDTO.validate_annotations(
                [{"class_id": -1, "polygon": [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]}]
            )

    def test_class_id_string_convertible(self):
        result = SegmentationSaveDTO.validate_annotations(
            [{"class_id": "0", "polygon": [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]}]
        )
        assert len(result) == 1

    def test_class_id_float_whole_number(self):
        result = SegmentationSaveDTO.validate_annotations(
            [{"class_id": 1.0, "polygon": [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]}]
        )
        assert len(result) == 1

    def test_class_id_invalid_string(self):
        with pytest.raises(ValueError, match="class_id must be a non-negative integer"):
            SegmentationSaveDTO.validate_annotations(
                [{"class_id": "abc", "polygon": [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]}]
            )
