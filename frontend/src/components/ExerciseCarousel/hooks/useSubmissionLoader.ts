import { useEffect } from 'react';
import { getSubmissionByUserAndExercise } from '../../../services/ExercisesService';
import { getDatasetLabels, getDatasetById } from '../../../services/datasetsService';
import { useCancelledFlag } from '../../../hooks/useAbortableFetch';
import type { COCOAnnotation } from '../../../services/COCOService';
import type { SegmentationAnnotation } from '../../../services/SegmentationService';
import type { AnswerItem, TabType, ExerciseStep } from '../types';
import { isSubmissionFinalized, findLastAnsweredIndex } from '../utils/exerciseHelpers';

interface UseSubmissionLoaderProps {
  exerciseId: string;
  userId: string;
  datasetId: string;
  labelledMedias: string[];
  unlabelledMedias: string[];
  totalSteps: number;
  isDetectionMode: boolean;
  isSegmentationMode: boolean;
  setIsFinalized: React.Dispatch<React.SetStateAction<boolean>>;
  setStep: React.Dispatch<React.SetStateAction<ExerciseStep>>;
  setBarStep: React.Dispatch<React.SetStateAction<number>>;
  setHasStarted: React.Dispatch<React.SetStateAction<boolean>>;
  setSupervisedScore: React.Dispatch<React.SetStateAction<number | null>>;
  setLabelledAnswers: React.Dispatch<React.SetStateAction<AnswerItem[]>>;
  setUnlabelledAnswers: React.Dispatch<React.SetStateAction<AnswerItem[]>>;
  setCurrentAnnotations: React.Dispatch<React.SetStateAction<COCOAnnotation[]>>;
  setCurrentSegmentationAnnotations: React.Dispatch<React.SetStateAction<SegmentationAnnotation[]>>;
  setCurrent: React.Dispatch<React.SetStateAction<number>>;
  setCurrentTab: React.Dispatch<React.SetStateAction<TabType>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setLabels: React.Dispatch<React.SetStateAction<string[]>>;
  setIsDetectionMode: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useSubmissionLoader({
  exerciseId,
  userId,
  datasetId,
  labelledMedias,
  unlabelledMedias,
  totalSteps,
  isDetectionMode,
  isSegmentationMode,
  setIsFinalized,
  setStep,
  setBarStep,
  setHasStarted,
  setSupervisedScore,
  setLabelledAnswers,
  setUnlabelledAnswers,
  setCurrentAnnotations,
  setCurrentSegmentationAnnotations,
  setCurrent,
  setCurrentTab,
  setIsLoading,
  setLabels,
  setIsDetectionMode,
}: UseSubmissionLoaderProps): void {
  const { isCancelled: isCancelledInit, reset: resetCancelledInit, cancel: cancelInit } = useCancelledFlag();
  const { isCancelled: isCancelledFetch, reset: resetCancelledFetch, cancel: cancelFetch } = useCancelledFlag();

  // Load existing submission
  useEffect(() => {
    resetCancelledInit();
    
    const checkIfFinalized = async () => {
      try {
        const submission = await getSubmissionByUserAndExercise(exerciseId, userId);
        if (isCancelledInit()) return;
        
        const finalized = isSubmissionFinalized(submission);
        setIsFinalized(finalized);
        
        if (finalized) {
          setStep(4);
          setBarStep(totalSteps);
          setHasStarted(true);
          if (submission?.supervisedScore !== null && submission?.supervisedScore !== undefined) {
            setSupervisedScore(submission.supervisedScore);
          }
        } else {
          const hasLabelledAnswers = submission?.labelledAnswers ? submission.labelledAnswers.length > 0 : false;
          const hasUnlabelledAnswers = submission?.unlabelledAnswers ? submission.unlabelledAnswers.length > 0 : false;
          
          if (submission && (hasLabelledAnswers || hasUnlabelledAnswers)) {
            setHasStarted(true);
            
            if (submission.labelledAnswers) {
              setLabelledAnswers(submission.labelledAnswers as AnswerItem[]);
              
              if (isDetectionMode && labelledMedias.length > 0) {
                const currentMediaId = labelledMedias[0];
                const currentAnswer = submission.labelledAnswers.find(a => a.mediaId === currentMediaId);
                if (currentAnswer && 'annotations' in currentAnswer && currentAnswer.annotations) {
                  if (isSegmentationMode) {
                    setCurrentSegmentationAnnotations(currentAnswer.annotations as unknown as SegmentationAnnotation[]);
                  } else {
                    setCurrentAnnotations(currentAnswer.annotations as unknown as COCOAnnotation[]);
                  }
                }
              }
            }
            
            if (submission.unlabelledAnswers) {
              setUnlabelledAnswers(submission.unlabelledAnswers as AnswerItem[]);
              
              if (isDetectionMode && unlabelledMedias.length > 0) {
                const currentMediaId = unlabelledMedias[0];
                const currentAnswer = submission.unlabelledAnswers.find(a => a.mediaId === currentMediaId);
                if (currentAnswer && 'annotations' in currentAnswer && currentAnswer.annotations) {
                  if (isSegmentationMode) {
                    setCurrentSegmentationAnnotations(currentAnswer.annotations as unknown as SegmentationAnnotation[]);
                  } else {
                    setCurrentAnnotations(currentAnswer.annotations as unknown as COCOAnnotation[]);
                  }
                }
              }
            }
            
            if (submission.supervisedScore !== null && submission.supervisedScore !== undefined) {
              setSupervisedScore(submission.supervisedScore);
              setStep(2);
              setCurrentTab('supervised');
            } else if (hasLabelledAnswers) {
              setStep(1);
              setCurrentTab('supervised');
              const lastAnsweredIndex = findLastAnsweredIndex(labelledMedias, submission.labelledAnswers as AnswerItem[] | undefined);
              if (lastAnsweredIndex !== -1) {
                setCurrent(lastAnsweredIndex);
              }
            } else if (hasUnlabelledAnswers) {
              setStep(3);
              setCurrentTab('unsupervised');
              const lastAnsweredIndex = findLastAnsweredIndex(unlabelledMedias, submission.unlabelledAnswers as AnswerItem[] | undefined);
              if (lastAnsweredIndex !== -1) {
                setCurrent(lastAnsweredIndex);
              }
            }
          }
        }
      } catch (error) {
        if (!isCancelledInit()) {
          console.error('Error checking if exercise is finalized:', error);
        }
      } finally {
        if (!isCancelledInit()) {
          setIsLoading(false);
        }
      }
    };
    
    checkIfFinalized();
    return () => { cancelInit(); };
  }, [exerciseId, userId, totalSteps]);

  // Load labels and task type
  useEffect(() => {
    resetCancelledFetch();
    
    const fetchLabels = async () => {
      try {
        const response = await getDatasetLabels(datasetId);
        if (!isCancelledFetch()) {
          setLabels(response);
        }
      } catch (err) {
        if (!isCancelledFetch()) {
          console.error(err as Error);
        }
      }
    };
    
    const fetchTaskType = async () => {
      try {
        const dataset = await getDatasetById(datasetId);
        if (!isCancelledFetch()) {
          const mode = dataset.task_type === 'detection' || dataset.task_type === 'segmentation';
          setIsDetectionMode(mode);
        }
      } catch (err) {
        if (!isCancelledFetch()) {
          console.error('Erro ao carregar tipo de tarefa:', err);
        }
      }
    };
    
    fetchLabels();
    fetchTaskType();
    return () => { cancelFetch(); };
  }, [datasetId]);
}
