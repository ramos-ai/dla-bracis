"""
Use case: calculate supervised practice score (classification, detection, segmentation).
"""

from domain.evaluation import (
    calculate_classification_score,
    calculate_detection_score,
    calculate_segmentation_score,
)
from infrastructure.persistence.labelled_queries import find_labelled_reference
from infrastructure.persistence.object_id_utils import to_object_id
from shared.logger import get_logger

from ._shared import get_db

logger = get_logger(__name__)


def calculate_supervised_score(
    labelled_answers: list,
    dataset_id: str,
    iou_threshold: float = 0.85,
    detection_score_mode: str = "recall",
    segmentation_iou_threshold: float = 0.75,
    segmentation_score_mode: str = "recall",
    supervised_media_ids: list = None,
) -> float:
    """
    Calculate supervised practice score by comparing student answers with correct dataset answers.

    supervised_media_ids: media IDs for supervised practice; when set, unanswered images count as 0.
    When None, only images present in labelled_answers are scored.

    Returns score from 0 to 100.
    """
    try:
        answers_by_media = _index_answers_by_media(labelled_answers)
        media_ids = _media_ids_to_score(answers_by_media, supervised_media_ids)
        if not media_ids:
            return 0.0

        task_type = _get_dataset_task_type(dataset_id)
        if task_type == "segmentation":
            return _score_segmentation(
                dataset_id,
                media_ids,
                answers_by_media,
                segmentation_iou_threshold,
                segmentation_score_mode,
            )

        if _is_detection(task_type, answers_by_media, media_ids):
            return _score_detection(
                dataset_id,
                media_ids,
                answers_by_media,
                iou_threshold,
                detection_score_mode,
            )

        return _score_classification(dataset_id, media_ids, answers_by_media)
    except Exception:
        logger.exception(
            "Failed to calculate supervised score dataset_id=%s", dataset_id
        )
        return 0.0


def _index_answers_by_media(labelled_answers: list | None) -> dict[str, dict]:
    answers_by_media: dict[str, dict] = {}
    for answer in labelled_answers or []:
        media_id = answer.get("mediaId")
        if media_id is not None:
            answers_by_media[str(media_id)] = answer
    return answers_by_media


def _media_ids_to_score(
    answers_by_media: dict[str, dict],
    supervised_media_ids: list | None,
) -> list[str]:
    if supervised_media_ids:
        return [str(media_id) for media_id in supervised_media_ids]
    return list(answers_by_media.keys())


def _get_dataset_task_type(dataset_id: str) -> str:
    dataset_oid = to_object_id(dataset_id)
    if dataset_oid is None:
        return "classification"

    dataset_doc = get_db().datasets.find_one({"_id": dataset_oid})
    if not dataset_doc:
        return "classification"

    return dataset_doc.get("task_type") or "classification"


def _is_detection(
    task_type: str,
    answers_by_media: dict[str, dict],
    media_ids: list[str],
) -> bool:
    if task_type == "detection":
        return True
    return any("annotations" in answers_by_media.get(media_id, {}) for media_id in media_ids)


def _mean_rounded(total_score: float, count: int) -> float:
    if count <= 0:
        return 0.0
    return round(total_score / count, 2)


def _score_segmentation(
    dataset_id: str,
    media_ids: list[str],
    answers_by_media: dict[str, dict],
    iou_threshold: float,
    score_mode: str,
) -> float:
    total_score = 0.0
    for media_id in media_ids:
        try:
            total_score += _segmentation_image_score(
                dataset_id,
                media_id,
                answers_by_media.get(media_id, {}),
                iou_threshold,
                score_mode,
            )
        except Exception:
            logger.warning(
                "Segmentation score failed dataset_id=%s media_id=%s",
                dataset_id,
                media_id,
                exc_info=True,
            )
    return _mean_rounded(total_score, len(media_ids))


def _segmentation_image_score(
    dataset_id: str,
    media_id: str,
    answer: dict,
    iou_threshold: float,
    score_mode: str,
) -> float:
    from infrastructure.persistence.service_segmentation import get_segmentation_by_media

    student_annotations = answer.get("annotations", [])
    ref_data = get_segmentation_by_media(str(dataset_id), str(media_id))
    correct_annotations = ref_data.get("annotations", []) if ref_data else []

    if not student_annotations and correct_annotations:
        return 0.0
    if not student_annotations or not correct_annotations:
        return 0.0

    return calculate_segmentation_score(
        student_annotations,
        correct_annotations,
        iou_threshold=iou_threshold,
        score_mode=score_mode,
    )


def _score_detection(
    dataset_id: str,
    media_ids: list[str],
    answers_by_media: dict[str, dict],
    iou_threshold: float,
    score_mode: str,
) -> float:
    coco_collection = get_db().coco_annotations
    total_score = 0.0

    for media_id in media_ids:
        try:
            total_score += _detection_image_score(
                coco_collection,
                dataset_id,
                media_id,
                answers_by_media.get(media_id, {}),
                iou_threshold,
                score_mode,
            )
        except Exception:
            logger.warning(
                "Detection score failed dataset_id=%s media_id=%s",
                dataset_id,
                media_id,
                exc_info=True,
            )

    return _mean_rounded(total_score, len(media_ids))


def _detection_image_score(
    collection,
    dataset_id: str,
    media_id: str,
    answer: dict,
    iou_threshold: float,
    score_mode: str,
) -> float:
    student_annotations = answer.get("annotations", [])
    correct_data = _find_coco_reference(collection, dataset_id, media_id)
    correct_annotations = correct_data.get("annotations", []) if correct_data else []

    if not student_annotations or not correct_annotations:
        return 0.0

    return calculate_detection_score(
        student_annotations,
        correct_annotations,
        iou_threshold=iou_threshold,
        score_mode=score_mode,
    )


def _find_coco_reference(collection, dataset_id: str, file_id: str) -> dict | None:
    doc = collection.find_one(
        {"dataset_id": str(dataset_id), "file_id": str(file_id)}
    )
    if doc:
        return doc

    dataset_oid = to_object_id(dataset_id)
    file_oid = to_object_id(file_id)
    if dataset_oid is None or file_oid is None:
        return None

    return collection.find_one({"dataset_id": dataset_oid, "file_id": file_oid})


def _score_classification(
    dataset_id: str,
    media_ids: list[str],
    answers_by_media: dict[str, dict],
) -> float:
    labelled_collection = get_db().labelled
    correct_count = 0

    for media_id in media_ids:
        try:
            answer = answers_by_media.get(media_id, {})
            student_labels = set(answer.get("labels", []))
            correct_data = find_labelled_reference(labelled_collection, dataset_id, media_id)
            if _is_classification_match(student_labels, correct_data):
                correct_count += 1
        except Exception:
            logger.warning(
                "Classification score failed dataset_id=%s media_id=%s",
                dataset_id,
                media_id,
                exc_info=True,
            )
            continue

    return _mean_rounded(correct_count * 100.0, len(media_ids))


def _is_classification_match(student_labels: set, correct_data: dict | None) -> bool:
    if not correct_data:
        return not student_labels

    if "labels" not in correct_data:
        return not student_labels

    correct_labels = set(correct_data["labels"])
    return calculate_classification_score(student_labels, correct_labels) == 100.0
