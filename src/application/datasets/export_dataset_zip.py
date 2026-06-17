"""
Export dataset as a single ZIP: dataset.json, images/ (resized, id in filename), labels/ (YOLO when applicable), data.yaml.
Differentiates: classification (folders by label), detection (COCO), segmentation (YOLO labels).
Images: JPG quality 85, max width 1024px.
Supports configurable export via ExportConfig.
"""

import io
import json
import random
import zipfile
from typing import Dict, List, Optional, Tuple

from bson import ObjectId
from PIL import Image

from application.datasets.export_config import ExportConfig
from domain.exceptions import NotFoundError, ValidationError
from infrastructure.persistence.db_connection import get_db_dla
from infrastructure.persistence.repositories.segmentation_repository import (
    SegmentationRepository,
)
from infrastructure.persistence.service_coco import get_coco_annotations_dict
from infrastructure.persistence.service_media import get_unlabelled_file_ids_all
from infrastructure.storage.gridfs_storage_impl import get_image_bytes

# DEFAULTS
MAX_IMAGE_WIDTH = 1024
JPEG_QUALITY = 85
TRAIN_RATIO = 0.8


def _resize_and_encode_jpeg(
    data: bytes,
    content_type: str,
    max_width: int = MAX_IMAGE_WIDTH,
    jpeg_quality: int = JPEG_QUALITY,
    keep_original: bool = False,
) -> bytes:
    """Decode image, optionally resize, encode as JPG. Returns bytes."""
    try:
        img = Image.open(io.BytesIO(data))
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        elif img.mode != "RGB":
            img = img.convert("RGB")
        w, h = img.size
        if not keep_original and w > max_width:
            ratio = max_width / w
            new_size = (max_width, int(h * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)
        out = io.BytesIO()
        img.save(out, "JPEG", quality=jpeg_quality)
        return out.getvalue()
    except Exception:
        return data


def _train_val_split(
    file_ids: List[str], seed: int = 42
) -> Tuple[List[str], List[str]]:
    """Deterministic 80/20 split (legacy)."""
    ordered = sorted(file_ids)
    random.seed(seed)
    random.shuffle(ordered)
    n = len(ordered)
    train_n = max(1, int(n * TRAIN_RATIO))
    return ordered[:train_n], ordered[train_n:]


def _compute_splits_from_config(
    file_ids: List[str],
    config: ExportConfig,
    labelled_ids: Optional[List[str]] = None,
) -> Dict[str, List[str]]:
    """
    Compute file_id -> split mapping. Returns {"train": [...], "val": [...], "test": [...]}.
    Rule: train ⊆ labelled_images; val/test ⊆ labelled ∪ unlabelled.
    When include_unlabeled and labelled_ids given: if train_target > len(labelled),
    train gets all labelled, remainder redistributed to val/test.
    """
    split_names = config.get_split_names()
    result: Dict[str, List[str]] = {s: [] for s in split_names}

    if config.split_mode == "manual" and config.manual_splits:
        for split_name, ids in config.manual_splits.items():
            if split_name in result and ids:
                result[split_name] = [str(fid) for fid in ids]
        return result

    # Auto split by percentages
    labelled_set = set(labelled_ids or [])
    ordered = sorted(file_ids)
    random.seed(config.seed)
    random.shuffle(ordered)
    n = len(ordered)
    if n == 0:
        return result

    # Calculate normalized percentages based on what's included
    train_pct = config.train_pct if config.include_train else 0
    val_pct = config.val_pct if config.include_val else 0
    test_pct = config.test_pct if config.include_test else 0
    total_pct = train_pct + val_pct + test_pct

    if total_pct <= 0:
        return result

    # Normalize to fractions
    t = train_pct / total_pct
    v = val_pct / total_pct
    te = test_pct / total_pct

    # Apply train ⊆ labelled constraint when include_unlabeled (labelled_ids provided)
    if labelled_set and config.include_train and t > 0:
        # Train split must contain labelled images only; val/test get the remainder.
        labelled_in_pool = [f for f in ordered if f in labelled_set]
        n_labelled = len(labelled_in_pool)
        train_target = max(1, int(n * t))
        train_n = min(train_target, n_labelled)
        result["train"] = labelled_in_pool[:train_n]

        # Remainder: unused labelled + all unlabelled
        remainder = (
            labelled_in_pool[train_n:]
            + [f for f in ordered if f not in labelled_set]
        )
        random.shuffle(remainder)
        n_rem = len(remainder)

        if n_rem > 0:
            v_ratio = v / (v + te) if (v + te) > 0 else 1.0
            val_n = int(n_rem * v_ratio) if config.include_val else 0
            if config.include_val and "val" in result:
                result["val"] = remainder[:val_n]
            if config.include_test and "test" in result:
                result["test"] = remainder[val_n:]
    else:
        idx = 0
        if config.include_train and t > 0 and "train" in result:
            end = max(idx + 1, int(n * t))
            result["train"] = ordered[idx:end]
            idx = end
        if config.include_val and v > 0 and idx < n and "val" in result:
            end = max(idx + 1, idx + int(n * v))
            result["val"] = ordered[idx:end]
            idx = end
        if config.include_test and te > 0 and idx < n and "test" in result:
            result["test"] = ordered[idx:]

    return result


def _build_data_yaml(
    task_type: str,
    labels: List[str],
    train_path: str = "images/train",
    val_path: Optional[str] = "images/val",
    test_path: Optional[str] = None,
) -> str:
    """YAML content for data.yaml (YOLO-style). Supports train/val/test."""
    import yaml

    names = {i: name for i, name in enumerate(labels)} if labels else {}
    data: dict = {"path": "dataset/", "names": names}
    if train_path:
        data["train"] = train_path
    if val_path:
        data["val"] = val_path
    if test_path:
        data["test"] = test_path
    return yaml.dump(
        data, default_flow_style=False, allow_unicode=True, sort_keys=False
    )


def _get_classification_file_ids_with_labels(
    dataset_id: str, max_limit: int = 2000
) -> List[Tuple[str, List[str]]]:
    """Return [(file_id, labels), ...] for classification (labelled only)."""
    db = get_db_dla()
    cursor = db.labelled.find(
        {"dataset_id": dataset_id},
        {"file_id": 1, "labels": 1},
    ).limit(max_limit * 2)
    out = []
    seen = set()
    for d in cursor:
        file_id = d.get("file_id")
        labels = d.get("labels") or []
        labels = [lb for lb in labels if lb and lb != "Sem rótulo / desconhecido"]
        if not file_id or not labels or str(file_id) in seen:
            continue
        seen.add(str(file_id))
        out.append((str(file_id), labels))
        if len(out) >= max_limit:
            break
    return out


def export_dataset_json(dataset_id: str) -> dict:
    """
    Return the same JSON that goes inside the ZIP (dataset.json). For classification: custom structure;
    for detection/segmentation: COCO. Raises ValidationError, NotFoundError.
    """
    if not dataset_id or not ObjectId.is_valid(dataset_id):
        raise ValidationError("Valid dataset_id is required")
    db = get_db_dla()
    dataset_doc = db.datasets.find_one({"_id": ObjectId(dataset_id)})
    if not dataset_doc:
        raise NotFoundError("Dataset", dataset_id)

    task_type = (dataset_doc.get("task_type") or "classification").lower()
    labels_list = dataset_doc.get("labels") or []
    dataset_name = dataset_doc.get("name") or "dataset"

    if task_type == "classification":
        items = _get_classification_file_ids_with_labels(dataset_id)
        file_ids = [fid for fid, _ in items]
        train_ids, _ = _train_val_split(file_ids)
        train_set = set(train_ids)
        export_images = []
        for file_id, img_labels in items:
            primary_label = img_labels[0] if img_labels else "unknown"
            folder_name = primary_label.replace(" ", "_").replace("/", "_")[:64]
            split = "train" if file_id in train_set else "val"
            arc_path = f"images/{split}/{folder_name}/{file_id}.jpg"
            export_images.append(
                {"file_id": file_id, "path": arc_path, "labels": img_labels}
            )
        return {
            "task_type": "classification",
            "dataset_name": dataset_name,
            "labels": labels_list,
            "images": export_images,
        }
    if task_type in ("detection", "segmentation"):
        return get_coco_annotations_dict(dataset_id, for_export=True)

    return {
        "task_type": task_type,
        "dataset_name": dataset_name,
        "labels": labels_list,
        "images": [],
    }


def export_dataset_zip(dataset_id: str, config: Optional[ExportConfig] = None) -> io.BytesIO:
    """
    Build a ZIP for the dataset. Uses default config (66/34 split) if config is None.
    Raises ValidationError, NotFoundError.
    """
    if config is None:
        config = ExportConfig.from_dict({"mode": "simple", "train_pct": 66, "val_pct": 34})
    return export_dataset_zip_with_config(dataset_id, config)


def export_dataset_zip_with_config(dataset_id: str, config: ExportConfig) -> io.BytesIO:
    """
    Build a ZIP with configurable split, format, and image options.
    Raises ValidationError, NotFoundError.
    """
    if not dataset_id or not ObjectId.is_valid(dataset_id):
        raise ValidationError("Valid dataset_id is required")
    db = get_db_dla()
    dataset_doc = db.datasets.find_one({"_id": ObjectId(dataset_id)})
    if not dataset_doc:
        raise NotFoundError("Dataset", dataset_id)

    task_type = (dataset_doc.get("task_type") or "classification").lower()
    labels_list = dataset_doc.get("labels") or []
    dataset_name = dataset_doc.get("name") or "dataset"

    max_w = config.max_width if not config.keep_original_resolution else 99999
    jpeg_q = config.jpeg_quality

    buf = io.BytesIO()
    zf = zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED)

    if task_type == "classification":
        _export_classification(
            zf, dataset_id, labels_list, dataset_name, config, max_w, jpeg_q
        )
    elif task_type == "detection":
        _export_detection(
            zf, dataset_id, labels_list, dataset_name, config, max_w, jpeg_q
        )
    elif task_type == "segmentation":
        _export_segmentation(
            zf, dataset_id, labels_list, dataset_name, config, max_w, jpeg_q
        )
    else:
        _export_classification(
            zf, dataset_id, labels_list, dataset_name, config, max_w, jpeg_q
        )

    zf.close()
    buf.seek(0)
    return buf


def _add_image_to_zip(
    zf: zipfile.ZipFile,
    file_id: str,
    arc_path: str,
    max_width: int = MAX_IMAGE_WIDTH,
    jpeg_quality: int = JPEG_QUALITY,
    keep_original: bool = False,
) -> bool:
    """Fetch image, resize (if not keep_original), add to ZIP. Return True if added."""
    data, _ = get_image_bytes(file_id)
    if not data:
        return False
    jpeg_data = _resize_and_encode_jpeg(
        data, "image/jpeg", max_width, jpeg_quality, keep_original
    )
    zf.writestr(arc_path, jpeg_data)
    return True


def _file_id_to_split(splits: Dict[str, List[str]]) -> Dict[str, str]:
    """Build file_id -> split_name mapping."""
    m: Dict[str, str] = {}
    for split_name, ids in splits.items():
        for fid in ids:
            m[str(fid)] = split_name
    return m


def _export_classification(
    zf: zipfile.ZipFile,
    dataset_id: str,
    labels_list: List[str],
    dataset_name: str,
    config: Optional[ExportConfig] = None,
    max_width: int = MAX_IMAGE_WIDTH,
    jpeg_quality: int = JPEG_QUALITY,
) -> None:
    """Classification: images in folders by label. dataset.json + data.yaml."""
    items = _get_classification_file_ids_with_labels(dataset_id)
    labelled_ids = [fid for fid, _ in items]

    if config and config.include_unlabeled:
        unlabelled_ids = get_unlabelled_file_ids_all(dataset_id, max_limit=5000)
        for fid in unlabelled_ids:
            if fid not in {item[0] for item in items}:
                items.append((fid, ["unlabeled"]))

    if not items:
        yaml_content = _build_data_yaml("classification", labels_list)
        zf.writestr("data.yaml", yaml_content)
        zf.writestr(
            "dataset.json",
            json.dumps(
                {"task_type": "classification", "images": [], "labels": labels_list},
                indent=2,
            ),
        )
        return

    file_ids = [fid for fid, _ in items]
    if config:
        labelled_for_split = (
            labelled_ids
            if config.include_unlabeled
            else None
        )
        splits = _compute_splits_from_config(file_ids, config, labelled_ids=labelled_for_split)
        fid_to_split = _file_id_to_split(splits)
        no_splits = len(splits) == 0
        if config.split_mode == "manual" and config.manual_splits and not no_splits:
            allowed = set()
            for ids in splits.values():
                allowed.update(ids)
            items = [(fid, labels) for fid, labels in items if fid in allowed]
    else:
        train_ids, _ = _train_val_split(file_ids)
        fid_to_split = {fid: ("train" if fid in train_ids else "val") for fid in file_ids}
        splits = {"train": [f for f in file_ids if fid_to_split[f] == "train"], "val": [f for f in file_ids if fid_to_split[f] == "val"]}
        no_splits = False

    export_images = []
    for file_id, img_labels in items:
        if config and config.split_mode == "manual" and config.manual_splits and splits and file_id not in fid_to_split:
            continue
        split = fid_to_split.get(file_id, "train") if splits else ""
        primary_label = img_labels[0] if img_labels else "unknown"
        folder_name = primary_label.replace(" ", "_").replace("/", "_")[:64]
        arc_path = f"images/{folder_name}/{file_id}.jpg" if not splits else f"images/{split}/{folder_name}/{file_id}.jpg"
        if _add_image_to_zip(zf, file_id, arc_path, max_width, jpeg_quality):
            export_images.append({"file_id": file_id, "path": arc_path, "labels": img_labels})

    dataset_json = {"task_type": "classification", "dataset_name": dataset_name, "labels": labels_list, "images": export_images}
    zf.writestr("dataset.json", json.dumps(dataset_json, indent=2, ensure_ascii=False))

    train_path = "images/train" if splits and "train" in splits else None
    val_path = "images/val" if splits and "val" in splits else None
    test_path = "images/test" if splits and "test" in splits else None
    yaml_content = _build_data_yaml("classification", labels_list, train_path, val_path, test_path)
    zf.writestr("data.yaml", yaml_content)


def _export_detection(
    zf: zipfile.ZipFile,
    dataset_id: str,
    labels_list: List[str],
    dataset_name: str,
    config: Optional[ExportConfig] = None,
    max_width: int = MAX_IMAGE_WIDTH,
    jpeg_quality: int = JPEG_QUALITY,
) -> None:
    """Detection: COCO in dataset.json, images in images/train, val, test. data.yaml."""
    coco = get_coco_annotations_dict(dataset_id, for_export=True)
    images_coco = coco.get("images") or []
    labelled_ids = [img["file_id"] for img in images_coco]

    if config and config.include_unlabeled:
        unlabelled_ids = get_unlabelled_file_ids_all(dataset_id, max_limit=5000)
        next_id = max((img.get("id", 0) for img in images_coco), default=0) + 1
        for fid in unlabelled_ids:
            if fid not in {img["file_id"] for img in images_coco}:
                images_coco.append(
                    {"id": next_id, "file_id": fid, "file_name": f"{fid}.jpg"}
                )
                next_id += 1
        coco["images"] = images_coco

    if not images_coco:
        zf.writestr(
            "dataset.json",
            json.dumps({"images": [], "annotations": [], "categories": []}, indent=2),
        )
        yaml_content = _build_data_yaml("detection", labels_list)
        zf.writestr("data.yaml", yaml_content)
        return

    file_ids = [img["file_id"] for img in images_coco]
    if config:
        labelled_for_split = (
            labelled_ids
            if config.include_unlabeled
            else None
        )
        splits = _compute_splits_from_config(
            file_ids, config, labelled_ids=labelled_for_split
        )
        fid_to_split = _file_id_to_split(splits)
        no_splits = len(splits) == 0
        if config.split_mode == "manual" and config.manual_splits and not no_splits:
            allowed = set()
            for ids in splits.values():
                allowed.update(ids)
            images_coco = [img for img in images_coco if img["file_id"] in allowed]
            image_ids_in_export = {img["id"] for img in images_coco}
            coco["images"] = images_coco
            coco["annotations"] = [
                a for a in coco.get("annotations", [])
                if a.get("image_id") in image_ids_in_export
            ]
    else:
        train_ids, _ = _train_val_split(file_ids)
        fid_to_split = {fid: ("train" if fid in train_ids else "val") for fid in file_ids}
        splits = {"train": [f for f in file_ids if fid_to_split[f] == "train"], "val": [f for f in file_ids if fid_to_split[f] == "val"]}
        no_splits = False

    for img in images_coco:
        file_id = img["file_id"]
        split = fid_to_split.get(file_id, "train") if splits else ""
        arc_path = f"images/{file_id}.jpg" if not splits else f"images/{split}/{file_id}.jpg"
        img["file_name"] = arc_path
        _add_image_to_zip(zf, file_id, arc_path, max_width, jpeg_quality)

    zf.writestr("dataset.json", json.dumps(coco, indent=2, ensure_ascii=False))
    train_path = "images/train" if splits and "train" in splits else None
    val_path = "images/val" if splits and "val" in splits else None
    test_path = "images/test" if splits and "test" in splits else None
    yaml_content = _build_data_yaml("detection", labels_list, train_path, val_path, test_path)
    zf.writestr("data.yaml", yaml_content)


def _export_segmentation(
    zf: zipfile.ZipFile,
    dataset_id: str,
    labels_list: List[str],
    dataset_name: str,
    config: Optional[ExportConfig] = None,
    max_width: int = MAX_IMAGE_WIDTH,
    jpeg_quality: int = JPEG_QUALITY,
) -> None:
    """Segmentation: YOLO labels in labels/train, val, test; images; dataset.json + data.yaml."""
    repo = SegmentationRepository()
    seg_docs = repo.find_all_by_dataset(dataset_id)
    coco = get_coco_annotations_dict(dataset_id, for_export=True)
    images_coco = coco.get("images") or []

    seg_file_ids = {str(d.get("file_id")) for d in seg_docs if d.get("file_id")}
    existing_file_ids = {img["file_id"] for img in images_coco}
    next_id = max((img.get("id", 0) for img in images_coco), default=0) + 1
    for fid in seg_file_ids:
        if fid not in existing_file_ids:
            images_coco.append({"id": next_id, "file_id": fid, "file_name": f"{fid}.jpg"})
            existing_file_ids.add(fid)
            next_id += 1
    coco["images"] = images_coco

    labelled_ids = [img["file_id"] for img in images_coco]

    if config and config.include_unlabeled:
        unlabelled_ids = get_unlabelled_file_ids_all(dataset_id, max_limit=5000)
        next_id = max((img.get("id", 0) for img in images_coco), default=0) + 1
        for fid in unlabelled_ids:
            if fid not in {img["file_id"] for img in images_coco}:
                images_coco.append(
                    {"id": next_id, "file_id": fid, "file_name": f"{fid}.jpg"}
                )
                next_id += 1
        coco["images"] = images_coco

    file_ids = list({img["file_id"] for img in images_coco})
    if not file_ids and seg_docs:
        file_ids = [str(d.get("file_id")) for d in seg_docs if d.get("file_id")]
    if not file_ids:
        zf.writestr(
            "dataset.json",
            json.dumps({"images": [], "annotations": [], "categories": []}, indent=2),
        )
        yaml_content = _build_data_yaml("segmentation", labels_list)
        zf.writestr("data.yaml", yaml_content)
        return

    if config:
        labelled_for_split = (
            labelled_ids
            if config.include_unlabeled
            else None
        )
        splits = _compute_splits_from_config(
            file_ids, config, labelled_ids=labelled_for_split
        )
        fid_to_split = _file_id_to_split(splits)
        no_splits = len(splits) == 0
        if config.split_mode == "manual" and config.manual_splits and not no_splits:
            allowed = set()
            for ids in splits.values():
                allowed.update(ids)
            file_ids = [f for f in file_ids if f in allowed]
            images_coco = [img for img in images_coco if img["file_id"] in allowed]
            image_ids_in_export = {img["id"] for img in images_coco}
            coco["images"] = images_coco
            coco["annotations"] = [
                a for a in coco.get("annotations", [])
                if a.get("image_id") in image_ids_in_export
            ]
    else:
        train_ids, _ = _train_val_split(file_ids)
        fid_to_split = {fid: ("train" if fid in train_ids else "val") for fid in file_ids}
        splits = {"train": [f for f in file_ids if fid_to_split[f] == "train"], "val": [f for f in file_ids if fid_to_split[f] == "val"]}
        no_splits = False

    for doc in seg_docs:
        file_id = doc.get("file_id")
        if not file_id:
            continue
        file_id_str = str(file_id)
        if config and config.split_mode == "manual" and config.manual_splits and splits and file_id_str not in fid_to_split:
            continue
        split = fid_to_split.get(file_id_str, "train") if splits else ""
        lines = []
        for ann in doc.get("annotations", []):
            cid = ann.get("class_id", 0)
            polygon = ann.get("polygon", [])
            if len(polygon) < 6 or len(polygon) % 2 != 0:
                continue
            coords = " ".join(f"{x:.6f}" for x in polygon)
            lines.append(f"{cid} {coords}")
        label_path = f"labels/{file_id_str}.txt" if not splits else f"labels/{split}/{file_id_str}.txt"
        zf.writestr(label_path, "\n".join(lines) + "\n" if lines else "")

    for img in images_coco:
        file_id = img["file_id"]
        split = fid_to_split.get(file_id, "train") if splits else ""
        arc_path = f"images/{file_id}.jpg" if not splits else f"images/{split}/{file_id}.jpg"
        img["file_name"] = arc_path
        _add_image_to_zip(zf, file_id, arc_path, max_width, jpeg_quality)

    zf.writestr("dataset.json", json.dumps(coco, indent=2, ensure_ascii=False))
    train_path = "images/train" if splits and "train" in splits else None
    val_path = "images/val" if splits and "val" in splits else None
    test_path = "images/test" if splits and "test" in splits else None
    yaml_content = _build_data_yaml("segmentation", labels_list, train_path, val_path, test_path)
    zf.writestr("data.yaml", yaml_content)
