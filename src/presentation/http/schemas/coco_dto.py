"""
DTOs for COCO annotation operations
"""

from typing import List

from .base_dto import BaseDTO


class COCOAnnotationDTO(BaseDTO):
    """DTO for COCO annotation"""

    def __init__(self, data: dict):
        self.dataset_id = self.validate_object_id(
            data.get("dataset_id", ""), "dataset_id"
        )
        self.file_id = self.validate_file_id(data.get("file_id", ""), "file_id")
        self.annotations = self.validate_annotations(data.get("annotations", []))
        self.update_user = self.validate_object_id(
            data.get("update_user", ""), "update_user"
        )

    @staticmethod
    def validate_annotations(annotations: List) -> List:
        """Validate COCO annotations structure"""
        if not isinstance(annotations, list):
            raise ValueError("annotations must be a list")

        for annotation in annotations:
            if not isinstance(annotation, dict):
                raise ValueError("Each annotation must be a dictionary")

            if "category_id" not in annotation:
                raise ValueError("annotation must have 'category_id'")
            if "segmentation" not in annotation:
                raise ValueError("annotation must have 'segmentation'")

            segmentation = annotation["segmentation"]
            if not isinstance(segmentation, list) or len(segmentation) == 0:
                raise ValueError("segmentation must be a non-empty list")

            for polygon in segmentation:
                if not isinstance(polygon, list):
                    raise ValueError("Each polygon in segmentation must be a list")
                if len(polygon) < 6:  # At least 3 points (x, y pairs)
                    raise ValueError("Polygon must have at least 3 points")
                if len(polygon) % 2 != 0:
                    raise ValueError("Polygon coordinates must be pairs (x, y)")

            if (
                not isinstance(annotation["category_id"], int)
                or annotation["category_id"] < 0
            ):
                raise ValueError("category_id must be a non-negative integer")

            if "area" in annotation:
                if (
                    not isinstance(annotation["area"], (int, float))
                    or annotation["area"] < 0
                ):
                    raise ValueError("area must be a non-negative number")

            if "bbox" in annotation:
                bbox = annotation["bbox"]
                if not isinstance(bbox, list) or len(bbox) != 4:
                    raise ValueError(
                        "bbox must be a list of 4 numbers [x, y, width, height]"
                    )
                for val in bbox:
                    if not isinstance(val, (int, float)) or val < 0:
                        raise ValueError("bbox values must be non-negative numbers")

        return annotations
