"""
Cache key generation helpers for consistent key naming.
All keys use colon-separated namespaces for easy pattern invalidation.
"""


class CacheKeys:
    """
    Centralized cache key generation.
    Pattern: {namespace}:{entity}:{identifiers}
    """
    TTL_SHORT = 30
    TTL_MEDIUM = 60
    TTL_LONG = 120
    TTL_VERY_LONG = 300

    @staticmethod
    def dataset_list(user_id: str, role: str, class_id: str = None, page: int = None) -> str:
        """Key for paginated dataset list."""
        class_part = class_id or "all"
        page_part = str(page) if page else "all"
        return f"datasets:list:{user_id}:{role}:{class_part}:{page_part}"

    @staticmethod
    def dataset_list_pattern() -> str:
        """Pattern to invalidate all dataset lists."""
        return "datasets:list:*"

    @staticmethod
    def dataset(dataset_id: str) -> str:
        """Key for single dataset by ID."""
        return f"dataset:{dataset_id}"

    @staticmethod
    def dataset_labels(dataset_id: str) -> str:
        """Key for dataset labels."""
        return f"dataset:labels:{dataset_id}"

    @staticmethod
    def coco_annotation(dataset_id: str, file_id: str) -> str:
        """Key for single COCO annotation."""
        return f"coco:{dataset_id}:{file_id}"

    @staticmethod
    def coco_dataset(dataset_id: str) -> str:
        """Key for all COCO annotations of a dataset."""
        return f"coco:dataset:{dataset_id}"

    @staticmethod
    def coco_dataset_pattern(dataset_id: str) -> str:
        """Pattern to invalidate all COCO cache for a dataset."""
        return f"coco:*{dataset_id}*"

    @staticmethod
    def segmentation(dataset_id: str, file_id: str) -> str:
        """Key for single segmentation annotation."""
        return f"segmentation:{dataset_id}:{file_id}"

    @staticmethod
    def segmentation_dataset_pattern(dataset_id: str) -> str:
        """Pattern to invalidate all segmentation cache for a dataset."""
        return f"segmentation:*{dataset_id}*"

    @staticmethod
    def export_stats(dataset_id: str) -> str:
        """Key for export stats (total, labelled, unlabelled counts)."""
        return f"export:stats:{dataset_id}"

    @staticmethod
    def medias_metadata(dataset_id: str) -> str:
        """Key for images with metadata."""
        return f"medias:metadata:{dataset_id}"

    @staticmethod
    def medias_labelled(dataset_id: str, page: int = None) -> str:
        """Key for labelled medias list."""
        page_part = str(page) if page else "all"
        return f"medias:labelled:{dataset_id}:{page_part}"

    @staticmethod
    def medias_unlabelled(dataset_id: str, page: int = None) -> str:
        """Key for unlabelled medias list."""
        page_part = str(page) if page else "all"
        return f"medias:unlabelled:{dataset_id}:{page_part}"

    @staticmethod
    def medias_pattern(dataset_id: str) -> str:
        """Pattern to invalidate all media cache for a dataset."""
        return f"medias:*:{dataset_id}:*"

    @staticmethod
    def exercises_dashboard(teacher_id: str, class_id: str = None) -> str:
        """Key for teacher dashboard stats."""
        class_part = class_id or "all"
        return f"exercises:dashboard:{teacher_id}:{class_part}"

    @staticmethod
    def exercises_ranking(teacher_id: str, class_id: str = None) -> str:
        """Key for student ranking."""
        class_part = class_id or "all"
        return f"exercises:ranking:{teacher_id}:{class_part}"

    @staticmethod
    def exercises_pattern(teacher_id: str = None) -> str:
        """Pattern to invalidate exercises cache."""
        if teacher_id:
            return f"exercises:*:{teacher_id}:*"
        return "exercises:*"
