"""
DTOs for Authentication operations
"""

import re

from .base_dto import BaseDTO


class UserCreateDTO(BaseDTO):
    """DTO for creating a user"""

    def __init__(self, data: dict):
        self.name = self.validate_card_name(data.get("name", ""), "name")
        self.email = self.validate_email(data.get("email", ""))
        self.password = data.get("password", "") or ""
        if "role" in data:
            self.role = self.validate_role(data.get("role"))

    @staticmethod
    def validate_email(email: str) -> str:
        """Validate email format"""
        if not isinstance(email, str):
            raise ValueError("email must be a string")
        email = email.strip().lower()
        pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
        if not re.match(pattern, email):
            raise ValueError("email must be a valid email address")
        if len(email) > 255:
            raise ValueError("email must be at most 255 characters long")
        return email

    @staticmethod
    def validate_role(role: str) -> str:
        """Validate user role"""
        valid_roles = ["student", "teacher", "admin", "unassigned"]
        if role not in valid_roles:
            raise ValueError(f"role must be one of: {', '.join(valid_roles)}")
        return role


class UserUpdateDTO(BaseDTO):
    """DTO for updating a user"""

    def __init__(self, data: dict):
        self.user_id = self.validate_object_id(data.get("id", ""), "id")
        if "name" in data:
            self.name = self.validate_card_name(data.get("name", ""), "name")
        if "email" in data:
            self.email = self.validate_email(data.get("email", ""))
        if "role" in data:
            self.role = self.validate_role(data.get("role"))
        if "contact_info" in data:
            self.contact_info = self.validate_contact_info(data.get("contact_info"))
        if "profile_image_id" in data:
            self.profile_image_id = data.get("profile_image_id")

    @staticmethod
    def validate_contact_info(contact_info: str) -> str:
        """Validate contact info (max 500 chars)"""
        if contact_info is None:
            return ""
        if not isinstance(contact_info, str):
            raise ValueError("contact_info must be a string")
        contact_info = contact_info.strip()
        if len(contact_info) > 500:
            raise ValueError("contact_info must be at most 500 characters long")
        return contact_info

    @staticmethod
    def validate_email(email: str) -> str:
        """Validate email format"""
        if not isinstance(email, str):
            raise ValueError("email must be a string")
        email = email.strip().lower()
        pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
        if not re.match(pattern, email):
            raise ValueError("email must be a valid email address")
        if len(email) > 255:
            raise ValueError("email must be at most 255 characters long")
        return email

    @staticmethod
    def validate_role(role: str) -> str:
        """Validate user role"""
        valid_roles = ["student", "teacher", "admin", "unassigned"]
        if role not in valid_roles:
            raise ValueError(f"role must be one of: {', '.join(valid_roles)}")
        return role
