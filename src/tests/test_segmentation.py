"""
Tests for YOLO segmentation: polygon validation, IoU, scoring, export format.
"""

from domain.evaluation import (
    calculate_segmentation_score,
    polygon_area,
    polygon_mask_iou,
    validate_and_normalize_polygon,
)


class TestValidatePolygon:
    """Validation of polygon input."""

    def test_invalid_too_few_points(self):
        assert validate_and_normalize_polygon([]) is None
        assert validate_and_normalize_polygon([0.1, 0.2]) is None  # 1 point
        assert validate_and_normalize_polygon([0.1, 0.2, 0.3, 0.4]) is None  # 2 points

    def test_invalid_odd_length(self):
        assert validate_and_normalize_polygon([0.1, 0.2, 0.3]) is None

    def test_invalid_out_of_range(self):
        assert validate_and_normalize_polygon([0.0, 0.0, 1.0, 0.0, 0.5, 1.2]) is None
        assert validate_and_normalize_polygon([-0.1, 0.0, 1.0, 0.0, 0.5, 1.0]) is None

    def test_valid_minimum_polygon(self):
        out = validate_and_normalize_polygon([0.0, 0.0, 1.0, 0.0, 0.5, 1.0])
        assert out is not None
        assert len(out) == 6


class TestPolygonArea:
    def test_triangle(self):
        # Triangle (0,0), (1,0), (0.5,1) -> area = 0.5
        poly = [0.0, 0.0, 1.0, 0.0, 0.5, 1.0]
        assert abs(polygon_area(poly) - 0.5) < 1e-9

    def test_square(self):
        poly = [0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0]
        assert abs(polygon_area(poly) - 1.0) < 1e-9


class TestPolygonIoU:
    """IoU between two polygons (mask IoU via Shapely)."""

    def test_identical_squares(self):
        sq = [0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0]
        iou = polygon_mask_iou(sq, sq)
        assert abs(iou - 1.0) < 1e-6

    def test_no_overlap(self):
        a = [0.0, 0.0, 0.5, 0.0, 0.5, 0.5, 0.0, 0.5]
        b = [0.5, 0.5, 1.0, 0.5, 1.0, 1.0, 0.5, 1.0]
        iou = polygon_mask_iou(a, b)
        assert iou >= 0.0 and iou < 0.01  # no or negligible overlap

    def test_half_overlap(self):
        # Two unit squares: one (0,0)-(1,1), other (0.5,0)-(1.5,1). Overlap = 0.5, union = 1.5, IoU = 1/3
        a = [0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0]
        b = [0.5, 0.0, 1.5, 0.0, 1.5, 1.0, 0.5, 1.0]
        # Normalized coords must be 0-1; use smaller squares inside [0,1]
        a = [0.0, 0.0, 0.5, 0.0, 0.5, 0.5, 0.0, 0.5]
        b = [0.25, 0.0, 0.75, 0.0, 0.75, 0.5, 0.25, 0.5]
        iou = polygon_mask_iou(a, b)
        assert iou > 0.2 and iou < 1.0


class TestCalculateSegmentationScore:
    """Matching and recall/F1 scoring."""

    def test_empty_reference_returns_100_if_student_empty(self):
        score = calculate_segmentation_score(
            [], [], iou_threshold=0.75, score_mode="recall"
        )
        assert score == 100.0

    def test_empty_reference_returns_0_if_student_has_any(self):
        student = [{"class_id": 0, "polygon": [0.0, 0.0, 0.5, 0.0, 0.25, 0.5]}]
        score = calculate_segmentation_score(
            student, [], iou_threshold=0.75, score_mode="recall"
        )
        assert score == 0.0

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
        # precision=1/1=1, recall=1/2=0.5, F1 = 2*1*0.5/(1+0.5) = 2/3
        expected_f1_pct = 100.0 * (2.0 / 3.0)
        assert abs(score - expected_f1_pct) < 1.0


class TestYOLOExportFormat:
    """Export line format: class_id x1 y1 x2 y2 ..."""

    def test_yolo_line_format(self):
        ann = {
            "class_id": 0,
            "polygon": [0.512, 0.231, 0.600, 0.245, 0.623, 0.310, 0.540, 0.350],
        }
        cid = ann["class_id"]
        polygon = ann["polygon"]
        coords = " ".join(f"{x:.6f}" for x in polygon)
        line = f"{cid} {coords}"
        assert line.startswith("0 ")
        parts = line.split()
        assert len(parts) == 9  # 1 class_id + 8 coords
        assert float(parts[0]) == 0
        assert all(0 <= float(parts[i]) <= 1 for i in range(1, 9))
