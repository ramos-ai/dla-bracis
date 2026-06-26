import { api } from "./api";

const datasetPath = "/dataset";

export type TDataset = {
  _id: string;
  dataset_name: string;
  description: string;
  labels: string[];
  task_type: string;
  user_id: string;
  visibility: string;
};

/** Lista datasets. Se classId for passado (professor com várias turmas), o backend devolve só os usados em exercícios dessa turma. */
export async function getDatasetsList(classId?: string | null): Promise<TDataset[]> {
  const params = classId ? { class_id: classId } : {};
  const response = await api.get(datasetPath + "/list", { params });
  return response.data.datasets;
}

export async function getDatasetData() {
  const response = await api.post("/save");
  return response.data;
}

export const getDatasetById = async (id: string | null): Promise<TDataset> => {
  const res = await api.get(datasetPath + `/${id}`);
  return res.data.dataset;
};

export const saveDataset = async (data: TDataset) => {
  const res = await api.post(datasetPath + "/save", data);
  return res;
};

export const editDataset = async (data: TDataset) => {
  const res = await api.put(datasetPath + `/edit/${data._id}`, data);
  return res;
};

export const getDatasetLabels = async (dataset_id: string) => {
  const res = await api.get(datasetPath + `/dataset_labels/${dataset_id}`);
  return res.data.labels;
};

export const updateDatasetLabels = async (dataset_id: string, labels: string[]) => {
  const res = await api.put(datasetPath + `/${dataset_id}/labels`, { labels });
  return res.data;
};

export const deleteDataset = async (dataset_id: string) => {
  const res = await api.delete(datasetPath + `/${dataset_id}`);
  return res.data;
};

/** Remove uma imagem do dataset. Se a imagem estiver em exercícios, use confirm: true após o utilizador confirmar. */
export const deleteDatasetMedia = async (
  dataset_id: string,
  file_id: string,
  confirm = false
): Promise<{ deleted: boolean; in_exercises?: boolean; exercises?: { id: string; title: string }[]; message?: string }> => {
  const qs = confirm ? '?confirm=true' : '';
  const res = await api.delete(datasetPath + `/${dataset_id}/media/${file_id}` + qs);
  return res.data;
};
