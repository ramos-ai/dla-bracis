"""
S3/MinIO configuration from environment.
Required only when S3_STORAGE_ENABLED=true: S3_ENDPOINT_URL, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY.
"""

import os

from infrastructure.config._env_helpers import optional, require

S3_STORAGE_ENABLED = optional("S3_STORAGE_ENABLED", False)
S3_ENDPOINT_URL = (os.getenv("S3_ENDPOINT_URL") or "").rstrip("/")
S3_BUCKET = os.getenv("S3_BUCKET", "")
S3_ACCESS_KEY = os.getenv("S3_ACCESS_KEY", "")
S3_SECRET_KEY = os.getenv("S3_SECRET_KEY", "")
S3_REGION = os.getenv("S3_REGION", "us-east-1")

if S3_STORAGE_ENABLED:
    require("S3_ENDPOINT_URL", S3_ENDPOINT_URL or None)
    require("S3_BUCKET", S3_BUCKET or None)
    require("S3_ACCESS_KEY", S3_ACCESS_KEY or None)
    require("S3_SECRET_KEY", S3_SECRET_KEY or None)
