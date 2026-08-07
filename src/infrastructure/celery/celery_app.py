"""
Celery application configuration.
Uses Redis as broker and result backend.
"""

import os

from celery import Celery

broker_url = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/1")
result_backend = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "data_labelling_app",
    broker=broker_url,
    backend=result_backend,
    include=[
        "infrastructure.celery.tasks",
        "infrastructure.celery.jobs.export",
        "infrastructure.celery.jobs.kaggle",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,
    task_soft_time_limit=3300,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    result_expires=86400,
    broker_connection_retry_on_startup=True,
)
