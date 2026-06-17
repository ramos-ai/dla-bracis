"""Persistence service for class (cohort) management."""

from shared.date_utils import utc_now

from bson import ObjectId

from infrastructure.persistence.db_connection import get_db_dla
from shared.logger import get_logger

logger = get_logger(__name__)

_SENSITIVE_USER_FIELDS = ("password", "created_at", "updated_at")


def _db():
    return get_db_dla()


def convert_objectid_to_str(obj):
    """Recursively convert ObjectId instances to strings for JSON serialization."""
    if isinstance(obj, ObjectId):
        return str(obj)
    if isinstance(obj, dict):
        return {key: convert_objectid_to_str(value) for key, value in obj.items()}
    if isinstance(obj, list):
        return [convert_objectid_to_str(item) for item in obj]
    return obj


def _optional_str(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _class_members_query(class_id: str, class_obj_id: ObjectId) -> dict:
    return {"$or": [{"class_id": class_obj_id}, {"class_id": class_id}]}


def _strip_sensitive_fields(user: dict) -> None:
    for field in _SENSITIVE_USER_FIELDS:
        user.pop(field, None)


def _set_class_id_from_field(user: dict) -> None:
    class_id = user.pop("class_id", None)
    if class_id:
        user["classId"] = str(class_id) if not isinstance(class_id, str) else class_id
    else:
        user["classId"] = None


def _set_teacher_class_fields(user: dict, class_obj_id: ObjectId) -> None:
    classes = user.pop("classes", None)
    if isinstance(classes, list):
        user["classIds"] = [str(item) for item in classes]
        user["classId"] = str(class_obj_id) if class_obj_id in classes else None
        return

    _set_class_id_from_field(user)


def _sanitize_student_user(user: dict) -> dict:
    user["_id"] = str(user["_id"])
    _strip_sensitive_fields(user)
    _set_class_id_from_field(user)
    return convert_objectid_to_str(user)


def _sanitize_teacher_user(user: dict, class_obj_id: ObjectId) -> dict:
    user["_id"] = str(user["_id"])
    _strip_sensitive_fields(user)
    _set_teacher_class_fields(user, class_obj_id)
    return convert_objectid_to_str(user)


def _sanitize_user_by_role(user: dict) -> dict:
    user["_id"] = str(user["_id"])
    _strip_sensitive_fields(user)

    classes = user.get("classes")
    if isinstance(classes, list):
        user["classIds"] = [str(item) for item in classes]
        user.pop("classes", None)
        _set_class_id_from_field(user)
        return user

    _set_class_id_from_field(user)
    return user


def _user_profile(user: dict) -> dict:
    return {
        "_id": str(user["_id"]),
        "name": user.get("name", ""),
        "email": user.get("email", ""),
        "contact_info": user.get("contact_info", ""),
        "profile_image_id": user.get("profile_image_id"),
    }


def _fetch_students_raw(class_id: str, class_obj_id: ObjectId, projection: dict | None = None):
    query = {**_class_members_query(class_id, class_obj_id), "role": "student"}
    cursor = _db().users.find(query, projection) if projection else _db().users.find(query)
    return list(cursor)


def _fetch_teachers_raw(class_obj_id: ObjectId) -> list:
    by_primary = list(_db().users.find({"class_id": class_obj_id, "role": "teacher"}))
    by_array = list(_db().users.find({"classes": class_obj_id, "role": "teacher"}))

    seen = {str(teacher["_id"]) for teacher in by_primary}
    merged = by_primary + [
        teacher for teacher in by_array if str(teacher["_id"]) not in seen
    ]
    return merged


def create_class(name: str, code: str = None, institution: str = None):
    """Create a new class (cohort). Returns the created class dict with _id or None on failure."""
    if not name or not name.strip():
        return None

    doc = {
        "name": name.strip(),
        "code": _optional_str(code),
        "institution": _optional_str(institution),
    }
    doc = {key: value for key, value in doc.items() if value is not None}

    try:
        result = _db().classes.insert_one(doc)
        created = _db().classes.find_one({"_id": result.inserted_id})
        if created:
            created["_id"] = str(created["_id"])
        return created
    except Exception:
        return None


def get_all_classes():
    return [
        {
            "_id": str(item["_id"]) if isinstance(item.get("_id"), ObjectId) else str(item.get("_id", "")),
            "name": str(item.get("name", "")),
        }
        for item in _db().classes.find()
    ]


def get_class_by_id(class_id):
    """Get a class by ID."""
    if not class_id:
        return None
    if not ObjectId.is_valid(class_id):
        logger.warning("Invalid ObjectId format: %s", class_id)
        return None

    try:
        result_class = _db().classes.find_one({"_id": ObjectId(class_id)})
        if result_class:
            result_class["_id"] = str(result_class["_id"])
            return result_class

        logger.warning("Class not found with id: %s", class_id)
        return None
    except Exception as error:
        logger.exception("Error in get_class_by_id")
        return None


def get_class_with_users(class_id: str):
    """Get class with list of students and teachers."""
    if not class_id:
        logger.warning("get_class_with_users: class_id is empty")
        return None
    if not ObjectId.is_valid(class_id):
        logger.warning("get_class_with_users: Invalid ObjectId format: %s", class_id)
        return None

    class_obj = get_class_by_id(class_id)
    if not class_obj:
        logger.warning("get_class_with_users: Class not found with id: %s", class_id)
        return None

    class_obj_id = ObjectId(class_id)
    students = [
        _sanitize_student_user(student)
        for student in _fetch_students_raw(class_id, class_obj_id)
    ]
    teachers = [
        _sanitize_teacher_user(teacher, class_obj_id)
        for teacher in _fetch_teachers_raw(class_obj_id)
    ]

    class_obj["students"] = students
    class_obj["teachers"] = teachers
    return convert_objectid_to_str(class_obj)


def get_student_ids_by_class(class_id: str):
    """Return list of _id (string) of students in the class."""
    if not class_id or not ObjectId.is_valid(class_id):
        return []

    students = _fetch_students_raw(class_id, ObjectId(class_id), {"_id": 1})
    return [str(student["_id"]) for student in students]


def _promote_unassigned_role(user_obj_id: ObjectId, role: str) -> bool:
    if role not in ("student", "teacher"):
        return False

    _db().users.update_one(
        {"_id": user_obj_id},
        {"$set": {"role": role, "updated_at": utc_now()}},
    )
    return True


def _assign_student_to_class(user_obj_id: ObjectId, class_obj_id: ObjectId):
    return _db().users.update_one(
        {"_id": user_obj_id},
        {"$set": {"class_id": class_obj_id, "updated_at": utc_now()}},
    )


def _assign_teacher_to_class(user_obj_id: ObjectId, class_obj_id: ObjectId, user: dict):
    if "classes" not in user:
        _db().users.update_one({"_id": user_obj_id}, {"$set": {"classes": []}})

    result = _db().users.update_one(
        {"_id": user_obj_id},
        {
            "$addToSet": {"classes": class_obj_id},
            "$set": {"updated_at": utc_now()},
        },
    )
    _db().users.update_one({"_id": user_obj_id}, {"$set": {"class_id": class_obj_id}})
    return result


def assign_user_to_class(user_id: str, class_id: str, role: str = None):
    """Assign a user to a class. Teachers can be in multiple classes."""
    if not ObjectId.is_valid(user_id) or not ObjectId.is_valid(class_id):
        return False
    if not get_class_by_id(class_id):
        return False

    user_obj_id = ObjectId(user_id)
    class_obj_id = ObjectId(class_id)
    user = _db().users.find_one({"_id": user_obj_id})
    if not user:
        return False

    user_role = user.get("role", "student")
    if user_role == "unassigned":
        if not _promote_unassigned_role(user_obj_id, role):
            return False
        user_role = role

    if user_role == "student":
        result = _assign_student_to_class(user_obj_id, class_obj_id)
    else:
        result = _assign_teacher_to_class(user_obj_id, class_obj_id, user)

    return result.modified_count > 0 or result.upserted_id is not None


def _remove_teacher_from_class(user_obj_id: ObjectId, class_obj_id: ObjectId):
    result = _db().users.update_one(
        {"_id": user_obj_id},
        {
            "$pull": {"classes": class_obj_id},
            "$set": {"updated_at": utc_now()},
        },
    )

    updated_user = _db().users.find_one({"_id": user_obj_id})
    if updated_user:
        classes_array = updated_user.get("classes", [])
        if not classes_array or updated_user.get("class_id") == class_obj_id:
            _db().users.update_one({"_id": user_obj_id}, {"$unset": {"class_id": ""}})

    return result


def remove_user_from_class(user_id: str, class_id: str = None):
    """Remove a user from a class."""
    if not ObjectId.is_valid(user_id):
        return False

    user_obj_id = ObjectId(user_id)
    user = _db().users.find_one({"_id": user_obj_id})
    if not user:
        return False

    user_role = user.get("role", "student")
    if user_role == "teacher" and class_id and ObjectId.is_valid(class_id):
        result = _remove_teacher_from_class(user_obj_id, ObjectId(class_id))
    else:
        result = _db().users.update_one(
            {"_id": user_obj_id},
            {"$unset": {"class_id": ""}, "$set": {"updated_at": utc_now()}},
        )

    return result.modified_count > 0


def get_users_by_role(role: str):
    """Get all users by role."""
    try:
        return [_sanitize_user_by_role(user) for user in _db().users.find({"role": role})]
    except Exception as error:
        logger.exception("Error in get_users_by_role")
        raise


def get_students_by_class(class_id: str):
    """Get all students in a specific class with profile info."""
    if not class_id or not ObjectId.is_valid(class_id):
        return []

    return [
        _user_profile(student)
        for student in _fetch_students_raw(class_id, ObjectId(class_id))
    ]


def get_teachers_by_class(class_id: str):
    """Get all teachers assigned to a specific class with profile info."""
    if not class_id or not ObjectId.is_valid(class_id):
        return []

    return [
        _user_profile(teacher)
        for teacher in _fetch_teachers_raw(ObjectId(class_id))
    ]
