"""Tests for infrastructure health checks."""

from unittest.mock import MagicMock, patch

import pytest

try:
    import boto3

    HAS_BOTO3 = True
except ImportError:
    HAS_BOTO3 = False


@pytest.mark.skipif(not HAS_BOTO3, reason="boto3 not installed")
class TestPingMinio:
    def test_returns_true_when_s3_disabled(self):
        with patch("infrastructure.health.config") as mock_config:
            mock_config.s3_storage_enabled = False
            from infrastructure.health import ping_minio

            assert ping_minio() is True

    def test_returns_true_when_s3_ok(self):
        with patch("infrastructure.health.config") as mock_config:
            mock_config.s3_storage_enabled = True
            mock_config.s3_endpoint_url = "http://localhost:9000"
            mock_config.s3_access_key = "minioadmin"
            mock_config.s3_secret_key = "minioadmin"
            mock_config.s3_region = "us-east-1"
            with patch("boto3.client") as mock_boto_client:
                mock_client = MagicMock()
                mock_client.list_buckets.return_value = {}
                mock_boto_client.return_value = mock_client
                from infrastructure.health import ping_minio

                assert ping_minio() is True

    def test_returns_false_when_s3_fails(self):
        with patch("infrastructure.health.config") as mock_config:
            mock_config.s3_storage_enabled = True
            mock_config.s3_endpoint_url = "http://localhost:9000"
            mock_config.s3_access_key = "minioadmin"
            mock_config.s3_secret_key = "minioadmin"
            mock_config.s3_region = "us-east-1"
            with patch("boto3.client") as mock_boto_client:
                mock_client = MagicMock()
                mock_client.list_buckets.side_effect = Exception("connection refused")
                mock_boto_client.return_value = mock_client
                from infrastructure.health import ping_minio

                assert ping_minio() is False
