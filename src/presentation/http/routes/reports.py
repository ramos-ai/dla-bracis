
from flasgger import swag_from
from flask import Blueprint, jsonify, request

from application.exercises.facade import finalize_submission_on_report
from application.reports.reports_service import (
    get_reports_by_exercise,
    get_reports_by_teacher,
    mark_all_reports_dismissed_for_teacher,
    save_report,
    update_report_status,
)
from domain.exceptions import (
    DatabaseError,
    UnauthorizedError,
    ValidationError,
)
from presentation.http.dependencies.auth_dependency import (
    get_current_user_id,
    teacher_or_admin_required,
    token_required,
)
from presentation.http.schemas import ReportCreateDTO
from shared.logger import get_logger

logger = get_logger(__name__)

reports_blueprint = Blueprint("reports", __name__)


@reports_blueprint.route("/create", methods=["POST"])
@token_required
@swag_from(
    {
        "tags": ["reports"],
        "summary": "Create a new error report",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {
                "name": "body",
                "in": "body",
                "required": True,
                "schema": {
                    "type": "object",
                    "required": ["exerciseId", "reportType", "description"],
                    "properties": {
                        "exerciseId": {"type": "string"},
                        "reportType": {
                            "type": "string",
                            "enum": ["error", "unlabelled"],
                        },
                        "description": {
                            "type": "string",
                            "minLength": 10,
                            "maxLength": 1000,
                        },
                        "mediaId": {"type": "string"},
                    },
                },
            }
        ],
        "responses": {
            201: {"description": "Report created successfully"},
            400: {"description": "Validation error"},
            401: {"description": "Not authenticated"},
        },
    }
)
def create_report_route():
    """Create a new report."""
    try:
        user_id = get_current_user_id()
        data = request.json

        if not data:
            raise ValidationError("Request body is required")

        data["userId"] = user_id

        dto = ReportCreateDTO(data)
        result = save_report(
            {
                "exerciseId": dto.exercise_id,
                "userId": dto.user_id,
                "reportType": dto.report_type,
                "description": dto.description,
                "mediaId": dto.media_id,
                "status": dto.status,
            }
        )

        if result["success"]:
            # Finalize submission and drop reported image from answers (counts as unanswered)
            finalize_result = finalize_submission_on_report(
                user_id=user_id, exercise_id=dto.exercise_id, media_id=dto.media_id
            )
            if not finalize_result.get("success"):
                logger.warning(
                    "Report saved but finalize_submission_on_report failed: %s",
                    finalize_result.get("message"),
                )
            return jsonify(result), 201
        else:
            raise DatabaseError(result["message"], "create_report")
    except (ValidationError, UnauthorizedError):
        raise
    except Exception as e:
        logger.exception("Error in create_report_route")
        raise DatabaseError(f"Error creating report: {str(e)}", "create_report")


@reports_blueprint.route("/list", methods=["GET"])
@token_required
@teacher_or_admin_required
@swag_from(
    {
        "tags": ["reports"],
        "summary": "List all reports for the authenticated teacher",
        "security": [{"BearerAuth": []}],
        "responses": {
            200: {
                "description": "List of reports",
                "schema": {
                    "type": "object",
                    "properties": {
                        "reports": {"type": "array", "items": {"type": "object"}}
                    },
                },
            },
            401: {"description": "Not authenticated"},
            403: {"description": "Access denied"},
        },
    }
)
def list_reports_route():
    """List all reports for the teacher."""
    try:
        teacher_id = get_current_user_id()
        return get_reports_by_teacher(teacher_id)
    except Exception as e:
        logger.exception("Error in list_reports_route")
        raise DatabaseError(f"Error listing reports: {str(e)}", "list_reports")


@reports_blueprint.route("/exercise/<exercise_id>", methods=["GET"])
@token_required
@teacher_or_admin_required
@swag_from(
    {
        "tags": ["reports"],
        "summary": "List reports for a specific exercise",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {"name": "exercise_id", "in": "path", "type": "string", "required": True}
        ],
        "responses": {
            200: {"description": "List of reports"},
            401: {"description": "Not authenticated"},
            403: {"description": "Access denied"},
        },
    }
)
def get_exercise_reports_route(exercise_id: str):
    """List reports for an exercise."""
    try:
        return get_reports_by_exercise(exercise_id)
    except Exception as e:
        logger.exception("Error in get_exercise_reports_route")
        raise DatabaseError(
            f"Error getting exercise reports: {str(e)}", "get_exercise_reports"
        )


@reports_blueprint.route("/<report_id>/status", methods=["PUT"])
@token_required
@teacher_or_admin_required
@swag_from(
    {
        "tags": ["reports"],
        "summary": "Update report status",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {"name": "report_id", "in": "path", "type": "string", "required": True},
            {
                "name": "body",
                "in": "body",
                "required": True,
                "schema": {
                    "type": "object",
                    "required": ["status"],
                    "properties": {
                        "status": {
                            "type": "string",
                            "enum": ["pending", "resolved", "dismissed"],
                        }
                    },
                },
            },
        ],
        "responses": {
            200: {"description": "Status atualizado com sucesso"},
            400: {"description": "Validation error"},
            401: {"description": "Not authenticated"},
            403: {"description": "Access denied"},
        },
    }
)
def update_report_status_route(report_id: str):
    """Atualiza o status de um reporte"""
    try:
        teacher_id = get_current_user_id()
        data = request.json

        if not data or "status" not in data:
            raise ValidationError("Status is required")

        status = data["status"]
        result = update_report_status(report_id, status, teacher_id)

        if result["success"]:
            return jsonify(result), 200
        else:
            raise DatabaseError(result["message"], "update_report_status")
    except (ValidationError, UnauthorizedError):
        raise
    except Exception as e:
        logger.exception("Error in update_report_status_route")
        raise DatabaseError(
            f"Error updating report status: {str(e)}", "update_report_status"
        )


@reports_blueprint.route("/mark-all-read", methods=["POST"])
@token_required
@teacher_or_admin_required
@swag_from(
    {
        "tags": ["reports"],
        "summary": "Mark all reports as read (clear notifications)",
        "security": [{"BearerAuth": []}],
        "responses": {
            200: {"description": "Notifications cleared"},
            401: {"description": "Not authenticated"},
            403: {"description": "Access denied"},
        },
    }
)
def mark_all_reports_read_route():
    """Mark all teacher reports as dismissed (clear notifications)."""
    try:
        teacher_id = get_current_user_id()
        result = mark_all_reports_dismissed_for_teacher(teacher_id)
        if result["success"]:
            return jsonify(result), 200
        raise DatabaseError(result.get("message", "Error"), "mark_all_read")
    except (ValidationError, UnauthorizedError):
        raise
    except Exception as e:
        logger.exception("Error in mark_all_reports_read_route")
        raise DatabaseError(f"Error clearing notifications: {str(e)}", "mark_all_read")
