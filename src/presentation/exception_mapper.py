"""
Maps domain/application exceptions to HTTP response (body + status code).
Single place for API boundary error handling.
"""

from typing import Tuple

from domain.exceptions import (
    BadRequestError,
    DatabaseError,
    DomainException,
    NotFoundError,
    UnauthorizedError,
    ValidationError,
)


def domain_exception_to_http(exception: DomainException) -> Tuple[dict, int]:
    """
    Convert a domain exception to (response_dict, status_code).
    Returns Flask-jsonify-compatible dict and HTTP status.
    """
    if isinstance(exception, ValidationError):
        return {
            "error": "Validation Error",
            "message": exception.message,
            "field": getattr(exception, "field", None),
        }, 400
    if isinstance(exception, NotFoundError):
        return {
            "error": "Not Found",
            "message": exception.message,
            "resource": getattr(exception, "resource", None),
        }, 404
    if isinstance(exception, DatabaseError):
        return {
            "error": "Database Error",
            "message": exception.message,
            "operation": getattr(exception, "operation", None),
        }, 500
    if isinstance(exception, UnauthorizedError):
        return {"error": "Unauthorized", "message": exception.message}, 401
    if isinstance(exception, BadRequestError):
        return {"error": "Bad Request", "message": exception.message}, 400
    return {"error": "Error", "message": exception.message}, 500
