
from flasgger import swag_from
from flask import Blueprint, g, jsonify, request

from application.exercises._shared import get_exercise_dict_by_id
from application.exercises.facade import (
    delete_exercise,
    get_exercise_by_id,
    get_exercise_common_errors,
    get_exercises,
    get_exercises_by_class,
    get_exercises_by_dataset,
    get_ranking,
    get_submission_by_user_and_exercise,
    get_submissions,
    get_submissions_by_exercise,
    get_teacher_dashboard_stats,
    save_exercise,
    save_manual_correction,
    save_submission,
)
from domain.exceptions import (
    DatabaseError,
    NotFoundError,
    UnauthorizedError,
    ValidationError,
)
from infrastructure.persistence.service_actions import save_action
from presentation.http.dependencies.auth_dependency import (
    assigned_role_required,
    get_current_user_id,
    teacher_or_admin_required,
    token_required,
)
from presentation.http.schemas import (
from shared.logger import get_logger

logger = get_logger(__name__)
    ExerciseCreateDTO,
    ExerciseUpdateDTO,
    SubmissionSaveDTO,
)

exercises_blueprint = Blueprint("exercises", __name__)


def _build_exercise_data(dto, user_id: str) -> dict:
    """Convert DTO to dict for the service layer."""
    exercise_data = {
        "title": dto.title,
        "didactic_detailing": dto.didactic_detailing,
        "do_date": (
            dto.do_date.isoformat()
            if hasattr(dto.do_date, "isoformat")
            else str(dto.do_date)
        ),
        "class": dto.class_id,
        "score": dto.score,
        "dataset": dto.dataset,
        "user_id": user_id,
        "whole_dataset": dto.whole_dataset,
        "supervised_practice": dto.supervised_practice,
        "unsupervised_practice": dto.unsupervised_practice,
    }
    if hasattr(dto, "iou_threshold"):
        exercise_data["iou_threshold"] = dto.iou_threshold
    if hasattr(dto, "detection_score_mode"):
        exercise_data["detection_score_mode"] = dto.detection_score_mode
    if hasattr(dto, "segmentation_iou_threshold"):
        exercise_data["segmentation_iou_threshold"] = dto.segmentation_iou_threshold
    if hasattr(dto, "segmentation_score_mode"):
        exercise_data["segmentation_score_mode"] = dto.segmentation_score_mode
    return exercise_data


def _build_submission_data(dto) -> dict:
    """Convert submission DTO to dict for the service layer."""
    submission_data = {"userId": dto.user_id, "exerciseId": dto.exercise_id}

    if hasattr(dto, "labelled_answers"):
        submission_data["labelledAnswers"] = dto.labelled_answers
    if hasattr(dto, "unlabelled_answers"):
        submission_data["unlabelledAnswers"] = dto.unlabelled_answers
    if hasattr(dto, "dataset_id"):
        submission_data["dataset_id"] = dto.dataset_id
    if hasattr(dto, "finalized"):
        submission_data["finalized"] = dto.finalized

    return submission_data


@exercises_blueprint.route("/create", methods=["POST"])
@token_required
@teacher_or_admin_required
@swag_from(
    {
        "tags": ["exercises"],
        "summary": "Create a new exercise",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {
                "name": "body",
                "in": "body",
                "required": True,
                "schema": {
                    "type": "object",
                    "required": [
                        "title",
                        "didactic_detailing",
                        "do_date",
                        "class",
                        "score",
                        "dataset",
                        "user_id",
                        "whole_dataset",
                    ],
                    "properties": {
                        "title": {"type": "string", "minLength": 3, "maxLength": 100},
                        "didactic_detailing": {
                            "type": "string",
                            "minLength": 10,
                            "maxLength": 100000,
                        },
                        "do_date": {"type": "string", "format": "date-time"},
                        "class": {"type": "string"},
                        "score": {"type": "number", "minimum": 0, "maximum": 100},
                        "dataset": {"type": "string"},
                        "user_id": {"type": "string"},
                        "whole_dataset": {"type": "boolean"},
                        "supervised_practice": {
                            "type": "array",
                            "items": {"type": "string"},
                            "maxItems": 100,
                        },
                        "unsupervised_practice": {
                            "type": "array",
                            "items": {"type": "string"},
                            "maxItems": 100,
                        },
                    },
                },
            }
        ],
        "responses": {
            201: {"description": "Exercise created successfully"},
            400: {"description": "Validation error"},
        },
    }
)
def create_exercise_route():
    try:
        req = request.json
        if not req:
            raise ValidationError("Request body is required")

        user_id = get_current_user_id()
        req["user_id"] = user_id

        dto = ExerciseCreateDTO(req)
        exercise_data = _build_exercise_data(dto, user_id)

        result, created_exercise_id = save_exercise(exercise_data)
        exercise_id_str = str(created_exercise_id) if created_exercise_id else ""

        try:
            save_action(
                user_id=user_id,
                action_type="exercise_created",
                description=f"Exercício '{dto.title}' criado",
                metadata={"exercise_id": exercise_id_str},
            )
        except Exception as e:
            logger.exception("Error saving action")

        try:
            from infrastructure.persistence.service_classes import (
                get_student_ids_by_class,
            )

            class_id = exercise_data.get("class")
            if class_id and exercise_id_str:
                student_ids = get_student_ids_by_class(class_id)
                for sid in student_ids:
                    try:
                        save_action(
                            user_id=sid,
                            action_type="new_exercise_in_class",
                            description=f"Novo exercício '{dto.title}' disponível na sua turma.",
                            metadata={
                                "exercise_id": exercise_id_str,
                                "class_id": str(class_id),
                            },
                        )
                    except Exception:
                        logger.warning(
                            "Failed to notify student sid=%s exercise_id=%s",
                            sid,
                            exercise_id_str,
                            exc_info=True,
                        )
        except Exception as e:
            logger.exception("Error notifying students")

        return result, 201
    except ValidationError:
        raise
    except Exception as e:
        raise DatabaseError(f"Error creating exercise: {str(e)}", "create_exercise")


@exercises_blueprint.route("/list", methods=["GET"])
@token_required
@assigned_role_required
def list_exercises_route():
    """List exercises filtered by role and class."""
    try:
        from flask import g

        from application.auth.auth_service import get_user_by_id

        user_id = g.current_user_id
        user_role = g.current_user_role
        requested_class_id = request.args.get("class_id")

        if user_role == "admin":
            if requested_class_id:
                return get_exercises({"class": requested_class_id})
            return get_exercises()

        user = get_user_by_id(user_id)
        if not user:
            return jsonify({"exercises": []}), 200

        if user_role == "student":
            student_class_id = user.get("classId") or user.get("class_id")
            if student_class_id:
                return get_exercises({"class": student_class_id})
            return jsonify({"exercises": []}), 200

        if user_role == "teacher":
            class_ids = user.get("classIds") or []
            if user.get("classId") and user["classId"] not in class_ids:
                class_ids = [user["classId"]] + class_ids

            if requested_class_id and requested_class_id in class_ids:
                return get_exercises({"class": requested_class_id, "user_id": user_id})

            if class_ids:
                return get_exercises({"class": {"$in": class_ids}, "user_id": user_id})

            return get_exercises({"user_id": user_id})

        return jsonify({"exercises": []}), 200
    except Exception as e:

        logger.exception("Error in list_exercises_route")
        raise DatabaseError(f"Error listing exercises: {str(e)}", "list_exercises")


@exercises_blueprint.route("/edit", methods=["POST"])
@token_required
@teacher_or_admin_required
@swag_from(
    {
        "tags": ["exercises"],
        "summary": "Update an existing exercise",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {
                "name": "body",
                "in": "body",
                "required": True,
                "schema": {
                    "type": "object",
                    "required": [
                        "_id",
                        "title",
                        "didactic_detailing",
                        "do_date",
                        "class",
                        "score",
                        "dataset",
                        "user_id",
                        "whole_dataset",
                    ],
                    "properties": {
                        "_id": {"type": "string"},
                        "title": {"type": "string", "minLength": 3, "maxLength": 100},
                        "didactic_detailing": {
                            "type": "string",
                            "minLength": 10,
                            "maxLength": 100000,
                        },
                        "do_date": {"type": "string", "format": "date-time"},
                        "class": {"type": "string"},
                        "score": {"type": "number", "minimum": 0, "maximum": 100},
                        "dataset": {"type": "string"},
                        "user_id": {"type": "string"},
                        "whole_dataset": {"type": "boolean"},
                        "supervised_practice": {
                            "type": "array",
                            "items": {"type": "string"},
                            "maxItems": 100,
                        },
                        "unsupervised_practice": {
                            "type": "array",
                            "items": {"type": "string"},
                            "maxItems": 100,
                        },
                    },
                },
            }
        ],
        "responses": {
            200: {"description": "Exercise updated successfully"},
            400: {"description": "Validation error"},
            404: {"description": "Exercise not found"},
        },
    }
)
def edit_exercise_route():
    try:

        req = request.json
        if not req:
            raise ValidationError("Request body is required")

        user_id = get_current_user_id()
        req["user_id"] = user_id

        dto = ExerciseUpdateDTO(req)
        exercise_id = dto.exercise_id

        existing_exercise = get_exercise_dict_by_id(exercise_id)
        if not existing_exercise:
            raise NotFoundError("Exercise", exercise_id)
        from application.auth.auth_service import get_user_by_id

        user = get_user_by_id(user_id)
        is_admin = user and user.get("role") == "admin"
        if str(existing_exercise.get("user_id")) != str(user_id) and not is_admin:
            raise ValidationError(
                "You do not have permission to edit this exercise. Only the creator can edit it.",
                "permission",
            )

        exercise_data = _build_exercise_data(dto, user_id)
        exercise_data["_id"] = exercise_id

        if hasattr(dto, "supervised_practice"):
            exercise_data["supervised_practice"] = dto.supervised_practice
        if hasattr(dto, "unsupervised_practice"):
            exercise_data["unsupervised_practice"] = dto.unsupervised_practice

        result, _ = save_exercise(exercise_data, True)
        return result
    except ValidationError:
        raise
    except Exception as e:
        raise DatabaseError(f"Error updating exercise: {str(e)}", "edit_exercise")


@exercises_blueprint.route("/by_class/<class_id>", methods=["GET"])
@token_required
@assigned_role_required
def get_exercises_by_class_id_route(class_id):
    return get_exercises_by_class(class_id)


@exercises_blueprint.route("/by_dataset/<dataset_id>", methods=["GET"])
@token_required
@teacher_or_admin_required
def get_exercises_by_dataset_route(dataset_id):
    """List exercises that use this dataset (for dataset edit page)."""
    return get_exercises_by_dataset(dataset_id)


@exercises_blueprint.route(
    "/get_submissions_by_exercise/<exercise_id>", methods=["GET"]
)
@token_required
@teacher_or_admin_required
def get_submissions_by_exercise_id_route(exercise_id):
    return get_submissions_by_exercise(exercise_id)


@exercises_blueprint.route("/save_submission", methods=["POST"])
@token_required
@assigned_role_required
@swag_from(
    {
        "tags": ["exercises"],
        "summary": "Save an exercise submission",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {
                "name": "body",
                "in": "body",
                "required": True,
                "schema": {
                    "type": "object",
                    "required": ["userId", "exerciseId"],
                    "properties": {
                        "userId": {"type": "string"},
                        "exerciseId": {"type": "string"},
                        "labelledAnswers": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "mediaId": {"type": "string"},
                                    "labels": {
                                        "type": "array",
                                        "items": {"type": "string"},
                                    },
                                },
                            },
                            "maxItems": 1000,
                        },
                        "unlabelledAnswers": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {"mediaId": {"type": "string"}},
                            },
                            "maxItems": 1000,
                        },
                    },
                },
            }
        ],
        "responses": {
            200: {"description": "Submission saved successfully"},
            400: {"description": "Validation error"},
            500: {"description": "Internal server error while saving submission"},
        },
    }
)
def save_submission_route():
    try:
        data = request.json
        if not data:
            raise ValidationError("Request body is required")

        dto = SubmissionSaveDTO(data)
        submission_data = _build_submission_data(dto)
        res = save_submission(submission_data)

        if not res.get("success", False):
            return (
                jsonify(
                    {
                        "success": False,
                        "message": res.get("message", "Error saving submission"),
                    }
                ),
                500,
            )

        return jsonify(res)
    except ValidationError:
        raise
    except Exception as e:
        logger.exception("Error in save_submission_route")
        raise DatabaseError(f"Error saving submission: {str(e)}", "save_submission")


@exercises_blueprint.route("/get_submissions", methods=["GET"])
@token_required
@teacher_or_admin_required
def get_submissions_route():
    return jsonify(get_submissions())


@exercises_blueprint.route("/exercise_by_id/<exercise_id>", methods=["GET"])
@token_required
@assigned_role_required
def get_exercise_by_id_route(exercise_id):
    return get_exercise_by_id(exercise_id)


@exercises_blueprint.route("/delete/<exercise_id>", methods=["DELETE"])
@token_required
@teacher_or_admin_required
@swag_from(
    {
        "tags": ["exercises"],
        "summary": "Delete an exercise (author or admin). Removes exercise and all submissions.",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {"name": "exercise_id", "in": "path", "type": "string", "required": True}
        ],
        "responses": {
            200: {"description": "Exercise and submissions deleted"},
            403: {"description": "Only the author or admin can delete"},
            404: {"description": "Exercise not found"},
        },
    }
)
def delete_exercise_route(exercise_id):
    """Delete exercise and all its submissions. Only the author (teacher) or admin."""
    try:
        current_user_id = get_current_user_id()
        current_user_role = getattr(g, "current_user_role", "") or ""
        result = delete_exercise(exercise_id, current_user_id, current_user_role)
        return jsonify(result), 200
    except NotFoundError as e:
        return jsonify({"message": str(e)}), 404
    except UnauthorizedError as e:
        return jsonify({"message": str(e)}), 403
    except Exception as e:
        logger.exception("Error in delete_exercise_route")
        raise DatabaseError(f"Error deleting exercise: {str(e)}", "delete_exercise")


@exercises_blueprint.route("/submission/<exercise_id>/<user_id>", methods=["GET"])
@token_required
@assigned_role_required
def get_submission_by_user_and_exercise_route(exercise_id, user_id):
    try:
        current_user_id = g.current_user_id
        current_user_role = g.current_user_role

        if current_user_id != user_id and current_user_role not in ["teacher", "admin"]:
            raise UnauthorizedError("You can only access your own submissions")

        submission = get_submission_by_user_and_exercise(user_id, exercise_id)
        return jsonify({"submission": submission}), 200
    except UnauthorizedError:
        raise
    except Exception as e:
        logger.exception("Error in get_submission_by_user_and_exercise_route")
        raise DatabaseError(f"Error getting submission: {str(e)}", "get_submission")


@exercises_blueprint.route("/submission/manual_correction", methods=["POST"])
@token_required
@teacher_or_admin_required
@swag_from(
    {
        "tags": ["exercises"],
        "summary": "Save teacher manual correction for a detection submission",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {
                "name": "body",
                "in": "body",
                "required": True,
                "schema": {
                    "type": "object",
                    "required": ["exerciseId", "userId", "manualCorrections"],
                    "properties": {
                        "exerciseId": {"type": "string"},
                        "userId": {"type": "string"},
                        "manualCorrections": {
                            "type": "object",
                            "description": "Dict of corrections per image: {media_id: {annotation_idx: true/false}}",
                        },
                    },
                },
            }
        ],
        "responses": {
            200: {"description": "Manual correction saved successfully"},
            400: {"description": "Validation error"},
            401: {"description": "Not authenticated"},
            403: {"description": "Access denied"},
        },
    }
)
def save_manual_correction_route():
    """Save teacher manual correction."""
    try:
        req = request.json
        if not req:
            raise ValidationError("Request body is required")

        exercise_id = req.get("exerciseId")
        user_id = req.get("userId")
        manual_corrections = req.get("manualCorrections")

        if not exercise_id or not user_id or not manual_corrections:
            raise ValidationError(
                "exerciseId, userId, and manualCorrections are required"
            )

        teacher_id = g.current_user_id

        result = save_manual_correction(
            exercise_id, user_id, manual_corrections, teacher_id
        )

        if result.get("success"):
            return jsonify(result), 200
        else:
            raise DatabaseError(
                result.get("message", "Failed to save manual correction"),
                "save_manual_correction",
            )

    except ValidationError:
        raise
    except Exception as e:
        logger.exception("Error in save_manual_correction_route")
        raise DatabaseError(
            f"Error saving manual correction: {str(e)}", "save_manual_correction"
        )


@exercises_blueprint.route("/dashboard/stats", methods=["GET"])
@token_required
@teacher_or_admin_required
@swag_from(
    {
        "tags": ["exercises"],
        "summary": "Get teacher dashboard statistics",
        "security": [{"BearerAuth": []}],
        "responses": {
            200: {
                "description": "Statistics returned successfully",
                "schema": {
                    "type": "object",
                    "properties": {
                        "total_exercises": {"type": "integer"},
                        "total_submissions": {"type": "integer"},
                        "total_students": {"type": "integer"},
                        "average_score": {"type": "number"},
                        "completion_rate": {"type": "number"},
                    },
                },
            },
            401: {"description": "Not authenticated"},
            403: {"description": "Access denied"},
        },
    }
)
def get_teacher_dashboard_stats_route():
    """Return statistics for the authenticated teacher's exercises. Accepts ?class_id= to filter by class."""
    try:
        teacher_id = get_current_user_id()
        class_id = request.args.get("class_id")
        stats = get_teacher_dashboard_stats(teacher_id, class_id=class_id)
        return jsonify(stats), 200
    except ValidationError:
        raise
    except Exception as e:
        logger.exception("Error in get_teacher_dashboard_stats_route")
        raise DatabaseError(
            f"Error getting dashboard stats: {str(e)}", "get_dashboard_stats"
        )


@exercises_blueprint.route("/ranking", methods=["GET"])
@token_required
@teacher_or_admin_required
def get_ranking_route():
    """Student ranking by score (global and by class). Accepts ?class_id= to filter by class."""
    try:
        teacher_id = get_current_user_id()
        top_n = request.args.get("top", type=int, default=50)
        top_n = min(max(1, top_n), 100)
        class_id = request.args.get("class_id")
        result = get_ranking(teacher_id, top_n=top_n, class_id=class_id)
        return jsonify(result), 200
    except ValidationError:
        raise
    except Exception as e:
        logger.exception("Error in get_ranking_route")
        raise DatabaseError(f"Error getting ranking: {str(e)}", "get_ranking")


@exercises_blueprint.route("/exercise/<exercise_id>/common_errors", methods=["GET"])
@token_required
@teacher_or_admin_required
@swag_from(
    {
        "tags": ["exercises"],
        "summary": "Get the most frequent errors for an exercise",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {
                "name": "exercise_id",
                "in": "path",
                "type": "string",
                "required": True,
                "description": "Exercise ID",
            }
        ],
        "responses": {
            200: {
                "description": "Most frequent errors returned successfully",
                "schema": {
                    "type": "object",
                    "properties": {
                        "errors": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "error_type": {"type": "string"},
                                    "label": {"type": "string"},
                                    "media_id": {"type": "string"},
                                    "frequency": {"type": "integer"},
                                    "percentage": {"type": "number"},
                                },
                            },
                        },
                        "total_submissions": {"type": "integer"},
                    },
                },
            },
            401: {"description": "Not authenticated"},
            403: {"description": "Access denied"},
        },
    }
)
def get_exercise_common_errors_route(exercise_id):
    """Return the most frequent errors for an exercise."""
    try:
        errors_data = get_exercise_common_errors(exercise_id)
        return jsonify(errors_data), 200
    except Exception as e:
        logger.exception("Error in get_exercise_common_errors_route")
        raise DatabaseError(
            f"Error getting common errors: {str(e)}", "get_common_errors"
        )


@exercises_blueprint.route(
    "/exercise/<exercise_id>/aggregated_annotations", methods=["GET"]
)
@token_required
@teacher_or_admin_required
@swag_from(
    {
        "tags": ["exercises"],
        "summary": "Get aggregated annotations from all students for overlay visualization",
        "description": "Returns all student annotations grouped by image for detection/segmentation exercises. Used to visualize annotation overlap/consensus.",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {
                "name": "exercise_id",
                "in": "path",
                "type": "string",
                "required": True,
                "description": "Exercise ID",
            }
        ],
        "responses": {
            200: {
                "description": "Aggregated annotations returned successfully",
                "schema": {
                    "type": "object",
                    "properties": {
                        "task_type": {
                            "type": "string",
                            "enum": ["detection", "segmentation"],
                        },
                        "labels": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "images": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "image_id": {"type": "string"},
                                    "annotations": {
                                        "type": "array",
                                        "items": {
                                            "type": "object",
                                            "properties": {
                                                "user_id": {"type": "string"},
                                                "type": {
                                                    "type": "string",
                                                    "enum": ["bbox", "polygon"],
                                                },
                                                "label_index": {"type": "integer"},
                                                "bbox": {
                                                    "type": "array",
                                                    "items": {"type": "number"},
                                                },
                                                "polygon": {
                                                    "type": "array",
                                                    "items": {"type": "number"},
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            400: {"description": "Exercise is not detection or segmentation type"},
            401: {"description": "Not authenticated"},
            403: {"description": "Access denied"},
            404: {"description": "Exercise not found"},
        },
    }
)
def get_aggregated_annotations_route(exercise_id):
    """Get all student annotations aggregated by image for overlay visualization."""
    try:
        from application.exercises.list_exercises import get_aggregated_annotations

        result = get_aggregated_annotations(exercise_id)
        return jsonify(result), 200
    except NotFoundError:
        raise
    except ValidationError:
        raise
    except Exception as e:
        logger.exception("Error in get_aggregated_annotations_route")
        raise DatabaseError(
            f"Error getting aggregated annotations: {str(e)}",
            "get_aggregated_annotations",
        )
