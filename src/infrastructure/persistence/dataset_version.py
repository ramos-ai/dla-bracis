"""Dataset version increment persistence."""

from infrastructure.persistence.db_connection import get_db_dla
from infrastructure.persistence.object_id_utils import to_object_id
from shared.date_utils import utc_now


def _db():
    return get_db_dla()


def increment_dataset_version(dataset_id: str) -> bool:
    """
    Increment dataset version by 1.
    Call when annotations, images, or other dataset content changes.

    Returns True if version was incremented, False if dataset not found.
    """
    oid = to_object_id(dataset_id)
    if oid is None:
        return False
    result = _db().datasets.update_one(
        {"_id": oid},
        {"$set": {"updated_at": utc_now()}, "$inc": {"version": 1}},
    )
    return result.matched_count > 0
