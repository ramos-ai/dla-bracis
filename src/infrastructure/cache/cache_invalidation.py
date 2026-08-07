"""
Cache invalidation utilities.
Provides pattern-based cache clearing for write operations.
"""


from infrastructure.cache.cache_config import cache
from shared.logger import get_logger

logger = get_logger(__name__)


def invalidate_cache_patterns(patterns: list[str]) -> int:
    """
    Invalidate cache entries matching given patterns.
    Uses Redis SCAN + DELETE for pattern matching.

    Args:
        patterns: List of glob patterns (e.g., ["datasets:list:*", "dataset:123"])

    Returns:
        Number of keys deleted
    """
    if not patterns:
        return 0

    deleted_count = 0

    try:
        redis_client = cache.cache._read_client
        prefix = cache.cache.key_prefix

        for pattern in patterns:
            full_pattern = f"{prefix}{pattern}"

            if "*" in pattern:
                cursor = 0
                keys_to_delete = []
                while True:
                    cursor, keys = redis_client.scan(cursor, match=full_pattern, count=100)
                    keys_to_delete.extend(keys)
                    if cursor == 0:
                        break

                if keys_to_delete:
                    deleted = redis_client.delete(*keys_to_delete)
                    deleted_count += deleted
                    logger.debug(f"Cache invalidated: {pattern} ({deleted} keys)")
            else:
                full_key = f"{prefix}{pattern}"
                if redis_client.delete(full_key):
                    deleted_count += 1
                    logger.debug(f"Cache invalidated: {pattern}")

    except AttributeError:
        logger.debug("Cache invalidation: SimpleCache fallback (no pattern support)")
        for pattern in patterns:
            if "*" not in pattern:
                cache.delete(pattern)
                deleted_count += 1
    except Exception as e:
        logger.warning(f"Cache invalidation error: {e}")

    return deleted_count


def invalidate_dataset_caches(dataset_id: str) -> None:
    """Invalidate all caches related to a dataset."""
    from infrastructure.cache.cache_keys import CacheKeys

    patterns = [
        CacheKeys.dataset(dataset_id),
        CacheKeys.dataset_labels(dataset_id),
        CacheKeys.dataset_list_pattern(),
        CacheKeys.coco_dataset(dataset_id),
        CacheKeys.export_stats(dataset_id),
        CacheKeys.medias_metadata(dataset_id),
        f"medias:labelled:{dataset_id}:*",
        f"medias:unlabelled:{dataset_id}:*",
    ]
    invalidate_cache_patterns(patterns)


def invalidate_annotation_caches(dataset_id: str, file_id: str = None) -> None:
    """Invalidate caches when annotations change."""
    from infrastructure.cache.cache_keys import CacheKeys

    patterns = [
        CacheKeys.coco_dataset(dataset_id),
        CacheKeys.export_stats(dataset_id),
        f"medias:labelled:{dataset_id}:*",
        f"medias:unlabelled:{dataset_id}:*",
    ]

    if file_id:
        patterns.append(CacheKeys.coco_annotation(dataset_id, file_id))
        patterns.append(CacheKeys.segmentation(dataset_id, file_id))

    invalidate_cache_patterns(patterns)


def invalidate_exercise_caches(teacher_id: str = None) -> None:
    """Invalidate exercise/dashboard caches."""
    from infrastructure.cache.cache_keys import CacheKeys

    patterns = [CacheKeys.exercises_pattern(teacher_id)]
    invalidate_cache_patterns(patterns)
