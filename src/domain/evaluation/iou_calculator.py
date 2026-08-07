"""
Intersection-over-Union (IoU) calculations for bounding boxes and polygons.
Pure functions; no database or framework dependencies.
"""

from typing import List, Optional

from domain.evaluation.constants import EPS, MIN_POLYGON_AREA

try:
    from shapely.geometry import Polygon
    from shapely.validation import make_valid
except ImportError:
    Polygon = None
    make_valid = None


def normalize_bbox(bbox: Optional[List], precision: int = 2) -> Optional[List[float]]:
    """
    Normalize bounding box to consistent precision and type.

    Args:
        bbox: [x_min, y_min, width, height]
        precision: Number of decimal places to round to.

    Returns:
        Normalized list [x_min, y_min, width, height] as floats, or None if invalid.
    """
    if not bbox or len(bbox) != 4:
        return None
    try:
        return [round(float(v), precision) for v in bbox]
    except (ValueError, TypeError):
        return None


def calculate_bbox_iou(bbox1: List, bbox2: List) -> float:
    """
    Compute Intersection over Union between two bounding boxes in [x_min, y_min, width, height].

    Args:
        bbox1: First bounding box.
        bbox2: Second bounding box.

    Returns:
        IoU value in [0.0, 1.0].
    """
    bbox1 = normalize_bbox(bbox1)
    bbox2 = normalize_bbox(bbox2)
    if not bbox1 or not bbox2:
        return 0.0

    x1_min, y1_min, w1, h1 = bbox1
    x2_min, y2_min, w2, h2 = bbox2
    if w1 < EPS or h1 < EPS or w2 < EPS or h2 < EPS:
        return 0.0

    area1 = w1 * h1
    area2 = w2 * h2
    x1_max = x1_min + w1
    y1_max = y1_min + h1
    x2_max = x2_min + w2
    y2_max = y2_min + h2

    inter_x_min = max(x1_min, x2_min)
    inter_y_min = max(y1_min, y2_min)
    inter_x_max = min(x1_max, x2_max)
    inter_y_max = min(y1_max, y2_max)
    if inter_x_max <= inter_x_min + EPS or inter_y_max <= inter_y_min + EPS:
        return 0.0

    inter_area = (inter_x_max - inter_x_min) * (inter_y_max - inter_y_min)
    union_area = area1 + area2 - inter_area
    if union_area < EPS:
        return 0.0
    iou = inter_area / union_area
    return max(0.0, min(1.0, iou))


def _normalize_polygon_orientation(polygon: List[float]) -> List[float]:
    """Ensure polygon has consistent orientation (counter-clockwise by convention)."""
    if len(polygon) < 6 or Polygon is None or make_valid is None:
        return polygon
    points = [(polygon[i], polygon[i + 1]) for i in range(0, len(polygon), 2)]
    try:
        p = Polygon(points)
        if not p.is_valid:
            p = make_valid(p)
        if p.is_empty or p.area < MIN_POLYGON_AREA:
            return polygon
        ext = list(p.exterior.coords)[:-1]
        flat = [float(c) for pnt in ext for c in pnt]
        return flat
    except Exception:
        return polygon


def validate_and_normalize_polygon(
    polygon: Optional[List[float]],
) -> Optional[List[float]]:
    """
    Validate polygon: at least 3 points, even length (x,y pairs), values in [0,1].
    Returns normalized list or None if invalid.
    """
    if not polygon or len(polygon) < 6 or len(polygon) % 2 != 0:
        return None
    try:
        coords = [float(x) for x in polygon]
        for v in coords:
            if v < -EPS or v > 1.0 + EPS:
                return None
        return _normalize_polygon_orientation(coords)
    except (ValueError, TypeError):
        return None


def polygon_area(polygon: List[float]) -> float:
    """Shoelace formula for polygon area (normalized coords)."""
    if len(polygon) < 6:
        return 0.0
    points = [(polygon[i], polygon[i + 1]) for i in range(0, len(polygon), 2)]
    n = len(points)
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += points[i][0] * points[j][1]
        area -= points[j][0] * points[i][1]
    return abs(area) / 2.0


def polygon_mask_iou(polygon_a: List[float], polygon_b: List[float]) -> float:
    """
    Compute IoU between two polygons (normalized 0-1) using Shapely.
    Returns value in [0, 1]. Uses polygon intersection/union (mask IoU).
    """
    if (
        len(polygon_a) < 6
        or len(polygon_b) < 6
        or Polygon is None
        or make_valid is None
    ):
        return 0.0
    try:
        points_a = [
            (polygon_a[i], polygon_a[i + 1]) for i in range(0, len(polygon_a), 2)
        ]
        points_b = [
            (polygon_b[i], polygon_b[i + 1]) for i in range(0, len(polygon_b), 2)
        ]
        pa = Polygon(points_a)
        pb = Polygon(points_b)
        if not pa.is_valid:
            pa = make_valid(pa)
        if not pb.is_valid:
            pb = make_valid(pb)
        if (
            pa.is_empty
            or pb.is_empty
            or pa.area < MIN_POLYGON_AREA
            or pb.area < MIN_POLYGON_AREA
        ):
            return 0.0
        inter = pa.intersection(pb).area
        union = pa.union(pb).area
        if union < EPS:
            return 0.0
        iou = inter / union
        return max(0.0, min(1.0, iou))
    except Exception:
        return 0.0


def effective_iou_for_matching(
    student_poly: List[float], reference_poly: List[float]
) -> float:
    """
    IoU used to decide if a student polygon matches a reference (for scoring).
    When the student polygon is entirely inside the reference, returns 1.0; otherwise mask IoU.
    """
    if (
        len(student_poly) < 6
        or len(reference_poly) < 6
        or Polygon is None
        or make_valid is None
    ):
        return 0.0
    try:
        pts_s = [
            (student_poly[i], student_poly[i + 1])
            for i in range(0, len(student_poly), 2)
        ]
        pts_r = [
            (reference_poly[i], reference_poly[i + 1])
            for i in range(0, len(reference_poly), 2)
        ]
        pa = Polygon(pts_s)
        pb = Polygon(pts_r)
        if not pa.is_valid:
            pa = make_valid(pa)
        if not pb.is_valid:
            pb = make_valid(pb)
        if (
            pa.is_empty
            or pb.is_empty
            or pa.area < MIN_POLYGON_AREA
            or pb.area < MIN_POLYGON_AREA
        ):
            return 0.0
        if pa.within(pb):
            return 1.0
        return polygon_mask_iou(student_poly, reference_poly)
    except Exception:
        return 0.0
