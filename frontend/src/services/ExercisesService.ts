import { api } from "./api";
import type { COCOAnnotation } from "./COCOService";
import type { SegmentationAnnotation } from "./SegmentationService";

const exercisesPath = "/exercises"

export interface ExerciseProps {
  _id: string | null;
  didactic_detailing: string;
  class_name?: string;
  title: string;
  do_date: string;
  class: string;
  score: number;
  dataset: string;
  user_id?: string; //pegar esse dado aqui dentro
  whole_dataset: boolean; // quando o professor quer enviar o dataset inteiro para o exercício sem precisar selecionar cada um
  supervised_practice: string[];
  created_at: string,
  last_update: string,
  unsupervised_practice: string[];
  iou_threshold?: number; // Threshold de IoU para exercícios de detecção (0.0 a 1.0)
  detection_score_mode?: 'recall' | 'f1'; // Modo de nota para detecção (Recall ou F1)
  segmentation_iou_threshold?: number; // Threshold IoU máscara para segmentação (0.0 a 1.0)
  segmentation_score_mode?: 'recall' | 'f1'; // Modo de nota para segmentação
  /** Tipo de tarefa do dataset (classification | segmentation | detection), preenchido pela API list/by_class */
  task_type?: string;
}

export type AnnotationType = COCOAnnotation | SegmentationAnnotation;

export interface SubmissionAnswerItem {
  mediaId: string;
  labels?: string[];
  annotations?: AnnotationType[];
}

export interface SubmissionProps {
  _id?: string;
  userId: string;
  exerciseId: string;
  labelledAnswers?: SubmissionAnswerItem[];
  unlabelledAnswers?: SubmissionAnswerItem[];
  dataset_id?: string;
  finalized?: boolean;
  supervisedScore?: number | null;
  manualScore?: number | null;
  finalScore?: number | null;
  hasManualCorrection?: boolean;
  manualCorrections?: Record<string, Record<string, boolean>>;
  manualCorrectionBy?: string;
  manualCorrectionAt?: string;
  submittedAt?: string;
  finalizedAt?: string;
  studentName?: string; // Added for teacher view
  studentEmail?: string; // Added for teacher view
  isFinalized?: boolean; // Added to check if exercise is finalized
}

export async function saveExercise(exercise: ExerciseProps) {
  const response = await api.post(exercisesPath + "/create", exercise);
  return response.data;
}

export async function editExercise(exercise: ExerciseProps) {
  const response = await api.post(exercisesPath + "/edit", exercise);
  return response.data;
}

export async function getExercisesList(classId?: string | null) {
  const params = classId ? { class_id: classId } : {};
  const response = await api.get(exercisesPath + "/list", { params });
  return response.data;
}

export async function getExercisesById(
  exerciseId: string
): Promise<ExerciseProps> {
  const response = await api.get(exercisesPath + `/exercise_by_id/${exerciseId}`);
  return response.data.exercise;
}

export async function deleteExercise(exerciseId: string): Promise<{ success: boolean; deleted_submissions: number }> {
  const response = await api.delete(exercisesPath + `/delete/${exerciseId}`);
  return response.data;
}

export async function getExercisesByClassId(
  classId: string
) {
  const response = await api.get(exercisesPath + `/by_class/${classId}`);
  return response.data.exercises;
}

export async function getExercisesByDatasetId(datasetId: string): Promise<ExerciseProps[]> {
  const response = await api.get(exercisesPath + `/by_dataset/${datasetId}`);
  return response.data.exercises ?? [];
}

export async function saveSubmission(submissionData: SubmissionProps) {
  const response = await api.post(exercisesPath + "/save_submission", submissionData);
  return response.data;
}

export async function getSubmissions(): Promise<SubmissionProps[]> {
  const response = await api.get(exercisesPath + "/get_submissions");
  return response.data;
}

export async function getSubmissionsByExerciseId(exerciseId: string): Promise<SubmissionProps[]> {
  const response = await api.get(exercisesPath + "/get_submissions_by_exercise/" + exerciseId);
  return response.data.submissions;
}

export async function getSubmissionByUserAndExercise(exerciseId: string, userId: string): Promise<SubmissionProps | null> {
  const response = await api.get(exercisesPath + `/submission/${exerciseId}/${userId}`);
  return response.data.submission;
}

export interface DashboardStats {
  total_exercises: number;
  total_submissions: number;
  total_students: number;
  average_score: number;
  exercises_stats: Array<{
    exercise_id: string;
    title: string;
    total_submissions: number;
    finalized_submissions: number;
    average_score: number;
    completion_rate: number;
  }>;
  score_distribution: Array<{
    range: string;
    count: number;
  }>;
  submissions_by_exercise: Array<{
    title: string;
    count: number;
    finalized: number;
  }>;
  completion_rate: number;
  confusion_matrix: {
    labels: string[];
    matrix: number[][];
    total: number;
  };
  student_evolution: Array<{
    week: string;
    average: number;
    count: number;
  }>;
  label_distribution: Array<{
    label: string;
    count: number;
  }>;
  label_performance: Array<{
    label: string;
    score: number;
    total: number;
    correct: number;
  }>;
  insights: Array<{
    type: 'success' | 'warning' | 'error' | 'info';
    severity: 'critical' | 'high' | 'medium' | 'low';
    title: string;
    description: string;
    icon: string;
  }>;
}

/** Estatísticas do dashboard do professor. Passar classId para filtrar por turma. */
export async function getTeacherDashboardStats(classId?: string | null): Promise<DashboardStats> {
  const params = classId ? { class_id: classId } : {};
  const response = await api.get(exercisesPath + '/dashboard/stats', { params });
  return response.data;
}

export interface RankingEntry {
  rank: number;
  user_id: string;
  name: string;
  average_score: number;
}

export interface RankingByClass {
  class_id: string;
  class_name: string;
  students: RankingEntry[];
}

export interface RankingResponse {
  global: RankingEntry[];
  by_class: RankingByClass[];
}

/** Ranking de alunos. Passar classId para filtrar por turma. */
export async function getRanking(topN: number = 50, classId?: string | null): Promise<RankingResponse> {
  const params: { top: number; class_id?: string } = { top: topN };
  if (classId) params.class_id = classId;
  const response = await api.get(exercisesPath + '/ranking', { params });
  return response.data;
}

export interface StudentStats {
  total_completed: number;
  average_score: number;
  total_submissions: number;
}

export interface PendingExercise {
  _id: string;
  title: string;
  task_type?: string;
  do_date?: string | null;
}

export interface StudentDashboard {
  stats: StudentStats;
  pending_exercises: PendingExercise[];
}

export async function getStudentStats(): Promise<StudentStats> {
  const response = await api.get('/student/stats');
  return response.data;
}

export async function getStudentDashboard(): Promise<StudentDashboard> {
  const response = await api.get('/student/dashboard');
  return response.data;
}

export interface CommonError {
  error_type: 'wrong_label' | 'missing_label';
  label: string;
  media_id: string;
  frequency: number;
  percentage: number;
}

export interface CommonErrorsResponse {
  errors: CommonError[];
  total_submissions: number;
  message?: string;
}

export async function getExerciseCommonErrors(exerciseId: string): Promise<CommonErrorsResponse> {
  const response = await api.get(exercisesPath + `/exercise/${exerciseId}/common_errors`);
  return response.data;
}

export interface ManualCorrectionData {
  exerciseId: string;
  userId: string;
  manualCorrections: Record<string, Record<string, boolean>>; // { mediaId: { annotationIdx: true/false } }
}

export interface ManualCorrectionResponse {
  success: boolean;
  message: string;
  manualScore?: number;
  percentageScore?: number;
}

export async function saveManualCorrection(data: ManualCorrectionData): Promise<ManualCorrectionResponse> {
  const response = await api.post(exercisesPath + '/submission/manual_correction', data);
  return response.data;
}

export interface AggregatedAnnotation {
  user_id: string;
  type: 'bbox' | 'polygon';
  label_index: number;
  bbox?: number[];
  polygon?: number[];
}

export interface AggregatedImage {
  image_id: string;
  annotations: AggregatedAnnotation[];
}

export interface AggregatedAnnotationsResponse {
  task_type: 'detection' | 'segmentation';
  labels: string[];
  images: AggregatedImage[];
}

export async function getAggregatedAnnotations(exerciseId: string): Promise<AggregatedAnnotationsResponse> {
  const response = await api.get(exercisesPath + `/exercise/${exerciseId}/aggregated_annotations`);
  return response.data;
}