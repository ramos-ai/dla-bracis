import { useEffect, useState, useCallback } from 'react';
import { getCOCOAnnotation } from '../../../services/COCOService';
import { 
  getSegmentationByMedia, 
  evaluateSegmentation, 
  type SegmentationAnnotation
} from '../../../services/SegmentationService';
import { useCancelledFlag } from '../../../hooks/useAbortableFetch';
import type { AnswerItem, FeedbackData } from '../types';

interface UseFeedbackLoaderProps {
  step: number;
  datasetId: string;
  labelledMedias: string[];
  labelledAnswers: AnswerItem[];
  isDetectionMode: boolean;
  isSegmentationMode: boolean;
  segmentationIoUThreshold: number;
  segmentationScoreMode: 'recall' | 'f1';
}

interface UseFeedbackLoaderReturn {
  feedbackData: FeedbackData;
  loadFeedbackForMedia: (mediaId: string) => Promise<void>;
}

export function useFeedbackLoader({
  step,
  datasetId,
  labelledMedias,
  labelledAnswers,
  isDetectionMode,
  isSegmentationMode,
  segmentationIoUThreshold,
  segmentationScoreMode,
}: UseFeedbackLoaderProps): UseFeedbackLoaderReturn {
  const { isCancelled: isCancelledFeedback, reset: resetCancelledFeedback, cancel: cancelFeedback } = useCancelledFlag();
  
  const [feedbackData, setFeedbackData] = useState<FeedbackData>({
    correctCoco: {},
    correctSegmentation: {},
    segmentationEval: {},
    loading: false,
  });

  const loadFeedbackForMedia = useCallback(async (mediaId: string) => {
    if (!mediaId) return;
    
    setFeedbackData(prev => ({ ...prev, loading: true }));
    
    try {
      if (isSegmentationMode) {
        const response = await getSegmentationByMedia(datasetId, mediaId);
        const correctAnnotations = response?.annotations || [];
        
        setFeedbackData(prev => ({
          ...prev,
          correctSegmentation: {
            ...prev.correctSegmentation,
            [mediaId]: correctAnnotations,
          },
        }));
        
        const userAnswer = labelledAnswers.find(a => a.mediaId === mediaId);
        if (userAnswer && 'annotations' in userAnswer && userAnswer.annotations) {
          const evalResult = await evaluateSegmentation(
            datasetId,
            mediaId,
            userAnswer.annotations as SegmentationAnnotation[],
            segmentationIoUThreshold,
            segmentationScoreMode
          );
          
          setFeedbackData(prev => ({
            ...prev,
            segmentationEval: {
              ...prev.segmentationEval,
              [mediaId]: { score: evalResult?.score ?? 0, matches: evalResult?.matches ?? [] },
            },
          }));
        }
      } else if (isDetectionMode) {
        const response = await getCOCOAnnotation(datasetId, mediaId);
        const correctAnnotations = response?.annotations || [];
        
        setFeedbackData(prev => ({
          ...prev,
          correctCoco: {
            ...prev.correctCoco,
            [mediaId]: correctAnnotations,
          },
        }));
      }
    } catch (error) {
      console.error('Error loading feedback for media:', error);
    } finally {
      setFeedbackData(prev => ({ ...prev, loading: false }));
    }
  }, [datasetId, isSegmentationMode, isDetectionMode, labelledAnswers, segmentationIoUThreshold, segmentationScoreMode]);

  useEffect(() => {
    if (step !== 2 || (!isDetectionMode && !isSegmentationMode) || labelledMedias.length === 0) return;
    
    resetCancelledFeedback();
    
    const loadAllFeedback = async () => {
      setFeedbackData(prev => ({ ...prev, loading: true }));
      
      for (const mediaId of labelledMedias) {
        if (isCancelledFeedback()) return;
        
        try {
          if (isSegmentationMode) {
            const response = await getSegmentationByMedia(datasetId, mediaId);
            if (isCancelledFeedback()) return;
            const correctAnnotations = response?.annotations || [];
            
            setFeedbackData(prev => ({
              ...prev,
              correctSegmentation: {
                ...prev.correctSegmentation,
                [mediaId]: correctAnnotations,
              },
            }));
            
            const userAnswer = labelledAnswers.find(a => a.mediaId === mediaId);
            if (userAnswer && 'annotations' in userAnswer && userAnswer.annotations) {
              const evalResult = await evaluateSegmentation(
                datasetId,
                mediaId,
                userAnswer.annotations as SegmentationAnnotation[],
                segmentationIoUThreshold,
                segmentationScoreMode
              );
              
              if (isCancelledFeedback()) return;
              
              setFeedbackData(prev => ({
                ...prev,
                segmentationEval: {
                  ...prev.segmentationEval,
                  [mediaId]: { score: evalResult?.score ?? 0, matches: evalResult?.matches ?? [] },
                },
              }));
            }
          } else {
            const response = await getCOCOAnnotation(datasetId, mediaId);
            if (isCancelledFeedback()) return;
            const correctAnnotations = response?.annotations || [];
            
            setFeedbackData(prev => ({
              ...prev,
              correctCoco: {
                ...prev.correctCoco,
                [mediaId]: correctAnnotations,
              },
            }));
          }
        } catch (error) {
          console.error(`Error loading feedback for media ${mediaId}:`, error);
        }
      }
      
      if (!isCancelledFeedback()) {
        setFeedbackData(prev => ({ ...prev, loading: false }));
      }
    };
    
    loadAllFeedback();
    return () => { cancelFeedback(); };
  }, [step, datasetId, labelledMedias, isDetectionMode, isSegmentationMode, labelledAnswers, segmentationIoUThreshold, segmentationScoreMode]);

  return {
    feedbackData,
    loadFeedbackForMedia,
  };
}
