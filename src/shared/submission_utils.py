"""Pure helpers for submission state."""


def is_submission_finalized(submission: dict) -> bool:
    """Check whether a submission has been finalized."""
    finalized_at = submission.get("finalizedAt")
    finalized_bool = submission.get("finalized", False)
    return (finalized_at is not None and finalized_at != "") or finalized_bool is True
