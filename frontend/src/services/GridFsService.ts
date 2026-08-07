import { api, apiFormData, baseURL } from './api';

const gridfsPath = '/gridfs';

export interface ImagesByDatasetPaginatedResponse {
  file_ids: string[];
  total: number;
  page: number;
  per_page: number;
}

/** Fetch all image IDs for a dataset (e.g. for filter). Prefer imagesByDatasetIdPaginated for gallery. */
export const imagesByDatasetId = async (
  datasetId: string
): Promise<string[]> => {
  const response = await api.get(
    `/images_by_dataset_id?dataset_id=${datasetId}`
  );
  return response.data;
};

/** Paginated list of image IDs. Use for gallery with infinite scroll. */
export const imagesByDatasetIdPaginated = async (
  datasetId: string,
  page: number,
  perPage: number
): Promise<ImagesByDatasetPaginatedResponse> => {
  const response = await api.get(
    `/images_by_dataset_id?dataset_id=${encodeURIComponent(datasetId)}&page=${page}&per_page=${perPage}`
  );
  return response.data;
};

export const getImageFromFs = (fileId: string) => {
  return baseURL + gridfsPath + `/image/${fileId}`;
};

export const uploadFile = async (
  formData: FormData,
  onProgress?: (progress: number) => void,
) => {
  const response = await apiFormData.post(gridfsPath + "/upload_images", formData, {
    onUploadProgress: (e) => {
      if (e.total && onProgress) {
        const progress = Math.round((e.loaded * 100) / e.total);
        onProgress(progress);
      }
    },
  });
  return response.data;
};

/** Upload a single image for rich content (e.g. exercise didactic detailing). Returns url for use in markdown. */
export const uploadContentImage = async (file: File): Promise<{ file_id: string; url: string }> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiFormData.post<{ file_id: string; url: string }>(
    gridfsPath + '/upload_content_image',
    formData
  );
  return response.data;
};