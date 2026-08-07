"""
Use case: create or update an exercise.
"""

from datetime import datetime

from flask import jsonify

from infrastructure.persistence.object_id_utils import to_object_id

from ._shared import get_db


def save_exercise(req: dict, edit: bool = False):
    """Create or update exercise. Returns (response_tuple, exercise_id_or_none)."""
    exercise = req
    dla = get_db()
    exercise_collection = dla.exercises

    class_oid = to_object_id(exercise.get("class"))
    dataset_oid = to_object_id(exercise.get("dataset"))
    user_oid = to_object_id(exercise.get("user_id"))

    if edit:
        exercise_oid = to_object_id(exercise["_id"])
        filter_criteria = {"_id": exercise_oid}
        data_to_update = {
            "last_update": datetime.now(),
            "title": exercise["title"],
            "didactic_detailing": exercise["didactic_detailing"],
            "do_date": exercise["do_date"],
            "class": class_oid if class_oid else exercise["class"],
            "score": exercise["score"],
            "dataset": dataset_oid if dataset_oid else exercise["dataset"],
            "user_id": user_oid if user_oid else exercise["user_id"],
            "whole_dataset": exercise["whole_dataset"],
        }
        if exercise.get("supervised_practice") and len(exercise["supervised_practice"]):
            data_to_update["supervised_practice"] = exercise["supervised_practice"]
            data_to_update["unsupervised_practice"] = exercise["unsupervised_practice"]
        if "iou_threshold" in exercise:
            data_to_update["iou_threshold"] = exercise["iou_threshold"]
        if "detection_score_mode" in exercise:
            data_to_update["detection_score_mode"] = exercise["detection_score_mode"]
        if "segmentation_iou_threshold" in exercise:
            data_to_update["segmentation_iou_threshold"] = exercise[
                "segmentation_iou_threshold"
            ]
        if "segmentation_score_mode" in exercise:
            data_to_update["segmentation_score_mode"] = exercise[
                "segmentation_score_mode"
            ]

        exercise_collection.update_one(filter_criteria, {"$set": data_to_update})
        return jsonify({"Message": "Update success!"}), None

    exercise_doc = {
        "created_at": datetime.now(),
        "last_update": datetime.now(),
        "didactic_detailing": exercise["didactic_detailing"],
        "title": exercise["title"],
        "do_date": exercise["do_date"],
        "class": class_oid if class_oid else exercise["class"],
        "score": exercise["score"],
        "dataset": dataset_oid if dataset_oid else exercise["dataset"],
        "user_id": user_oid if user_oid else exercise["user_id"],
        "whole_dataset": exercise["whole_dataset"],
        "supervised_practice": exercise["supervised_practice"],
        "unsupervised_practice": exercise["unsupervised_practice"],
    }
    if "iou_threshold" in exercise:
        exercise_doc["iou_threshold"] = exercise["iou_threshold"]
    if "detection_score_mode" in exercise:
        exercise_doc["detection_score_mode"] = exercise["detection_score_mode"]
    if "segmentation_iou_threshold" in exercise:
        exercise_doc["segmentation_iou_threshold"] = exercise[
            "segmentation_iou_threshold"
        ]
    if "segmentation_score_mode" in exercise:
        exercise_doc["segmentation_score_mode"] = exercise["segmentation_score_mode"]

    result = exercise_collection.insert_one(exercise_doc)
    return jsonify(
        {"Message": "Insert success!", "exercise_id": str(result.inserted_id)}
    ), str(result.inserted_id)
