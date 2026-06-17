"""Evaluation domain: IoU, matching, and scoring logic (framework-agnostic)."""

from domain.evaluation.iou_calculator import (
    calculate_bbox_iou,
    effective_iou_for_matching,
    normalize_bbox,
    polygon_area,
    polygon_mask_iou,
    validate_and_normalize_polygon,
)
from domain.evaluation.metrics import f1_score_from_matches, recall_score_from_matches
from domain.evaluation.scoring_engine import (
    calculate_classification_score,
    calculate_detection_score,
    calculate_segmentation_score,
)
from domain.evaluation.segmentation_evaluation import evaluate_segmentation

__all__ = [
    "normalize_bbox",
    "calculate_bbox_iou",
    "polygon_mask_iou",
    "effective_iou_for_matching",
    "polygon_area",
    "validate_and_normalize_polygon",
    "recall_score_from_matches",
    "f1_score_from_matches",
    "calculate_detection_score",
    "calculate_segmentation_score",
    "calculate_classification_score",
    "evaluate_segmentation",
]
