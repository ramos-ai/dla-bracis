import { api } from "./api";

const notificationsPath = "/reports";

export interface Notification {
  _id: string;
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
}

interface ReportData {
  _id: string;
  reportType?: string;
  description?: string;
  status?: string;
  createdAt?: string;
}

export async function getNotifications(): Promise<{ notifications: Notification[]; unread_count: number }> {
  try {
    const response = await api.get(notificationsPath + "/list");
    const reports = response.data.reports || [];
    
    // Convert reports to notifications format
    const notifications: Notification[] = reports.map((report: ReportData) => ({
      _id: report._id,
      type: report.reportType || 'report',
      message: report.description || 'Novo reporte',
      read: report.status !== 'pending',
      createdAt: report.createdAt || new Date().toISOString()
    }));
    
    const unread_count = notifications.filter(n => !n.read).length;
    
    return { notifications, unread_count };
  } catch (error: unknown) {
    // 403 = apenas professor/admin podem ver reportes; alunos recebem lista vazia sem erro
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status !== 403) {
      console.error('Error fetching notifications:', error);
    }
    return { notifications: [], unread_count: 0 };
  }
}
