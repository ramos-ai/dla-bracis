import type { COCOAnnotation } from '../../services/COCOService';
import type { SegmentationAnnotation, SegmentationMatch } from '../../services/SegmentationService';

export type TabType = 'explanation' | 'supervised' | 'unsupervised';

export type AnnotationTool = 'hand' | 'rectangle' | 'polygon' | 'eraser';

export type ExerciseStep = 0 | 1 | 2 | 3 | 4;

export type AnnotationType = COCOAnnotation | SegmentationAnnotation;

export interface AnswerItem {
  mediaId: string;
  labels?: string[];
  annotations?: AnnotationType[];
}

export interface ExerciseCarouselProps {
  exerciseId: string;
  datasetId: string;
  labelledMedias: string[];
  unlabelledMedias: string[];
  didaticDetailing: string;
  taskType?: 'classification' | 'detection' | 'segmentation';
  onComplete?: () => void | Promise<void>;
  iouThreshold?: number;
  segmentationIoUThreshold?: number;
  segmentationScoreMode?: 'recall' | 'f1';
  teacherName?: string;
}

export interface ExerciseState {
  currentTab: TabType;
  current: number;
  step: ExerciseStep;
  barStep: number;
  labels: string[];
  selectedLabels: string[];
  labelledAnswers: AnswerItem[];
  unlabelledAnswers: AnswerItem[];
  isFinalized: boolean;
  isLoading: boolean;
  hasStarted: boolean;
  supervisedScore: number | null;
  isDetectionMode: boolean;
  currentAnnotations: COCOAnnotation[];
  currentSegmentationAnnotations: SegmentationAnnotation[];
}

export interface FeedbackData {
  correctCoco: Record<string, COCOAnnotation[]>;
  correctSegmentation: Record<string, SegmentationAnnotation[]>;
  segmentationEval: Record<string, { score: number; matches: SegmentationMatch[] }>;
  loading: boolean;
}

export interface ReportModalState {
  isOpen: boolean;
  text: string;
  type: 'error' | 'unlabelled';
}
