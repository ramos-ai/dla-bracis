"""MongoDB query helpers for labelled reference documents."""

from infrastructure.persistence.object_id_utils import to_object_id


def find_labelled_reference(collection, dataset_id: str, media_id: str) -> dict | None:
    dataset_oid = to_object_id(dataset_id)
    file_oid = to_object_id(media_id)

    queries: list[dict] = [
        {"dataset_id": str(dataset_id), "file_id": str(media_id)},
    ]
    if dataset_oid and file_oid:
        queries.append({"dataset_id": dataset_oid, "file_id": file_oid})
    if dataset_oid:
        queries.append({"dataset_id": dataset_oid, "file_id": str(media_id)})
    if file_oid:
        queries.append({"dataset_id": str(dataset_id), "file_id": file_oid})

    for query in queries:
        doc = collection.find_one(query)
        if doc:
            return doc
    return None
