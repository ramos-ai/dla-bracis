"""Shared KaggleService instance for use cases."""

from application.kaggle.kaggle_service import KaggleService

_service: KaggleService | None = None


def get_kaggle_service() -> KaggleService:
    global _service
    if _service is None:
        _service = KaggleService()
    return _service
