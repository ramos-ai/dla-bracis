import { api, apiLongRunning } from "./api";

const exportPath = "/export";

export interface ExportConfigPayload {
  mode?: "simple" | "custom";
  split_mode?: "auto" | "manual";
  train_pct?: number;
  val_pct?: number;
  test_pct?: number;
  include_train?: boolean;
  include_val?: boolean;
  include_test?: boolean;
  manual_splits?: { train: string[]; val: string[]; test: string[] };
  max_width?: number;
  jpeg_quality?: number;
  keep_original_resolution?: boolean;
  include_unlabeled?: boolean;
  seed?: number;
}

export interface ExportResponsesParams {
  dataset_ids?: string[];
  task_type?: string;
  include_labelled?: boolean;
  include_unlabelled?: boolean;
}

export interface TaskStatus {
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
  progress: number;
  result: { download_url?: string; dataset_id?: string } | null;
  error: string | null;
}

export interface AsyncExportResponse {
  success: boolean;
  task_id?: string;
  message?: string;
}

/** Get task status for async operations. */
export async function getTaskStatus(taskId: string): Promise<TaskStatus> {
  const response = await api.get<TaskStatus>(`/tasks/${taskId}`);
  return response.data;
}

/** [Admin] Fetch export payload (responses by dataset). Use with downloadExportResponses for file download. */
export async function fetchExportResponses(params: ExportResponsesParams): Promise<Record<string, unknown>> {
  const searchParams = new URLSearchParams();
  if (params.dataset_ids?.length) {
    searchParams.set("dataset_ids", params.dataset_ids.join(","));
  }
  if (params.task_type) {
    searchParams.set("task_type", params.task_type);
  }
  if (params.include_labelled !== undefined) {
    searchParams.set("include_labelled", String(params.include_labelled));
  }
  if (params.include_unlabelled !== undefined) {
    searchParams.set("include_unlabelled", String(params.include_unlabelled));
  }
  const qs = searchParams.toString();
  const url = qs ? `${exportPath}/responses?${qs}` : `${exportPath}/responses`;
  const response = await api.get(url);
  return response.data as Record<string, unknown>;
}

/** Trigger download of export JSON file. */
export function downloadExportResponses(data: Record<string, unknown>, filename?: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `export-respostas-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface DatasetExportStats {
  total: number;
  labelled: number;
  unlabelled: number;
}

/** Fetch dataset stats (total, labelled, unlabelled) for export config modal. */
export async function fetchDatasetExportStats(datasetId: string): Promise<DatasetExportStats> {
  const response = await api.get<DatasetExportStats>(
    `${exportPath}/dataset/${datasetId}/stats`
  );
  return response.data;
}

export async function downloadDatasetZip(datasetId: string): Promise<boolean> {
  const response = await apiLongRunning.get(`${exportPath}/dataset/${datasetId}`, {
    responseType: "blob",
  });
  const blob = response.data as Blob;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dataset_${datasetId}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

/** Export dataset with custom config (POST) - synchronous version. */
export async function downloadDatasetZipWithConfig(
  datasetId: string,
  config: ExportConfigPayload
): Promise<boolean> {
  const response = await apiLongRunning.post(
    `${exportPath}/dataset/${datasetId}/configured`,
    config,
    { responseType: "blob" }
  );
  const blob = response.data as Blob;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dataset_${datasetId}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

export async function startAsyncExport(
  datasetId: string,
  config: ExportConfigPayload
): Promise<AsyncExportResponse> {
  try {
    const response = await api.post<AsyncExportResponse>(
      `${exportPath}/dataset/${datasetId}/async`,
      config
    );
    return response.data;
  } catch {
    return { success: false, message: "Failed to start export" };
  }
}

export function downloadFromUrl(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function downloadDatasetZipAsync(
  datasetId: string,
  config: ExportConfigPayload,
  onProgress?: (message: string) => void
): Promise<{ success: boolean; error?: string }> {
  onProgress?.("Iniciando exportação...");
  const taskResponse = await startAsyncExport(datasetId, config);
  
  if (!taskResponse.success || !taskResponse.task_id) {
    return { success: false, error: taskResponse.message || "Failed to start export" };
  }

  const taskId = taskResponse.task_id;
  const pollInterval = 2000;
  const maxAttempts = 300; // 10 minutes max (300 * 2s = 600s)
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    
    try {
      const status = await getTaskStatus(taskId);
      
      if (status.progress !== undefined && status.progress > 0) {
        onProgress?.(`Processando... ${status.progress}%`);
      }
      
      if (status.status === 'DONE') {
        onProgress?.("Download em andamento...");
        const downloadUrl = status.result?.download_url;
        if (downloadUrl) {
          if (downloadUrl.startsWith('/api/')) {
            const response = await apiLongRunning.get(downloadUrl.replace('/api', ''), {
              responseType: "blob",
            });
            const blob = response.data as Blob;
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `dataset_${datasetId}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          } else {
            downloadFromUrl(downloadUrl, `dataset_${datasetId}.zip`);
          }
        }
        return { success: true };
      }
      
      if (status.status === 'FAILED') {
        return { success: false, error: status.error || 'Export failed' };
      }
    } catch {
      // Continue polling on network errors
    }
  }
  
  return { success: false, error: 'Export timed out' };
}
