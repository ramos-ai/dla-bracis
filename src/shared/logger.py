"""
Structured logging for observability. request_id is injected from Flask g when in request context.
"""

import logging
import sys

LOG_FORMAT = (
    "%(asctime)s | %(levelname)s | %(name)s | request_id=%(request_id)s | %(message)s"
)


class RequestIdFilter(logging.Filter):
    """Inject request_id from Flask g into log record."""

    def filter(self, record):
        try:
            from flask import g, has_request_context

            record.request_id = (
                getattr(g, "request_id", "-") if has_request_context() else "-"
            )
        except Exception:
            record.request_id = "-"
        return True


def configure_app_logging(app=None):
    """Attach request_id filter and formatter to root logger. Call after creating Flask app."""
    root = logging.getLogger()
    if not root.handlers:
        h = logging.StreamHandler(sys.stderr)
        h.setFormatter(logging.Formatter(LOG_FORMAT, datefmt="%Y-%m-%dT%H:%M:%S"))
        h.addFilter(RequestIdFilter())
        root.addHandler(h)
        root.setLevel(logging.INFO)


def get_logger(name: str) -> logging.Logger:
    """Return a logger. request_id is injected by RequestIdFilter when configured via configure_app_logging."""
    return logging.getLogger(name)
