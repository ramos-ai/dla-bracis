"""
Application configuration from environment.
JWT, Flask, CORS, and other app-level settings.
"""

import os

from infrastructure.config._env_helpers import optional, require

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
require(
    "JWT_SECRET_KEY",
    JWT_SECRET_KEY,
    "Used to sign tokens; if default, anyone can forge JWTs.",
)
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = optional("ACCESS_TOKEN_EXPIRE_MINUTES", 1440)

FLASK_ENV = optional("FLASK_ENV", "production")
PORT = optional("PORT", 5000)
CORS_ORIGINS = (os.getenv("CORS_ORIGINS") or "*").strip()
MAX_CONTENT_LENGTH_MB = optional("MAX_CONTENT_LENGTH_MB", 25)
KAGGLE_ENCRYPTION_KEY = os.getenv("KAGGLE_ENCRYPTION_KEY")
