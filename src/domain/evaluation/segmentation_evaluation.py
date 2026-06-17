"""
Segmentation evaluation that returns both score and match list for professor panel.
Same logic as calculate_segmentation_score but returns matches with original indices and IoU.
"""

from typing import Any, Dict, List

import numpy as np

from domain.evaluation.iou_calculator import effective_iou_for_matching
from domain.evaluation.matching_strategy import compute_best_assignment

try:
    from scipy.optimize import linear_sum_assignment
except ImportError:
    linear_sum_assignment = None


def evaluate_segmentation(
    student_annotations: List[Dict[str, Any]],
    correct_annotations: List[Dict[str, Any]],
    iou_threshold: float = 0.75,
    score_mode: str = "recall",
) -> Dict[str, Any]:
    """
    Returns score and list of matches for display in professor panel.
    Matches: list of { student_idx, correct_idx, iou } (original indices, IoU value).

    Args:
        student_annotations: Student annotations with polygon/segmentation and class_id.
        correct_annotations: Reference annotations.
        iou_threshold: Minimum IoU to count as match.
        score_mode: 'recall' or 'f1'.

    Returns:
        {'score': float, 'matches': [{'student_idx': int, 'correct_idx': int, 'iou': float}, ...]}
    """
    if not correct_annotations:
        return {"score": 100.0 if not student_annotations else 0.0, "matches": []}
    if not student_annotations:
        return {"score": 0.0, "matches": []}

    valid_student = []
    valid_correct = []
    for i, ann in enumerate(student_annotations):
        poly = ann.get("polygon") or ann.get("segmentation")
        if not isinstance(poly, list) or len(poly) < 6 or len(poly) % 2 != 0:
            poly = None
        if not poly:
            continue
        cid = ann.get("class_id")
        if cid is None:
            continue
        try:
            c = int(cid)
        except (ValueError, TypeError):
            continue
        valid_student.append({"orig_index": i, "polygon": poly, "class_id": c})
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
        valid_correct.append({"orig_index": j, "polygon": poly, "class_id": c})

    if not valid_correct or not valid_student or linear_sum_assignment is None:
        return {"score": 0.0, "matches": []}

    n_s = len(valid_student)
    n_c = len(valid_correct)
    cost_matrix = np.full((n_s, n_c), np.inf)
    for i, s in enumerate(valid_student):
        for j, c in enumerate(valid_correct):
            if s["class_id"] != c["class_id"]:
                continue
            iou = effective_iou_for_matching(s["polygon"], c["polygon"])
            cost_matrix[i, j] = 1.0 - iou

    correct_matches, matched_pairs = compute_best_assignment(cost_matrix, iou_threshold)
    matches_out = []
    for m in matched_pairs:
        i, j = m["row_idx"], m["col_idx"]
        iou_val = m["iou"]
        matches_out.append(
            {
                "student_idx": valid_student[i]["orig_index"],
                "correct_idx": valid_correct[j]["orig_index"],
                "iou": round(iou_val, 4),
            }
        )

    if score_mode == "f1":
        precision = (correct_matches / n_s) if n_s else 0.0
        recall = correct_matches / n_c
        if precision + recall <= 0:
            score = 0.0
        else:
            f1 = 2.0 * precision * recall / (precision + recall)
            score = round(f1 * 100.0, 2)
    else:
        score = round((correct_matches / n_c) * 100.0, 2)
    return {"score": score, "matches": matches_out}
