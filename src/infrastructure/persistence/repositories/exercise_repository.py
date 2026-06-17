"""
Repository for Exercise operations
"""

from typing import Any, Dict, List

from infrastructure.persistence.db_connection import get_db_dla

from .base_repository import BaseRepository


class ExerciseRepository(BaseRepository):
    """Repository for exercise data access"""

    def __init__(self):
        db = get_db_dla()
        super().__init__(db.exercises)

    def find_by_class(self, class_id: str) -> List[Dict[str, Any]]:
        """Find all exercises by class ID"""
        return self.find_all({"class": class_id})

    def find_by_user_id(self, user_id: str) -> List[Dict[str, Any]]:
        """Find all exercises by user ID"""
        return self.find_all({"user_id": user_id})

    def find_by_dataset(self, dataset_id: str) -> List[Dict[str, Any]]:
        """Find all exercises by dataset ID"""
        return self.find_all({"dataset": dataset_id})
