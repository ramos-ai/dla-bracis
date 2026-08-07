"""Kaggle credential use cases."""

from application.kaggle.kaggle_provider import get_kaggle_service


def save_kaggle_credentials(user_id: str, username: str, api_key: str) -> None:
    get_kaggle_service().save_credentials(user_id, username, api_key)


def validate_kaggle_credentials(user_id: str) -> bool:
    return get_kaggle_service().validate_credentials(user_id)


def check_has_credentials(user_id: str) -> bool:
    return get_kaggle_service().has_credentials(user_id)


def delete_kaggle_credentials(user_id: str) -> bool:
    return get_kaggle_service().delete_credentials(user_id)
