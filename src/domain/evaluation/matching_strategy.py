"""
Hungarian matching for optimal assignment (detection and segmentation).
Uses scipy.optimize.linear_sum_assignment on a cost matrix.
"""

from typing import List, Tuple

import numpy as np
from scipy.optimize import linear_sum_assignment

from domain.evaluation.constants import EPS


def compute_best_assignment(
    cost_matrix: np.ndarray,
    iou_threshold: float,
) -> Tuple[int, List[dict]]:
    """
    Compute best assignment from cost matrix and count matches above IoU threshold.
    Cost is 1 - IoU, so we minimize cost to maximize IoU.

    Args:
        cost_matrix: Matrix of shape (n_student, n_correct); inf for invalid pairs.
        iou_threshold: Minimum IoU to count as a match.

    Returns:
        (correct_matches_count, list of match dicts with student_idx, correct_idx, iou).
    """
    n_s, n_c = cost_matrix.shape
    if n_s == 0 or n_c == 0:
        return 0, []
    if np.all(np.isinf(cost_matrix)):
        return 0, []
    row_ind, col_ind = linear_sum_assignment(cost_matrix)
    correct_matches = 0
    matched_pairs = []
    for idx in range(len(row_ind)):
        i, j = row_ind[idx], col_ind[idx]
        cost = cost_matrix[i, j]
        if cost == np.inf:
            continue
        iou = 1.0 - cost
        if iou + EPS >= iou_threshold:
            correct_matches += 1
            matched_pairs.append({"row_idx": i, "col_idx": j, "iou": iou})
    return correct_matches, matched_pairs
