import { api } from "./api";

const actionsPath = "/actions";

export interface UserAction {
  _id: string;
  user_id: string;
  action_type: string;
  description: string;
  metadata?: { exercise_id?: string; class_id?: string; [key: string]: unknown };
  created_at: string;
}

export async function getRecentActions(limit: number = 10): Promise<UserAction[]> {
  const response = await api.get(actionsPath + "/recent", { params: { limit } });
  return response.data.actions || [];
}

export async function getAllActions(): Promise<UserAction[]> {
  const response = await api.get(actionsPath + "/all");
  return response.data.actions || [];
}

export async function deleteAction(actionId: string): Promise<void> {
  await api.delete(actionsPath + "/" + actionId);
}

export async function clearAllActions(): Promise<{ deleted_count: number }> {
  const response = await api.post(actionsPath + "/clear");
  return response.data;
}
