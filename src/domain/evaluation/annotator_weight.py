"""
Annotator reliability from supervised classification pairs.

GT × student labels → confusion matrix → Cohen κ → weight = clip(κ, 0, 1).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Sequence

MIN_PAIRS_FOR_WEIGHT = 5
MAX_MATRIX_LABELS_UI = 12


@dataclass
class ConfusionMatrix:
    """Square confusion matrix: rows = actual (GT), cols = predicted."""

    labels: list[str] = field(default_factory=list)
    matrix: list[list[int]] = field(default_factory=list)
    counts: dict[tuple[str, str], int] = field(default_factory=dict)

    def add_pair(self, actual: str, predicted: str) -> None:
        key = (str(actual), str(predicted))
        self.counts[key] = self.counts.get(key, 0) + 1

    @classmethod
    def from_pairs(cls, pairs: Iterable[tuple[str, str]]) -> "ConfusionMatrix":
        cm = cls()
        for actual, predicted in pairs:
            cm.add_pair(actual, predicted)
        cm.rebuild()
        return cm

    def rebuild(self) -> None:
        label_set: set[str] = set()
        for actual, predicted in self.counts:
            label_set.add(actual)
            label_set.add(predicted)
        self.labels = sorted(label_set)
        n = len(self.labels)
        index = {label: i for i, label in enumerate(self.labels)}
        self.matrix = [[0] * n for _ in range(n)]
        for (actual, predicted), count in self.counts.items():
            self.matrix[index[actual]][index[predicted]] = count

    @property
    def n_pairs(self) -> int:
        return sum(self.counts.values())

    def to_dict(self) -> dict:
        if not self.labels and self.counts:
            self.rebuild()
        return {
            "labels": list(self.labels),
            "matrix": [list(row) for row in self.matrix],
            "n_pairs": self.n_pairs,
        }


def cohens_kappa(matrix: Sequence[Sequence[int]] | ConfusionMatrix) -> float | None:
    """
    Cohen's κ for a square confusion matrix.

    Returns None when undefined (empty, N=0, or Pe == 1).
    """
    if isinstance(matrix, ConfusionMatrix):
        if not matrix.labels and matrix.counts:
            matrix.rebuild()
        rows = matrix.matrix
    else:
        rows = matrix

    if not rows:
        return None

    n = len(rows)
    if n == 0 or any(len(row) != n for row in rows):
        return None

    total = sum(sum(row) for row in rows)
    if total <= 0:
        return None

    observed = sum(rows[i][i] for i in range(n)) / total

    row_marginals = [sum(rows[i]) for i in range(n)]
    col_marginals = [sum(rows[i][j] for i in range(n)) for j in range(n)]
    expected = sum(
        row_marginals[i] * col_marginals[i] for i in range(n)
    ) / (total * total)

    if abs(1.0 - expected) < 1e-12:
        return None

    return (observed - expected) / (1.0 - expected)


def weight_from_kappa(kappa: float | None, n_pairs: int) -> float | None:
    """Emit weight only with enough pairs; clip κ to [0, 1]."""
    if kappa is None or n_pairs < MIN_PAIRS_FOR_WEIGHT:
        return None
    return max(0.0, min(1.0, float(kappa)))


def compute_annotator_reliability(
    pairs: Iterable[tuple[str, str]],
) -> dict:
    """
    Build confusion matrix and derive κ / weight.

    Returns dict with: kappa, weight, n_pairs, labels, matrix.
    """
    cm = ConfusionMatrix.from_pairs(pairs)
    n_pairs = cm.n_pairs
    kappa = cohens_kappa(cm) if n_pairs >= 2 else None
    weight = weight_from_kappa(kappa, n_pairs)
    return {
        "kappa": kappa,
        "weight": weight,
        "n_pairs": n_pairs,
        "labels": list(cm.labels),
        "matrix": [list(row) for row in cm.matrix],
    }


def matrix_available_for_ui(labels: Sequence[str] | None) -> bool:
    """Whether the confusion matrix is small enough to show in the admin UI."""
    if not labels:
        return False
    return len(labels) <= MAX_MATRIX_LABELS_UI


def reliability_summary(payload: dict | None) -> dict | None:
    """Strip matrix fields for list endpoints."""
    if not payload:
        return None
    return {
        "kappa": payload.get("kappa"),
        "weight": payload.get("weight"),
        "n_pairs": int(payload.get("n_pairs") or 0),
    }


def reliability_detail_for_api(payload: dict | None) -> dict:
    """Shape stored reliability for GET detail (conditional matrix)."""
    if not payload:
        return {
            "kappa": None,
            "weight": None,
            "n_pairs": 0,
            "matrix_available": False,
            "labels": [],
            "matrix": [],
        }

    labels = list(payload.get("labels") or [])
    available = matrix_available_for_ui(labels)
    detail = {
        "kappa": payload.get("kappa"),
        "weight": payload.get("weight"),
        "n_pairs": int(payload.get("n_pairs") or 0),
        "matrix_available": available,
        "updated_at": payload.get("updated_at"),
    }
    if available:
        detail["labels"] = labels
        detail["matrix"] = payload.get("matrix") or []
    else:
        detail["labels"] = []
        detail["matrix"] = []
    return detail
