"""Tests for Celery task status tracking via Redis."""

import json
import sys
from unittest.mock import MagicMock, patch

import pytest

# Mock celery and redis before any imports from infrastructure.celery
sys.modules["celery"] = MagicMock()
sys.modules["redis"] = MagicMock()


class TestTaskStatus:
    """Tests for task_status module."""

    @pytest.fixture
    def mock_redis(self):
        """Create a mock Redis client."""
        mock = MagicMock()
        mock.get.return_value = None
        mock.setex.return_value = True
        mock.delete.return_value = 1
        return mock

    @pytest.fixture(autouse=True)
    def reset_redis_client(self):
        """Reset the redis client singleton before each test."""
        yield
        # Clean up after test
        try:
            import infrastructure.celery.task_status as ts
            ts._redis_client = None
        except Exception:
            pass

    def test_task_key_format(self):
        from infrastructure.celery.task_status import _task_key

        key = _task_key("abc123")
        assert key == "task:abc123"

    def test_set_task_status_new_task(self, mock_redis):
        import infrastructure.celery.task_status as task_status_module

        with patch.object(task_status_module, "_get_redis", return_value=mock_redis):
            task_status_module.set_task_status(
                task_id="task123",
                status="PROCESSING",
                progress=50,
                result=None,
                error=None,
                user_id="user456",
            )

            mock_redis.setex.assert_called_once()
            call_args = mock_redis.setex.call_args
            assert call_args[0][0] == "task:task123"
            assert call_args[0][1] == 3600  # TTL

            payload = json.loads(call_args[0][2])
            assert payload["status"] == "PROCESSING"
            assert payload["progress"] == 50
            assert payload["user_id"] == "user456"
            assert payload["result"] is None
            assert payload["error"] is None

    def test_set_task_status_preserves_created_at(self, mock_redis):
        import infrastructure.celery.task_status as task_status_module

        existing_data = json.dumps({
            "status": "PENDING",
            "progress": 0,
            "created_at": "2024-01-01T00:00:00+00:00",
        })
        mock_redis.get.return_value = existing_data

        with patch.object(task_status_module, "_get_redis", return_value=mock_redis):
            task_status_module.set_task_status(
                task_id="task123",
                status="PROCESSING",
                progress=25,
            )

            call_args = mock_redis.setex.call_args
            payload = json.loads(call_args[0][2])
            assert payload["created_at"] == "2024-01-01T00:00:00+00:00"

    def test_set_task_status_clamps_progress(self, mock_redis):
        import infrastructure.celery.task_status as task_status_module

        with patch.object(task_status_module, "_get_redis", return_value=mock_redis):
            task_status_module.set_task_status("task123", "PROCESSING", progress=150)
            payload = json.loads(mock_redis.setex.call_args[0][2])
            assert payload["progress"] == 100

            task_status_module.set_task_status("task123", "PROCESSING", progress=-10)
            payload = json.loads(mock_redis.setex.call_args[0][2])
            assert payload["progress"] == 0

    def test_get_task_status_found(self, mock_redis):
        import infrastructure.celery.task_status as task_status_module

        stored_data = json.dumps({
            "status": "DONE",
            "progress": 100,
            "result": {"download_url": "http://example.com/file.zip"},
            "error": None,
            "user_id": "user123",
        })
        mock_redis.get.return_value = stored_data

        with patch.object(task_status_module, "_get_redis", return_value=mock_redis):
            result = task_status_module.get_task_status("task123")

            assert result is not None
            assert result["status"] == "DONE"
            assert result["progress"] == 100
            assert result["result"]["download_url"] == "http://example.com/file.zip"

    def test_get_task_status_not_found(self, mock_redis):
        import infrastructure.celery.task_status as task_status_module

        mock_redis.get.return_value = None

        with patch.object(task_status_module, "_get_redis", return_value=mock_redis):
            result = task_status_module.get_task_status("nonexistent")
            assert result is None

    def test_get_task_status_invalid_json(self, mock_redis):
        import infrastructure.celery.task_status as task_status_module

        mock_redis.get.return_value = "invalid json {"

        with patch.object(task_status_module, "_get_redis", return_value=mock_redis):
            result = task_status_module.get_task_status("task123")
            assert result is None

    def test_delete_task_status_success(self, mock_redis):
        import infrastructure.celery.task_status as task_status_module

        mock_redis.delete.return_value = 1

        with patch.object(task_status_module, "_get_redis", return_value=mock_redis):
            result = task_status_module.delete_task_status("task123")
            assert result is True
            mock_redis.delete.assert_called_once_with("task:task123")

    def test_delete_task_status_not_found(self, mock_redis):
        import infrastructure.celery.task_status as task_status_module

        mock_redis.delete.return_value = 0

        with patch.object(task_status_module, "_get_redis", return_value=mock_redis):
            result = task_status_module.delete_task_status("nonexistent")
            assert result is False

    def test_init_task(self, mock_redis):
        import infrastructure.celery.task_status as task_status_module

        with patch.object(task_status_module, "_get_redis", return_value=mock_redis):
            task_status_module.init_task("task123", user_id="user456")

            call_args = mock_redis.setex.call_args
            payload = json.loads(call_args[0][2])
            assert payload["status"] == "PENDING"
            assert payload["progress"] == 0
            assert payload["user_id"] == "user456"

    def test_init_task_without_user(self, mock_redis):
        import infrastructure.celery.task_status as task_status_module

        with patch.object(task_status_module, "_get_redis", return_value=mock_redis):
            task_status_module.init_task("task123")

            call_args = mock_redis.setex.call_args
            payload = json.loads(call_args[0][2])
            assert payload["status"] == "PENDING"
            assert payload["user_id"] is None

    def test_set_task_status_with_error(self, mock_redis):
        import infrastructure.celery.task_status as task_status_module

        with patch.object(task_status_module, "_get_redis", return_value=mock_redis):
            task_status_module.set_task_status(
                task_id="task123",
                status="FAILED",
                progress=50,
                error="Something went wrong",
            )

            call_args = mock_redis.setex.call_args
            payload = json.loads(call_args[0][2])
            assert payload["status"] == "FAILED"
            assert payload["error"] == "Something went wrong"

    def test_set_task_status_with_result(self, mock_redis):
        import infrastructure.celery.task_status as task_status_module

        with patch.object(task_status_module, "_get_redis", return_value=mock_redis):
            task_status_module.set_task_status(
                task_id="task123",
                status="DONE",
                progress=100,
                result={"kaggle_url": "https://kaggle.com/datasets/user/dataset"},
            )

            call_args = mock_redis.setex.call_args
            payload = json.loads(call_args[0][2])
            assert payload["status"] == "DONE"
            assert payload["result"]["kaggle_url"] == "https://kaggle.com/datasets/user/dataset"

    def test_task_ttl_constant(self):
        from infrastructure.celery.task_status import TASK_TTL

        assert TASK_TTL == 3600  # 1 hour


class TestGetRedis:
    """Tests for Redis client initialization."""

    @pytest.fixture(autouse=True)
    def reset_redis_client(self):
        """Reset the redis client singleton before each test."""
        yield
        try:
            import infrastructure.celery.task_status as ts
            ts._redis_client = None
        except Exception:
            pass

    def test_get_redis_creates_client(self):
        import infrastructure.celery.task_status as task_status_module

        task_status_module._redis_client = None

        mock_client = MagicMock()
        mock_redis_module = MagicMock()
        mock_redis_module.from_url.return_value = mock_client

        with patch.object(task_status_module, "redis", mock_redis_module):
            with patch.dict("os.environ", {"REDIS_URL": "redis://testhost:6379/0"}):
                result = task_status_module._get_redis()

                mock_redis_module.from_url.assert_called_once_with(
                    "redis://testhost:6379/0", decode_responses=True
                )
                assert result == mock_client

    def test_get_redis_uses_default_url(self):
        import infrastructure.celery.task_status as task_status_module

        task_status_module._redis_client = None

        mock_client = MagicMock()
        mock_redis_module = MagicMock()
        mock_redis_module.from_url.return_value = mock_client

        with patch.object(task_status_module, "redis", mock_redis_module):
            with patch.dict("os.environ", {}, clear=True):
                task_status_module._get_redis()

                mock_redis_module.from_url.assert_called_once_with(
                    "redis://localhost:6379/0", decode_responses=True
                )

    def test_get_redis_reuses_client(self):
        import infrastructure.celery.task_status as task_status_module

        mock_client = MagicMock()
        task_status_module._redis_client = mock_client

        mock_redis_module = MagicMock()

        with patch.object(task_status_module, "redis", mock_redis_module):
            result = task_status_module._get_redis()

            mock_redis_module.from_url.assert_not_called()
            assert result == mock_client
