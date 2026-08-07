import { useState, useRef, useCallback } from 'react';
import type { COCOAnnotation } from '../../../services/COCOService';
import type { SegmentationAnnotation } from '../../../services/SegmentationService';
import type { TabType, ExerciseStep, AnswerItem } from '../types';
import { resetLabelInputs, updateAnswerInList } from '../utils/exerciseHelpers';

interface UseExerciseStateProps {
  labelledMedias: string[];
  unlabelledMedias: string[];
  taskType: string;
}

interface UseExerciseStateReturn {
  // Tab and navigation state
  currentTab: TabType;
  setCurrentTab: React.Dispatch<React.SetStateAction<TabType>>;
  current: number;
  setCurrent: React.Dispatch<React.SetStateAction<number>>;
  step: ExerciseStep;
  setStep: React.Dispatch<React.SetStateAction<ExerciseStep>>;
  barStep: number;
  setBarStep: React.Dispatch<React.SetStateAction<number>>;
  
  // Labels state
  labels: string[];
  setLabels: React.Dispatch<React.SetStateAction<string[]>>;
  selectedLabels: string[];
  setSelectedLabels: React.Dispatch<React.SetStateAction<string[]>>;
  
  // Answers state
  labelledAnswers: AnswerItem[];
  setLabelledAnswers: React.Dispatch<React.SetStateAction<AnswerItem[]>>;
  unlabelledAnswers: AnswerItem[];
  setUnlabelledAnswers: React.Dispatch<React.SetStateAction<AnswerItem[]>>;
  
  // Exercise status
  isFinalized: boolean;
  setIsFinalized: React.Dispatch<React.SetStateAction<boolean>>;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  hasStarted: boolean;
  setHasStarted: React.Dispatch<React.SetStateAction<boolean>>;
  supervisedScore: number | null;
  setSupervisedScore: React.Dispatch<React.SetStateAction<number | null>>;
  
  // Detection/Segmentation state
  isDetectionMode: boolean;
  setIsDetectionMode: React.Dispatch<React.SetStateAction<boolean>>;
  isSegmentationMode: boolean;
  currentAnnotations: COCOAnnotation[];
  setCurrentAnnotations: React.Dispatch<React.SetStateAction<COCOAnnotation[]>>;
  currentSegmentationAnnotations: SegmentationAnnotation[];
  setCurrentSegmentationAnnotations: React.Dispatch<React.SetStateAction<SegmentationAnnotation[]>>;
  
  // Refs
  hasUnsavedChanges: React.MutableRefObject<boolean>;
  
  // Computed values
  totalSteps: number;
  
  // Actions
  handleLabelChange: (label: string) => void;
  resetLabels: () => void;
  updateAnswerList: (answer: AnswerItem, isLabelled: boolean) => void;
  handleStartExercise: (e?: React.MouseEvent) => void;
}

export function useExerciseState({
  labelledMedias,
  unlabelledMedias,
  taskType,
}: UseExerciseStateProps): UseExerciseStateReturn {
  // Tab and navigation state
  const [currentTab, setCurrentTab] = useState<TabType>('explanation');
  const [current, setCurrent] = useState<number>(0);
  const [step, setStep] = useState<ExerciseStep>(0);
  const [barStep, setBarStep] = useState<number>(0);
  
  // Labels state
  const [labels, setLabels] = useState<string[]>([]);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  
  // Answers state
  const [labelledAnswers, setLabelledAnswers] = useState<AnswerItem[]>([]);
  const [unlabelledAnswers, setUnlabelledAnswers] = useState<AnswerItem[]>([]);
  
  // Exercise status
  const [isFinalized, setIsFinalized] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  const [supervisedScore, setSupervisedScore] = useState<number | null>(null);
  
  // Detection/Segmentation state
  const [isDetectionMode, setIsDetectionMode] = useState<boolean>(
    taskType === 'detection' || taskType === 'segmentation'
  );
  const isSegmentationMode = taskType === 'segmentation';
  const [currentAnnotations, setCurrentAnnotations] = useState<COCOAnnotation[]>([]);
  const [currentSegmentationAnnotations, setCurrentSegmentationAnnotations] = useState<SegmentationAnnotation[]>([]);
  
  // Refs
  const hasUnsavedChanges = useRef<boolean>(false);
  
  // Computed values
  const totalSteps = labelledMedias.length + unlabelledMedias.length;
  
  // Actions
  const handleLabelChange = useCallback((label: string) => {
    setSelectedLabels([label]);
  }, []);
  
  const resetLabels = useCallback(() => {
    setSelectedLabels([]);
    resetLabelInputs();
  }, []);
  
  const updateAnswerList = useCallback((answer: AnswerItem, isLabelled: boolean) => {
    if (isLabelled) {
      setLabelledAnswers(prev => updateAnswerInList(prev, answer));
    } else {
      setUnlabelledAnswers(prev => updateAnswerInList(prev, answer));
    }
  }, []);
  
  const handleStartExercise = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setHasStarted(true);
    
    if (labelledMedias.length > 0) {
      setCurrentTab('supervised');
      setStep(1);
      setCurrent(0);
      setBarStep(0);
    } else if (unlabelledMedias.length > 0) {
      setCurrentTab('unsupervised');
      setStep(3);
      setCurrent(0);
      setBarStep(0);
    } else {
      setCurrentTab('supervised');
      setStep(2);
      setBarStep(0);
    }
  }, [labelledMedias.length, unlabelledMedias.length]);
  
  return {
    // Tab and navigation state
    currentTab,
    setCurrentTab,
    current,
    setCurrent,
    step,
    setStep,
    barStep,
    setBarStep,
    
    // Labels state
    labels,
    setLabels,
    selectedLabels,
    setSelectedLabels,
    
    // Answers state
    labelledAnswers,
    setLabelledAnswers,
    unlabelledAnswers,
    setUnlabelledAnswers,
    
    // Exercise status
    isFinalized,
    setIsFinalized,
    isLoading,
    setIsLoading,
    hasStarted,
    setHasStarted,
    supervisedScore,
    setSupervisedScore,
    
    // Detection/Segmentation state
    isDetectionMode,
    setIsDetectionMode,
    isSegmentationMode,
    currentAnnotations,
    setCurrentAnnotations,
    currentSegmentationAnnotations,
    setCurrentSegmentationAnnotations,
    
    // Refs
    hasUnsavedChanges,
    
    // Computed values
    totalSteps,
    
    // Actions
    handleLabelChange,
    resetLabels,
    updateAnswerList,
    handleStartExercise,
  };
}
