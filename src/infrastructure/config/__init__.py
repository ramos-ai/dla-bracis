"""
Configuration from environment (.env).
- db_config: MongoDB
- s3_config: S3/MinIO
- app_config: JWT, Flask, CORS
- config: unified Config object
"""

from infrastructure.config.config import Config, config
from infrastructure.config.db_config import (
    MONGODB_DB_NAME,
    MONGODB_MEDIAS_DB,
    MONGODB_URL,
)
from infrastructure.config.s3_config import (
    S3_ACCESS_KEY,
    S3_BUCKET,
    S3_ENDPOINT_URL,
    S3_REGION,
    S3_SECRET_KEY,
    S3_STORAGE_ENABLED,
)

__all__ = [
    "config",
    "Config",
    "MONGODB_URL",
    "MONGODB_DB_NAME",
    "MONGODB_MEDIAS_DB",
    "S3_STORAGE_ENABLED",
    "S3_ENDPOINT_URL",
    "S3_BUCKET",
    "S3_ACCESS_KEY",
    "S3_SECRET_KEY",
    "S3_REGION",
]
