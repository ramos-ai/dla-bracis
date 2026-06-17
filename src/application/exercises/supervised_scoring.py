"""Shared helpers for recomputing supervised scores on submissions."""

from typing import Any

from shared.logger import get_logger

from .calculate_supervised_score import calculate_supervised_score

logger = get_logger(__name__)

DEFAULT_SCORING = {
    "iou_threshold": 0.85,
    "exercise_weight": 100.0,
    "detection_score_mode": "recall",
    "segmentation_iou_threshold": 0.75,
    "segmentation_score_mode": "recall",
    "supervised_media_ids": [],
}


def scoring_params_from_exercise(exercise: dict | None) -> dict[str, Any]:
    if not exercise:
        return dict(DEFAULT_SCORING)

    return {
        "iou_threshold": float(exercise.get("iou_threshold", 0.85)),
        "exercise_weight": float(exercise.get("score", 100.0)),
        "detection_score_mode": exercise.get("detection_score_mode", "recall"),
        "segmentation_iou_threshold": float(
            exercise.get("segmentation_iou_threshold", 0.75)
        ),
        "segmentation_score_mode": exercise.get("segmentation_score_mode", "recall"),
        "supervised_media_ids": exercise.get("supervised_practice") or [],
    }


def recompute_supervised_score(
    doc: dict, exercise: dict | None, dataset_id: str | None
) -> None:
    if not dataset_id:
        return

    if not doc.get("labelledAnswers"):
        doc["supervisedScore"] = None
        return

    params = scoring_params_from_exercise(exercise)
    try:
        percentage_score = calculate_supervised_score(
            doc["labelledAnswers"],
            dataset_id,
            iou_threshold=params["iou_threshold"],
            detection_score_mode=params["detection_score_mode"],
            segmentation_iou_threshold=params["segmentation_iou_threshold"],
            segmentation_score_mode=params["segmentation_score_mode"],
            supervised_media_ids=params["supervised_media_ids"],
        )
        doc["supervisedScore"] = round(
            (percentage_score / 100.0) * params["exercise_weight"], 2
        )
    except Exception:
        logger.exception(
            "Failed to recompute supervised score dataset_id=%s exercise_id=%s",
            dataset_id,
            exercise.get("_id") if exercise else None,
        )
        doc["supervisedScore"] = None
