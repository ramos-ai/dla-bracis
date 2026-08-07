import { api } from './api';

export interface LabelledMediaProps {
  _id?: string;
  dataset_id: string;
  insert_user: string;
  insert_date: string;
}

export interface MediaItem {
  file_id: string;
  media_name: string;
}

export interface PaginatedMediasResponse {
  file_ids: string[];
  items: MediaItem[];
  total: number;
  page: number;
  per_page: number;
}

const mediasPath = '/medias';

export const getLabelledMedias = async ( datasetId: string ): Promise<string[]> => {
  const response = await api.get( mediasPath  + `/labelled_medias/${datasetId}`);
  return response.data;
};

export const getUnlabelledMedias = async ( datasetId: string ): Promise<string[]>  => {
  const response = await api.get( mediasPath  + `/unlabelled_medias/${datasetId}`);
  return response.data;
};

/** Paginated labelled medias (for exercise image picker). Use to avoid loading hundreds of thumbnails at once. */
export const getLabelledMediasPaginated = async (
  datasetId: string,
  page: number = 1,
  perPage: number = 24
): Promise<PaginatedMediasResponse> => {
  const response = await api.get(
    `${mediasPath}/labelled_medias/${datasetId}`,
    { params: { page, per_page: perPage } }
  );
  return response.data;
};

/** File IDs for export manual split picker, optionally filtered by class. */
export const getExportPickerMedias = async (
  datasetId: string,
  split: 'train' | 'val' | 'test',
  includeUnlabelled: boolean,
  taskType: string,
  classIndices?: number[]
): Promise<string[]> => {
  const params: Record<string, string> = {
    split,
    include_unlabelled: String(includeUnlabelled),
    task_type: taskType,
  };
  if (classIndices && classIndices.length > 0) {
    params.class_indices = classIndices.join(',');
  }
  const response = await api.get(
    `${mediasPath}/export_picker_medias/${datasetId}`,
    { params }
  );
  return response.data.file_ids ?? [];
};

/** Paginated unlabelled medias (for exercise image picker). */
export const getUnlabelledMediasPaginated = async (
  datasetId: string,
  page: number = 1,
  perPage: number = 24
): Promise<PaginatedMediasResponse> => {
  const response = await api.get(
    `${mediasPath}/unlabelled_medias/${datasetId}`,
    { params: { page, per_page: perPage } }
  );
  return response.data;
};
