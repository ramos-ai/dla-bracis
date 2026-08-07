"""
Flask-Caching configuration with Redis backend.
Falls back to SimpleCache if Redis is unavailable.
"""

import os

from flask_caching import Cache

cache = Cache()


def init_cache(app):
    """
    Initialize Flask-Caching with Redis or fallback to SimpleCache.
    Call this in app factory after app creation.
    """
    redis_url = os.environ.get("REDIS_URL", "")

    if redis_url:
        cache_config = {
            "CACHE_TYPE": "RedisCache",
            "CACHE_REDIS_URL": redis_url,
            "CACHE_DEFAULT_TIMEOUT": 300,
            "CACHE_KEY_PREFIX": "dlapp:",
        }
        app.logger.info(f"Cache: Using Redis at {redis_url}")
    else:
        cache_config = {
            "CACHE_TYPE": "SimpleCache",
            "CACHE_DEFAULT_TIMEOUT": 300,
        }
        app.logger.warning("Cache: REDIS_URL not set, using SimpleCache (not for production)")

    app.config.from_mapping(cache_config)
    cache.init_app(app)

    return cache


def get_with_cache(key: str, fetch_fn, ttl: int = 300):
    """
    Cache-aside pattern: get from cache or fetch and store.

    Args:
        key: Cache key
        fetch_fn: Callable that returns data if cache miss
        ttl: Time-to-live in seconds (default 300)

    Returns:
        Cached or freshly fetched data
    """
    data = cache.get(key)
    if data is None:
        data = fetch_fn()
        if data is not None:
            cache.set(key, data, timeout=ttl)
    return data
