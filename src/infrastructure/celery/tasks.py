"""
Celery background tasks.
Tasks for heavy operations that should run asynchronously.
"""

from infrastructure.celery.celery_app import celery_app
from infrastructure.celery.jobs.export import export_dataset_task
from infrastructure.celery.jobs.kaggle import upload_kaggle_task
from shared.logger import get_logger

logger = get_logger(__name__)

__all__ = ["warmup_dataset_cache", "cleanup_expired_cache", "export_dataset_task", "upload_kaggle_task"]


@celery_app.task(bind=True, max_retries=3)
def warmup_dataset_cache(self, dataset_id: str):
    """
    Pre-warm cache for a dataset after invalidation.
    Useful for frequently accessed datasets.
    """
    try:
        logger.info(f"Warming up cache for dataset {dataset_id}")
        from application.datasets import get_dataset_by_id
        from infrastructure.cache import cache
        from infrastructure.cache.cache_keys import CacheKeys

        dataset = get_dataset_by_id(dataset_id)
        if dataset:
            cache.set(
                CacheKeys.dataset(dataset_id),
                dataset,
                timeout=CacheKeys.TTL_VERY_LONG,
            )
            logger.info(f"Cache warmed for dataset {dataset_id}")
        return {"status": "success", "dataset_id": dataset_id}
    except Exception as exc:
        logger.error(f"Cache warmup failed for {dataset_id}: {exc}")
        raise self.retry(exc=exc, countdown=60)


@celery_app.task
def cleanup_expired_cache():
    """
    Periodic task to clean up expired cache entries.
    Redis handles TTL automatically, but this can be used for custom cleanup.
    """
    logger.info("Running cache cleanup task")
    return {"status": "success"}
