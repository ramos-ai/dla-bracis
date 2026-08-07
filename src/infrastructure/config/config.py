"""
Unified configuration: assembles Config class from db_config, s3_config, app_config.
Single entry point for config object and re-exports.
"""

from . import app_config, db_config, s3_config


class Config:
    """Configuration object aggregating all env-based settings."""

    # MongoDB
    mongodb_url = db_config.MONGODB_URL
    mongodb_db_name = db_config.MONGODB_DB_NAME
    mongodb_medias_db = db_config.MONGODB_MEDIAS_DB
    mongodb_max_pool_size = db_config.MONGODB_MAX_POOL_SIZE
    mongodb_min_pool_size = db_config.MONGODB_MIN_POOL_SIZE
    mongodb_server_selection_timeout_ms = (
        db_config.MONGODB_SERVER_SELECTION_TIMEOUT_MS
    )
    mongodb_retry_writes = db_config.MONGODB_RETRY_WRITES

    # S3
    s3_storage_enabled = s3_config.S3_STORAGE_ENABLED
    s3_endpoint_url = s3_config.S3_ENDPOINT_URL
    s3_bucket = s3_config.S3_BUCKET
    s3_access_key = s3_config.S3_ACCESS_KEY
    s3_secret_key = s3_config.S3_SECRET_KEY
    s3_region = s3_config.S3_REGION

    # JWT & App
    jwt_secret_key = app_config.JWT_SECRET_KEY
    jwt_algorithm = app_config.JWT_ALGORITHM
    access_token_expire_minutes = app_config.ACCESS_TOKEN_EXPIRE_MINUTES
    flask_env = app_config.FLASK_ENV
    port = app_config.PORT
    cors_origins = app_config.CORS_ORIGINS
    max_content_length_bytes = app_config.MAX_CONTENT_LENGTH_MB * 1024 * 1024

    # Kaggle
    kaggle_encryption_key = app_config.KAGGLE_ENCRYPTION_KEY


config = Config()
