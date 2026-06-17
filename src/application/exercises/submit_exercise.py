"""
Use case: save student submission (answers, supervised score, finalize).
"""

from infrastructure.persistence.object_id_utils import to_object_id
from shared.date_utils import utc_now
from shared.logger import get_logger

from ._shared import get_db, get_exercise_dict_by_id
from .supervised_scoring import recompute_supervised_score

logger = get_logger(__name__)


def save_submission(data: dict) -> dict:
    """Save or update submission. Returns {success, message, submission_id?, supervisedScore?}."""
    dla = get_db()
    submissions_collection = dla.exercises_submissions

    user_id = data["userId"]
    exercise_id = data["exerciseId"]
    user_oid = to_object_id(user_id)
    exercise_oid = to_object_id(exercise_id)

    filter_criteria = {
        "$or": [
            {"userId": user_oid, "exerciseId": exercise_oid},
            {"userId": user_id, "exerciseId": exercise_id},
            {"userId": user_oid, "exerciseId": exercise_id},
            {"userId": user_id, "exerciseId": exercise_oid},
        ]
    }
    doc = submissions_collection.find_one(filter_criteria)
    if not doc:
        doc = {
            "userId": user_id,
            "exerciseId": exercise_id,
            "labelledAnswers": [],
            "unlabelledAnswers": [],
            "submittedAt": utc_now(),
            "supervisedScore": None,
            "finalizedAt": None,
        }
    else:
        if "labelledAnswers" not in doc:
            doc["labelledAnswers"] = []
        if "unlabelledAnswers" not in doc:
            doc["unlabelledAnswers"] = []
        if "submittedAt" not in doc:
            doc["submittedAt"] = utc_now()
        if "supervisedScore" not in doc:
            doc["supervisedScore"] = None
        if "finalizedAt" not in doc:
            doc["finalizedAt"] = None
        if "finalized" not in doc:
            doc["finalized"] = False

    if data.get("labelledAnswers"):
        for new_answer in data["labelledAnswers"]:
            doc["labelledAnswers"] = [
                a
                for a in doc.get("labelledAnswers", [])
                if a.get("mediaId") != new_answer.get("mediaId")
            ]
            doc["labelledAnswers"].append(new_answer)
    if data.get("unlabelledAnswers"):
        for new_answer in data["unlabelledAnswers"]:
            doc["unlabelledAnswers"] = [
                a
                for a in doc.get("unlabelledAnswers", [])
                if a.get("mediaId") != new_answer.get("mediaId")
            ]
            doc["unlabelledAnswers"].append(new_answer)

    if data.get("dataset_id") and doc.get("labelledAnswers"):
        exercise = (
            get_exercise_dict_by_id(data.get("exerciseId"))
            if data.get("exerciseId")
            else None
        )
        recompute_supervised_score(doc, exercise, data.get("dataset_id"))

    if data.get("finalized", False):
        doc["finalizedAt"] = utc_now()
        doc["finalized"] = True
        _save_finalize_action(
            data.get("exerciseId"), data.get("userId"), doc.get("supervisedScore")
        )

    if "submittedAt" not in doc or not doc["submittedAt"]:
        doc["submittedAt"] = utc_now()

    update_data = {
        "labelledAnswers": doc.get("labelledAnswers", []),
        "unlabelledAnswers": doc.get("unlabelledAnswers", []),
        "submittedAt": doc.get("submittedAt") or utc_now(),
    }
    if "supervisedScore" in doc:
        update_data["supervisedScore"] = doc["supervisedScore"]
    if doc.get("finalizedAt"):
        update_data["finalizedAt"] = doc["finalizedAt"]
        update_data["finalized"] = True
    elif "finalized" in doc:
        update_data["finalized"] = False

    try:
        upsert_filter = {"userId": user_id, "exerciseId": exercise_id}
        submissions_collection.update_one(
            upsert_filter, {"$set": update_data}, upsert=True
        )
        updated_doc = submissions_collection.find_one(filter_criteria)
        if not updated_doc:
            return {
                "success": False,
                "message": "failed: Document not found after update",
            }
        return {
            "success": True,
            "message": "success",
            "submission_id": str(updated_doc["_id"]),
            "supervisedScore": updated_doc.get("supervisedScore"),
        }
    except Exception as e:
        return {"success": False, "message": f"failed: {str(e)}"}


def _save_finalize_action(exercise_id: str, user_id: str, final_score):
    """Record action when student finalizes exercise."""
    if not exercise_id or not user_id:
        return
    try:
        from infrastructure.persistence.service_actions import save_action

        exercise = get_exercise_dict_by_id(exercise_id)
        exercise_title = exercise.get("title", "Exercício") if exercise else "Exercício"
        save_action(
            user_id=str(user_id),
            action_type="exercise_completed",
            description=f"Exercício '{exercise_title}' finalizado",
            metadata={"exercise_id": str(exercise_id), "score": final_score},
        )
    except Exception:
        logger.warning(
            "Failed to save finalize action user_id=%s exercise_id=%s",
            user_id,
            exercise_id,
            exc_info=True,
        )
