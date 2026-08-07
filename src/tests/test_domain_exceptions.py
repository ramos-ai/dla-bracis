"""Tests for domain exceptions."""

from domain.exceptions import (
    BadRequestError,
    DatabaseError,
    DomainException,
    NotFoundError,
    UnauthorizedError,
    ValidationError,
)


class TestDomainException:
    def test_base_message(self):
        e = DomainException("test message")
        assert str(e) == "test message"
        assert e.message == "test message"

    def test_inheritance(self):
        assert issubclass(ValidationError, DomainException)
        assert issubclass(NotFoundError, DomainException)
        assert issubclass(DatabaseError, DomainException)
        assert issubclass(UnauthorizedError, DomainException)
        assert issubclass(BadRequestError, DomainException)


class TestValidationError:
    def test_message_only(self):
        e = ValidationError("invalid value")
        assert str(e) == "invalid value"
        assert e.field is None

    def test_message_with_field(self):
        e = ValidationError("invalid value", field="email")
        assert str(e) == "invalid value"
        assert e.field == "email"


class TestNotFoundError:
    def test_resource_only(self):
        e = NotFoundError("User")
        assert "User" in str(e)
        assert e.identifier is None

    def test_resource_with_id(self):
        e = NotFoundError("Exercise", "507f1f77bcf86cd799439011")
        assert "Exercise" in str(e)
        assert "507f1f77bcf86cd799439011" in str(e)
        assert e.identifier == "507f1f77bcf86cd799439011"


class TestDatabaseError:
    def test_message_only(self):
        e = DatabaseError("connection failed")
        assert str(e) == "connection failed"
        assert e.operation is None

    def test_message_with_operation(self):
        e = DatabaseError("update failed", operation="save_exercise")
        assert str(e) == "update failed"
        assert e.operation == "save_exercise"


class TestUnauthorizedError:
    def test_default_message(self):
        e = UnauthorizedError()
        assert str(e) == "Unauthorized"

    def test_custom_message(self):
        e = UnauthorizedError("Access denied")
        assert str(e) == "Access denied"


class TestBadRequestError:
    def test_message(self):
        e = BadRequestError("Malformed JSON")
        assert str(e) == "Malformed JSON"
