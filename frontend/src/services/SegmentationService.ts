import { api } from "./api";

const segmentationPath = "/segmentation";

export interface SegmentationAnnotation {
  class_id: number;
  polygon: number[]; // [x1, y1, x2, y2, ...] normalized 0-1
}

export interface SegmentationSavePayload {
  dataset_id: string;
  file_id: string;
  annotations: SegmentationAnnotation[];
  update_user: string;
}

export interface SegmentationByMediaResponse {
  annotations: SegmentationAnnotation[];
  dataset_id?: string;
  file_id?: string;
}

export async function saveSegmentation(data: SegmentationSavePayload): Promise<{ success: boolean; message: string }> {
  const response = await api.post(segmentationPath + "/save", data);
  return response.data;
}

export async function getSegmentationByMedia(datasetId: string, fileId: string): Promise<SegmentationByMediaResponse> {
  const response = await api.get(segmentationPath + `/by_media?dataset_id=${datasetId}&file_id=${fileId}`);
  return response.data;
}

export async function clearSegmentation(datasetId: string, fileId: string): Promise<{ success: boolean; message: string }> {
  const response = await api.delete(segmentationPath + `/clear?dataset_id=${datasetId}&file_id=${fileId}`);
  return response.data;
}

export interface SegmentationMatch {
  student_idx: number;
  correct_idx: number;
  iou: number;
}

export interface SegmentationEvaluateResponse {
  score: number;
  matches: SegmentationMatch[];
}

export async function evaluateSegmentation(
  datasetId: string,
  fileId: string,
  studentAnnotations: SegmentationAnnotation[],
  iouThreshold?: number,
  scoreMode?: 'recall' | 'f1'
): Promise<SegmentationEvaluateResponse> {
  const response = await api.post(segmentationPath + '/evaluate', {
    dataset_id: datasetId,
    file_id: fileId,
    student_annotations: studentAnnotations,
    iou_threshold: iouThreshold ?? 0.75,
    score_mode: scoreMode ?? 'recall',
  });
  return response.data;
}

export async function getSegmentationBatch(
  datasetId: string,
  fileIds: string[]
): Promise<Record<string, boolean>> {
  const response = await api.post(segmentationPath + '/batch', {
    dataset_id: datasetId,
    file_ids: fileIds,
  });
  return response.data.annotations_map || {};
}
