"""Port: JWT create/decode (implemented in infrastructure.security.jwt_provider_impl)."""

from abc import ABC, abstractmethod
from datetime import timedelta
from typing import Any, Dict, Optional


class JWTProviderPort(ABC):
    """Abstract JWT port; infrastructure implements with HS256."""

    @abstractmethod
    def create_access_token(
        self, data: Dict[str, Any], expires_delta: Optional[timedelta] = None
    ) -> str:
        pass

    @abstractmethod
    def decode_access_token(self, token: str) -> Dict[str, Any]:
        pass
