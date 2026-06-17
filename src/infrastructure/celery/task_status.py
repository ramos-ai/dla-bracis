"""
Task status tracking via Redis.
Stores task progress and results without using MongoDB.
"""

import json
import os
from datetime import datetime, timezone
from typing import Optional

import redis

TASK_TTL = 3600

_redis_client: Optional[redis.Redis] = None


def _get_redis() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
        _redis_client = redis.from_url(redis_url, decode_responses=True)
    return _redis_client


def _task_key(task_id: str) -> str:
    return f"task:{task_id}"


def set_task_status(
    task_id: str,
    status: str,
    progress: int = 0,
    result: Optional[dict] = None,
    error: Optional[str] = None,
    user_id: Optional[str] = None,
    message: Optional[str] = None,
) -> None:
    """
    Set task status in Redis.

    Args:
        task_id: Celery task ID
        status: PENDING | PROCESSING | DONE | FAILED
        progress: 0-100
        result: Result data (e.g., {"download_url": "..."})
        error: Error message if failed
        user_id: Owner user ID for security validation
        message: Optional progress message for UI display
    """
    r = _get_redis()
    key = _task_key(task_id)

    existing = r.get(key)
    created_at = datetime.now(timezone.utc).isoformat()
    if existing:
        try:
            data = json.loads(existing)
            created_at = data.get("created_at", created_at)
        except (json.JSONDecodeError, TypeError):
            pass

    payload = {
        "status": status,
        "progress": max(0, min(100, progress)),
        "result": result,
        "error": error,
        "user_id": user_id,
        "message": message,
        "created_at": created_at,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    r.setex(key, TASK_TTL, json.dumps(payload))


def get_task_status(task_id: str) -> Optional[dict]:
    """
    Get task status from Redis.

    Returns:
        Dict with status, progress, result, error or None if not found
    """
    r = _get_redis()
    key = _task_key(task_id)
    data = r.get(key)

    if not data:
        return None

    try:
        return json.loads(data)
    except (json.JSONDecodeError, TypeError):
        return None


def delete_task_status(task_id: str) -> bool:
    """Delete task status from Redis."""
    r = _get_redis()
    key = _task_key(task_id)
    return r.delete(key) > 0


def init_task(task_id: str, user_id: Optional[str] = None) -> None:
    """Initialize a task with PENDING status."""
    set_task_status(task_id, "PENDING", progress=0, user_id=user_id)
