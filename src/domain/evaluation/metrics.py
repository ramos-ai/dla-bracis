"""
Precision, recall and F1 from match counts.
Pure functions for scoring after Hungarian matching.
"""


def recall_score_from_matches(correct_matches: int, n_reference: int) -> float:
    """
    Recall as (matches / total reference) * 100.

    Args:
        correct_matches: Number of reference items matched.
        n_reference: Total number of reference items.

    Returns:
        Score in [0, 100].
    """
    if n_reference <= 0:
        return 0.0
    return (correct_matches / n_reference) * 100.0


def f1_score_from_matches(
    correct_matches: int, n_student: int, n_reference: int
) -> float:
    """
    F1 from TP/FP/FN: 2*TP / (2*TP + FP + FN) * 100.
    Equivalently 2*P*R/(P+R) with P=TP/n_student, R=TP/n_reference.

    Args:
        correct_matches: TP (matched pairs with IoU >= threshold).
        n_student: Total student predictions (TP + FP).
        n_reference: Total reference items (TP + FN).

    Returns:
        F1 score in [0, 100].
    """
    if n_reference <= 0 and n_student <= 0:
        return 0.0
    precision = (correct_matches / n_student) if n_student else 0.0
    recall = (correct_matches / n_reference) if n_reference else 0.0
    if precision + recall <= 0:
        return 0.0
    f1 = 2.0 * precision * recall / (precision + recall)
    return f1 * 100.0
