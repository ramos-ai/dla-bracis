import { api } from './api';

const trainingPath = '/training';

export interface TrainingProps {
  labels: string[];
  dataset_id: string;
  file_id: string;
  update_user: string;
}

export const saveTraining = async (data: TrainingProps) => {
  return await api.post(trainingPath + '/save', data);
};

export const getLabelsForFile = async (dataset_id: string, file_id: string): Promise<string[]> => {
  const response = await api.get(trainingPath + '/labels', {
    params: { dataset_id, file_id }
  });
  return response.data.labels || [];
};

export const getLabelsBatch = async (
  dataset_id: string,
  file_ids: string[]
): Promise<Record<string, string[]>> => {
  const response = await api.post(trainingPath + '/labels/batch', {
    dataset_id,
    file_ids,
  });
  return response.data.labels_map || {};
};
