"""
Tests for domain.evaluation: IoU, matching, metrics, and correction scoring algorithms.
No Flask or MongoDB; pure unit tests.
"""

import numpy as np

from domain.evaluation.iou_calculator import (
    calculate_bbox_iou,
    effective_iou_for_matching,
    normalize_bbox,
    polygon_area,
    polygon_mask_iou,
    validate_and_normalize_polygon,
)
from domain.evaluation.matching_strategy import compute_best_assignment
from domain.evaluation.metrics import f1_score_from_matches, recall_score_from_matches
from domain.evaluation.scoring_engine import (
    calculate_classification_score,
    calculate_detection_score,
    calculate_segmentation_score,
)
from domain.evaluation.segmentation_evaluation import evaluate_segmentation


class TestNormalizeBbox:
    """Bounding box normalization."""

    def test_valid_bbox(self):
        assert normalize_bbox([0.1, 0.2, 0.3, 0.4]) == [0.1, 0.2, 0.3, 0.4]
        assert normalize_bbox([1, 2, 3, 4]) == [1.0, 2.0, 3.0, 4.0]

    def test_invalid_bbox_returns_none(self):
        assert normalize_bbox([]) is None
        assert normalize_bbox([1, 2, 3]) is None
        assert normalize_bbox([1, 2, 3, 4, 5]) is None
        assert normalize_bbox(None) is None


class TestCalculateBboxIou:
    """Bounding box IoU (intersection over union)."""

    def test_identical_boxes(self):
        b = [0.0, 0.0, 0.5, 0.5]
        assert abs(calculate_bbox_iou(b, b) - 1.0) < 1e-6

    def test_no_overlap(self):
        a = [0.0, 0.0, 0.5, 0.5]
        b = [0.5, 0.5, 0.5, 0.5]
        assert calculate_bbox_iou(a, b) == 0.0

    def test_half_overlap(self):
        a = [0.0, 0.0, 1.0, 1.0]
        b = [0.5, 0.0, 0.5, 1.0]
        iou = calculate_bbox_iou(a, b)
        assert 0.48 < iou < 0.52

    def test_invalid_boxes_return_zero(self):
        assert calculate_bbox_iou([], [0, 0, 1, 1]) == 0.0
        assert calculate_bbox_iou([0, 0, 1, 1], [0, 0, 0, 0]) == 0.0


class TestPolygonArea:
    """Polygon area (shoelace)."""

    def test_triangle(self):
        poly = [0.0, 0.0, 1.0, 0.0, 0.5, 1.0]
        assert abs(polygon_area(poly) - 0.5) < 1e-9

    def test_square(self):
        poly = [0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0]
        assert abs(polygon_area(poly) - 1.0) < 1e-9

    def test_too_few_points(self):
        assert polygon_area([0, 0]) == 0.0


class TestValidateAndNormalizePolygon:
    """Polygon validation (0-1 coords, min 3 points)."""

    def test_invalid_too_few_points(self):
        assert validate_and_normalize_polygon([]) is None
        assert validate_and_normalize_polygon([0.1, 0.2]) is None
        assert validate_and_normalize_polygon([0.1, 0.2, 0.3, 0.4]) is None

    def test_invalid_odd_length(self):
        assert validate_and_normalize_polygon([0.1, 0.2, 0.3]) is None

    def test_invalid_out_of_range(self):
        assert validate_and_normalize_polygon([0.0, 0.0, 1.0, 0.0, 0.5, 1.2]) is None
        assert validate_and_normalize_polygon([-0.1, 0.0, 1.0, 0.0, 0.5, 1.0]) is None

    def test_valid_minimum_polygon(self):
        out = validate_and_normalize_polygon([0.0, 0.0, 1.0, 0.0, 0.5, 1.0])
        assert out is not None
        assert len(out) == 6


class TestPolygonMaskIou:
    """Polygon mask IoU (requires Shapely)."""

    def test_identical_squares(self):
        sq = [0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0]
        iou = polygon_mask_iou(sq, sq)
        assert abs(iou - 1.0) < 1e-6

    def test_no_overlap(self):
        a = [0.0, 0.0, 0.5, 0.0, 0.5, 0.5, 0.0, 0.5]
        b = [0.5, 0.5, 1.0, 0.5, 1.0, 1.0, 0.5, 1.0]
        iou = polygon_mask_iou(a, b)
        assert iou >= 0.0 and iou < 0.01

    def test_too_few_points_returns_zero(self):
        assert polygon_mask_iou([0, 0], [0, 0, 1, 0, 0.5, 1]) == 0.0


class TestEffectiveIouForMatching:
    """Effective IoU (student inside reference => 1.0)."""

    def test_identical_returns_positive(self):
        poly = [0.0, 0.0, 0.5, 0.0, 0.25, 0.5]
        assert effective_iou_for_matching(poly, poly) >= 0.99

    def test_too_few_points_returns_zero(self):
        assert effective_iou_for_matching([0, 0], [0, 0, 1, 0, 0.5, 1]) == 0.0


class TestRecallAndF1Metrics:
    """Recall and F1 from match counts."""

    def test_recall_full_match(self):
        assert recall_score_from_matches(5, 5) == 100.0

    def test_recall_half_match(self):
        assert recall_score_from_matches(2, 4) == 50.0

    def test_recall_zero_reference(self):
        assert recall_score_from_matches(0, 0) == 0.0

    def test_f1_perfect(self):
        assert abs(f1_score_from_matches(3, 3, 3) - 100.0) < 1e-6

    def test_f1_half_precision_half_recall(self):
        f1 = f1_score_from_matches(1, 2, 2)
        expected = 100.0 * (2.0 * 0.5 * 0.5 / 1.0)
        assert abs(f1 - expected) < 1e-6

    def test_f1_zero_denominator(self):
        assert f1_score_from_matches(0, 0, 0) == 0.0


class TestMatchingStrategy:
    """Hungarian assignment and threshold counting."""

    def test_empty_matrix(self):
        cost = np.array([]).reshape(0, 0)
        n, pairs = compute_best_assignment(cost, 0.5)
        assert n == 0
        assert pairs == []

    def test_single_match_above_threshold(self):
        cost = np.array([[0.2]])
        n, pairs = compute_best_assignment(cost, 0.5)
        assert n == 1
        assert len(pairs) == 1
        assert pairs[0]["iou"] == 0.8

    def test_single_match_below_threshold(self):
        cost = np.array([[0.6]])
        n, pairs = compute_best_assignment(cost, 0.5)
        assert n == 0
        assert len(pairs) == 0

    def test_two_by_two_best_assignment(self):
        cost = np.array([[0.0, 1.0], [1.0, 0.0]])
        n, pairs = compute_best_assignment(cost, 0.5)
        assert n == 2
        assert len(pairs) == 2


class TestClassificationScore:
    """Classification: exact label set match."""

    def test_exact_match(self):
        assert calculate_classification_score({"a", "b"}, {"a", "b"}) == 100.0

    def test_wrong_labels(self):
        assert calculate_classification_score({"a"}, {"b"}) == 0.0

    def test_extra_label(self):
        assert calculate_classification_score({"a", "b"}, {"a"}) == 0.0

    def test_missing_label(self):
        assert calculate_classification_score({"a"}, {"a", "b"}) == 0.0

    def test_empty_both(self):
        assert calculate_classification_score(set(), set()) == 100.0


class TestDetectionScore:
    """Detection scoring (bbox IoU + Hungarian, recall/F1)."""

    def test_empty_reference_returns_100_if_student_empty(self):
        assert (
            calculate_detection_score([], [], iou_threshold=0.85, score_mode="recall")
            == 100.0
        )

    def test_empty_reference_returns_0_if_student_has_any(self):
        student = [{"category_id": 1, "bbox": [0.0, 0.0, 0.2, 0.2]}]
        assert (
            calculate_detection_score(
                student, [], iou_threshold=0.85, score_mode="recall"
            )
            == 0.0
        )

    def test_one_to_one_perfect_match_recall(self):
        box = [0.0, 0.0, 0.3, 0.3]
        correct = [{"category_id": 1, "bbox": box}]
        student = [{"category_id": 1, "bbox": box}]
        assert (
            calculate_detection_score(
                student, correct, iou_threshold=0.5, score_mode="recall"
            )
            == 100.0
        )

    def test_category_mismatch_no_match(self):
        correct = [{"category_id": 1, "bbox": [0.0, 0.0, 0.3, 0.3]}]
        student = [{"category_id": 2, "bbox": [0.0, 0.0, 0.3, 0.3]}]
        assert (
            calculate_detection_score(
                student, correct, iou_threshold=0.5, score_mode="recall"
            )
            == 0.0
        )

    def test_recall_two_ref_one_match(self):
        box = [0.0, 0.0, 0.3, 0.3]
        correct = [
            {"category_id": 1, "bbox": box},
            {"category_id": 1, "bbox": [0.5, 0.5, 0.2, 0.2]},
        ]
        student = [{"category_id": 1, "bbox": box}]
        score = calculate_detection_score(
            student, correct, iou_threshold=0.5, score_mode="recall"
        )
        assert score == 50.0

    def test_f1_penalizes_extra_predictions(self):
        box = [0.0, 0.0, 0.3, 0.3]
        correct = [{"category_id": 1, "bbox": box}]
        student = [
            {"category_id": 1, "bbox": box},
            {"category_id": 1, "bbox": [0.6, 0.6, 0.2, 0.2]},
        ]
        score = calculate_detection_score(
            student, correct, iou_threshold=0.5, score_mode="f1"
        )
        assert score < 100.0
        assert score > 0.0


class TestSegmentationScore:
    """Segmentation scoring (polygon IoU + Hungarian, recall/F1)."""

    def test_empty_reference_returns_100_if_student_empty(self):
        assert (
            calculate_segmentation_score(
                [], [], iou_threshold=0.75, score_mode="recall"
            )
            == 100.0
        )

    def test_empty_reference_returns_0_if_student_has_any(self):
        student = [{"class_id": 0, "polygon": [0.0, 0.0, 0.5, 0.0, 0.25, 0.5]}]
        assert (
            calculate_segmentation_score(
                student, [], iou_threshold=0.75, score_mode="recall"
            )
            == 0.0
        )

    def test_recall_one_match(self):
        poly = [0.0, 0.0, 0.5, 0.0, 0.25, 0.5]
        correct = [{"class_id": 0, "polygon": poly}]
        student = [{"class_id": 0, "polygon": poly}]
        score = calculate_segmentation_score(
            student, correct, iou_threshold=0.5, score_mode="recall"
        )
        assert score == 100.0

    def test_f1_two_ref_one_student_match(self):
        poly = [0.0, 0.0, 0.5, 0.0, 0.25, 0.5]
        correct = [
            {"class_id": 0, "polygon": poly},
            {"class_id": 0, "polygon": [0.5, 0.5, 1.0, 0.5, 0.75, 1.0]},
        ]
        student = [{"class_id": 0, "polygon": poly}]
        score = calculate_segmentation_score(
            student, correct, iou_threshold=0.5, score_mode="f1"
        )
        expected_f1_pct = 100.0 * (2.0 / 3.0)
        assert abs(score - expected_f1_pct) < 1.0


class TestEvaluateSegmentation:
    """Segmentation evaluation (score + matches for professor panel)."""

    def test_returns_score_and_matches(self):
        poly = [0.0, 0.0, 0.5, 0.0, 0.25, 0.5]
        correct = [{"class_id": 0, "polygon": poly}]
        student = [{"class_id": 0, "polygon": poly}]
        result = evaluate_segmentation(
            student, correct, iou_threshold=0.5, score_mode="recall"
        )
        assert "score" in result
        assert "matches" in result
        assert result["score"] == 100.0
        assert len(result["matches"]) == 1
        assert "student_idx" in result["matches"][0]
        assert "correct_idx" in result["matches"][0]
        assert "iou" in result["matches"][0]

    def test_empty_reference(self):
        result = evaluate_segmentation([], [])
        assert result["score"] == 100.0
        assert result["matches"] == []

    def test_empty_student_with_reference(self):
        correct = [{"class_id": 0, "polygon": [0.0, 0.0, 0.5, 0.0, 0.25, 0.5]}]
        result = evaluate_segmentation([], correct)
        assert result["score"] == 0.0
        assert result["matches"] == []

    def test_evaluate_segmentation_f1_mode(self):
        poly = [0.0, 0.0, 0.5, 0.0, 0.25, 0.5]
        correct = [{"class_id": 0, "polygon": poly}]
        student = [{"class_id": 0, "polygon": poly}]
        result = evaluate_segmentation(
            student, correct, iou_threshold=0.5, score_mode="f1"
        )
        assert result["score"] == 100.0
        assert len(result["matches"]) == 1
