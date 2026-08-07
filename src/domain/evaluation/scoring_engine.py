"""
Scoring engine for classification, detection and segmentation.

Detection and segmentation share the same evaluation model:
- IoU as matching criterion (bbox for detection, polygon for segmentation).
- 1-to-1 matching via Hungarian algorithm (cost = 1 - IoU).
- TP = matched pairs with IoU >= threshold; FP = student items unmatched; FN = reference items unmatched.
- Recall = TP / (TP + FN) * 100; F1 = 2*TP / (2*TP + FP + FN) * 100.
- Professor chooses score_mode per exercise: 'recall' or 'f1'.

Pure logic: takes annotations and parameters, returns score in [0, 100].
"""

from typing import Any, Dict, List

import numpy as np

from domain.evaluation.iou_calculator import (
    calculate_bbox_iou,
    effective_iou_for_matching,
    normalize_bbox,
)
from domain.evaluation.matching_strategy import compute_best_assignment
from domain.evaluation.metrics import f1_score_from_matches, recall_score_from_matches


def calculate_classification_score(student_labels: set, correct_labels: set) -> float:
    """
    Score classification by exact label set match: 100 if equal, 0 otherwise.

    Args:
        student_labels: Set of labels chosen by student.
        correct_labels: Set of correct labels.

    Returns:
        100.0 if match, 0.0 otherwise.
    """
    return 100.0 if student_labels == correct_labels else 0.0


def calculate_detection_score(
    student_annotations: List[Dict[str, Any]],
    correct_annotations: List[Dict[str, Any]],
    iou_threshold: float = 0.85,
    score_mode: str = "recall",
) -> float:
    """
    Score detection by matching student vs reference boxes (1-1 Hungarian).
    Same category_id required for a pair; cost = 1 - IoU.

    Args:
        student_annotations: List of COCO-style annotations (bbox, category_id).
        correct_annotations: Reference annotations.
        iou_threshold: Minimum IoU to count as correct.
        score_mode: 'recall' or 'f1'.

    Returns:
        Score in [0, 100].
    """
    if not correct_annotations:
        return 100.0 if not student_annotations else 0.0
    if not student_annotations:
        return 0.0

    valid_student = []
    valid_correct = []
    for i, ann in enumerate(student_annotations):
        bbox = ann.get("bbox", [])
        cat = ann.get("category_id")
        if not bbox or len(bbox) != 4 or cat is None:
            continue
        norm = normalize_bbox(bbox)
        if not norm:
            continue
        try:
            c = int(cat)
        except (ValueError, TypeError):
            continue
        valid_student.append({"index": i, "bbox": norm, "category": c})
    for j, ann in enumerate(correct_annotations):
        bbox = ann.get("bbox", [])
        cat = ann.get("category_id")
        if not bbox or len(bbox) != 4 or cat is None:
            continue
        norm = normalize_bbox(bbox)
        if not norm:
            continue
        try:
            c = int(cat)
        except (ValueError, TypeError):
            continue
        valid_correct.append({"index": j, "bbox": norm, "category": c})

    if not valid_correct or not valid_student:
        return 0.0

    n_s = len(valid_student)
    n_c = len(valid_correct)
    cost_matrix = np.full((n_s, n_c), np.inf)
    for i, s in enumerate(valid_student):
        for j, c in enumerate(valid_correct):
            if s["category"] != c["category"]:
                continue
            iou = calculate_bbox_iou(s["bbox"], c["bbox"])
            cost_matrix[i, j] = 1.0 - iou

    correct_matches, _ = compute_best_assignment(cost_matrix, iou_threshold)
    if score_mode == "f1":
        return round(f1_score_from_matches(correct_matches, n_s, n_c), 2)
    return round(recall_score_from_matches(correct_matches, n_c), 2)


def calculate_segmentation_score(
    student_annotations: List[Dict[str, Any]],
    correct_annotations: List[Dict[str, Any]],
    iou_threshold: float = 0.75,
    score_mode: str = "recall",
) -> float:
    """
    Score segmentation by matching student vs reference polygons (1-1 Hungarian).
    Same class_id required; cost = 1 - effective IoU.

    Args:
        student_annotations: List of annotations with 'polygon' or 'segmentation' and 'class_id'.
        correct_annotations: Reference annotations with 'polygon' and 'class_id'.
        iou_threshold: Minimum IoU to count as correct.
        score_mode: 'recall' or 'f1'.

    Returns:
        Score in [0, 100].
    """
    if not correct_annotations:
        return 100.0 if not student_annotations else 0.0
    if not student_annotations:
        return 0.0

    valid_student = []
    valid_correct = []
    for i, ann in enumerate(student_annotations):
        poly = ann.get("polygon") or ann.get("segmentation")
        if not isinstance(poly, list) or len(poly) < 6 or len(poly) % 2 != 0:
            continue
        cid = ann.get("class_id")
        if cid is None:
            continue
        try:
            c = int(cid)
        except (ValueError, TypeError):
            continue
        valid_student.append({"index": i, "polygon": poly, "class_id": c})
    for j, ann in enumerate(correct_annotations):
        poly = ann.get("polygon")
        if not poly or len(poly) < 6 or len(poly) % 2 != 0:
            continue
        cid = ann.get("class_id")
        if cid is None:
            continue
        try:
            c = int(cid)
        except (ValueError, TypeError):
            continue
        valid_correct.append({"index": j, "polygon": poly, "class_id": c})

    if not valid_correct or not valid_student:
        return 0.0

    n_s = len(valid_student)
    n_c = len(valid_correct)
    cost_matrix = np.full((n_s, n_c), np.inf)
    for i, s in enumerate(valid_student):
        for j, c in enumerate(valid_correct):
            if s["class_id"] != c["class_id"]:
                continue
            iou = effective_iou_for_matching(s["polygon"], c["polygon"])
            cost_matrix[i, j] = 1.0 - iou

    correct_matches, _ = compute_best_assignment(cost_matrix, iou_threshold)
    if score_mode == "f1":
        return round(f1_score_from_matches(correct_matches, n_s, n_c), 2)
    return round(recall_score_from_matches(correct_matches, n_c), 2)
