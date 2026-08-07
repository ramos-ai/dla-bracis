"""
JWT provider: create/decode tokens and extract from Authorization header.
Uses shared.config for secrets (from .env).
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import jwt

from domain.exceptions import UnauthorizedError
from infrastructure.config.config import config

SECRET_KEY = config.jwt_secret_key
ALGORITHM = config.jwt_algorithm


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)
ACCESS_TOKEN_EXPIRE_MINUTES = config.access_token_expire_minutes


def create_access_token(
    data: Dict[str, Any], expires_delta: Optional[timedelta] = None
) -> str:
    """Create a JWT access token. data usually includes user_id, email, role."""
    to_encode = data.copy()
    if expires_delta:
        expire = _utc_now() + expires_delta
    else:
        expire = _utc_now() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "iat": _utc_now(), "type": "access"})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Dict[str, Any]:
    """Decode and validate a JWT access token. Raises UnauthorizedError if invalid or expired."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "access":
            raise UnauthorizedError("Invalid token type")
        return payload
    except jwt.ExpiredSignatureError:
        raise UnauthorizedError("Token has expired")
    except jwt.InvalidTokenError as e:
        raise UnauthorizedError(f"Invalid token: {str(e)}")


def get_token_from_header(auth_header: Optional[str]) -> str:
    """Extract Bearer token from Authorization header. Raises UnauthorizedError if missing or malformed."""
    if not auth_header:
        raise UnauthorizedError("Authorization header is missing")
    try:
        scheme, token = auth_header.split(" ", 1)
        if scheme.lower() != "bearer":
            raise UnauthorizedError("Authorization scheme must be Bearer")
        return token
    except ValueError:
        raise UnauthorizedError("Invalid authorization header format")
