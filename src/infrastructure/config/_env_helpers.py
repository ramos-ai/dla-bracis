"""Helpers for loading and validating environment variables."""

import os


def require(name: str, value: str | None, message: str = "") -> str:
    """Raise ValueError if value is missing or empty."""
    if value is None or (isinstance(value, str) and value.strip() == ""):
        raise ValueError(
            f"Missing required env: {name}. {message}".strip()
            or f"Set {name} in .env (see .env.example)."
        )
    return value.strip() if isinstance(value, str) else value


def optional(name: str, default: str | int | bool) -> str | int | bool:
    """Return env value or default. Handles bool, int, str."""
    val = os.getenv(name)
    if val is None or (isinstance(val, str) and val.strip() == ""):
        return default
    if isinstance(default, bool):
        return val.lower() in ("true", "1", "yes")
    if isinstance(default, int):
        return int(val)
    return val.strip()
