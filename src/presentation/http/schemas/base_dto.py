"""
Base DTO class with validation utilities
"""

import re
from abc import ABC
from typing import Any, List, Optional


class BaseDTO(ABC):
    """Base class for all DTOs with common validation methods"""

    @staticmethod
    def validate_string_length(
        value: str, field_name: str, min_length: int = 1, max_length: int = 255
    ) -> str:
        """Validate string length"""
        if not isinstance(value, str):
            raise ValueError(f"{field_name} must be a string")
        value = value.strip()
        if len(value) < min_length:
            raise ValueError(
                f"{field_name} must be at least {min_length} characters long"
            )
        if len(value) > max_length:
            raise ValueError(
                f"{field_name} must be at most {max_length} characters long"
            )
        return value

    @staticmethod
    def validate_card_name(name: str, field_name: str = "name") -> str:
        """Validate card/exercise name - alphanumeric, spaces, hyphens, underscores"""
        if not isinstance(name, str):
            raise ValueError(f"{field_name} must be a string")
        name = name.strip()
        if len(name) < 3:
            raise ValueError(f"{field_name} must be at least 3 characters long")
        if len(name) > 100:
            raise ValueError(f"{field_name} must be at most 100 characters long")
        pattern = r"^[a-zA-Z0-9\s\-_áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]+$"
        if not re.match(pattern, name):
            raise ValueError(
                f"{field_name} contains invalid characters. Only letters, numbers, spaces, hyphens and underscores are allowed"
            )
        return name

    @staticmethod
    def validate_object_id(
        id_value: Any, field_name: str, optional: bool = False
    ) -> Optional[str]:
        """Validate MongoDB ObjectId"""
        from bson import ObjectId

        if optional and (not id_value or id_value == ""):
            return None
        if not isinstance(id_value, str):
            raise ValueError(f"{field_name} must be a string")
        if not ObjectId.is_valid(id_value):
            raise ValueError(f"{field_name} must be a valid ObjectId")
        return id_value

    @staticmethod
    def validate_file_id(
        id_value: Any, field_name: str, optional: bool = False
    ) -> Optional[str]:
        """Validate file_id: accepts ObjectId (24 hex) or UUID hex (32 hex) for S3-stored images"""
        from bson import ObjectId

        if optional and (not id_value or id_value == ""):
            return None
        if not isinstance(id_value, str):
            raise ValueError(f"{field_name} must be a string")
        s = id_value.strip()
        if not s:
            raise ValueError(f"{field_name} must be non-empty")
        if ObjectId.is_valid(s):
            return s
        if len(s) == 32 and all(c in "0123456789abcdefABCDEF" for c in s):
            return s
        raise ValueError(
            f"{field_name} must be a valid ObjectId (24 hex) or file id (32 hex)"
        )

    @staticmethod
    def validate_list_length(
        value: List,
        field_name: str,
        min_length: int = 1,
        max_length: Optional[int] = None,
    ) -> List:
        """Validate list length"""
        if not isinstance(value, list):
            raise ValueError(f"{field_name} must be a list")
        if len(value) < min_length:
            raise ValueError(f"{field_name} must have at least {min_length} items")
        if max_length and len(value) > max_length:
            raise ValueError(f"{field_name} must have at most {max_length} items")
        return value

    @staticmethod
    def validate_image_count(
        count: int, min_count: int = 1, max_count: int = 100
    ) -> int:
        """Validate image count"""
        if not isinstance(count, int):
            raise ValueError("Image count must be an integer")
        if count < min_count:
            raise ValueError(f"Must have at least {min_count} image(s)")
        if count > max_count:
            raise ValueError(f"Must have at most {max_count} images")
        return count

    def to_dict(self) -> dict:
        """Convert DTO to dictionary"""
        return {k: v for k, v in self.__dict__.items() if v is not None}
