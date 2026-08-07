"""
MongoDB configuration from environment.
Required: MONGODB_URI or (MONGODB_HOST + MONGODB_PORT).
"""

import os

from infrastructure.config._env_helpers import optional

MONGODB_URI = os.getenv("MONGODB_URI")
MONGODB_HOST = os.getenv("MONGODB_HOST")
MONGODB_PORT_STR = os.getenv("MONGODB_PORT")

if MONGODB_URI:
    MONGODB_URL = MONGODB_URI.strip()
elif MONGODB_HOST:
    MONGODB_URL = f"mongodb://{MONGODB_HOST}:{int(MONGODB_PORT_STR or '27017')}/"
else:
    raise ValueError(
        "Set either MONGODB_URI or MONGODB_HOST in .env (see .env.example)."
    )

MONGODB_DB_NAME = os.getenv("MONGODB_DATABASE", "datalabellingapp")
MONGODB_MEDIAS_DB = optional("MONGODB_MEDIAS_DB", "medias")
MONGODB_MAX_POOL_SIZE = optional("MONGODB_MAX_POOL_SIZE", 50)
MONGODB_MIN_POOL_SIZE = optional("MONGODB_MIN_POOL_SIZE", 10)
MONGODB_SERVER_SELECTION_TIMEOUT_MS = optional(
    "MONGODB_SERVER_SELECTION_TIMEOUT_MS", 5000
)
MONGODB_RETRY_WRITES = os.getenv("MONGODB_RETRY_WRITES", "true").lower() in (
    "true",
    "1",
    "yes",
)
