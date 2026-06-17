"""
API schemas (request/response contracts). Boundary layer, not domain.
"""

from .auth_dto import UserCreateDTO, UserUpdateDTO
from .base_dto import BaseDTO
from .coco_dto import COCOAnnotationDTO
from .dataset_dto import DatasetCreateDTO, DatasetUpdateDTO
from .exercise_dto import ExerciseCreateDTO, ExerciseUpdateDTO
from .media_dto import LabellingSave2DTO, LabellingSaveDTO, MediaUploadDTO
from .report_dto import ReportCreateDTO
from .segmentation_dto import SegmentationSaveDTO
from .submission_dto import SubmissionSaveDTO

__all__ = [
    "BaseDTO",
    "DatasetCreateDTO",
    "DatasetUpdateDTO",
    "ExerciseCreateDTO",
    "ExerciseUpdateDTO",
    "MediaUploadDTO",
    "LabellingSaveDTO",
    "LabellingSave2DTO",
    "UserCreateDTO",
    "UserUpdateDTO",
    "SubmissionSaveDTO",
    "COCOAnnotationDTO",
    "SegmentationSaveDTO",
    "ReportCreateDTO",
]
