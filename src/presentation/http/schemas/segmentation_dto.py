"""
DTOs for YOLO segmentation annotation operations
"""

from typing import List

from .base_dto import BaseDTO


class SegmentationSaveDTO(BaseDTO):
    """DTO for saving YOLO segmentation annotations."""

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
        """Validate annotations: list of { class_id, polygon } with polygon normalized 0-1, min 3 points."""
        if not isinstance(annotations, list):
            raise ValueError("annotations must be a list")

        for annotation in annotations:
            if not isinstance(annotation, dict):
                raise ValueError("Each annotation must be a dictionary")
            if "class_id" not in annotation:
                raise ValueError("annotation must have 'class_id'")
            if "polygon" not in annotation:
                raise ValueError("annotation must have 'polygon'")
            polygon = annotation["polygon"]
            if (
                not isinstance(polygon, list)
                or len(polygon) < 6
                or len(polygon) % 2 != 0
            ):
                raise ValueError("polygon must be a list of at least 3 (x,y) pairs")
            try:
                for v in polygon:
                    fv = float(v)
                    if fv < -1e-9 or fv > 1.0 + 1e-9:
                        raise ValueError(
                            "polygon coordinates must be normalized between 0 and 1"
                        )
            except (ValueError, TypeError):
                raise ValueError("polygon must contain numbers")
            cid = annotation["class_id"]
            if not isinstance(cid, int) and not (
                isinstance(cid, float) and cid == int(cid)
            ):
                try:
                    cid = int(cid)
                except (ValueError, TypeError):
                    raise ValueError("class_id must be a non-negative integer")
            if cid < 0:
                raise ValueError("class_id must be non-negative")

        return annotations
