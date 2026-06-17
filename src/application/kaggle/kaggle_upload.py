"""Dataset upload orchestration for Kaggle (single and batched)."""

import os
import shutil
import subprocess
import tempfile
from typing import Callable, Optional

from application.datasets.dataset_use_cases import get_dataset_by_id
from domain.exceptions import NotFoundError, ValidationError

from .kaggle_cli import KaggleCliClient
from .kaggle_credentials import KaggleCredentialsManager
from .kaggle_export import KaggleDatasetExporter
from .kaggle_metadata import KaggleMetadataBuilder
from .kaggle_types import BATCH_SIZE, KaggleUploadResult, LARGE_DATASET_THRESHOLD


class KaggleDatasetUploader:
    """Uploads exported datasets to Kaggle via CLI."""

    def __init__(
        self,
        cli: KaggleCliClient | None = None,
        credentials: KaggleCredentialsManager | None = None,
        metadata: KaggleMetadataBuilder | None = None,
        exporter: KaggleDatasetExporter | None = None,
    ):
        self._cli = cli or KaggleCliClient()
        self._credentials = credentials or KaggleCredentialsManager()
        self._metadata = metadata or KaggleMetadataBuilder()
        self._exporter = exporter or KaggleDatasetExporter()

    def upload(
        self,
        user_id: str,
        dataset_id: str,
        title: str,
        description: str,
        is_private: bool,
        export_config: dict | None = None,
        progress_callback: Optional[Callable[[int, str], None]] = None,
    ) -> KaggleUploadResult:
        try:
            username, api_key = self._credentials.get_decrypted(user_id)
            dataset = get_dataset_by_id(dataset_id)
            if not dataset:
                return KaggleUploadResult.fail(
                    "DATASET_NOT_FOUND",
                    f"Dataset {dataset_id} not found.",
                )

            dataset_version = dataset.get("version", 0)
            env = self._cli.build_env(username, api_key)
            image_count = self._exporter.get_image_count(dataset_id)

            if image_count > LARGE_DATASET_THRESHOLD:
                return self._upload_batched(
                    username=username,
                    env=env,
                    dataset_id=dataset_id,
                    title=title,
                    description=description,
                    is_private=is_private,
                    export_config=export_config,
                    dataset_version=dataset_version,
                    progress_callback=progress_callback,
                )

            return self._upload_single(
                username=username,
                env=env,
                dataset_id=dataset_id,
                title=title,
                description=description,
                is_private=is_private,
                export_config=export_config,
                dataset_version=dataset_version,
                progress_callback=progress_callback,
            )
        except NotFoundError as error:
            return KaggleUploadResult.fail("DATASET_NOT_FOUND", str(error))
        except ValidationError as error:
            return KaggleUploadResult.fail(
                getattr(error, "code", "VALIDATION_ERROR"),
                str(error),
            )
        except subprocess.TimeoutExpired:
            return KaggleUploadResult.fail(
                "TIMEOUT",
                "Upload timed out. The dataset may be too large.",
            )
        except Exception as error:
            return KaggleUploadResult.fail("UNKNOWN_ERROR", str(error))

    def _upload_single(
        self,
        username: str,
        env: dict,
        dataset_id: str,
        title: str,
        description: str,
        is_private: bool,
        export_config: dict | None,
        dataset_version: int,
        progress_callback: Optional[Callable[[int, str], None]],
    ) -> KaggleUploadResult:
        temp_dir = tempfile.mkdtemp(prefix="kaggle_export_")
        try:
            if progress_callback:
                progress_callback(10, "Exporting dataset...")

            extract_dir = os.path.join(temp_dir, "dataset")
            self._exporter.export_to_directory(dataset_id, export_config, extract_dir)

            if progress_callback:
                progress_callback(50, "Uploading to Kaggle...")

            metadata = self._metadata.build_metadata(
                username, title, description, is_private, dataset_version
            )
            self._metadata.write_metadata_file(extract_dir, metadata)

            upload_error = self._create_or_version(
                extract_dir,
                env,
                f"Version {dataset_version}",
                timeout=600,
            )
            if upload_error is not None:
                return upload_error

            if progress_callback:
                progress_callback(95, "Finalizing...")

            return KaggleUploadResult.ok(self._metadata.dataset_url(username, title))
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    def _upload_batched(
        self,
        username: str,
        env: dict,
        dataset_id: str,
        title: str,
        description: str,
        is_private: bool,
        export_config: dict | None,
        dataset_version: int,
        progress_callback: Optional[Callable[[int, str], None]],
    ) -> KaggleUploadResult:
        temp_dir = tempfile.mkdtemp(prefix="kaggle_batch_")
        try:
            if progress_callback:
                progress_callback(5, "Exporting dataset...")

            extract_dir = os.path.join(temp_dir, "full_dataset")
            self._exporter.export_to_directory(dataset_id, export_config, extract_dir)

            if progress_callback:
                progress_callback(15, "Preparing batches...")

            partition = self._exporter.partition_files(extract_dir)
            total_images = len(partition.images)
            num_batches = (total_images + BATCH_SIZE - 1) // BATCH_SIZE

            metadata = self._metadata.build_metadata(
                username, title, description, is_private, dataset_version
            )

            for batch_idx in range(num_batches):
                batch_num = batch_idx + 1
                is_first = batch_idx == 0

                if progress_callback:
                    pct = 15 + int((batch_idx / num_batches) * 80)
                    progress_callback(pct, f"Uploading batch {batch_num}/{num_batches}...")

                batch_error = self._upload_one_batch(
                    temp_dir=temp_dir,
                    batch_num=batch_num,
                    is_first=is_first,
                    num_batches=num_batches,
                    metadata=metadata,
                    partition=partition,
                    batch_idx=batch_idx,
                    env=env,
                )
                if batch_error is not None:
                    return batch_error

            if progress_callback:
                progress_callback(95, "Finalizing...")

            return KaggleUploadResult.ok(self._metadata.dataset_url(username, title))
        except Exception as error:
            return KaggleUploadResult.fail("BATCH_UPLOAD_ERROR", str(error))
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    def _upload_one_batch(
        self,
        temp_dir: str,
        batch_num: int,
        is_first: bool,
        num_batches: int,
        metadata: dict,
        partition,
        batch_idx: int,
        env: dict,
    ) -> KaggleUploadResult | None:
        batch_dir = os.path.join(temp_dir, f"batch_{batch_num}")
        os.makedirs(batch_dir, exist_ok=True)

        self._metadata.write_metadata_file(batch_dir, metadata)

        if is_first:
            for src_path, rel_path in partition.other:
                self._exporter.copy_file(src_path, batch_dir, rel_path)

        start_idx = batch_idx * BATCH_SIZE
        end_idx = min(start_idx + BATCH_SIZE, len(partition.images))
        batch_images = partition.images[start_idx:end_idx]
        self._exporter.copy_matching_labels(batch_dir, batch_images, partition.labels)

        success, error = self._run_batch_upload(
            batch_dir, env, is_first, batch_num, num_batches
        )
        shutil.rmtree(batch_dir, ignore_errors=True)

        if success:
            return None
        return self._batch_error_result(error, batch_num, num_batches)

    def _run_batch_upload(
        self,
        batch_dir: str,
        env: dict,
        is_first: bool,
        batch_num: int,
        num_batches: int,
    ) -> tuple[bool, str]:
        message = f"Batch {batch_num}/{num_batches}"

        if is_first:
            success, error = self._cli.create_dataset(batch_dir, env, timeout=300)
            if success:
                return True, ""
            if "already exists" in error.lower() or "409" in error:
                return self._cli.version_dataset(batch_dir, env, message, timeout=300)
            return False, error

        return self._cli.version_dataset(
            batch_dir,
            env,
            message,
            delete_old_versions=True,
            timeout=300,
        )

    def _create_or_version(
        self,
        directory: str,
        env: dict,
        version_message: str,
        timeout: int,
    ) -> KaggleUploadResult | None:
        success, error = self._cli.create_dataset(directory, env, timeout=timeout)
        if success:
            return None

        if "already exists" in error.lower() or "409" in error:
            success, error = self._cli.version_dataset(
                directory, env, version_message, timeout=timeout
            )
            if success:
                return None
            return KaggleUploadResult.fail(
                "VERSION_FAILED",
                error,
            )

        return self._cli_error_result(error)

    def _cli_error_result(self, error: str) -> KaggleUploadResult:
        if "401" in error or "unauthorized" in error.lower():
            return KaggleUploadResult.fail(
                "INVALID_CREDENTIALS",
                "Invalid Kaggle credentials.",
            )
        if "429" in error or "rate limit" in error.lower():
            return KaggleUploadResult.fail(
                "RATE_LIMITED",
                "Kaggle API rate limit exceeded. Please try again later.",
            )
        return KaggleUploadResult.fail("UPLOAD_FAILED", error)

    def _batch_error_result(
        self, error: str, batch_num: int, num_batches: int
    ) -> KaggleUploadResult:
        if "401" in error or "unauthorized" in error.lower():
            return KaggleUploadResult.fail(
                "INVALID_CREDENTIALS",
                "Invalid Kaggle credentials.",
            )
        if "429" in error or "rate limit" in error.lower():
            return KaggleUploadResult.fail(
                "RATE_LIMITED",
                f"Kaggle API rate limit exceeded at batch {batch_num}/{num_batches}.",
            )
        return KaggleUploadResult.fail(
            "BATCH_UPLOAD_FAILED",
            f"Batch {batch_num}/{num_batches} failed: {error}",
        )
