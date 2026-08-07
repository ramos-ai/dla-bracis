"""Admin/teacher routes for student reliability."""

from flask import Blueprint, g, jsonify

from domain.evaluation.annotator_weight import reliability_detail_for_api
from domain.exceptions import DatabaseError, NotFoundError, ValidationError
from infrastructure.persistence.service_student_reliability import (
    get_reliability,
    user_exists,
    users_share_class,
)
from presentation.http.dependencies.auth_dependency import (
    teacher_or_admin_required,
    token_required,
)
from shared.logger import get_logger

logger = get_logger(__name__)

students_blueprint = Blueprint("students", __name__)


@students_blueprint.route("/<string:user_id>/reliability", methods=["GET"])
@token_required
@teacher_or_admin_required
def get_student_reliability_route(user_id: str):
    """Return classification reliability (κ, weight) for a student; matrix if ≤12 classes."""
    try:
        if not user_id:
            raise ValidationError("user_id is required", "user_id")

        from bson import ObjectId

        if not ObjectId.is_valid(user_id):
            raise ValidationError(f"Invalid user_id format: {user_id}", "user_id")

        if not user_exists(user_id):
            raise NotFoundError("User", user_id)

        viewer_id = getattr(g, "current_user_id", None)
        viewer_role = getattr(g, "current_user_role", None)
        if viewer_role != "admin" and not users_share_class(str(viewer_id), user_id):
            return (
                jsonify(
                    {
                        "error": "Forbidden",
                        "message": "Not allowed to view this student's reliability",
                    }
                ),
                403,
            )

        stored = get_reliability(user_id)
        detail = reliability_detail_for_api(stored)
        detail["user_id"] = user_id
        return jsonify({"reliability": detail}), 200
    except (ValidationError, NotFoundError):
        raise
    except Exception as e:
        logger.exception("Error in get_student_reliability_route")
        raise DatabaseError(
            f"Error getting student reliability: {str(e)}",
            "get_student_reliability",
        )
