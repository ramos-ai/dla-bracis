"""Export DLA datasets to a local directory for Kaggle upload."""

import os
import shutil
import zipfile
from dataclasses import dataclass

from application.datasets.export_config import ExportConfig
from application.datasets.export_dataset_zip import export_dataset_zip_with_config

from .kaggle_types import DEFAULT_EXPORT_CONFIG


@dataclass
class ExportFilePartition:
    images: list[tuple[str, str]]
    labels: list[tuple[str, str]]
    other: list[tuple[str, str]]


class KaggleDatasetExporter:
    """Exports and partitions dataset files for Kaggle packaging."""

    def resolve_config(self, export_config: dict | None) -> ExportConfig:
        payload = export_config or DEFAULT_EXPORT_CONFIG
        return ExportConfig.from_dict(payload)

    def get_image_count(self, dataset_id: str) -> int:
        from infrastructure.persistence.db_connection import get_db_dla

        return get_db_dla().files.count_documents({"dataset_id": dataset_id})

    def export_to_directory(
        self, dataset_id: str, export_config: dict | None, extract_dir: str
    ) -> None:
        config = self.resolve_config(export_config)
        zip_buffer = export_dataset_zip_with_config(dataset_id, config)

        os.makedirs(extract_dir, exist_ok=True)
        zip_path = os.path.join(os.path.dirname(extract_dir), "dataset.zip")
        with open(zip_path, "wb") as handle:
            handle.write(zip_buffer.read())

        with zipfile.ZipFile(zip_path, "r") as archive:
            archive.extractall(extract_dir)

    def partition_files(self, extract_dir: str) -> ExportFilePartition:
        images: list[tuple[str, str]] = []
        labels: list[tuple[str, str]] = []
        other: list[tuple[str, str]] = []

        for root, _, files in os.walk(extract_dir):
            for filename in files:
                full_path = os.path.join(root, filename)
                rel_path = os.path.relpath(full_path, extract_dir)

                if rel_path.startswith("images/"):
                    images.append((full_path, rel_path))
                elif rel_path.startswith("labels/"):
                    labels.append((full_path, rel_path))
                else:
                    other.append((full_path, rel_path))

        return ExportFilePartition(images=images, labels=labels, other=other)

    @staticmethod
    def copy_file(src_path: str, batch_dir: str, rel_path: str) -> None:
        dst_path = os.path.join(batch_dir, rel_path)
        os.makedirs(os.path.dirname(dst_path), exist_ok=True)
        shutil.copy2(src_path, dst_path)

    @classmethod
    def copy_matching_labels(
        cls,
        batch_dir: str,
        batch_images: list[tuple[str, str]],
        label_files: list[tuple[str, str]],
    ) -> None:
        for src_path, rel_path in batch_images:
            cls.copy_file(src_path, batch_dir, rel_path)

            base_name = os.path.splitext(os.path.basename(rel_path))[0]
            img_subdir = os.path.dirname(rel_path).replace("images/", "")

            for label_src, label_rel in label_files:
                label_base = os.path.splitext(os.path.basename(label_rel))[0]
                label_subdir = os.path.dirname(label_rel).replace("labels/", "")
                if label_base != base_name or label_subdir != img_subdir:
                    continue
                cls.copy_file(label_src, batch_dir, label_rel)
                break
