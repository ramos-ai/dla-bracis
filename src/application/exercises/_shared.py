"""
Shared helpers for exercise use cases. No business logic, only data shape and DB access.
"""

from infrastructure.persistence.exercise_enrichment import enrich_exercise_with_task_type
from infrastructure.persistence.db_connection import get_db_dla
from infrastructure.persistence.object_id_utils import to_object_id
from shared.submission_utils import is_submission_finalized


def get_db():
    return get_db_dla()


def _convert_objectid_fields(doc: dict) -> dict:
    """Convert ObjectId fields to strings for JSON serialization."""
    from bson import ObjectId

    if doc is None:
        return doc
    for key in list(doc.keys()):
        if isinstance(doc[key], ObjectId):
            doc[key] = str(doc[key])
    return doc


def get_exercise_dict_by_id(exercise_id: str) -> dict | None:
    """Return exercise as dict or None. Internal use only."""
    exercise_oid = to_object_id(exercise_id)
    if exercise_oid is None:
        return None
    dla = get_db()
    exercise = dla.exercises.find_one({"_id": exercise_oid})
    if exercise is None:
        return None
    return _convert_objectid_fields(exercise)


def normalize_submission(submission: dict) -> dict:
    """Normalize a submission to standard format."""
    submission = _convert_objectid_fields(submission)
    if "supervisedScore" not in submission:
        submission["supervisedScore"] = None
    submission["isFinalized"] = is_submission_finalized(submission)
    if "manualScore" in submission and submission["manualScore"] is not None:
        submission["finalScore"] = submission["manualScore"]
        submission["hasManualCorrection"] = True
    else:
        submission["finalScore"] = submission.get("supervisedScore")
        submission["hasManualCorrection"] = False
    return submission
