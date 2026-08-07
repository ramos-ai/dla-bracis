"""Persistence for student classification reliability (Cohen κ → weight)."""

from infrastructure.persistence.db_connection import get_db_dla
from infrastructure.persistence.object_id_utils import to_object_id
from shared.logger import get_logger

logger = get_logger(__name__)


def _db():
    return get_db_dla()


def get_reliability(user_id: str) -> dict | None:
    """Return stored classification_reliability for a user, or None."""
    user_oid = to_object_id(user_id)
    if user_oid is None:
        return None
    user = _db().users.find_one(
        {"_id": user_oid},
        {"classification_reliability": 1},
    )
    if not user:
        return None
    return user.get("classification_reliability")


def set_reliability(user_id: str, payload: dict) -> bool:
    """Persist classification_reliability on the user document."""
    user_oid = to_object_id(user_id)
    if user_oid is None:
        return False
    try:
        result = _db().users.update_one(
            {"_id": user_oid},
            {"$set": {"classification_reliability": payload}},
        )
        return result.matched_count > 0
    except Exception:
        logger.exception("Failed to set classification_reliability user_id=%s", user_id)
        return False


def user_exists(user_id: str) -> bool:
    user_oid = to_object_id(user_id)
    if user_oid is None:
        return False
    return _db().users.find_one({"_id": user_oid}, {"_id": 1}) is not None


def users_share_class(admin_or_teacher_id: str, student_id: str) -> bool:
    """True if the viewer is admin, or a teacher sharing a class with the student."""
    viewer_oid = to_object_id(admin_or_teacher_id)
    student_oid = to_object_id(student_id)
    if viewer_oid is None or student_oid is None:
        return False

    viewer = _db().users.find_one({"_id": viewer_oid}, {"role": 1, "class_id": 1, "classes": 1})
    student = _db().users.find_one({"_id": student_oid}, {"role": 1, "class_id": 1})
    if not viewer or not student:
        return False

    if viewer.get("role") == "admin":
        return True
    if viewer.get("role") != "teacher":
        return False

    student_class = student.get("class_id")
    if student_class is None:
        return False

    teacher_classes = viewer.get("classes") or []
    if isinstance(teacher_classes, list):
        for item in teacher_classes:
            if str(item) == str(student_class):
                return True

    teacher_primary = viewer.get("class_id")
    if teacher_primary is not None and str(teacher_primary) == str(student_class):
        return True

    return False
