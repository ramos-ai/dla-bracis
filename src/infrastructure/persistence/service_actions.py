"""
Service for handling user actions/activities
"""

from bson import ObjectId

from infrastructure.persistence.db_connection import get_db_dla
from shared.date_utils import utc_now
from shared.logger import get_logger

logger = get_logger(__name__)


def _db():
    return get_db_dla()


def save_action(
    user_id: str, action_type: str, description: str, metadata: dict = None
):
    """Save a user action"""
    try:
        actions_collection = _db().user_actions

        user_id_str = str(user_id)

        action_data = {
            "user_id": user_id_str,
            "action_type": action_type,
            "description": description,
            "metadata": metadata or {},
            "created_at": utc_now(),
        }

        result = actions_collection.insert_one(action_data)
        action_id = str(result.inserted_id)
        return action_id
    except Exception:
        logger.exception("Failed to save action user_id=%s type=%s", user_id, action_type)
        return None


def get_user_actions(user_id: str, limit: int = 10):
    """Get recent actions for a user"""
    try:
        actions_collection = _db().user_actions

        user_id_str = str(user_id)

        query = {"user_id": user_id_str}

        if ObjectId.is_valid(user_id_str):
            query = {
                "$or": [{"user_id": user_id_str}, {"user_id": ObjectId(user_id_str)}]
            }

        actions = list(
            actions_collection.find(query).sort("created_at", -1).limit(limit)
        )

        for action in actions:
            action["_id"] = str(action["_id"])
            if "user_id" in action and isinstance(action["user_id"], ObjectId):
                action["user_id"] = str(action["user_id"])
            if "created_at" in action:
                action["created_at"] = action["created_at"].isoformat()

        return actions
    except Exception:
        logger.exception("Failed to get user actions user_id=%s", user_id)
        return []


def get_all_user_actions(user_id: str):
    """Get all actions for a user (for modal)"""
    try:
        actions_collection = _db().user_actions

        user_id_str = str(user_id)

        query = {"user_id": user_id_str}

        if ObjectId.is_valid(user_id_str):
            query = {
                "$or": [{"user_id": user_id_str}, {"user_id": ObjectId(user_id_str)}]
            }

        actions = list(actions_collection.find(query).sort("created_at", -1))

        for action in actions:
            action["_id"] = str(action["_id"])
            if "user_id" in action and isinstance(action["user_id"], ObjectId):
                action["user_id"] = str(action["user_id"])
            if "created_at" in action:
                action["created_at"] = action["created_at"].isoformat()

        return actions
    except Exception:
        logger.exception("Failed to get all user actions user_id=%s", user_id)
        return []


def delete_action(action_id: str, user_id: str) -> bool:
    """Remove an action. Only removes if it belongs to the given user_id."""
    try:
        if not action_id or not ObjectId.is_valid(action_id):
            return False
        actions_collection = _db().user_actions
        user_id_str = str(user_id)
        result = actions_collection.delete_one(
            {"_id": ObjectId(action_id), "user_id": user_id_str}
        )
        if result.deleted_count == 0 and ObjectId.is_valid(user_id_str):
            result = actions_collection.delete_one(
                {"_id": ObjectId(action_id), "user_id": ObjectId(user_id_str)}
            )
        return result.deleted_count > 0
    except Exception:
        logger.exception(
            "Failed to delete action action_id=%s user_id=%s", action_id, user_id
        )
        return False


def delete_all_user_actions(user_id: str) -> int:
    """Remove all actions for the user. Returns the number removed."""
    try:
        actions_collection = _db().user_actions
        user_id_str = str(user_id)
        query = {"user_id": user_id_str}
        if ObjectId.is_valid(user_id_str):
            query = {
                "$or": [{"user_id": user_id_str}, {"user_id": ObjectId(user_id_str)}]
            }
        result = actions_collection.delete_many(query)
        return result.deleted_count
    except Exception:
        logger.exception("Failed to delete all user actions user_id=%s", user_id)
        return 0
