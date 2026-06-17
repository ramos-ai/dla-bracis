
from flasgger import swag_from
from flask import Blueprint, g, jsonify

from domain.exceptions import DatabaseError
from infrastructure.persistence.service_student_stats import (
    get_student_dashboard,
    get_student_stats,
)
from presentation.http.dependencies.auth_dependency import (
from shared.logger import get_logger

logger = get_logger(__name__)
    assigned_role_required,
    token_required,
)

student_stats_blueprint = Blueprint("student_stats", __name__)


@student_stats_blueprint.route("/stats", methods=["GET"])
@token_required
@assigned_role_required
@swag_from(
    {
        "tags": ["student_stats"],
        "summary": "Get student statistics",
        "security": [{"BearerAuth": []}],
        "responses": {
            200: {
                "description": "Statistics returned successfully",
                "schema": {
                    "type": "object",
                    "properties": {
                        "total_completed": {"type": "integer"},
                        "average_score": {"type": "number"},
                        "total_submissions": {"type": "integer"},
                    },
                },
            },
            401: {"description": "Not authenticated"},
        },
    }
)
def get_student_stats_route():
    """Get statistics for the authenticated student."""
    try:
        student_id = g.current_user_id

        stats = get_student_stats(student_id)

        return jsonify(stats), 200
    except Exception as e:
        logger.exception("Error in get_student_stats_route")
        raise DatabaseError(
            f"Error getting student stats: {str(e)}", "get_student_stats"
        )


@student_stats_blueprint.route("/dashboard", methods=["GET"])
@token_required
@assigned_role_required
def get_student_dashboard_route():
    """Student dashboard: statistics and pending exercises."""
    try:
        student_id = g.current_user_id
        data = get_student_dashboard(student_id)
        return jsonify(data), 200
    except Exception as e:
        logger.exception("Error in get_student_dashboard_route")
        raise DatabaseError(
            f"Error getting student dashboard: {str(e)}", "get_student_dashboard"
        )
