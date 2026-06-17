from flasgger import swag_from
from flask import Blueprint, jsonify, request

from domain.exceptions import DatabaseError, NotFoundError, ValidationError
from infrastructure.persistence.service_classes import (
    assign_user_to_class,
    create_class,
    get_all_classes,
    get_class_with_users,
    get_students_by_class,
    get_teachers_by_class,
    get_users_by_role,
    remove_user_from_class,
)
from presentation.http.dependencies.auth_dependency import (
from shared.logger import get_logger

logger = get_logger(__name__)
    admin_required,
    token_required,
)

classes_blueprint = Blueprint("classes", __name__)


@classes_blueprint.route("/create", methods=["POST"])
@token_required
@admin_required
@swag_from(
    {
        "tags": ["classes"],
        "summary": "Create a new class",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {
                "name": "body",
                "in": "body",
                "required": True,
                "schema": {
                    "type": "object",
                    "required": ["name"],
                    "properties": {
                        "name": {"type": "string"},
                        "code": {"type": "string"},
                        "institution": {"type": "string"},
                    },
                },
            }
        ],
        "responses": {
            201: {"description": "Class created successfully"},
            400: {"description": "Validation error"},
            401: {"description": "Not authenticated"},
            403: {"description": "Admin only"},
        },
    }
)
def create_class_route():
    """Create a new class (admin only)."""
    try:
        data = request.json or {}
        name = (data.get("name") or "").strip()
        if not name:
            raise ValidationError("name is required", "name")
        code = data.get("code")
        institution = data.get("institution")
        created = create_class(name=name, code=code, institution=institution)
        if not created:
            raise DatabaseError("Error creating class", "create_class")
        return jsonify({"class": created}), 201
    except (ValidationError,):
        raise
    except Exception as e:
        raise DatabaseError(str(e), "create_class")


@classes_blueprint.route("/list", methods=["GET"])
@token_required
@swag_from(
    {
        "tags": ["classes"],
        "summary": "List all classes",
        "security": [{"BearerAuth": []}],
        "responses": {
            200: {
                "description": "List of classes returned successfully",
                "schema": {
                    "type": "object",
                    "properties": {
                        "classes": {"type": "array", "items": {"type": "object"}}
                    },
                },
            },
            401: {"description": "Not authenticated"},
        },
    }
)
def list_classes_route():
    """List all available classes."""
    res = get_all_classes()
    return jsonify({"classes": res})


@classes_blueprint.route("/<string:class_id>", methods=["GET"])
@token_required
@admin_required
def get_class_route(class_id):
    """Get a class with its students and teachers."""
    try:
        if not class_id:
            raise ValidationError("class_id is required", "class_id")

        from bson import ObjectId

        if not ObjectId.is_valid(class_id):
            raise ValidationError(f"Invalid class_id format: {class_id}", "class_id")

        class_data = get_class_with_users(class_id)
        if not class_data:
            raise NotFoundError("Class", class_id)
        return jsonify({"class": class_data}), 200
    except (ValidationError, NotFoundError):
        raise
    except Exception as e:

        logger.exception("Error in get_class_route")
        raise DatabaseError(f"Error getting class: {str(e)}", "get_class")


@classes_blueprint.route("/assign", methods=["POST"])
@token_required
@admin_required
def assign_user_to_class_route():
    """Assign one or more users to a class."""
    try:
        data = request.json
        if not data:
            raise ValidationError("Request body is required")

        user_ids = data.get("user_ids")
        if not user_ids:
            user_id = data.get("user_id")
            if user_id:
                user_ids = [user_id]

        class_id = data.get("class_id")
        role = data.get(
            "role"
        )

        if not user_ids or not class_id:
            raise ValidationError("user_ids (or user_id) and class_id are required")

        if not isinstance(user_ids, list):
            user_ids = [user_ids]

        user_ids = [uid for uid in user_ids if uid]

        if not user_ids:
            raise ValidationError("At least one user_id is required")

        from bson import ObjectId

        if not ObjectId.is_valid(class_id):
            raise ValidationError(f"Invalid class_id format: {class_id}", "class_id")

        from infrastructure.persistence.service_classes import get_class_by_id

        if not get_class_by_id(class_id):
            raise NotFoundError("Class", class_id)

        success_count = 0
        failed_users = []

        for user_id in user_ids:
            if not ObjectId.is_valid(user_id):
                failed_users.append(user_id)
                continue

            success = assign_user_to_class(user_id, class_id, role=role)
            if success:
                success_count += 1
            else:
                failed_users.append(user_id)

        if success_count == 0:
            raise NotFoundError("Users or Class", str(user_ids))

        response_message = f"{success_count} adicionado(s) com sucesso."
        if failed_users:
            response_message += f" Falha ao adicionar {len(failed_users)} usuário(s)."

        return (
            jsonify(
                {
                    "message": response_message,
                    "success_count": success_count,
                    "failed_count": len(failed_users),
                }
            ),
            200,
        )
    except (ValidationError, NotFoundError):
        raise
    except Exception as e:

        logger.exception("Error in assign_user_to_class_route")
        raise DatabaseError(f"Error assigning user to class: {str(e)}", "assign_user")


@classes_blueprint.route("/remove", methods=["POST"])
@token_required
@admin_required
def remove_user_from_class_route():
    """Remove a user from their class."""
    try:
        data = request.json
        if not data:
            raise ValidationError("Request body is required")

        user_id = data.get("user_id")
        class_id = data.get("class_id")

        if not user_id:
            raise ValidationError("user_id is required")

        success = remove_user_from_class(user_id, class_id)
        if not success:
            raise NotFoundError("User", user_id)

        return jsonify({"message": "Usuário removido da classe com sucesso"}), 200
    except (ValidationError, NotFoundError):
        raise
    except Exception as e:
        raise DatabaseError(f"Erro ao remover usuário da classe: {str(e)}", "remove_user")


@classes_blueprint.route("/users/<string:role>", methods=["GET"])
@token_required
@admin_required
def get_users_by_role_route(role):
    """Get all users by role (student or teacher)."""
    try:
        if role not in ["student", "teacher", "unassigned"]:
            raise ValidationError("role must be 'student', 'teacher' or 'unassigned'")

        users = get_users_by_role(role)
        return jsonify({"users": users}), 200
    except ValidationError:
        raise
    except Exception as e:

        logger.exception("Erro ao obter usuários")
        raise DatabaseError(f"Erro ao obter usuários por papel: {str(e)}", "get_users_by_role")


@classes_blueprint.route("/<string:class_id>/students", methods=["GET"])
@token_required
@swag_from(
    {
        "tags": ["classes"],
        "summary": "Get all students in a class",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {
                "name": "class_id",
                "in": "path",
                "type": "string",
                "required": True,
                "description": "Class ID",
            }
        ],
        "responses": {
            200: {
                "description": "List of students",
                "schema": {
                    "type": "object",
                    "properties": {
                        "students": {"type": "array", "items": {"type": "object"}}
                    },
                },
            },
            400: {"description": "Invalid class ID"},
            401: {"description": "Not authenticated"},
        },
    }
)
def get_students_by_class_route(class_id):
    """Get all students in a specific class (for teachers)."""
    try:
        from bson import ObjectId
        from flask import g

        if not ObjectId.is_valid(class_id):
            raise ValidationError(f"Invalid class_id format: {class_id}", "class_id")

        user_role = getattr(g, "current_user_role", None)
        if user_role not in ["teacher", "admin"]:
            raise ValidationError("Only teachers can view students", "role")

        students = get_students_by_class(class_id)
        return jsonify({"students": students}), 200
    except ValidationError:
        raise
    except Exception as e:

        logger.exception("Error getting students")
        raise DatabaseError(f"Error getting students: {str(e)}", "get_students")


@classes_blueprint.route("/<string:class_id>/teachers", methods=["GET"])
@token_required
@swag_from(
    {
        "tags": ["classes"],
        "summary": "Get all teachers in a class",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {
                "name": "class_id",
                "in": "path",
                "type": "string",
                "required": True,
                "description": "Class ID",
            }
        ],
        "responses": {
            200: {
                "description": "List of teachers",
                "schema": {
                    "type": "object",
                    "properties": {
                        "teachers": {"type": "array", "items": {"type": "object"}}
                    },
                },
            },
            400: {"description": "Invalid class ID"},
            401: {"description": "Not authenticated"},
        },
    }
)
def get_teachers_by_class_route(class_id):
    """Get all teachers in a specific class (for students)."""
    try:
        from bson import ObjectId

        if not ObjectId.is_valid(class_id):
            raise ValidationError(f"Invalid class_id format: {class_id}", "class_id")

        teachers = get_teachers_by_class(class_id)
        return jsonify({"teachers": teachers}), 200
    except ValidationError:
        raise
    except Exception as e:

        logger.exception("Error getting teachers")
        raise DatabaseError(f"Error getting teachers: {str(e)}", "get_teachers")
