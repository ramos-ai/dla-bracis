"""Kaggle dataset metadata and slug helpers."""

import json
import os
import re


class KaggleMetadataBuilder:
    """Builds dataset-metadata.json and public Kaggle URLs."""

    @staticmethod
    def sanitize_slug(title: str) -> str:
        slug = title.lower()
        slug = re.sub(r"[^a-z0-9\s-]", "", slug)
        slug = re.sub(r"[\s_]+", "-", slug)
        slug = re.sub(r"-+", "-", slug)
        slug = slug.strip("-")
        if len(slug) < 3:
            slug = f"dataset-{slug}" if slug else "dataset"
        return slug[:50]

    @classmethod
    def build_metadata(
        cls,
        username: str,
        title: str,
        description: str,
        is_private: bool,
        dataset_version: int,
    ) -> dict:
        slug = cls.sanitize_slug(title)
        return {
            "title": title,
            "id": f"{username}/{slug}",
            "licenses": [{"name": "CC0-1.0"}],
            "isPrivate": is_private,
            "keywords": ["computer-vision", "image-annotation"],
            "description": description
            or f"Dataset exported from Data Labelling App (v{dataset_version})",
        }

    @staticmethod
    def write_metadata_file(directory: str, metadata: dict) -> str:
        metadata_path = os.path.join(directory, "dataset-metadata.json")
        with open(metadata_path, "w", encoding="utf-8") as handle:
            json.dump(metadata, handle, indent=2, ensure_ascii=False)
        return metadata_path

    @classmethod
    def dataset_url(cls, username: str, title: str) -> str:
        slug = cls.sanitize_slug(title)
        return f"https://www.kaggle.com/datasets/{username}/{slug}"
