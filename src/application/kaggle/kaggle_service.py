"""
Kaggle Service facade: composes credential, CLI, and upload sub-services.
"""

from typing import Callable, Optional, Tuple

from .kaggle_cli import KaggleCliClient
from .kaggle_credentials import KaggleCredentialsManager
from .kaggle_types import KaggleUploadResult
from .kaggle_upload import KaggleDatasetUploader

__all__ = ["KaggleService", "KaggleUploadResult"]


class KaggleService:
    """Facade for Kaggle API operations."""

    def __init__(
        self,
        credentials: KaggleCredentialsManager | None = None,
        cli: KaggleCliClient | None = None,
        uploader: KaggleDatasetUploader | None = None,
    ):
        self._credentials = credentials or KaggleCredentialsManager()
        self._cli = cli or KaggleCliClient()
        self._uploader = uploader or KaggleDatasetUploader(
            cli=self._cli,
            credentials=self._credentials,
        )

    def save_credentials(self, user_id: str, username: str, api_key: str) -> None:
        self._credentials.save(user_id, username, api_key)

    def has_credentials(self, user_id: str) -> bool:
        return self._credentials.has_credentials(user_id)

    def delete_credentials(self, user_id: str) -> bool:
        return self._credentials.delete(user_id)

    def validate_credentials(self, user_id: str) -> bool:
        username, api_key = self._credentials.get_decrypted(user_id)
        return self._cli.validate_credentials(username, api_key)

    def upload_dataset(
        self,
        user_id: str,
        dataset_id: str,
        title: str,
        description: str,
        is_private: bool,
        export_config: dict = None,
        progress_callback: Optional[Callable[[int, str], None]] = None,
    ) -> KaggleUploadResult:
        return self._uploader.upload(
            user_id=user_id,
            dataset_id=dataset_id,
            title=title,
            description=description,
            is_private=is_private,
            export_config=export_config,
            progress_callback=progress_callback,
        )

    def _get_decrypted_credentials(self, user_id: str) -> Tuple[str, str]:
        return self._credentials.get_decrypted(user_id)
