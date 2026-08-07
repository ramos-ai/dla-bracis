"""
Repository for Dataset operations
"""

from typing import Any, Dict, List, Optional

from infrastructure.persistence.db_connection import get_db_dla

from .base_repository import BaseRepository


class DatasetRepository(BaseRepository):
    """Repository for dataset data access"""

    def __init__(self):
        db = get_db_dla()
        super().__init__(db.datasets)

    def find_by_user_id(self, user_id: str) -> List[Dict[str, Any]]:
        """Find all datasets by user ID"""
        return self.find_all({"user_id": user_id})

    def find_by_visibility(self, visibility: str) -> List[Dict[str, Any]]:
        """Find all datasets by visibility"""
        return self.find_all({"visibility": visibility})

    def get_labels(self, dataset_id: str) -> Optional[List[str]]:
        """Get labels for a dataset"""
        dataset = self.find_by_id(dataset_id)
        if dataset and "labels" in dataset:
            return dataset["labels"]
        return None
