"""
Cache infrastructure: Redis-backed caching with Flask-Caching.
"""

from infrastructure.cache.cache_config import cache, init_cache
from infrastructure.cache.cache_invalidation import invalidate_cache_patterns
from infrastructure.cache.cache_keys import CacheKeys

__all__ = ["cache", "init_cache", "CacheKeys", "invalidate_cache_patterns"]
