"""Dataset use cases: list, get, create, update, delete, labels. All DB access is here (Clean Architecture)."""

from datetime import datetime, timezone

from application.auth.auth_service import get_user_by_id
from domain.exceptions import NotFoundError, ValidationError
from infrastructure.persistence.dataset_version import increment_dataset_version
from infrastructure.persistence.db_connection import get_db_dla
from infrastructure.persistence.object_id_utils import (
    doc_to_json_serializable,
    docs_to_json_serializable,
    to_object_id,
)


def list_datasets(
    class_id: str | None = None,
    user_id: str | None = None,
    user_role: str | None = None,
    page: int | None = None,
    per_page: int | None = None,
):
    """
    List datasets based on role:
    - Admin: all datasets (optionally filtered by class)
    - Teacher: only datasets THEY created that are used in exercises of the selected class
    - Student: datasets used in exercises of their class (from any teacher)
    Returns list of dicts with _id as str. If page and per_page are set (>= 1), returns only that page and total count.
    """
    db = get_db_dla()
    datasets_collection = db.datasets
    exercises_collection = db.exercises

    if user_role == "admin" and not class_id:
        datasets = list(datasets_collection.find())
        return _paginate_list(docs_to_json_serializable(datasets), page, per_page)

    if not user_id:
        return _paginate_list([], page, per_page)

    user = get_user_by_id(user_id)
    if not user:
        return _paginate_list([], page, per_page)

    user_oid = to_object_id(user_id)

    if user_role == "admin" and class_id:
        class_oid = to_object_id(class_id)
        if class_oid:
            exercises = list(
                exercises_collection.find(
                    {"$or": [{"class": class_oid}, {"class": class_id}]}, {"dataset": 1}
                )
            )
            dataset_ids = [to_object_id(ex["dataset"]) for ex in exercises if ex.get("dataset")]
            dataset_ids = [d for d in dataset_ids if d is not None]
            if dataset_ids:
                datasets = list(datasets_collection.find({"_id": {"$in": dataset_ids}}))
            else:
                datasets = []
            return _paginate_list(docs_to_json_serializable(datasets), page, per_page)
        return _paginate_list([], page, per_page)

    if user_role == "student":
        student_class_id = user.get("classId") or user.get("class_id")
        if student_class_id:
            class_oid = to_object_id(student_class_id)
            exercises = list(
                exercises_collection.find(
                    {"$or": [{"class": class_oid}, {"class": student_class_id}]},
                    {"dataset": 1},
                )
            )
            dataset_ids = [to_object_id(ex["dataset"]) for ex in exercises if ex.get("dataset")]
            dataset_ids = [d for d in dataset_ids if d is not None]
            if dataset_ids:
                datasets = list(datasets_collection.find({"_id": {"$in": dataset_ids}}))
            else:
                datasets = []
            return _paginate_list(docs_to_json_serializable(datasets), page, per_page)
        return _paginate_list([], page, per_page)

    if user_role == "teacher":
        query = {"$or": [{"user_id": user_oid}, {"user_id": user_id}]} if user_oid else {"user_id": user_id}
        datasets = list(datasets_collection.find(query))
        return _paginate_list(docs_to_json_serializable(datasets), page, per_page)

    return _paginate_list([], page, per_page)


def _paginate_list(items: list, page: int | None, per_page: int | None):
    """If page and per_page valid, return (items_slice, total). Else return (items, None, None, None)."""
    if page is None or per_page is None or page < 1 or per_page < 1:
        return (items, None, None, None)
    per_page = min(per_page, 100)
    total = len(items)
    start = (page - 1) * per_page
    slice_items = items[start : start + per_page]
    return (slice_items, total, page, per_page)


def get_dataset_by_id(dataset_id: str):
    """Return dataset dict or None. _id is string."""
    oid = to_object_id(dataset_id)
    if oid is None:
        return None
    db = get_db_dla()
    doc = db.datasets.find_one({"_id": oid})
    return doc_to_json_serializable(doc)


def get_dataset_labels(dataset_id: str):
    """Return labels list for dataset or None if not found. Raises nothing."""
    oid = to_object_id(dataset_id)
    if oid is None:
        return None
    db = get_db_dla()
    doc = db.datasets.find_one({"_id": oid}, {"labels": 1})
    if not doc or "labels" not in doc:
        return None
    return doc["labels"]


def create_dataset(
    dataset_name: str,
    description: str,
    task_type: str,
    labels: list,
    user_id: str,
    visibility: str,
) -> str:
    """Create dataset with version 1. Returns inserted_id as str."""
    db = get_db_dla()
    now = datetime.now(timezone.utc)
    user_oid = to_object_id(user_id)
    result = db.datasets.insert_one(
        {
            "dataset_name": dataset_name,
            "description": description,
            "task_type": task_type,
            "labels": labels,
            "user_id": user_oid if user_oid else user_id,
            "visibility": visibility,
            "version": 1,
            "created_at": now,
            "updated_at": now,
        }
    )
    return str(result.inserted_id)


def update_dataset(dataset_id: str, data: dict, user_id: str) -> None:
    """Update dataset and increment version. Raises NotFoundError, ValidationError (permission)."""
    db = get_db_dla()
    oid = to_object_id(dataset_id)
    if oid is None:
        raise NotFoundError("Dataset", dataset_id)
    existing = db.datasets.find_one({"_id": oid})
    if not existing:
        raise NotFoundError("Dataset", dataset_id)
    user = get_user_by_id(user_id)
    is_admin = user and user.get("role") == "admin"
    owner_id = str(existing.get("user_id")) if existing.get("user_id") else None
    if owner_id != str(user_id) and not is_admin:
        raise ValidationError(
            "Você não tem permissão para editar este dataset. Apenas o criador pode editá-lo.",
            "permission",
        )
    data["updated_at"] = datetime.now(timezone.utc)
    db.datasets.update_one(
        {"_id": oid},
        {"$set": data, "$inc": {"version": 1}},
    )


def update_dataset_labels(dataset_id: str, labels: list) -> None:
    """Update dataset labels and increment version. Raises NotFoundError if dataset not found."""
    db = get_db_dla()
    oid = to_object_id(dataset_id)
    if oid is None:
        raise NotFoundError("Dataset", dataset_id)
    result = db.datasets.update_one(
        {"_id": oid},
        {"$set": {"labels": labels, "updated_at": datetime.now(timezone.utc)}, "$inc": {"version": 1}},
    )
    if result.matched_count == 0:
        raise NotFoundError("Dataset", dataset_id)


def delete_dataset(dataset_id: str) -> int:
    """Delete dataset and all exercises that use it. Returns deleted_exercises_count."""
    db = get_db_dla()
    oid = to_object_id(dataset_id)
    if oid is None:
        raise NotFoundError("Dataset", dataset_id)
    doc = db.datasets.find_one({"_id": oid})
    if not doc:
        raise NotFoundError("Dataset", dataset_id)

    exercises_count = db.exercises.count_documents(
        {"$or": [{"dataset": oid}, {"dataset": dataset_id}]}
    )
    
    db.exercises.delete_many({"$or": [{"dataset": oid}, {"dataset": dataset_id}]})
    db.datasets.delete_one({"_id": oid})
    return exercises_count
