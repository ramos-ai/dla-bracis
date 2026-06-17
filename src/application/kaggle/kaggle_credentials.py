"""Encrypted Kaggle credential storage and retrieval."""

from typing import Tuple

from domain.exceptions import ValidationError
from infrastructure.persistence.repositories.kaggle_credentials_repository import (
    KaggleCredentialsRepository,
)
from infrastructure.security.encryption_service import (
    decrypt_credential,
    encrypt_credential,
    is_encryption_configured,
)


class KaggleCredentialsManager:
    """Manages per-user Kaggle API credentials."""

    def __init__(self, repository: KaggleCredentialsRepository | None = None):
        self._repo = repository or KaggleCredentialsRepository()

    def save(self, user_id: str, username: str, api_key: str) -> None:
        if not is_encryption_configured():
            raise ValidationError(
                "Kaggle integration not configured. Contact administrator.",
                "ENCRYPTION_NOT_CONFIGURED",
            )
        if not username or not api_key:
            raise ValidationError(
                "Username and API key are required.",
                "INVALID_CREDENTIALS",
            )

        username_enc = encrypt_credential(username)
        api_key_enc = encrypt_credential(api_key)
        if not self._repo.upsert(user_id, username_enc, api_key_enc):
            raise ValidationError("Failed to save credentials.", "SAVE_FAILED")

    def has_credentials(self, user_id: str) -> bool:
        return self._repo.has_credentials(user_id)

    def delete(self, user_id: str) -> bool:
        return self._repo.delete_by_user_id(user_id)

    def get_decrypted(self, user_id: str) -> Tuple[str, str]:
        creds = self._repo.find_by_user_id(user_id)
        if not creds:
            raise ValidationError(
                "No Kaggle credentials found. Please configure your API token first.",
                "NO_CREDENTIALS",
            )

        try:
            username = decrypt_credential(creds.get("username_encrypted"))
            api_key = decrypt_credential(creds.get("api_key_encrypted"))
        except Exception as error:
            raise ValidationError(
                f"Failed to decrypt credentials: {error}",
                "DECRYPTION_FAILED",
            ) from error

        if not username or not api_key:
            raise ValidationError("Stored credentials are invalid.", "INVALID_CREDENTIALS")

        return username, api_key
