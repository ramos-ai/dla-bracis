"""Port: file storage upload/download (implemented in infrastructure.storage)."""

from abc import ABC, abstractmethod
from typing import Optional, Tuple


class StorageProviderPort(ABC):
    """Abstract storage port; infrastructure implements S3/GridFS."""

    @abstractmethod
    def upload_file(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
        metadata: Optional[dict] = None,
    ) -> bool:
        pass

    @abstractmethod
    def get_file(self, key: str) -> Optional[Tuple[any, str, int]]:
        """Returns (body_stream, content_type, content_length) or None."""
        pass
