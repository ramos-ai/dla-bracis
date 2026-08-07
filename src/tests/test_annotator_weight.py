"""Unit tests for domain.evaluation.annotator_weight (Cohen κ → weight)."""

from domain.evaluation.annotator_weight import (
    MAX_MATRIX_LABELS_UI,
    MIN_PAIRS_FOR_WEIGHT,
    ConfusionMatrix,
    cohens_kappa,
    compute_annotator_reliability,
    matrix_available_for_ui,
    reliability_detail_for_api,
    reliability_summary,
    weight_from_kappa,
)


class TestConfusionMatrix:
    def test_from_pairs_builds_sorted_labels(self):
        cm = ConfusionMatrix.from_pairs(
            [("b", "a"), ("a", "a"), ("b", "b")]
        )
        assert cm.labels == ["a", "b"]
        assert cm.n_pairs == 3
        # rows actual, cols predicted
        assert cm.matrix == [[1, 0], [1, 1]]


class TestCohensKappa:
    def test_perfect_agreement(self):
        # Diagonal-only → κ = 1
        matrix = [[5, 0], [0, 5]]
        kappa = cohens_kappa(matrix)
        assert kappa is not None
        assert abs(kappa - 1.0) < 1e-9

    def test_chance_level_binary(self):
        # Equal off-diagonal and diagonal in balanced way → κ ≈ 0
        matrix = [[5, 5], [5, 5]]
        kappa = cohens_kappa(matrix)
        assert kappa is not None
        assert abs(kappa) < 1e-9

    def test_empty_returns_none(self):
        assert cohens_kappa([]) is None
        assert cohens_kappa([[]]) is None
        assert cohens_kappa([[0, 0], [0, 0]]) is None

    def test_pe_one_returns_none(self):
        # All mass in one cell → Pe = 1
        assert cohens_kappa([[10]]) is None


class TestWeightFromKappa:
    def test_below_min_pairs_null(self):
        assert weight_from_kappa(0.9, MIN_PAIRS_FOR_WEIGHT - 1) is None
        assert weight_from_kappa(0.9, 0) is None

    def test_clips_negative_and_above_one(self):
        assert weight_from_kappa(-0.3, 10) == 0.0
        assert weight_from_kappa(1.2, 10) == 1.0

    def test_passthrough_in_range(self):
        assert abs(weight_from_kappa(0.75, 10) - 0.75) < 1e-9


class TestComputeAnnotatorReliability:
    def test_perfect_five_pairs(self):
        pairs = [("cat", "cat")] * 3 + [("dog", "dog")] * 2
        result = compute_annotator_reliability(pairs)
        assert result["n_pairs"] == 5
        assert result["weight"] is not None
        assert abs(result["weight"] - 1.0) < 1e-9
        assert abs(result["kappa"] - 1.0) < 1e-9

    def test_fewer_than_five_weight_null(self):
        pairs = [("a", "a"), ("b", "b"), ("a", "a"), ("b", "b")]
        result = compute_annotator_reliability(pairs)
        assert result["n_pairs"] == 4
        assert result["kappa"] is not None
        assert abs(result["kappa"] - 1.0) < 1e-9
        assert result["weight"] is None

    def test_single_pair_kappa_none(self):
        result = compute_annotator_reliability([("a", "a")])
        assert result["n_pairs"] == 1
        assert result["kappa"] is None
        assert result["weight"] is None


class TestMatrixUiGate:
    def test_available_within_limit(self):
        assert matrix_available_for_ui(["a", "b"]) is True
        assert matrix_available_for_ui([str(i) for i in range(MAX_MATRIX_LABELS_UI)]) is True

    def test_unavailable_when_too_many(self):
        labels = [str(i) for i in range(MAX_MATRIX_LABELS_UI + 1)]
        assert matrix_available_for_ui(labels) is False
        assert matrix_available_for_ui([]) is False

    def test_detail_omits_large_matrix(self):
        labels = [str(i) for i in range(MAX_MATRIX_LABELS_UI + 1)]
        n = len(labels)
        payload = {
            "kappa": 0.5,
            "weight": 0.5,
            "n_pairs": 20,
            "labels": labels,
            "matrix": [[0] * n for _ in range(n)],
        }
        detail = reliability_detail_for_api(payload)
        assert detail["matrix_available"] is False
        assert detail["matrix"] == []
        assert detail["kappa"] == 0.5

    def test_summary_strips_matrix(self):
        summary = reliability_summary(
            {
                "kappa": 0.8,
                "weight": 0.8,
                "n_pairs": 10,
                "labels": ["a"],
                "matrix": [[10]],
            }
        )
        assert summary == {"kappa": 0.8, "weight": 0.8, "n_pairs": 10}
