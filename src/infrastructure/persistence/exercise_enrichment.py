"""Exercise document enrichment via MongoDB lookups."""

from infrastructure.persistence.db_connection import get_db_dla
from infrastructure.persistence.object_id_utils import to_object_id
from shared.logger import get_logger

logger = get_logger(__name__)


def _db():
    return get_db_dla()


def enrich_exercise_with_task_type(doc: dict) -> dict:
    """Add task_type from dataset to exercise doc."""
    dataset_id = doc.get("dataset")
    if dataset_id:
        try:
            dataset_oid = to_object_id(dataset_id)
            if dataset_oid:
                dataset_doc = _db().datasets.find_one(
                    {"_id": dataset_oid}, {"task_type": 1}
                )
                doc["task_type"] = (
                    (dataset_doc.get("task_type") or "classification")
                    if dataset_doc
                    else "classification"
                )
            else:
                doc["task_type"] = "classification"
        except Exception:
            logger.warning(
                "Failed to enrich exercise with task_type dataset_id=%s",
                dataset_id,
                exc_info=True,
            )
            doc["task_type"] = "classification"
    else:
        doc["task_type"] = "classification"
    return doc
