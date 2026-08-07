"""Tests for cache infrastructure (cache_config, cache_keys, cache_invalidation)."""

import sys
from unittest.mock import MagicMock

import pytest


class TestCacheKeys:
    """Tests for CacheKeys class."""

    @pytest.fixture(autouse=True)
    def setup_mocks(self):
        """Mock flask_caching before importing."""
        MagicMock()
        sys.modules["flask_caching"] = MagicMock()
        yield
        if "flask_caching" in sys.modules:
            del sys.modules["flask_caching"]

    def test_dataset_list_with_all_params(self):
        from infrastructure.cache.cache_keys import CacheKeys

        key = CacheKeys.dataset_list("user123", "teacher", "class456", 2)
        assert key == "datasets:list:user123:teacher:class456:2"

    def test_dataset_list_without_class(self):
        from infrastructure.cache.cache_keys import CacheKeys

        key = CacheKeys.dataset_list("user123", "admin")
        assert key == "datasets:list:user123:admin:all:all"

    def test_dataset_list_without_page(self):
        from infrastructure.cache.cache_keys import CacheKeys

        key = CacheKeys.dataset_list("user123", "student", "class789")
        assert key == "datasets:list:user123:student:class789:all"

    def test_dataset_list_pattern(self):
        from infrastructure.cache.cache_keys import CacheKeys

        pattern = CacheKeys.dataset_list_pattern()
        assert pattern == "datasets:list:*"

    def test_dataset(self):
        from infrastructure.cache.cache_keys import CacheKeys

        key = CacheKeys.dataset("ds123")
        assert key == "dataset:ds123"

    def test_dataset_labels(self):
        from infrastructure.cache.cache_keys import CacheKeys

        key = CacheKeys.dataset_labels("ds123")
        assert key == "dataset:labels:ds123"

    def test_coco_annotation(self):
        from infrastructure.cache.cache_keys import CacheKeys

        key = CacheKeys.coco_annotation("ds123", "file456")
        assert key == "coco:ds123:file456"

    def test_coco_dataset(self):
        from infrastructure.cache.cache_keys import CacheKeys

        key = CacheKeys.coco_dataset("ds123")
        assert key == "coco:dataset:ds123"

    def test_coco_dataset_pattern(self):
        from infrastructure.cache.cache_keys import CacheKeys

        pattern = CacheKeys.coco_dataset_pattern("ds123")
        assert "ds123" in pattern
        assert "*" in pattern

    def test_segmentation(self):
        from infrastructure.cache.cache_keys import CacheKeys

        key = CacheKeys.segmentation("ds123", "file456")
        assert key == "segmentation:ds123:file456"

    def test_segmentation_dataset_pattern(self):
        from infrastructure.cache.cache_keys import CacheKeys

        pattern = CacheKeys.segmentation_dataset_pattern("ds123")
        assert "ds123" in pattern
        assert "*" in pattern

    def test_export_stats(self):
        from infrastructure.cache.cache_keys import CacheKeys

        key = CacheKeys.export_stats("ds123")
        assert key == "export:stats:ds123"

    def test_medias_metadata(self):
        from infrastructure.cache.cache_keys import CacheKeys

        key = CacheKeys.medias_metadata("ds123")
        assert key == "medias:metadata:ds123"

    def test_medias_labelled_with_page(self):
        from infrastructure.cache.cache_keys import CacheKeys

        key = CacheKeys.medias_labelled("ds123", 3)
        assert key == "medias:labelled:ds123:3"

    def test_medias_labelled_without_page(self):
        from infrastructure.cache.cache_keys import CacheKeys

        key = CacheKeys.medias_labelled("ds123")
        assert key == "medias:labelled:ds123:all"

    def test_medias_unlabelled_with_page(self):
        from infrastructure.cache.cache_keys import CacheKeys

        key = CacheKeys.medias_unlabelled("ds123", 5)
        assert key == "medias:unlabelled:ds123:5"

    def test_medias_unlabelled_without_page(self):
        from infrastructure.cache.cache_keys import CacheKeys

        key = CacheKeys.medias_unlabelled("ds123")
        assert key == "medias:unlabelled:ds123:all"

    def test_medias_pattern(self):
        from infrastructure.cache.cache_keys import CacheKeys

        pattern = CacheKeys.medias_pattern("ds123")
        assert "ds123" in pattern
        assert "*" in pattern

    def test_exercises_dashboard_with_class(self):
        from infrastructure.cache.cache_keys import CacheKeys

        key = CacheKeys.exercises_dashboard("teacher123", "class456")
        assert key == "exercises:dashboard:teacher123:class456"

    def test_exercises_dashboard_without_class(self):
        from infrastructure.cache.cache_keys import CacheKeys

        key = CacheKeys.exercises_dashboard("teacher123")
        assert key == "exercises:dashboard:teacher123:all"

    def test_exercises_ranking_with_class(self):
        from infrastructure.cache.cache_keys import CacheKeys

        key = CacheKeys.exercises_ranking("teacher123", "class456")
        assert key == "exercises:ranking:teacher123:class456"

    def test_exercises_ranking_without_class(self):
        from infrastructure.cache.cache_keys import CacheKeys

        key = CacheKeys.exercises_ranking("teacher123")
        assert key == "exercises:ranking:teacher123:all"

    def test_exercises_pattern_with_teacher(self):
        from infrastructure.cache.cache_keys import CacheKeys

        pattern = CacheKeys.exercises_pattern("teacher123")
        assert "teacher123" in pattern
        assert "*" in pattern

    def test_exercises_pattern_without_teacher(self):
        from infrastructure.cache.cache_keys import CacheKeys

        pattern = CacheKeys.exercises_pattern()
        assert pattern == "exercises:*"

    def test_ttl_constants(self):
        from infrastructure.cache.cache_keys import CacheKeys

        assert CacheKeys.TTL_SHORT == 30
        assert CacheKeys.TTL_MEDIUM == 60
        assert CacheKeys.TTL_LONG == 120
        assert CacheKeys.TTL_VERY_LONG == 300
