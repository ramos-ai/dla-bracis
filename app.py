import sys
from pathlib import Path
from uuid import uuid4

_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(_ROOT / "src"))

from flasgger import Swagger
from flask import Flask, g, jsonify, request
from flask_cors import CORS

from domain.exceptions import (
    BadRequestError,
    DatabaseError,
    NotFoundError,
    UnauthorizedError,
    ValidationError,
)
from infrastructure.cache import init_cache
from infrastructure.config.config import config
from presentation.exception_mapper import domain_exception_to_http
from presentation.http.routes.actions import actions_blueprint
from presentation.http.routes.auth import auth_blueprint
from presentation.http.routes.classes import classes_blueprint
from presentation.http.routes.coco import coco_blueprint
from presentation.http.routes.datasets import datasets_blueprint
from presentation.http.routes.exercises import exercises_blueprint
from presentation.http.routes.export_routes import export_blueprint
from presentation.http.routes.gridfs import gridfs_blueprint
from presentation.http.routes.kaggle_routes import kaggle_blueprint
from presentation.http.routes.medias import medias_blueprint
from presentation.http.routes.reports import reports_blueprint
from presentation.http.routes.segmentation import segmentation_blueprint
from presentation.http.routes.student_stats import student_stats_blueprint
from presentation.http.routes.tasks import tasks_blueprint
from shared.logger import configure_app_logging

app = Flask(__name__)

init_cache(app)


@app.before_request
def set_request_id():
    g.request_id = request.headers.get("X-Request-ID") or uuid4().hex


configure_app_logging(app)

try:
    from prometheus_flask_exporter import PrometheusMetrics

    metrics = PrometheusMetrics(app, path="/metrics")
except ImportError:
    metrics = None

try:
    from flask_limiter import Limiter
    from flask_limiter.util import get_remote_address

    limiter = Limiter(
        app=app,
        key_func=get_remote_address,
        default_limits=["1000 per minute"],
        storage_uri="memory://",
    )
except ImportError:
    limiter = None

app.config["JSON_SORT_KEYS"] = False
app.config["MAX_CONTENT_LENGTH"] = config.max_content_length_bytes

_cors_origins_list = (
    [o.strip() for o in config.cors_origins.split(",") if o.strip()]
    if config.cors_origins != "*"
    else "*"
)
CORS(
    app,
    resources={r"/*": {"origins": _cors_origins_list}},
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
    expose_headers=["Content-Type", "Authorization"],
    supports_credentials=False,
    max_age=3600,
)


@app.errorhandler(413)
def handle_request_entity_too_large(_e):
    return (
        jsonify(
            {
                "error": "Request Entity Too Large",
                "message": "Upload exceeds the maximum allowed size (25MB per image). Send one image at a time or reduce the file size.",
            }
        ),
        413,
    )


@app.errorhandler(429)
def handle_rate_limit_exceeded(_e):
    return (
        jsonify(
            {
                "error": "Too Many Requests",
                "message": "Rate limit exceeded. Please slow down and try again later.",
            }
        ),
        429,
    )


@app.errorhandler(ValidationError)
def handle_validation_error(e):
    body, status = domain_exception_to_http(e)
    return jsonify(body), status


@app.errorhandler(NotFoundError)
def handle_not_found_error(e):
    body, status = domain_exception_to_http(e)
    return jsonify(body), status


@app.errorhandler(DatabaseError)
def handle_database_error(e):
    body, status = domain_exception_to_http(e)
    return jsonify(body), status


@app.errorhandler(UnauthorizedError)
def handle_unauthorized_error(e):
    body, status = domain_exception_to_http(e)
    return jsonify(body), status


@app.errorhandler(BadRequestError)
def handle_bad_request_error(e):
    body, status = domain_exception_to_http(e)
    return jsonify(body), status


@app.errorhandler(ValueError)
def handle_value_error(e):
    return jsonify({"error": "Validation Error", "message": str(e)}), 400


@app.errorhandler(Exception)
def handle_generic_error(e):
    return (
        jsonify(
            {
                "error": "Internal Server Error",
                "message": str(e) if app.debug else "An unexpected error occurred",
            }
        ),
        500,
    )


app.register_blueprint(auth_blueprint, url_prefix="/api/auth")
app.register_blueprint(gridfs_blueprint, url_prefix="/api/gridfs")
app.register_blueprint(datasets_blueprint, url_prefix="/api/dataset")
app.register_blueprint(medias_blueprint, url_prefix="/api")
app.register_blueprint(classes_blueprint, url_prefix="/api/classes")
app.register_blueprint(exercises_blueprint, url_prefix="/api/exercises")
app.register_blueprint(reports_blueprint, url_prefix="/api/reports")
app.register_blueprint(coco_blueprint, url_prefix="/api/coco")
app.register_blueprint(segmentation_blueprint, url_prefix="/api/segmentation")
app.register_blueprint(export_blueprint, url_prefix="/api/export")
app.register_blueprint(actions_blueprint, url_prefix="/api/actions")
app.register_blueprint(student_stats_blueprint, url_prefix="/api/student")
app.register_blueprint(kaggle_blueprint, url_prefix="/api/kaggle")
app.register_blueprint(tasks_blueprint, url_prefix="/api/tasks")

if limiter is not None:
    for rule in app.url_map.iter_rules():
        ep = rule.endpoint or ""
        if "auth" in ep and ("login" in ep or "register" in ep):
            app.view_functions[ep] = limiter.limit("10 per minute")(
                app.view_functions[ep]
            )
        elif "gridfs" in ep and ("upload" in ep or "upload_images" in ep):
            app.view_functions[ep] = limiter.limit("2000 per hour")(
                app.view_functions[ep]
            )


@app.route("/api/health/live", methods=["GET"])
def health_live():
    """Liveness: app process is up. Always 200. Use this for Docker/K8s liveness."""
    return jsonify({"status": "ok"}), 200


@app.route("/api/health", methods=["GET"])
def health():
    """Readiness: MongoDB, MinIO (when S3 enabled), and Redis. Returns 503 if any dependency is down."""
    from infrastructure.health import ping_minio, ping_redis
    from infrastructure.persistence.db_connection import ping_mongodb

    mongodb_ok = ping_mongodb()
    minio_ok = ping_minio()
    redis_ok = ping_redis()
    all_ok = mongodb_ok and minio_ok and redis_ok
    status = "ok" if all_ok else "degraded"
    response_data = {
        "status": status,
        "mongodb": "ok" if mongodb_ok else "error",
        "minio": "ok" if minio_ok else "error",
        "redis": "ok" if redis_ok else "error",
    }
    return jsonify(response_data), 200 if all_ok else 503


swagger_config = {
    "headers": [],
    "specs": [
        {
            "endpoint": "apispec",
            "route": "/apispec.json",
            "rule_filter": lambda rule: True,
            "model_filter": lambda tag: True,
        }
    ],
    "static_url_path": "/flasgger_static",
    "swagger_ui": True,
    "specs_route": "/api-docs",
}

swagger_template = {
    "swagger": "2.0",
    "info": {
        "title": "Data Labelling App API",
        "description": "Data Labelling App (DLA) — pedagogical image annotation API",
        "version": "1.0.0",
        "contact": {"name": "API Support"},
    },
    "basePath": "/api",
    "securityDefinitions": {
        "BearerAuth": {
            "type": "apiKey",
            "name": "Authorization",
            "in": "header",
            "description": 'JWT Authorization header using the Bearer scheme. Example: "Authorization: Bearer {token}"',
        }
    },
    "tags": [
        {"name": "auth", "description": "Authentication and user operations"},
        {"name": "datasets", "description": "Dataset operations"},
        {"name": "exercises", "description": "Exercise operations"},
        {"name": "medias", "description": "Media/image operations"},
        {"name": "classes", "description": "Class operations"},
        {"name": "gridfs", "description": "GridFS file storage operations"},
        {"name": "reports", "description": "Error report operations"},
        {"name": "coco", "description": "COCO format annotation operations"},
        {"name": "kaggle", "description": "Kaggle integration operations"},
    ],
}

swagger = Swagger(app, config=swagger_config, template=swagger_template)


@app.route("/", methods=["GET", "OPTIONS"])
def root():
    """Root endpoint - redirects to API documentation"""
    if request.method == "OPTIONS":
        response = jsonify({})
        response.headers.add("Access-Control-Allow-Origin", "*")
        response.headers.add(
            "Access-Control-Allow-Headers", "Content-Type, Authorization"
        )
        response.headers.add(
            "Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS"
        )
        return response, 200

    return (
        jsonify(
            {
                "message": "Data Labelling App API",
                "version": "1.0.0",
                "documentation": "/api-docs",
                "status": "running",
            }
        ),
        200,
    )


if __name__ == "__main__":
    debug_mode = config.flask_env == "development"
    app.run(host="0.0.0.0", port=config.port, debug=debug_mode)
