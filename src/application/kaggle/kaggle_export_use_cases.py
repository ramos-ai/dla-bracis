"""Kaggle dataset export use cases."""

from typing import Any, Dict

from application.kaggle.kaggle_provider import get_kaggle_service
from application.kaggle.kaggle_types import KaggleUploadResult


def export_to_kaggle(
    user_id: str,
    dataset_id: str,
    title: str,
    description: str,
    is_private: bool,
    export_config: Dict[str, Any] = None,
) -> Dict[str, Any]:
    result: KaggleUploadResult = get_kaggle_service().upload_dataset(
        user_id=user_id,
        dataset_id=dataset_id,
        title=title,
        description=description,
        is_private=is_private,
        export_config=export_config,
    )
    return _upload_result_to_response(result)


def _upload_result_to_response(result: KaggleUploadResult) -> Dict[str, Any]:
    response: Dict[str, Any] = {
        "success": result.success,
        "kaggle_url": result.kaggle_url,
        "error": None,
    }
    if not result.success:
        response["error"] = {
            "code": result.error_code or "UNKNOWN_ERROR",
            "message": result.error_message or "An unknown error occurred.",
        }
    return response
