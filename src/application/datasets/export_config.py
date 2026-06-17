"""
Export configuration schema for configurable dataset export.
"""

from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass
class ExportConfig:
    """Configuration for dataset export. Defaults match simple/quick export."""

    mode: str = "simple"  # "simple" | "custom"
    split_mode: str = "auto"  # "auto" | "manual"
    # Percentages (0-100), must sum to 100 when split_mode=auto
    train_pct: float = 66.0
    val_pct: float = 34.0
    test_pct: float = 0.0
    # Which splits to include
    include_train: bool = True
    include_val: bool = True
    include_test: bool = False
    # Manual assignment: file_id -> "train" | "val" | "test"
    manual_splits: Optional[Dict[str, List[str]]] = None  # {"train": [...], "val": [...], "test": [...]}
    # Format: "coco" | "yolo" | "both" (both when task supports it)
    format: str = "auto"  # "auto" | "coco" | "yolo" | "both"
    # Image options
    max_width: int = 1024
    jpeg_quality: int = 85
    keep_original_resolution: bool = False
    # Annotation options
    include_unlabeled: bool = False
    class_filter: Optional[List[int]] = None  # indices of classes to include
    # Reproducibility
    seed: int = 42

    @classmethod
    def from_dict(cls, d: dict) -> "ExportConfig":
        """Build config from request JSON."""
        manual = d.get("manual_splits")
        if manual and not isinstance(manual, dict):
            manual = None
        return cls(
            mode=d.get("mode", "simple"),
            split_mode=d.get("split_mode", "auto"),
            train_pct=float(d.get("train_pct", 66)),
            val_pct=float(d.get("val_pct", 34)),
            test_pct=float(d.get("test_pct", 0)),
            include_train=d.get("include_train", True),
            include_val=d.get("include_val", True),
            include_test=d.get("include_test", False),
            manual_splits=manual,
            format=d.get("format", "auto"),
            max_width=int(d.get("max_width", 1024)),
            jpeg_quality=int(d.get("jpeg_quality", 85)),
            keep_original_resolution=bool(d.get("keep_original_resolution", False)),
            include_unlabeled=bool(d.get("include_unlabeled", False)),
            class_filter=d.get("class_filter"),
            seed=int(d.get("seed", 42)),
        )

    def get_split_names(self) -> List[str]:
        """Return list of split names to include (e.g. ['train', 'val']).
        - Manual mode: returns splits that have at least one image in manual_splits.
        - Auto mode: returns splits where include_* is True.
        - When none selected, returns [] — images go to images/ without subfolders."""
        if self.split_mode == "manual" and self.manual_splits:
            names = []
            for split_name in ("train", "val", "test"):
                ids = self.manual_splits.get(split_name)
                if ids:
                    names.append(split_name)
            if names:
                return names
        names = []
        if self.include_train:
            names.append("train")
        if self.include_val:
            names.append("val")
        if self.include_test:
            names.append("test")
        return names
