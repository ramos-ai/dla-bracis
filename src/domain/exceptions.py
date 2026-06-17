"""
Domain and application-level exceptions.
Only the API layer should map these to HTTP responses.
"""


class DomainException(Exception):
    """Base exception for domain and application errors."""

    def __init__(self, message: str):
        self.message = message
        super().__init__(self.message)


class ValidationError(DomainException):
    """Raised when validation fails."""

    def __init__(self, message: str, field: str | None = None, code: str | None = None):
        self.field = field
        self.code = code or field
        super().__init__(message)


class NotFoundError(DomainException):
    """Raised when a resource is not found."""

    def __init__(self, resource: str, identifier: str | None = None):
        self.resource = resource
        self.identifier = identifier
        message = f"{resource} not found" + (
            f" with id: {identifier}" if identifier else ""
        )
        super().__init__(message)


class DatabaseError(DomainException):
    """Raised when a database operation fails."""

    def __init__(self, message: str, operation: str | None = None):
        self.operation = operation
        super().__init__(message)


class UnauthorizedError(DomainException):
    """Raised when user is not authorized."""

    def __init__(self, message: str = "Unauthorized"):
        super().__init__(message)


class BadRequestError(DomainException):
    """Raised when a bad request is made."""

    def __init__(self, message: str):
        super().__init__(message)
