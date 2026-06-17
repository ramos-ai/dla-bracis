"""
Export dataset task - runs asynchronously via Celery.
Generates ZIP with images, annotations, and metadata.
"""

import io
import os
import tempfile
from typing import Optional

from bson import ObjectId

from infrastructure.celery.celery_app import celery_app
from infrastructure.celery.task_status import set_task_status
from shared.logger import get_logger

logger = get_logger(__name__)


@celery_app.task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
)
def export_dataset_task(
    self,
    dataset_id: str,
    config: Optional[dict] = None,
    user_id: Optional[str] = None,
) -> dict:
    """
    Export dataset to ZIP asynchronously.

    Args:
        dataset_id: Dataset ID to export
        config: Export configuration dict
        user_id: User who requested the export

    Returns:
        Dict with download_url or error
    """
    task_id = self.request.id
    logger.info(f"Starting export task {task_id} for dataset {dataset_id}")

    try:
        set_task_status(task_id, "PROCESSING", progress=5, user_id=user_id)

        from infrastructure.persistence.db_connection import get_db_dla

        db = get_db_dla()
        if not ObjectId.is_valid(dataset_id):
            set_task_status(
                task_id, "FAILED", error="Invalid dataset ID", user_id=user_id
            )
            return {"success": False, "error": "Invalid dataset ID"}

        dataset_doc = db.datasets.find_one({"_id": ObjectId(dataset_id)})
        if not dataset_doc:
            set_task_status(
                task_id, "FAILED", error="Dataset not found", user_id=user_id
            )
            return {"success": False, "error": "Dataset not found"}

        set_task_status(task_id, "PROCESSING", progress=10, user_id=user_id)

        from application.datasets.export_config import ExportConfig
        from application.datasets.export_dataset_zip import (
            export_dataset_zip_with_config,
        )

        if config:
            export_config = ExportConfig.from_dict(config)
        else:
            export_config = ExportConfig.from_dict({
                "mode": "simple",
                "train_pct": 66,
                "val_pct": 34,
            })

        set_task_status(task_id, "PROCESSING", progress=20, user_id=user_id)

        buf = export_dataset_zip_with_config(dataset_id, export_config)

        set_task_status(task_id, "PROCESSING", progress=80, user_id=user_id)

        from infrastructure.config.config import config as app_config

        if app_config.s3_storage_enabled:
            download_url = _save_to_s3(buf, dataset_id, task_id)
        else:
            download_url = _save_to_temp(buf, dataset_id, task_id)

        set_task_status(
            task_id,
            "DONE",
            progress=100,
            result={"download_url": download_url, "dataset_id": dataset_id},
            user_id=user_id,
        )

        logger.info(f"Export task {task_id} completed successfully")
        return {"success": True, "download_url": download_url}

    except Exception as exc:
        logger.error(f"Export task {task_id} failed: {exc}")
        set_task_status(
            task_id, "FAILED", error=str(exc), user_id=user_id
        )
        raise


def _save_to_s3(buf: io.BytesIO, dataset_id: str, task_id: str) -> str:
    """Save ZIP to S3 and return signed URL."""
    import boto3
    from botocore.config import Config as BotocoreConfig

    from infrastructure.config.config import config

    s3_client = boto3.client(
        "s3",
        endpoint_url=config.s3_endpoint_url,
        aws_access_key_id=config.s3_access_key,
        aws_secret_access_key=config.s3_secret_key,
        region_name=config.s3_region,
        config=BotocoreConfig(signature_version="s3v4"),
    )

    key = f"exports/{dataset_id}/{task_id}.zip"
    buf.seek(0)
    s3_client.put_object(
        Bucket=config.s3_bucket,
        Key=key,
        Body=buf.read(),
        ContentType="application/zip",
    )

    url = s3_client.generate_presigned_url(
        "get_object",
        Params={"Bucket": config.s3_bucket, "Key": key},
        ExpiresIn=3600,
    )
    return url


def _save_to_temp(buf: io.BytesIO, dataset_id: str, task_id: str) -> str:
    """Save ZIP to temp directory and return local path reference."""
    export_dir = os.path.join(tempfile.gettempdir(), "dla_exports")
    os.makedirs(export_dir, exist_ok=True)

    filename = f"{dataset_id}_{task_id}.zip"
    filepath = os.path.join(export_dir, filename)

    buf.seek(0)
    with open(filepath, "wb") as f:
        f.write(buf.read())

    return f"/api/export/download/{task_id}"
