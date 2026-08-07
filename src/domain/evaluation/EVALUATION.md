# Evaluation Module

Pure Python grading logic for the Data Labelling App (DLA). No Flask, MongoDB, or Celery imports — reproducible as described in the BRACIS paper (*Image Annotation Tool for Dataset Generation and Export with Specialist Training*).

**Paper → code:** Section “Automatic grading module” maps directly to this folder. Hyperparameters (`iou_threshold`, `score_mode`, `supervised_practice`) are set on exercises in the application layer; this module only computes scores from annotations.

---

## Pipeline (detection & segmentation)

1. Filter valid student/reference objects (class constraint).
2. Build cost matrix `C_ij = 1 − IoU*` (same class) or `+∞` (different class).
3. Solve one-to-one matching with the Hungarian algorithm (`scipy.optimize.linear_sum_assignment`).
4. Count TP: matched pairs with `IoU* ≥ τ` (exercise threshold).
5. Derive FP = `N_s − TP`, FN = `N_r − TP`.
6. Score: **F1** or **recall** × 100, per exercise config.

**Classification:** exact set match on labels → 100 or 0 (no matching step).

---

## Module map

| File | Role |
|------|------|
| `constants.py` | `EPS`, `SEGMENTATION_EPS`, `MIN_POLYGON_AREA` — paper safeguards |
| `iou_calculator.py` | Bbox IoU; polygon area (shoelace); mask IoU (Shapely); **effective IoU** for segmentation |
| `matching_strategy.py` | Hungarian assignment; TP count above τ |
| `metrics.py` | Recall and F1 from match counts (0–100 scale) |
| `scoring_engine.py` | `calculate_classification_score`, `calculate_detection_score`, `calculate_segmentation_score` |
| `segmentation_evaluation.py` | Same as segmentation score + per-match list for teacher UI |

Public API: `domain.evaluation` (`__init__.py` re-exports).

---

## IoU definitions (paper § overlap)

**Bounding boxes** — COCO `bbox` format `(x_min, y_min, w, h)`:

```
IoU = area(intersection) / area(union)   if union > ε, else 0
```

**Polygons** — normalized coordinates `[x1,y1,…]`; mask IoU via Shapely intersection/union. Union floor `ε_seg = 10⁻⁹`.

**Effective IoU (segmentation matching only):**

```
IoU_eff(P,Q) = 1   if student polygon P ⊆ reference Q
             = mask IoU(P,Q)   otherwise
```

Pedagogical intent: inner masks (conservative delineation) count as full matches when inside the reference.

---

## Matching & metrics (paper § optimal matching)

- Only same-class pairs enter the cost matrix.
- Detection uses standard bbox IoU; segmentation uses `IoU_eff`.
- After assignment: `TP`, `FP`, `FN` as in the paper.
- **Precision** `P = TP/(TP+FP)`, **recall** `R = TP/(TP+FN)`, **F1** = harmonic mean (or direct count formula in `metrics.py`).
- **Score** = `100·F1` or `100·R` depending on `detection_score_mode` / `segmentation_score_mode`.

---

## Degenerate cases

| Condition | Score |
|-----------|-------|
| `N_r = N_s = 0` | 100 (nothing to mark) |
| `N_r = 0`, `N_s > 0` or reverse | 0 |
| Invalid / empty annotations | filtered before matching |

Application layer (`calculate_supervised_score`) averages per-image scores over `supervised_practice` media IDs; unanswered images count as 0 when that list is set.

---

## Dependencies

- `numpy` — cost matrices
- `scipy` — Hungarian (`linear_sum_assignment`)
- `shapely` — polygon IoU (optional at import; functions degrade safely if missing)

---

## Tests

`src/tests/test_domain_evaluation.py`, `test_segmentation.py` — geometry, matching, and end-to-end score cases aligned with paper constants.

---

## Reproducing paper results

Use the same τ, `score_mode`, and annotation shapes as the exercise config. Constants in `constants.py` must match the manuscript (ε = 10⁻⁶, ε_seg = 10⁻⁹, A_min = 10⁻⁸).
