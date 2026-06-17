"""Shared types and constants for Kaggle integration."""

from dataclasses import dataclass
from typing import Optional

BATCH_SIZE = 300
LARGE_DATASET_THRESHOLD = 5000

DEFAULT_EXPORT_CONFIG = {
    "mode": "simple",
    "train_pct": 66,
    "val_pct": 34,
}


@dataclass
class KaggleUploadResult:
    """Result of a Kaggle upload operation."""

    success: bool
    kaggle_url: Optional[str] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None

    @classmethod
    def ok(cls, kaggle_url: str) -> "KaggleUploadResult":
        return cls(success=True, kaggle_url=kaggle_url)

    @classmethod
    def fail(cls, error_code: str, error_message: str) -> "KaggleUploadResult":
        return cls(
            success=False,
            error_code=error_code,
            error_message=error_message,
        )
