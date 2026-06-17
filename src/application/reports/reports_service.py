"""
Service for handling exercise reports.
"""

from bson import ObjectId
from flask import jsonify

from application.auth.auth_service import get_user_by_id
from infrastructure.persistence.db_connection import get_db_dla
from infrastructure.persistence.object_id_utils import to_object_id
from shared.date_utils import utc_now
from shared.logger import get_logger

logger = get_logger(__name__)

VALID_STATUSES = frozenset({"pending", "resolved", "dismissed"})


def _db():
    return get_db_dla()


def _convert_objectid_fields(doc: dict) -> dict:
    if doc is None:
        return doc
    for key in list(doc.keys()):
        if isinstance(doc[key], ObjectId):
            doc[key] = str(doc[key])
    return doc


def _build_report_payload(data: dict) -> dict:
    now = utc_now()
    return {
        "exerciseId": data["exerciseId"],
        "userId": data["userId"],
        "reportType": data["reportType"],
        "description": data["description"],
        "mediaId": data.get("mediaId"),
        "status": data.get("status", "pending"),
        "createdAt": now,
        "updatedAt": now,
    }


def _teacher_exercises_query(teacher_id: str) -> dict:
    teacher_oid = to_object_id(teacher_id)
    if teacher_oid:
        return {"$or": [{"user_id": teacher_oid}, {"user_id": teacher_id}]}
    return {"user_id": teacher_id}


def _fetch_teacher_exercise_ids(teacher_id: str) -> tuple[list[str], list]:
    exercises = list(_db().exercises.find(_teacher_exercises_query(teacher_id), {"_id": 1}))
    exercise_ids = [str(doc["_id"]) for doc in exercises]
    exercise_oids = [doc["_id"] for doc in exercises]
    return exercise_ids, exercise_oids


def _reports_query_for_exercise(exercise_id: str) -> dict:
    exercise_oid = to_object_id(exercise_id)
    if exercise_oid:
        return {"$or": [{"exerciseId": exercise_oid}, {"exerciseId": exercise_id}]}
    return {"exerciseId": exercise_id}


def _reports_query_for_exercises(
    exercise_ids: list[str], exercise_oids: list
) -> dict:
    return {
        "$or": [
            {"exerciseId": {"$in": exercise_ids}},
            {"exerciseId": {"$in": exercise_oids}},
        ]
    }


def _fetch_reports_sorted(query: dict) -> list:
    return list(_db().reports.find(query).sort("createdAt", -1))


def _attach_reporter_profile(report: dict) -> None:
    user_id = report.get("userId")
    if not user_id:
        return

    try:
        user = get_user_by_id(user_id)
        if not user:
            report["userName"] = "Usuário desconhecido"
            report["userEmail"] = "Email not available"
            return

        report["userName"] = user.get("name", "Usuário desconhecido")
        report["userEmail"] = user.get("email", "Email not available")
    except Exception as error:
        logger.exception("Error fetching user info")
        report["userName"] = "Error fetching user"
        report["userEmail"] = "Email not available"


def _attach_exercise_title(report: dict) -> None:
    exercise_id = report.get("exerciseId")
    if not exercise_id:
        return

    try:
        exercise_oid = to_object_id(exercise_id)
        exercise_doc = (
            _db().exercises.find_one({"_id": exercise_oid}) if exercise_oid else None
        )
        if not exercise_doc:
            report["exerciseTitle"] = "Exercise not found"
            return

        report["exerciseTitle"] = exercise_doc.get("title", "Exercício desconhecido")
    except Exception as error:
        logger.exception("Error fetching exercise info")
        report["exerciseTitle"] = "Error fetching exercise"


def _enrich_report(report: dict, *, include_exercise: bool = False) -> dict:
    _convert_objectid_fields(report)
    _attach_reporter_profile(report)
    if include_exercise:
        _attach_exercise_title(report)
    return report


def _reports_response(reports: list, *, include_exercise: bool = False):
    enriched = [_enrich_report(report, include_exercise=include_exercise) for report in reports]
    return jsonify({"reports": enriched})


def _reports_error_response(error: Exception):
    return jsonify({"error": str(error), "reports": []}), 500


def save_report(data: dict) -> dict:
    """Save a new report."""
    try:
        result = _db().reports.insert_one(_build_report_payload(data))
        return {
            "success": True,
            "report_id": str(result.inserted_id),
            "message": "Report saved successfully",
        }
    except Exception as error:
        logger.exception("Error saving report")
        return {"success": False, "message": f"Error saving report: {error}"}


def get_reports_by_exercise(exercise_id: str):
    """Get all reports for a specific exercise."""
    try:
        query = _reports_query_for_exercise(exercise_id)
        reports = _fetch_reports_sorted(query)
        return _reports_response(reports)
    except Exception as error:
        logger.exception("Error getting reports")
        return _reports_error_response(error)


def get_reports_by_teacher(teacher_id: str):
    """Get all reports for exercises created by a teacher."""
    try:
        exercise_ids, exercise_oids = _fetch_teacher_exercise_ids(teacher_id)
        if not exercise_ids:
            return jsonify({"reports": []})

        query = _reports_query_for_exercises(exercise_ids, exercise_oids)
        reports = _fetch_reports_sorted(query)
        return _reports_response(reports, include_exercise=True)
    except Exception as error:
        logger.exception("Error getting reports by teacher")
        return _reports_error_response(error)


def _load_report(report_id: str) -> dict | None:
    report_oid = to_object_id(report_id)
    if report_oid is None:
        return None
    return _db().reports.find_one({"_id": report_oid})


def _teacher_owns_exercise(exercise_id: str, teacher_id: str) -> bool:
    exercise_oid = to_object_id(exercise_id)
    if exercise_oid is None:
        return False

    teacher_oid = to_object_id(teacher_id)
    user_filter = (
        {"$or": [{"user_id": teacher_oid}, {"user_id": teacher_id}]}
        if teacher_oid
        else {"user_id": teacher_id}
    )
    return _db().exercises.find_one({"_id": exercise_oid, **user_filter}) is not None


def update_report_status(report_id: str, status: str, teacher_id: str) -> dict:
    """Update report status (only by the teacher who owns the exercise)."""
    if status not in VALID_STATUSES:
        return {"success": False, "message": "Invalid status"}

    try:
        report = _load_report(report_id)
        if not report:
            return {"success": False, "message": "Report not found"}

        if not _teacher_owns_exercise(str(report.get("exerciseId")), teacher_id):
            return {
                "success": False,
                "message": "Unauthorized: You do not own this exercise",
            }

        report_oid = to_object_id(report_id)
        result = _db().reports.update_one(
            {"_id": report_oid},
            {"$set": {"status": status, "updatedAt": utc_now()}},
        )

        if result.modified_count > 0:
            return {"success": True, "message": "Report status updated successfully"}

        return {"success": False, "message": "Report not updated"}
    except Exception as error:
        logger.exception("Error updating report status")
        return {"success": False, "message": f"Error updating report: {error}"}


def mark_all_reports_dismissed_for_teacher(teacher_id: str) -> dict:
    """Mark pending reports for this teacher's exercises as dismissed."""
    try:
        exercise_ids, exercise_oids = _fetch_teacher_exercise_ids(teacher_id)
        if not exercise_ids:
            return {
                "success": True,
                "modified_count": 0,
                "message": "No reports to clear",
            }

        query = {
            **_reports_query_for_exercises(exercise_ids, exercise_oids),
            "status": "pending",
        }
        result = _db().reports.update_many(
            query,
            {"$set": {"status": "dismissed", "updatedAt": utc_now()}},
        )
        return {
            "success": True,
            "modified_count": result.modified_count,
            "message": "Notifications cleared",
        }
    except Exception as error:
        logger.exception("Error in mark_all_reports_dismissed_for_teacher")
        return {"success": False, "message": str(error), "modified_count": 0}
