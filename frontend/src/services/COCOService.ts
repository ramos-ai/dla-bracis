import { api } from "./api";

const cocoPath = "/coco";

export interface COCOAnnotation {
  category_id: number;
  segmentation: number[][]; // [[x1, y1, x2, y2, ...]]
  area: number;
  bbox: number[]; // [x, y, width, height]
  iscrowd: number;
}

export interface COCOSaveData {
  dataset_id: string;
  file_id: string;
  annotations: COCOAnnotation[];
}

export interface COCOResponse {
  annotations: COCOAnnotation[];
  dataset_id?: string;
  file_id?: string;
}

export interface COCOFormat {
  images: Array<{
    id: number;
    file_id: string;
    file_name: string;
  }>;
  annotations: Array<{
    id: number;
    image_id: number;
    category_id: number;
    segmentation: number[][];
    area: number;
    bbox: number[];
    iscrowd: number;
  }>;
  categories: Array<{
    id: number;
    name: string;
  }>;
}

export async function saveCOCOAnnotation(data: COCOSaveData): Promise<{ success: boolean; message: string }> {
  const response = await api.post(cocoPath + "/save", data);
  return response.data;
}

export async function getCOCOAnnotation(datasetId: string, fileId: string): Promise<COCOResponse> {
  const response = await api.get(cocoPath + `/get?dataset_id=${datasetId}&file_id=${fileId}`);
  return response.data;
}

export async function getDatasetCOCOAnnotations(datasetId: string): Promise<COCOFormat> {
  const response = await api.get(cocoPath + `/dataset/${datasetId}`);
  return response.data;
}

export async function deleteCOCOAnnotation(datasetId: string, fileId: string): Promise<{ success: boolean; message: string }> {
  const response = await api.delete(cocoPath + `/delete?dataset_id=${datasetId}&file_id=${fileId}`);
  return response.data;
}

export async function getCOCOAnnotationsBatch(
  datasetId: string,
  fileIds: string[]
): Promise<Record<string, boolean>> {
  const response = await api.post(cocoPath + '/batch', {
    dataset_id: datasetId,
    file_ids: fileIds,
  });
  return response.data.annotations_map || {};
}
