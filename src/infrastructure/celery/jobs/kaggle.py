"""
Kaggle upload task - runs asynchronously via Celery.
Exports dataset and uploads to Kaggle.
"""

from typing import Optional

from infrastructure.celery.celery_app import celery_app
from infrastructure.celery.task_status import set_task_status
from shared.logger import get_logger

logger = get_logger(__name__)


@celery_app.task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 2},
)
def upload_kaggle_task(
    self,
    dataset_id: str,
    user_id: str,
    title: str,
    description: str = "",
    is_private: bool = True,
    export_config: Optional[dict] = None,
) -> dict:
    """
    Upload dataset to Kaggle asynchronously.

    For large datasets (>5000 images), uses batched upload to avoid timeouts.

    Args:
        dataset_id: Dataset ID to export
        user_id: User who requested the upload
        title: Dataset title for Kaggle
        description: Dataset description
        is_private: Whether dataset should be private
        export_config: Export configuration dict

    Returns:
        Dict with kaggle_url or error
    """
    task_id = self.request.id
    logger.info(f"Starting Kaggle upload task {task_id} for dataset {dataset_id}")

    def progress_callback(progress: int, message: str):
        """Update task status with progress from KaggleService."""
        set_task_status(
            task_id,
            "PROCESSING",
            progress=progress,
            user_id=user_id,
            message=message,
        )
        logger.info(f"Kaggle upload {task_id}: {progress}% - {message}")

    try:
        set_task_status(task_id, "PROCESSING", progress=5, user_id=user_id, message="Initializing...")

        from application.kaggle.kaggle_service import KaggleService

        service = KaggleService()

        result = service.upload_dataset(
            user_id=user_id,
            dataset_id=dataset_id,
            title=title,
            description=description,
            is_private=is_private,
            export_config=export_config,
            progress_callback=progress_callback,
        )

        if result.success:
            set_task_status(
                task_id,
                "DONE",
                progress=100,
                result={
                    "kaggle_url": result.kaggle_url,
                    "dataset_id": dataset_id,
                },
                user_id=user_id,
            )
            logger.info(f"Kaggle upload task {task_id} completed: {result.kaggle_url}")
            return {"success": True, "kaggle_url": result.kaggle_url}
        else:
            set_task_status(
                task_id,
                "FAILED",
                error=result.error_message,
                user_id=user_id,
            )
            logger.error(f"Kaggle upload task {task_id} failed: {result.error_message}")
            return {
                "success": False,
                "error_code": result.error_code,
                "error": result.error_message,
            }

    except Exception as exc:
        logger.error(f"Kaggle upload task {task_id} failed: {exc}")
        set_task_status(task_id, "FAILED", error=str(exc), user_id=user_id)
        raise
