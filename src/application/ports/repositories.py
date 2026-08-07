"""Port: abstract repository interface (implemented in infrastructure)."""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional


class BaseRepositoryPort(ABC):
    """Abstract repository port; infrastructure implements concrete repositories."""

    @abstractmethod
    def find_by_id(self, id: str) -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    def find_all(self, filter: Optional[Dict] = None) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    def create(self, data: Dict[str, Any]) -> str:
        pass

    @abstractmethod
    def update(self, id: str, data: Dict[str, Any]) -> bool:
        pass

    @abstractmethod
    def delete(self, id: str) -> bool:
        pass
