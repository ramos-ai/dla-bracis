"""S3-compatible storage (MinIO) for file uploads and downloads. All failures are logged."""

import logging

from infrastructure.config.s3_config import (
    S3_ACCESS_KEY,
    S3_BUCKET,
    S3_ENDPOINT_URL,
    S3_REGION,
    S3_SECRET_KEY,
    S3_STORAGE_ENABLED,
)

logger = logging.getLogger(__name__)


def _get_client():
    if not S3_STORAGE_ENABLED:
        return None
    import boto3
    from botocore.config import Config

    config = Config(
        signature_version="s3v4", retries={"max_attempts": 3, "mode": "standard"}
    )
    return boto3.client(
        "s3",
        endpoint_url=S3_ENDPOINT_URL,
        aws_access_key_id=S3_ACCESS_KEY,
        aws_secret_access_key=S3_SECRET_KEY,
        region_name=S3_REGION,
        config=config,
    )


def ensure_bucket_exists():
    """Create the bucket if it does not exist (call on startup or first upload)."""
    if not S3_STORAGE_ENABLED:
        return
    try:
        client = _get_client()
        client.head_bucket(Bucket=S3_BUCKET)
        logger.info("s3_bucket_ok", extra={"bucket": S3_BUCKET})
    except Exception as e:
        logger.warning(
            "s3_head_bucket_failed", extra={"bucket": S3_BUCKET, "error": str(e)}
        )
        try:
            client = _get_client()
            client.create_bucket(Bucket=S3_BUCKET)
            logger.info("s3_bucket_created", extra={"bucket": S3_BUCKET})
        except Exception as e2:
            logger.error(
                "s3_create_bucket_failed",
                extra={"bucket": S3_BUCKET, "error": str(e2)},
                exc_info=True,
            )
            raise


def upload_file(
    key: str,
    data: bytes,
    content_type: str = "application/octet-stream",
    metadata: dict = None,
):
    """Guarda um arquivo no bucket. key = file_id (string). Returns True on success, False on failure (logged)."""
    if not S3_STORAGE_ENABLED:
        return False
    try:
        client = _get_client()
        extra = {}
        if content_type:
            extra["ContentType"] = content_type
        if metadata:
            extra["Metadata"] = {k: str(v) for k, v in metadata.items()}
        client.put_object(
            Bucket=S3_BUCKET,
            Key=key,
            Body=data,
            **extra,
        )
        return True
    except Exception as e:
        logger.error(
            "s3_upload_failed",
            extra={
                "key": key,
                "bucket": S3_BUCKET,
                "content_length": len(data),
                "error": str(e),
            },
            exc_info=True,
        )
        return False


def get_file(key: str):
    """Get a file from the bucket. Returns (body_stream, content_type, content_length) or None. Failures are logged."""
    if not S3_STORAGE_ENABLED:
        return None
    try:
        client = _get_client()
        resp = client.get_object(Bucket=S3_BUCKET, Key=key)
        body = resp["Body"]
        content_type = resp.get("ContentType") or "application/octet-stream"
        content_length = resp.get("ContentLength") or 0
        return body, content_type, content_length
    except Exception as e:
        logger.error(
            "s3_get_failed",
            extra={"key": key, "bucket": S3_BUCKET, "error": str(e)},
            exc_info=True,
        )
        return None
