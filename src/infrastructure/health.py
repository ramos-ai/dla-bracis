"""Health checks for external dependencies (MongoDB, MinIO/S3, Redis)."""

import os

from infrastructure.config.config import config


def ping_minio() -> bool:
    """Return True if S3/MinIO is reachable (when S3 is enabled). Uses list_buckets so bucket need not exist yet."""
    if not config.s3_storage_enabled:
        return True
    try:
        import boto3
        from botocore.config import Config as BotocoreConfig

        client = boto3.client(
            "s3",
            endpoint_url=config.s3_endpoint_url,
            aws_access_key_id=config.s3_access_key or "minioadmin",
            aws_secret_access_key=config.s3_secret_key or "minioadmin",
            region_name=config.s3_region,
            config=BotocoreConfig(
                signature_version="s3v4", retries={"max_attempts": 1}
            ),
        )
        client.list_buckets()
        return True
    except Exception:
        return False


def ping_redis() -> bool:
    """Return True if Redis is reachable. Returns True if REDIS_URL not configured (cache disabled)."""
    redis_url = os.environ.get("REDIS_URL", "")
    if not redis_url:
        return True

    try:
        import redis

        client = redis.from_url(redis_url, socket_connect_timeout=2)
        return client.ping()
    except Exception:
        return False
