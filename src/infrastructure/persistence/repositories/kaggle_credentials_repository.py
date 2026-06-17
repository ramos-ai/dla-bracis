"""
Repository for Kaggle credentials storage.
Credentials are stored encrypted per user.
"""

from shared.date_utils import utc_now
from typing import Any, Dict, Optional

from infrastructure.persistence.db_connection import get_db_dla
from infrastructure.persistence.repositories.base_repository import BaseRepository


class KaggleCredentialsRepository(BaseRepository):
    """Repository for Kaggle API credentials (encrypted)."""

    def __init__(self):
        db = get_db_dla()
        super().__init__(db.kaggle_credentials)
        self._ensure_indexes()

    def _ensure_indexes(self):
        """Create indexes for the collection."""
        self.collection.create_index("user_id", unique=True)

    def find_by_user_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Find credentials by user ID."""
        if not user_id:
            return None
        doc = self.collection.find_one({"user_id": user_id})
        if doc:
            doc["_id"] = str(doc["_id"])
        return doc

    def upsert(
        self,
        user_id: str,
        username_encrypted: bytes,
        api_key_encrypted: bytes,
    ) -> bool:
        """
        Insert or update credentials for a user.

        Args:
            user_id: The user's ID
            username_encrypted: Encrypted Kaggle username
            api_key_encrypted: Encrypted Kaggle API key

        Returns:
            True if operation succeeded
        """
        if not user_id or not username_encrypted or not api_key_encrypted:
            return False

        now = utc_now()
        result = self.collection.update_one(
            {"user_id": user_id},
            {
                "$set": {
                    "username_encrypted": username_encrypted,
                    "api_key_encrypted": api_key_encrypted,
                    "updated_at": now,
                },
                "$setOnInsert": {
                    "user_id": user_id,
                    "created_at": now,
                },
            },
            upsert=True,
        )
        return result.acknowledged

    def delete_by_user_id(self, user_id: str) -> bool:
        """Delete credentials for a user."""
        if not user_id:
            return False
        result = self.collection.delete_one({"user_id": user_id})
        return result.deleted_count > 0

    def has_credentials(self, user_id: str) -> bool:
        """Check if user has stored credentials."""
        if not user_id:
            return False
        return self.collection.count_documents({"user_id": user_id}) > 0
