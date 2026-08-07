"""
Pytest configuration and fixtures.
Ensures project root and src are on sys.path so app, config, api, domain, services can be imported.
Lazy-loads app only when fixtures that need it are used (avoids import errors for domain-only tests).
"""

import os
import sys
from pathlib import Path

# Set minimal env for tests that load config (JWT, MongoDB, etc.)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-do-not-use-in-production")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017/")
os.environ.setdefault("S3_STORAGE_ENABLED", "false")

_SRC = Path(__file__).resolve().parent.parent
_PROJECT_ROOT = _SRC.parent
for path in (_PROJECT_ROOT, str(_SRC)):
    if path not in sys.path:
        sys.path.insert(0, path)

import pytest


@pytest.fixture
def app():
    """Create Flask app for testing. Lazy import to allow domain-only tests without full app deps."""
    from app import app as flask_app

    flask_app.config["TESTING"] = True
    flask_app.config["DEBUG"] = True
    return flask_app


@pytest.fixture
def client(app):
    """Create test client"""
    return app.test_client()


@pytest.fixture
def mock_db():
    """Mock database connection"""
    from infrastructure.persistence.db_connection import get_db_dla

    return get_db_dla()
