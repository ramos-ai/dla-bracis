"""
Use case: save teacher manual correction for a detection submission.
"""

from bson import ObjectId

from domain.evaluation import calculate_detection_score
from infrastructure.persistence.object_id_utils import to_object_id
from shared.date_utils import utc_now
from shared.logger import get_logger

from ._shared import get_db, get_exercise_dict_by_id

logger = get_logger(__name__)


def save_manual_correction(
    exercise_id: str,
    user_id: str,
    manual_corrections: dict,
    teacher_id: str,
) -> dict:
    """
    Save teacher manual correction for a detection submission.
    manual_corrections: dict of manual corrections per image:
        { 'media_id': {'student_annotation_idx': True/False, ...}, ... }
    Returns dict with success, message, manualScore?, percentageScore?.
    """
    try:
        dla = get_db()
        submissions_collection = dla.exercises_submissions
        coco_collection = dla.coco_annotations

        user_oid = to_object_id(user_id)
        exercise_oid = to_object_id(exercise_id)

        query = {
            "$or": [
                {"userId": user_oid, "exerciseId": exercise_oid},
                {"userId": user_id, "exerciseId": exercise_id},
                {"userId": user_oid, "exerciseId": exercise_id},
                {"userId": user_id, "exerciseId": exercise_oid},
            ]
        }
        submission = submissions_collection.find_one(query)
        if not submission:
            return {"success": False, "message": "Submission not found"}

        exercise = get_exercise_dict_by_id(exercise_id)
        if not exercise:
            return {"success": False, "message": "Exercise not found"}

        dataset_id = exercise.get("dataset")
        if not dataset_id:
            return {"success": False, "message": "Exercise has no dataset"}

        labelled_answers = submission.get("labelledAnswers", [])
        if not labelled_answers:
            return {"success": False, "message": "No labelled answers found"}

        total_correct = 0.0
        total_possible = 0

        for answer in labelled_answers:
            media_id = answer.get("mediaId")
            if not media_id:
                continue

            correct_data = coco_collection.find_one(
                {"dataset_id": str(dataset_id), "file_id": str(media_id)}
            )
            if not correct_data:
                dataset_oid = (
                    ObjectId(dataset_id)
                    if isinstance(dataset_id, str) and ObjectId.is_valid(dataset_id)
                    else dataset_id
                )
                media_oid = (
                    ObjectId(media_id)
                    if isinstance(media_id, str) and ObjectId.is_valid(media_id)
                    else media_id
                )
                correct_data = coco_collection.find_one(
                    {"dataset_id": dataset_oid, "file_id": media_oid}
                )
            correct_annotations = (
                correct_data.get("annotations", []) if correct_data else []
            )
            total_possible += len(correct_annotations)

            image_corrections = manual_corrections.get(str(media_id), {})
            student_annotations = answer.get("annotations", [])

            if image_corrections:
                for idx_str, is_correct in image_corrections.items():
                    if isinstance(is_correct, bool) and is_correct:
                        total_correct += 1
            else:
                if student_annotations and correct_annotations:
                    iou_threshold = exercise.get("iou_threshold", 0.85)
                    detection_score_mode = exercise.get(
                        "detection_score_mode", "recall"
                    )
                    image_score = calculate_detection_score(
                        student_annotations,
                        correct_annotations,
                        iou_threshold=iou_threshold,
                        score_mode=detection_score_mode,
                    )
                    total_correct += (image_score / 100.0) * len(correct_annotations)

        percentage_score = (
            (total_correct / total_possible * 100.0) if total_possible > 0 else 0.0
        )
        exercise_weight = float(exercise.get("score", 100.0))
        manual_score = (percentage_score / 100.0) * exercise_weight

        update_data = {
            "manualCorrections": manual_corrections,
            "manualScore": round(manual_score, 2),
            "manualCorrectionBy": teacher_id,
            "manualCorrectionAt": utc_now(),
        }
        update_query = {
            "$or": [
                {"userId": user_oid, "exerciseId": exercise_oid},
                {"userId": user_id, "exerciseId": exercise_id},
                {"userId": user_oid, "exerciseId": exercise_id},
                {"userId": user_id, "exerciseId": exercise_oid},
            ]
        }
        result = submissions_collection.update_one(
            update_query,
            {"$set": update_data},
        )

        if result.modified_count > 0:
            _notify_student_manual_correction(
                user_id, exercise_id, exercise, submission, manual_score, teacher_id
            )
            return {
                "success": True,
                "message": "Manual correction saved successfully",
                "manualScore": round(manual_score, 2),
                "percentageScore": round(percentage_score, 2),
            }
        return {"success": False, "message": "Failed to update submission"}
    except Exception as e:
        return {"success": False, "message": f"Error: {str(e)}"}


def _notify_student_manual_correction(
    user_id: str,
    exercise_id: str,
    exercise: dict,
    submission: dict,
    manual_score: float,
    teacher_id: str,
):
    """Create notification action for the student."""
    try:
        from application.auth.auth_service import get_user_by_id
        from infrastructure.persistence.service_actions import save_action

        exercise_title = exercise.get("title", "Exercício")
        teacher_name = "Professor"
        try:
            teacher_user = get_user_by_id(teacher_id)
            if teacher_user:
                teacher_name = teacher_user.get("name", "Professor")
        except Exception:
            logger.warning(
                "Failed to fetch teacher name teacher_id=%s", teacher_id, exc_info=True
            )
        action_description = (
            f"Seu exercício '{exercise_title}' foi re-corrigido manualmente pelo professor {teacher_name}. "
            f"Nova nota: {round(manual_score, 2)}"
        )
        save_action(
            user_id=str(user_id),
            action_type="exercise_manually_corrected",
            description=action_description,
            metadata={
                "exercise_id": str(exercise_id),
                "exercise_title": exercise_title,
                "original_score": submission.get("supervisedScore"),
                "manual_score": round(manual_score, 2),
                "teacher_id": str(teacher_id),
                "correction_type": "manual",
            },
        )
    except Exception:
        logger.warning(
            "Failed to notify student of manual correction user_id=%s exercise_id=%s",
            user_id,
            exercise_id,
            exc_info=True,
        )
