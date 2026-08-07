"""Analytics computations for the teacher dashboard (matrices, trends, insights)."""

import statistics
from collections import defaultdict

from shared.logger import get_logger

from ._report_queries import (
    DISCARDED_LABEL,
    UNKNOWN_LABEL,
    empty_confusion_matrix,
    find_labelled_reference,
    parse_submission_date,
    score_to_percentage,
    submissions_for_exercise,
    week_start_key,
)
from ._shared import get_db

logger = get_logger(__name__)


def calculate_confusion_matrix(exercises: list, submissions: list) -> dict:
    try:
        labelled_collection = get_db().labelled
        all_labels: set[str] = set()
        predictions: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

        for exercise in exercises:
            dataset_id = exercise.get("dataset")
            if not dataset_id:
                continue

            exercise_id = str(exercise["_id"])
            exercise_submissions = submissions_for_exercise(
                submissions, exercise_id, exercise["_id"]
            )

            for submission in exercise_submissions:
                _accumulate_confusion_pairs(
                    submission,
                    dataset_id,
                    labelled_collection,
                    all_labels,
                    predictions,
                )

        return _build_confusion_matrix(all_labels, predictions)
    except Exception:
        return empty_confusion_matrix()


def _accumulate_confusion_pairs(
    submission: dict,
    dataset_id: str,
    labelled_collection,
    all_labels: set[str],
    predictions: dict,
) -> None:
    for answer in submission.get("labelledAnswers", []):
        media_id = answer.get("mediaId")
        student_labels = answer.get("labels", [])
        if not media_id or not student_labels:
            continue

        correct_data = find_labelled_reference(labelled_collection, dataset_id, str(media_id))
        if not correct_data or "labels" not in correct_data:
            continue

        correct_labels = correct_data["labels"]
        predicted = student_labels[0] if student_labels else UNKNOWN_LABEL
        actual = correct_labels[0] if correct_labels else UNKNOWN_LABEL

        all_labels.add(predicted)
        all_labels.add(actual)
        predictions[actual][predicted] += 1


def _build_confusion_matrix(all_labels: set[str], predictions: dict) -> dict:
    if not all_labels:
        return empty_confusion_matrix()

    labels_list = sorted(all_labels)
    matrix = []
    total = 0

    for actual in labels_list:
        row = []
        for predicted in labels_list:
            count = predictions[actual][predicted]
            row.append(count)
            total += count
        matrix.append(row)

    return {"labels": labels_list, "matrix": matrix, "total": total}


def calculate_student_evolution(
    submissions: list, max_scores: dict[str, float]
) -> list:
    try:
        weekly_scores: dict[str, list[float]] = defaultdict(list)

        for submission in submissions:
            pct = _submission_percentage(submission, max_scores)
            if pct is None:
                continue

            submitted_at = submission.get("submittedAt") or submission.get("finalizedAt")
            date = parse_submission_date(submitted_at)
            if date is None:
                continue

            weekly_scores[week_start_key(date)].append(pct)

        if not weekly_scores:
            return []

        evolution = [
            {
                "week": week_key,
                "average": round(sum(scores) / len(scores), 1),
                "count": len(scores),
            }
            for week_key, scores in sorted(weekly_scores.items())
        ]
        return evolution[-8:]
    except Exception:
        return []


def _submission_percentage(submission: dict, max_scores: dict[str, float]) -> float | None:
    raw_score = submission.get("supervisedScore")
    if raw_score is None:
        return None

    exercise_id = str(submission.get("exerciseId"))
    max_score = max_scores.get(exercise_id, 100.0) or 100.0
    return score_to_percentage(raw_score, max_score)


def calculate_label_distribution(exercises: list, submissions: list) -> list:
    try:
        label_counts: dict[str, int] = defaultdict(int)

        for exercise in exercises:
            exercise_id = str(exercise["_id"])
            exercise_submissions = submissions_for_exercise(
                submissions, exercise_id, exercise["_id"]
            )

            for submission in exercise_submissions:
                for answer in submission.get("labelledAnswers", []):
                    for label in answer.get("labels", []):
                        if label and label != DISCARDED_LABEL:
                            label_counts[label] += 1

        if not label_counts:
            return []

        sorted_labels = sorted(label_counts.items(), key=lambda x: x[1], reverse=True)[:10]
        return [{"label": label, "count": count} for label, count in sorted_labels]
    except Exception:
        return []


def calculate_label_performance(confusion_matrix: dict) -> list:
    try:
        labels = confusion_matrix.get("labels", [])
        matrix = confusion_matrix.get("matrix", [])
        if not labels or not matrix:
            return []

        performance = []
        for index, label in enumerate(labels):
            correct = matrix[index][index] if index < len(matrix[index]) else 0
            total = sum(matrix[index]) if index < len(matrix) else 0
            score = (correct / total * 100) if total > 0 else 0
            performance.append(
                {
                    "label": label,
                    "score": round(score, 1),
                    "total": total,
                    "correct": correct,
                }
            )

        performance.sort(key=lambda item: item["score"], reverse=True)
        return performance
    except Exception:
        return []


def generate_insights(
    exercises_stats: list,
    percentages: list[float],
    confusion_matrix: dict,
    label_distribution: list,
    student_evolution: list,
    total_submissions: int,
    total_finalized: int,
) -> list:
    insights: list[dict] = []

    try:
        insights.extend(_completion_insights(total_submissions, total_finalized))
        insights.extend(_exercise_score_insights(exercises_stats))
        insights.extend(_confusion_insights(confusion_matrix))
        insights.extend(_evolution_insights(student_evolution))
        insights.extend(_label_balance_insights(label_distribution))
        insights.extend(_performance_distribution_insights(percentages))
    except Exception:
        logger.exception("Failed to generate dashboard insights")

    return _top_insights_by_severity(insights, limit=5)


def _completion_insights(total_submissions: int, total_finalized: int) -> list:
    if total_submissions <= 0:
        return []

    completion_rate = (total_finalized / total_submissions) * 100
    if completion_rate < 30:
        return [
            {
                "type": "error",
                "severity": "critical",
                "title": "Taxa de conclusão muito baixa",
                "description": (
                    f"Apenas {completion_rate:.1f}% das submissões foram finalizadas. "
                    "Isso pode indicar problemas sérios de engajamento ou dificuldade."
                ),
                "icon": "alert",
            }
        ]

    if completion_rate < 50:
        return [
            {
                "type": "warning",
                "severity": "high",
                "title": "Taxa de conclusão baixa",
                "description": (
                    f"Apenas {completion_rate:.1f}% das submissões foram finalizadas. "
                    "Considere verificar se os exercícios estão muito difíceis."
                ),
                "icon": "alert",
            }
        ]

    return []


def _exercise_score_insights(exercises_stats: list) -> list:
    low_score = [
        exercise
        for exercise in exercises_stats
        if exercise["average_score"] < 40 and exercise["total_submissions"] >= 3
    ]
    if low_score:
        names = _truncate_titles(low_score[:2])
        return [
            {
                "type": "error",
                "severity": "high",
                "title": "Exercícios com baixo desempenho",
                "description": (
                    f"Os exercícios '{names}' têm média abaixo de 40%. "
                    "Considere revisar o conteúdo ou fornecer material de apoio."
                ),
                "icon": "target",
            }
        ]

    medium_score = [
        exercise
        for exercise in exercises_stats
        if 40 <= exercise["average_score"] < 60 and exercise["total_submissions"] >= 3
    ]
    if not medium_score:
        return []

    names = _truncate_titles(medium_score[:2])
    return [
        {
            "type": "warning",
            "severity": "medium",
            "title": "Exercícios com desempenho moderado",
            "description": (
                f"Os exercícios '{names}' têm média entre 40-60%. "
                "Pode haver espaço para melhorias."
            ),
            "icon": "target",
        }
    ]


def _confusion_insights(confusion_matrix: dict) -> list:
    labels = confusion_matrix.get("labels") or []
    matrix = confusion_matrix.get("matrix") or []
    total = confusion_matrix.get("total", 0)
    if total <= 10 or not labels or not matrix:
        return []

    confused_pair, max_confusion = _most_common_confusion(labels, matrix)
    if confused_pair is None or max_confusion < 3:
        return []

    pct = (max_confusion / total) * 100
    severity = "high" if pct >= 20 else "medium" if pct >= 10 else "low"
    actual, predicted = confused_pair
    return [
        {
            "type": "info",
            "severity": severity,
            "title": "Confusão frequente detectada",
            "description": (
                f"'{actual}' é frequentemente confundido com '{predicted}' "
                f"({pct:.1f}% dos casos). Considere reforçar as diferenças entre essas classes."
            ),
            "icon": "grid",
        }
    ]


def _most_common_confusion(labels: list, matrix: list) -> tuple[tuple[str, str] | None, int]:
    max_confusion = 0
    confused_pair = None

    for row_index, actual in enumerate(labels):
        for col_index, predicted in enumerate(labels):
            if row_index == col_index:
                continue
            count = matrix[row_index][col_index]
            if count > max_confusion:
                max_confusion = count
                confused_pair = (actual, predicted)

    return confused_pair, max_confusion


def _evolution_insights(student_evolution: list) -> list:
    if len(student_evolution) < 3:
        return []

    recent = student_evolution[-3:]
    if _is_monotonic_increasing(recent):
        diff = recent[-1]["average"] - recent[0]["average"]
        return [
            {
                "type": "success",
                "severity": "low",
                "title": "Tendência positiva",
                "description": (
                    f"A média dos alunos está em crescimento nas últimas semanas (+{diff:.1f}%), "
                    f"passando de {recent[0]['average']:.1f}% para {recent[-1]['average']:.1f}%."
                ),
                "icon": "trending",
            }
        ]

    if not _is_monotonic_decreasing(recent):
        return []

    diff = recent[0]["average"] - recent[-1]["average"]
    if diff > 10:
        return [
            {
                "type": "error",
                "severity": "high",
                "title": "Queda significativa no desempenho",
                "description": (
                    f"A média dos alunos caiu {diff:.1f}% nas últimas semanas. "
                    "Ação urgente recomendada."
                ),
                "icon": "trending",
            }
        ]

    if diff > 5:
        return [
            {
                "type": "warning",
                "severity": "medium",
                "title": "Queda no desempenho",
                "description": (
                    f"A média dos alunos caiu {diff:.1f}% nas últimas semanas. "
                    "Considere revisar o conteúdo recente."
                ),
                "icon": "trending",
            }
        ]

    return []


def _is_monotonic_increasing(points: list) -> bool:
    return all(points[i]["average"] <= points[i + 1]["average"] for i in range(len(points) - 1))


def _is_monotonic_decreasing(points: list) -> bool:
    return all(points[i]["average"] >= points[i + 1]["average"] for i in range(len(points) - 1))


def _label_balance_insights(label_distribution: list) -> list:
    if len(label_distribution) < 2:
        return []

    max_count = label_distribution[0]["count"]
    min_count = label_distribution[-1]["count"]
    if max_count <= 0 or min_count <= 0:
        return []

    ratio = max_count / min_count
    if ratio > 10:
        return [
            {
                "type": "warning",
                "severity": "medium",
                "title": "Desbalanceamento severo de classes",
                "description": (
                    f"A classe '{label_distribution[0]['label']}' tem {ratio:.1f}x mais amostras "
                    f"que '{label_distribution[-1]['label']}'. "
                    "Isso pode afetar significativamente o aprendizado."
                ),
                "icon": "chart",
            }
        ]

    if ratio > 5:
        return [
            {
                "type": "info",
                "severity": "low",
                "title": "Desbalanceamento de classes",
                "description": (
                    f"A classe '{label_distribution[0]['label']}' tem {ratio:.1f}x mais amostras "
                    f"que '{label_distribution[-1]['label']}'."
                ),
                "icon": "chart",
            }
        ]

    return []


def _performance_distribution_insights(percentages: list[float]) -> list:
    if not percentages:
        return []

    insights = []
    high_performers = sum(1 for pct in percentages if pct >= 90)
    low_performers = sum(1 for pct in percentages if pct < 40)

    if high_performers > 0:
        pct_high = (high_performers / len(percentages)) * 100
        if pct_high >= 30:
            insights.append(
                {
                    "type": "success",
                    "severity": "low",
                    "title": "Excelente desempenho geral",
                    "description": (
                        f"{pct_high:.1f}% das submissões têm nota acima de 90%. "
                        "Os alunos estão dominando o conteúdo!"
                    ),
                    "icon": "star",
                }
            )
        elif pct_high >= 15:
            insights.append(
                {
                    "type": "success",
                    "severity": "low",
                    "title": "Bom desempenho",
                    "description": f"{pct_high:.1f}% das submissões têm nota acima de 90%.",
                    "icon": "star",
                }
            )

    if len(percentages) >= 5:
        try:
            if statistics.variance(percentages) > 800:
                insights.append(
                    {
                        "type": "warning",
                        "severity": "medium",
                        "title": "Alta variação nas notas",
                        "description": (
                            "Há grande dispersão nas notas dos alunos. "
                            "Alguns podem precisar de atenção individual."
                        ),
                        "icon": "chart",
                    }
                )
        except Exception:
            logger.warning(
                "Failed to compute performance distribution insight", exc_info=True
            )

    if low_performers > 0:
        pct_low = (low_performers / len(percentages)) * 100
        if pct_low >= 40:
            insights.append(
                {
                    "type": "error",
                    "severity": "critical",
                    "title": "Muitos alunos com dificuldade",
                    "description": (
                        f"{pct_low:.1f}% das submissões têm nota abaixo de 40%. "
                        "Considere revisar o conteúdo ou oferecer suporte adicional."
                    ),
                    "icon": "alert",
                }
            )

    return insights


def _truncate_titles(exercises: list, max_len: int = 20) -> str:
    names = []
    for exercise in exercises:
        title = exercise["title"]
        if len(title) > max_len:
            names.append(f"{title[:max_len]}...")
        else:
            names.append(title)
    return ", ".join(names)


def _top_insights_by_severity(insights: list, limit: int) -> list:
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    insights.sort(key=lambda item: severity_order.get(item.get("severity", "low"), 3))
    return insights[:limit]
