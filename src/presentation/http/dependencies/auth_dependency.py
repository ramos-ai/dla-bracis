"""
Auth dependency: get current user from request, protect routes with decorators.
Uses infrastructure.security.jwt_provider for JWT.
"""

from functools import wraps

from flask import g, jsonify, request

from domain.exceptions import UnauthorizedError
from infrastructure.security.jwt_provider_impl import (
    decode_access_token,
    get_token_from_header,
)


def get_current_user_id() -> str:
    """Return current user id from g (set by @token_required). Raises UnauthorizedError if missing."""
    if not hasattr(g, "current_user_id") or not g.current_user_id:
        raise UnauthorizedError("User ID not found in token")
    return g.current_user_id


def token_required(f):
    """Decorator: require valid JWT; set g.current_user_id, g.current_user_email, g.current_user_role."""

    @wraps(f)
    def decorated(*args, **kwargs):
        if request.method == "OPTIONS":
            r = jsonify({})
            r.headers.add("Access-Control-Allow-Origin", "*")
            r.headers.add("Access-Control-Allow-Headers", "Content-Type, Authorization")
            r.headers.add(
                "Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS"
            )
            return r, 200
        auth_header = request.headers.get("Authorization")
        try:
            token = get_token_from_header(auth_header)
            payload = decode_access_token(token)
            g.current_user_id = payload.get("user_id")
            g.current_user_email = payload.get("email")
            g.current_user_role = payload.get("role", "unassigned")
        except UnauthorizedError as e:
            return jsonify({"error": "Unauthorized", "message": str(e)}), 401
        return f(*args, **kwargs)

    return decorated


def admin_required(f):
    """Decorator: require admin role (use after @token_required)."""

    @wraps(f)
    def decorated(*args, **kwargs):
        if not hasattr(g, "current_user_role"):
            return (
                jsonify(
                    {"error": "Unauthorized", "message": "Authentication required"}
                ),
                401,
            )
        if g.current_user_role != "admin":
            return (
                jsonify({"error": "Forbidden", "message": "Admin access required"}),
                403,
            )
        return f(*args, **kwargs)

    return decorated


def teacher_or_admin_required(f):
    """Decorator: require teacher or admin role (use after @token_required)."""

    @wraps(f)
    def decorated(*args, **kwargs):
        if not hasattr(g, "current_user_role"):
            return (
                jsonify(
                    {"error": "Unauthorized", "message": "Authentication required"}
                ),
                401,
            )
        if g.current_user_role not in ("teacher", "admin"):
            return (
                jsonify(
                    {
                        "error": "Forbidden",
                        "message": "Teacher or admin access required",
                    }
                ),
                403,
            )
        return f(*args, **kwargs)

    return decorated


def assigned_role_required(f):
    """Decorator: require assigned role (student, teacher or admin). Rejects unassigned."""

    @wraps(f)
    def decorated(*args, **kwargs):
        if not hasattr(g, "current_user_role"):
            return (
                jsonify(
                    {"error": "Unauthorized", "message": "Authentication required"}
                ),
                401,
            )
        if g.current_user_role == "unassigned":
            return (
                jsonify(
                    {
                        "error": "Forbidden",
                        "message": "Please wait for the administrator to assign you a role to use the system",
                    }
                ),
                403,
            )
        return f(*args, **kwargs)

    return decorated
