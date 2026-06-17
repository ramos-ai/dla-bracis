from bson import ObjectId
from flasgger import swag_from
from flask import Blueprint, g, jsonify, request

from application.auth.auth_service import (
    authenticate_user,
    create_user,
    get_all_users,
    get_user_by_id,
    update_user,
)
from domain.exceptions import (
    DatabaseError,
    NotFoundError,
    UnauthorizedError,
    ValidationError,
)
from infrastructure.security.jwt_provider_impl import create_access_token
from presentation.http.dependencies.auth_dependency import (
from shared.logger import get_logger

logger = get_logger(__name__)
    admin_required,
    token_required,
)

auth_blueprint = Blueprint("auth", __name__)


@auth_blueprint.route("/register", methods=["POST", "OPTIONS"])
@swag_from(
    {
        "tags": ["auth"],
        "summary": "Register a new user",
        "parameters": [
            {
                "name": "body",
                "in": "body",
                "required": True,
                "schema": {
                    "type": "object",
                    "required": ["name", "email", "password"],
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "User name (3-100 characters)",
                            "minLength": 3,
                            "maxLength": 100,
                        },
                        "email": {
                            "type": "string",
                            "format": "email",
                            "description": "User email",
                        },
                        "password": {"type": "string", "description": "User password"},
                        "role": {
                            "type": "string",
                            "enum": ["student", "teacher", "admin", "unassigned"],
                            "description": "User role (omit in public registration: defaults to unassigned)",
                            "default": "unassigned",
                        },
                    },
                },
            }
        ],
        "responses": {
            201: {
                "description": "User created successfully",
                "schema": {
                    "type": "object",
                    "properties": {
                        "message": {"type": "string"},
                        "user": {"type": "object"},
                        "access_token": {"type": "string"},
                        "token_type": {"type": "string"},
                    },
                },
            },
            400: {"description": "Validation error"},
            409: {"description": "Email already registered"},
        },
    }
)
def register_route():
    """Register a new user and return JWT token."""
    if request.method == "OPTIONS":
        from flask import make_response

        response = make_response()
        response.headers.add("Access-Control-Allow-Origin", "*")
        response.headers.add(
            "Access-Control-Allow-Headers", "Content-Type, Authorization"
        )
        response.headers.add("Access-Control-Allow-Methods", "POST, OPTIONS")
        response.headers.add("Access-Control-Max-Age", "3600")
        return response, 200

    try:
        data = request.json
        if not data:
            raise ValidationError("Request body is required")

        user = create_user(data)

        token_data = {
            "user_id": user["_id"],
            "email": user["email"],
            "role": user.get("role", "unassigned"),
        }
        access_token = create_access_token(token_data)

        return (
            jsonify(
                {
                    "message": "User created successfully",
                    "user": user,
                    "access_token": access_token,
                    "token_type": "bearer",
                }
            ),
            201,
        )

    except ValidationError as e:
        if "already exists" in str(e):
            return jsonify({"error": "Conflict", "message": str(e)}), 409
        raise
    except Exception as e:
        raise DatabaseError(f"Error registering user: {str(e)}", "register")


@auth_blueprint.route("/login", methods=["POST", "OPTIONS"])
@swag_from(
    {
        "tags": ["auth"],
        "summary": "Authenticate user and return JWT token",
        "parameters": [
            {
                "name": "body",
                "in": "body",
                "required": True,
                "schema": {
                    "type": "object",
                    "required": ["email", "password"],
                    "properties": {
                        "email": {
                            "type": "string",
                            "format": "email",
                            "description": "User email",
                        },
                        "password": {"type": "string", "description": "User password"},
                    },
                },
            }
        ],
        "responses": {
            200: {
                "description": "Login realizado com sucesso",
                "schema": {
                    "type": "object",
                    "properties": {
                        "access_token": {"type": "string"},
                        "token_type": {"type": "string"},
                        "user": {"type": "object"},
                    },
                },
            },
            401: {"description": "Invalid credentials"},
        },
    }
)
def login_route():
    """Authenticate user and return JWT token."""
    if request.method == "OPTIONS":
        from flask import make_response

        response = make_response()
        response.headers.add("Access-Control-Allow-Origin", "*")
        response.headers.add(
            "Access-Control-Allow-Headers", "Content-Type, Authorization"
        )
        response.headers.add("Access-Control-Allow-Methods", "POST, OPTIONS")
        response.headers.add("Access-Control-Max-Age", "3600")
        return response, 200

    try:
        data = request.json
        if not data:
            raise ValidationError("Request body is required")

        email = data.get("email", "").strip()
        password = data.get("password", "")

        if not email or not password:
            raise ValidationError("Email and password are required")

        user = authenticate_user(email, password)

        if not user:
            raise UnauthorizedError("Email ou senha inválidos")

        user_id_str = str(user["_id"])

        token_data = {
            "user_id": user_id_str,
            "email": str(user["email"]),
            "role": str(user.get("role", "unassigned")),
        }
        access_token = create_access_token(token_data)

        user_response = {
            "_id": user_id_str,
            "name": str(user.get("name", "")),
            "email": str(user.get("email", "")),
            "role": str(user.get("role", "unassigned")),
            "classId": str(user.get("classId")) if user.get("classId") else None,
            "classIds": (
                user.get("classIds")
                if isinstance(user.get("classIds"), list)
                else ([user["classId"]] if user.get("classId") else [])
            ),
            "is_active": bool(user.get("is_active", True)),
            "contact_info": user.get("contact_info", ""),
            "profile_image_id": user.get("profile_image_id"),
        }

        return (
            jsonify(
                {
                    "access_token": access_token,
                    "token_type": "bearer",
                    "user": user_response,
                }
            ),
            200,
        )

    except (ValidationError, UnauthorizedError):
        raise
    except Exception as e:

        logger.exception("Error in login_route")
        raise DatabaseError(f"Error during login: {str(e)}", "login")


@auth_blueprint.route("/me", methods=["GET"])
@token_required
@swag_from(
    {
        "tags": ["auth"],
        "summary": "Get authenticated user information",
        "security": [{"BearerAuth": []}],
        "responses": {
            200: {
                "description": "User information",
                "schema": {
                    "type": "object",
                    "properties": {"user": {"type": "object"}},
                },
            },
            401: {"description": "Not authenticated"},
        },
    }
)
def get_current_user_route():
    """Return authenticated user information."""
    try:
        user_id = g.current_user_id
        user = get_user_by_id(user_id)

        if not user:
            raise NotFoundError("User", user_id)

        return jsonify({"user": user}), 200
    except NotFoundError:
        raise
    except Exception as e:
        raise DatabaseError(f"Error getting user: {str(e)}", "get_current_user")


@auth_blueprint.route("/get_user/<string:id>", methods=["GET"])
@token_required
@swag_from(
    {
        "tags": ["auth"],
        "summary": "Get a user by ID",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {
                "name": "id",
                "in": "path",
                "type": "string",
                "required": True,
                "description": "User ID",
            }
        ],
        "responses": {
            200: {"description": "User found"},
            404: {"description": "User not found"},
            401: {"description": "Not authenticated"},
        },
    }
)
def get_user_route(id):
    """Get a user by ID (requires authentication)."""
    try:
        if not ObjectId.is_valid(id):
            raise ValidationError("Invalid user ID", "id")

        user = get_user_by_id(id)
        if not user:
            raise NotFoundError("User", id)

        return jsonify(user), 200
    except (ValidationError, NotFoundError):
        raise
    except Exception as e:
        raise DatabaseError(f"Error getting user: {str(e)}", "get_user")


@auth_blueprint.route("/users", methods=["GET"])
@token_required
@admin_required
@swag_from(
    {
        "tags": ["auth"],
        "summary": "List all users (admin only)",
        "security": [{"BearerAuth": []}],
        "responses": {
            200: {
                "description": "List of users",
                "schema": {
                    "type": "object",
                    "properties": {
                        "users": {"type": "array", "items": {"type": "object"}}
                    },
                },
            },
            401: {"description": "Not authenticated"},
            403: {"description": "Access denied - admin required"},
        },
    }
)
def list_users_route():
    """List all users (admin only)."""
    try:
        users = get_all_users()
        return jsonify({"users": users}), 200
    except Exception as e:
        raise DatabaseError(f"Error listing users: {str(e)}", "list_users")


@auth_blueprint.route("/update", methods=["PUT"])
@token_required
@swag_from(
    {
        "tags": ["auth"],
        "summary": "Update the authenticated user",
        "security": [{"BearerAuth": []}],
        "parameters": [
            {
                "name": "body",
                "in": "body",
                "required": True,
                "schema": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "User name"},
                        "email": {
                            "type": "string",
                            "format": "email",
                            "description": "User email",
                        },
                        "role": {
                            "type": "string",
                            "enum": ["student", "teacher", "admin"],
                            "description": "User role",
                        },
                        "contact_info": {
                            "type": "string",
                            "description": "Contact information (max 500 chars)",
                        },
                        "profile_image_id": {
                            "type": "string",
                            "description": "GridFS file ID for profile image",
                        },
                    },
                },
            }
        ],
        "responses": {
            200: {"description": "User updated successfully"},
            400: {"description": "Validation error"},
            401: {"description": "Not authenticated"},
            404: {"description": "User not found"},
        },
    }
)
def update_current_user_route():
    """Update the authenticated user."""
    try:
        user_id = g.current_user_id
        data = request.json

        if not data:
            raise ValidationError("Request body is required")

        if hasattr(g, "current_user_role") and g.current_user_role != "admin":
            if "role" in data:
                del data["role"]

        user = update_user(user_id, data)
        return jsonify({"message": "User updated successfully", "user": user}), 200

    except (ValidationError, NotFoundError):
        raise
    except Exception as e:
        raise DatabaseError(f"Error updating user: {str(e)}", "update_user")


@auth_blueprint.route("/profile-image", methods=["POST"])
@token_required
@swag_from(
    {
        "tags": ["auth"],
        "summary": "Upload profile image (teacher only)",
        "security": [{"BearerAuth": []}],
        "consumes": ["multipart/form-data"],
        "parameters": [
            {
                "name": "file",
                "in": "formData",
                "type": "file",
                "required": True,
                "description": "Profile image file (jpg, png, gif, webp - max 5MB)",
            }
        ],
        "responses": {
            200: {
                "description": "Profile image uploaded successfully",
                "schema": {
                    "type": "object",
                    "properties": {
                        "message": {"type": "string"},
                        "profile_image_id": {"type": "string"},
                        "user": {"type": "object"},
                    },
                },
            },
            400: {"description": "Validation error"},
            401: {"description": "Not authenticated"},
            403: {"description": "Only teachers can upload profile images"},
        },
    }
)
def upload_profile_image_route():
    """Upload profile image for the authenticated teacher."""
    try:
        user_id = g.current_user_id
        user_role = getattr(g, "current_user_role", None)

        if user_role not in ["teacher", "admin", "student"]:
            raise ValidationError("Only teachers and students can upload profile images", "role")

        if "file" not in request.files:
            raise ValidationError("No file provided", "file")

        file = request.files["file"]
        if file.filename == "":
            raise ValidationError("No file selected", "file")

        allowed_extensions = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
        filename_lower = file.filename.lower()
        if not any(filename_lower.endswith(ext) for ext in allowed_extensions):
            raise ValidationError(
                "Invalid file type. Allowed: jpg, png, gif, webp", "file"
            )

        file.seek(0, 2)
        size = file.tell()
        file.seek(0)
        max_size = 5 * 1024 * 1024  # 5MB
        if size > max_size:
            raise ValidationError("File too large. Maximum size is 5MB", "file")

        from werkzeug.utils import secure_filename

        from infrastructure.storage.gridfs_storage_impl import upload_image_on_grid_fs

        filename = secure_filename(file.filename)
        file_id = upload_image_on_grid_fs(file, f"profile_{user_id}_{filename}")

        user = update_user(user_id, {"profile_image_id": str(file_id)})

        return (
            jsonify(
                {
                    "message": "Profile image uploaded successfully",
                    "profile_image_id": str(file_id),
                    "user": user,
                }
            ),
            200,
        )

    except ValidationError:
        raise
    except Exception as e:
        raise DatabaseError(f"Error uploading profile image: {str(e)}", "profile_image")


@auth_blueprint.route("/profile-image", methods=["DELETE"])
@token_required
@swag_from(
    {
        "tags": ["auth"],
        "summary": "Delete profile image",
        "security": [{"BearerAuth": []}],
        "responses": {
            200: {"description": "Profile image deleted successfully"},
            401: {"description": "Not authenticated"},
        },
    }
)
def delete_profile_image_route():
    """Delete profile image for the authenticated user."""
    try:
        user_id = g.current_user_id
        user = update_user(user_id, {"profile_image_id": None})

        return (
            jsonify({"message": "Profile image deleted successfully", "user": user}),
            200,
        )

    except (ValidationError, NotFoundError):
        raise
    except Exception as e:
        raise DatabaseError(f"Error deleting profile image: {str(e)}", "profile_image")
