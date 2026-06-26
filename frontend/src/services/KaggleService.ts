import { api } from "./api";

const kagglePath = "/kaggle";

export interface KaggleCredentials {
  username: string;
  api_key: string;
}

export interface KaggleExportConfig {
  mode: 'simple' | 'custom';
  split_mode: 'auto' | 'manual';
  train_pct: number;
  val_pct: number;
  test_pct: number;
  include_train: boolean;
  include_val: boolean;
  include_test: boolean;
  manual_splits?: { train: string[]; val: string[]; test: string[] };
  max_width: number;
  jpeg_quality: number;
  keep_original_resolution: boolean;
  include_unlabeled: boolean;
  seed: number;
}

export interface KaggleExportRequest {
  title: string;
  description: string;
  is_private: boolean;
  export_config?: KaggleExportConfig;
}

export interface KaggleExportResponse {
  success: boolean;
  kaggle_url: string | null;
  error: { code: string; message: string } | null;
}

export interface KaggleTaskResponse {
  success: boolean;
  task_id: string;
  error?: { code: string; message: string };
}

export interface TaskStatus {
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
  progress: number;
  result: { kaggle_url?: string; dataset_id?: string } | null;
  error: string | null;
}

export interface KaggleCredentialsStatus {
  has_credentials: boolean;
}

export interface KaggleValidationResult {
  valid: boolean;
  error?: string;
  code?: string;
}

/**
 * Save Kaggle API credentials for the current user.
 * Credentials are encrypted and stored securely on the backend.
 */
export async function saveKaggleCredentials(
  credentials: KaggleCredentials
): Promise<void> {
  await api.post(`${kagglePath}/credentials`, credentials);
}

/**
 * Check if the current user has stored Kaggle credentials.
 */
export async function getCredentialsStatus(): Promise<KaggleCredentialsStatus> {
  const response = await api.get<KaggleCredentialsStatus>(
    `${kagglePath}/credentials/status`
  );
  return response.data;
}

/**
 * Delete stored Kaggle credentials for the current user.
 */
export async function deleteKaggleCredentials(): Promise<void> {
  await api.delete(`${kagglePath}/credentials`);
}

/**
 * Validate stored Kaggle credentials against the Kaggle API.
 */
export async function validateKaggleCredentials(): Promise<KaggleValidationResult> {
  try {
    const response = await api.post<KaggleValidationResult>(
      `${kagglePath}/credentials/validate`
    );
    return response.data;
  } catch (error: unknown) {
    const err = error as { response?: { data?: KaggleValidationResult } };
    if (err.response?.data) {
      return err.response.data;
    }
    return { valid: false, error: "Validation request failed" };
  }
}

/**
 * Get task status for async operations.
 */
export async function getTaskStatus(taskId: string): Promise<TaskStatus> {
  const response = await api.get<TaskStatus>(`/tasks/${taskId}`);
  return response.data;
}

/**
 * Export a dataset to Kaggle (async).
 * Returns task_id for polling.
 */
export async function startKaggleExport(
  datasetId: string,
  request: KaggleExportRequest
): Promise<KaggleTaskResponse> {
  try {
    const response = await api.post<KaggleTaskResponse>(
      `${kagglePath}/dataset/${datasetId}/export`,
      request
    );
    return response.data;
  } catch (error: unknown) {
    const err = error as { response?: { data?: { error?: { code: string; message: string } } } };
    return {
      success: false,
      task_id: '',
      error: err.response?.data?.error || {
        code: "REQUEST_FAILED",
        message: "Failed to connect to the server",
      },
    };
  }
}

/**
 * Export a dataset to Kaggle with polling.
 * Polls until task completes and returns final result.
 */
export async function exportToKaggle(
  datasetId: string,
  request: KaggleExportRequest
): Promise<KaggleExportResponse> {
  const taskResponse = await startKaggleExport(datasetId, request);
  
  if (!taskResponse.success || !taskResponse.task_id) {
    return {
      success: false,
      kaggle_url: null,
      error: taskResponse.error || { code: 'TASK_START_FAILED', message: 'Failed to start export task' },
    };
  }

  const taskId = taskResponse.task_id;
  const pollInterval = 2000;
  const maxAttempts = 180; // 6 minutes max
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    
    try {
      const status = await getTaskStatus(taskId);
      
      if (status.status === 'DONE') {
        return {
          success: true,
          kaggle_url: status.result?.kaggle_url || null,
          error: null,
        };
      }
      
      if (status.status === 'FAILED') {
        return {
          success: false,
          kaggle_url: null,
          error: { code: 'EXPORT_FAILED', message: status.error || 'Export failed' },
        };
      }
    } catch {
      // Continue polling on network errors
    }
  }
  
  return {
    success: false,
    kaggle_url: null,
    error: { code: 'TIMEOUT', message: 'Export timed out' },
  };
}
