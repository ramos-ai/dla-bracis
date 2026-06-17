"""
Authentication service with user management
"""

import bcrypt
from bson import ObjectId

from domain.exceptions import DatabaseError, NotFoundError, ValidationError
from infrastructure.persistence.db_connection import get_db_dla
from presentation.http.schemas import UserCreateDTO, UserUpdateDTO
from shared.date_utils import utc_now


def _db():
    return get_db_dla()


def _normalize_user_doc(user_doc: dict) -> dict:
    """Normalize user document: _id as str, remove password, set classId/classIds from classes/class_id."""
    if not user_doc:
        return user_doc
    user_doc["_id"] = str(user_doc["_id"])
    if "password" in user_doc:
        del user_doc["password"]
    if "classes" in user_doc and isinstance(user_doc["classes"], list):
        user_doc["classIds"] = [
            str(c) if isinstance(c, ObjectId) else str(c)
            for c in user_doc["classes"]
            if c
        ]
        user_doc["classId"] = (
            str(user_doc["class_id"])
            if user_doc.get("class_id")
            else (user_doc["classIds"][0] if user_doc["classIds"] else None)
        )
        del user_doc["classes"]
        if "class_id" in user_doc:
            del user_doc["class_id"]
    elif "class_id" in user_doc and user_doc["class_id"]:
        cid = user_doc["class_id"]
        user_doc["classId"] = str(cid) if isinstance(cid, ObjectId) else cid
        user_doc["classIds"] = [user_doc["classId"]]
        del user_doc["class_id"]
    else:
        user_doc["classId"] = None
        user_doc["classIds"] = []
        if "class_id" in user_doc:
            del user_doc["class_id"]
        if "classes" in user_doc:
            del user_doc["classes"]
    return user_doc


def _truncate_password_to_72_bytes(password: str) -> bytes:
    """Truncate password to 72 bytes to comply with bcrypt limit"""
    if not password:
        return b""
    password_bytes = password.encode("utf-8")
    if len(password_bytes) > 72:
        return password_bytes[:72]
    return password_bytes


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    if not plain_password or not hashed_password:
        return False

    try:
        truncated_password = _truncate_password_to_72_bytes(plain_password)

        if isinstance(hashed_password, str):
            hashed_bytes = hashed_password.encode("utf-8")
        elif isinstance(hashed_password, bytes):
            hashed_bytes = hashed_password
        else:
            return False

        return bcrypt.checkpw(truncated_password, hashed_bytes)
    except (ValueError, TypeError, AttributeError):
        return False
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt"""
    if not password:
        password = ""
    truncated_password = _truncate_password_to_72_bytes(password)
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(truncated_password, salt)
    return hashed.decode("utf-8")


def get_user_by_id(user_id: ObjectId | str):
    """Get user by ID"""
    if isinstance(user_id, str):
        if not ObjectId.is_valid(user_id):
            return None
        user_id = ObjectId(user_id)
    user = _db().users.find_one({"_id": user_id})
    if user is None:
        return None
    return _normalize_user_doc(user)


def get_user_by_email(email: str):
    """Get user by email"""
    user = _db().users.find_one({"email": email.lower()})
    if user is None:
        return None
    return _normalize_user_doc(user)


def authenticate_user(email: str, password: str):
    """
    Authenticate a user with email and password

    Returns:
        User dict if authentication successful, None otherwise
    """
    user = get_user_by_email(email)
    if not user:
        return None

    user_with_password = _db().users.find_one({"email": email.lower()})
    if not user_with_password or "password" not in user_with_password:
        return None

    stored_hash = user_with_password["password"]
    if not verify_password(password, stored_hash):
        return None

    for field in ("created_at", "updated_at"):
        user_with_password.pop(field, None)
    return _normalize_user_doc(user_with_password)


def create_user(user_data: dict):
    """
    Create a new user

    Args:
        user_data: User data dictionary

    Returns:
        Created user dict
    """
    try:
        dto = UserCreateDTO(user_data)
    except ValueError as e:
        raise ValidationError(
            str(e), "password" if "senha" in str(e).lower() else "validation"
        )

    existing_user = get_user_by_email(dto.email)
    if existing_user:
        raise ValidationError(f"User with email {dto.email} already exists", "email")

    hashed_password = get_password_hash(dto.password)

    user_doc = {
        "name": dto.name,
        "email": dto.email.lower(),
        "password": hashed_password,
        "role": dto.role if hasattr(dto, "role") else "unassigned",
        "created_at": utc_now(),
        "updated_at": utc_now(),
        "is_active": True,
    }

    try:
        result = _db().users.insert_one(user_doc)
        user_doc["_id"] = str(result.inserted_id)
        del user_doc["password"]
        return user_doc
    except Exception as e:
        raise DatabaseError(f"Error creating user: {str(e)}", "create_user")


def update_user(user_id: str, user_data: dict):
    """
    Update an existing user

    Args:
        user_id: User ID
        user_data: User data dictionary

    Returns:
        Updated user dict
    """
    if not ObjectId.is_valid(user_id):
        raise ValidationError("Invalid user ID", "user_id")

    dto = UserUpdateDTO({**user_data, "id": user_id})

    existing_user = get_user_by_id(user_id)
    if not existing_user:
        raise NotFoundError("User", user_id)

    update_data = {"updated_at": utc_now()}

    if hasattr(dto, "name"):
        update_data["name"] = dto.name
    if hasattr(dto, "email"):
        email_user = get_user_by_email(dto.email)
        if email_user and email_user["_id"] != user_id:
            raise ValidationError(f"Email {dto.email} is already taken", "email")
        update_data["email"] = dto.email.lower()
    if hasattr(dto, "role"):
        update_data["role"] = dto.role
    if hasattr(dto, "contact_info"):
        update_data["contact_info"] = dto.contact_info
    if hasattr(dto, "profile_image_id"):
        update_data["profile_image_id"] = dto.profile_image_id

    try:
        result = _db().users.update_one({"_id": ObjectId(user_id)}, {"$set": update_data})

        if result.matched_count == 0:
            raise NotFoundError("User", user_id)

        return get_user_by_id(user_id)
    except (NotFoundError, ValidationError):
        raise
    except Exception as e:
        raise DatabaseError(f"Error updating user: {str(e)}", "update_user")


def get_all_users():
    """Get all users (without passwords)"""
    users = list(_db().users.find({}, {"password": 0}))
    return [_normalize_user_doc(u) for u in users]
