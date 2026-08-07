"""
Use case: export all submissions with exercise/dataset info for download.
"""

from shared.date_utils import utc_now

from application.auth.auth_service import get_user_by_id

from ._shared import get_db


def get_responses_export(
    dataset_ids=None,
    task_type=None,
    include_labelled=True,
    include_unlabelled=True,
) -> dict:
    """
    Build export payload of all submissions with exercise/dataset info.
    Only includes submissions whose exercise belongs to a dataset in dataset_ids (if provided)
    and whose dataset task_type matches task_type (if provided).
    Returns dict suitable for JSON export.
    """
    dla = get_db()
    submissions_collection = dla.exercises_submissions
    exercises_collection = dla.exercises
    datasets_collection = dla.datasets

    exercises_by_id = {}
    for ex in exercises_collection.find():
        eid = str(ex["_id"])
        exercises_by_id[eid] = {
            "dataset": str(ex["dataset"]) if ex.get("dataset") else None,
            "title": ex.get("title", ""),
        }

    datasets_by_id = {}
    for ds in datasets_collection.find():
        did = str(ds["_id"])
        datasets_by_id[did] = {
            "name": ds.get("dataset_name", ""),
            "task_type": ds.get("task_type") or "classification",
        }

    dataset_ids_set = (
        set(str(d) for d in dataset_ids)
        if dataset_ids and len(dataset_ids) > 0
        else None
    )
    filter_task_type = (
        str(task_type).strip().lower() if task_type and str(task_type).strip() else None
    )

    by_dataset = {}
    for sub in submissions_collection.find():
        sub = dict(sub)
        sub["_id"] = str(sub["_id"])
        exercise_id = sub.get("exerciseId")
        if not exercise_id:
            continue
        ex_info = exercises_by_id.get(str(exercise_id))
        if not ex_info:
            continue
        dataset_id = ex_info.get("dataset")
        if not dataset_id:
            continue
        ds_info = datasets_by_id.get(str(dataset_id))
        if not ds_info:
            continue
        if dataset_ids_set is not None and dataset_id not in dataset_ids_set:
            continue
        if (
            filter_task_type
            and (ds_info.get("task_type") or "classification") != filter_task_type
        ):
            continue
        if not include_labelled and "labelledAnswers" in sub:
            sub = {k: v for k, v in sub.items() if k != "labelledAnswers"}
        if not include_unlabelled and "unlabelledAnswers" in sub:
            sub = {k: v for k, v in sub.items() if k != "unlabelledAnswers"}
        try:
            user = get_user_by_id(sub.get("userId"))
            sub["studentName"] = user.get("name", "") if user else ""
            sub["studentEmail"] = user.get("email", "") if user else ""
        except Exception:
            sub["studentName"] = ""
            sub["studentEmail"] = ""
        sub["exerciseTitle"] = ex_info.get("title", "")
        sub["dataset_id"] = dataset_id
        sub["dataset_name"] = ds_info.get("name", "")
        sub["task_type"] = ds_info.get("task_type", "classification")
        if dataset_id not in by_dataset:
            by_dataset[dataset_id] = {
                "dataset_id": dataset_id,
                "dataset_name": ds_info.get("name", ""),
                "task_type": ds_info.get("task_type", "classification"),
                "submissions": [],
            }
        by_dataset[dataset_id]["submissions"].append(sub)

    return {
        "exportedAt": utc_now().isoformat().replace("+00:00", "Z"),
        "filters": {
            "dataset_ids": list(dataset_ids_set) if dataset_ids_set else None,
            "task_type": filter_task_type,
            "includeLabelled": include_labelled,
            "includeUnlabelled": include_unlabelled,
        },
        "data": list(by_dataset.values()),
    }
