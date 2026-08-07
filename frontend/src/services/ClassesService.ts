import { api } from "./api";

const classesPath = "/classes";

export interface ClassesProps {
  _id?: string | null;
  name: string;
  code?: string;
  institution?: string;
}

export interface ClassificationReliabilitySummary {
  kappa: number | null;
  weight: number | null;
  n_pairs: number;
}

export interface ClassificationReliabilityDetail extends ClassificationReliabilitySummary {
  matrix_available: boolean;
  labels?: string[];
  matrix?: number[][];
  updated_at?: string;
  user_id?: string;
}

export interface ClassMember {
  _id: string;
  name: string;
  email: string;
  contact_info?: string;
  profile_image_id?: string;
  classification_reliability?: ClassificationReliabilitySummary | null;
}

export async function getClassesList(): Promise<ClassesProps[]> {
  const response = await api.get(classesPath + "/list");
  return response.data.classes;
}

export interface CreateClassPayload {
  name: string;
  code?: string;
  institution?: string;
}

export async function createClass(payload: CreateClassPayload): Promise<ClassesProps> {
  const response = await api.post(classesPath + "/create", payload);
  return response.data.class;
}

export async function getStudentsByClass(classId: string): Promise<ClassMember[]> {
  const response = await api.get(`${classesPath}/${classId}/students`);
  return response.data.students;
}

export async function getTeachersByClass(classId: string): Promise<ClassMember[]> {
  const response = await api.get(`${classesPath}/${classId}/teachers`);
  return response.data.teachers;
}

export async function getStudentReliability(
  userId: string,
): Promise<ClassificationReliabilityDetail> {
  const response = await api.get(`/students/${userId}/reliability`);
  return response.data.reliability;
}