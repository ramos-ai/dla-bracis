import { api } from "./api";

const reportsPath = "/reports";

export interface ReportProps {
  _id?: string;
  exerciseId: string;
  userId: string;
  reportType: 'error' | 'unlabelled';
  description: string;
  mediaId?: string;
  status: 'pending' | 'resolved' | 'dismissed';
  createdAt?: string;
  updatedAt?: string;
  userName?: string;
  userEmail?: string;
  exerciseTitle?: string;
}

export interface CreateReportData {
  exerciseId: string;
  reportType: 'error' | 'unlabelled';
  description: string;
  mediaId?: string;
}

export async function createReport(data: CreateReportData): Promise<{ success: boolean; message: string; report_id?: string }> {
  const response = await api.post(reportsPath + "/create", data);
  return response.data;
}

export async function getReportsList(): Promise<ReportProps[]> {
  try {
    const response = await api.get(reportsPath + "/list");
    return response.data.reports || [];
  } catch (error: unknown) {
    // 403 = apenas professor/admin podem ver a lista de reportes
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 403) return [];
    throw error;
  }
}

export async function getExerciseReports(exerciseId: string): Promise<ReportProps[]> {
  const response = await api.get(reportsPath + `/exercise/${exerciseId}`);
  return response.data.reports || [];
}

export async function updateReportStatus(reportId: string, status: 'pending' | 'resolved' | 'dismissed'): Promise<{ success: boolean; message: string }> {
  const response = await api.put(reportsPath + `/${reportId}/status`, { status });
  return response.data;
}

/** Mark all reports as dismissed (clear notifications). Teacher/admin only. */
export async function markAllReportsRead(): Promise<{ success: boolean; message: string; modified_count?: number }> {
  const response = await api.post(reportsPath + '/mark-all-read');
  return response.data;
}
