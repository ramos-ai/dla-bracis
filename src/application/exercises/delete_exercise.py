"""
Use case: delete an exercise and all its submissions. Only the author (teacher) or admin can delete.
"""


from application.exercises._shared import get_db, get_exercise_dict_by_id
from domain.exceptions import NotFoundError, UnauthorizedError
from infrastructure.persistence.object_id_utils import to_object_id


def delete_exercise(
    exercise_id: str, current_user_id: str, current_user_role: str
) -> dict:
    """
    Delete exercise and all its submissions. Allowed only if current user is the exercise author or admin.
    Returns {"success": True, "deleted_submissions": int} or raises NotFoundError / UnauthorizedError.
    """
    exercise_oid = to_object_id(exercise_id)
    if not exercise_oid:
        raise NotFoundError("Exercise", exercise_id or "invalid")

    exercise = get_exercise_dict_by_id(exercise_id)
    if not exercise:
        raise NotFoundError("Exercise", exercise_id)

    author_id = exercise.get("user_id")
    author_id = str(author_id).strip() if author_id else ""

    is_admin = (current_user_role or "").lower() == "admin"
    is_author = author_id and str(current_user_id) == str(author_id)
    if not is_admin and not is_author:
        raise UnauthorizedError(
            "Apenas o autor do exercício ou um administrador pode excluí-lo."
        )

    dla = get_db()

    deleted_submissions = dla.exercises_submissions.delete_many(
        {"$or": [{"exerciseId": exercise_oid}, {"exerciseId": exercise_id}]}
    ).deleted_count
    result = dla.exercises.delete_one({"_id": exercise_oid})
    if result.deleted_count == 0:
        raise NotFoundError("Exercise", exercise_id)

    return {"success": True, "deleted_submissions": deleted_submissions}
