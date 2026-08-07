import { useState, useCallback } from 'react';
import { getCOCOAnnotation, COCOAnnotation } from '../services/COCOService';
import { getSegmentationByMedia, evaluateSegmentation, SegmentationAnnotation, SegmentationMatch } from '../services/SegmentationService';
import { getLabelsForFile } from '../services/TrainingService';
import { useCancelledFlag } from './useAbortableFetch';

interface AnnotationData {
  cocoAnnotations: Record<string, COCOAnnotation[]>;
  segmentationAnnotations: Record<string, SegmentationAnnotation[]>;
  classificationLabels: Record<string, string[]>;
  segmentationEvaluations: Record<string, { score: number; matches: SegmentationMatch[] }>;
}

interface UseAnnotationLoaderReturn {
  data: AnnotationData;
  loading: boolean;
  error: string | null;
  loadAnnotationsForMedias: (
    datasetId: string,
    mediaIds: string[],
    taskType: 'classification' | 'detection' | 'segmentation',
    options?: {
      studentAnnotations?: Record<string, SegmentationAnnotation[]>;
      iouThreshold?: number;
      scoreMode?: 'recall' | 'f1';
    }
  ) => Promise<void>;
  clearData: () => void;
}

const initialData: AnnotationData = {
  cocoAnnotations: {},
  segmentationAnnotations: {},
  classificationLabels: {},
  segmentationEvaluations: {},
};

/**
 * Hook for loading annotations from the backend.
 * Supports COCO (detection), segmentation, and classification annotations.
 * Includes cancellation support to prevent race conditions.
 */
export function useAnnotationLoader(): UseAnnotationLoaderReturn {
  const [data, setData] = useState<AnnotationData>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isCancelled, reset, cancel } = useCancelledFlag();

  const clearData = useCallback(() => {
    setData(initialData);
    setError(null);
  }, []);

  const loadAnnotationsForMedias = useCallback(async (
    datasetId: string,
    mediaIds: string[],
    taskType: 'classification' | 'detection' | 'segmentation',
    options?: {
      studentAnnotations?: Record<string, SegmentationAnnotation[]>;
      iouThreshold?: number;
      scoreMode?: 'recall' | 'f1';
    }
  ) => {
    cancel();
    reset();
    setLoading(true);
    setError(null);

    const cocoMap: Record<string, COCOAnnotation[]> = {};
    const segMap: Record<string, SegmentationAnnotation[]> = {};
    const labelsMap: Record<string, string[]> = {};
    const evalMap: Record<string, { score: number; matches: SegmentationMatch[] }> = {};

    try {
      for (const mediaId of mediaIds) {
        if (isCancelled()) return;

        try {
          if (taskType === 'detection') {
            const response = await getCOCOAnnotation(datasetId, mediaId);
            if (isCancelled()) return;
            cocoMap[mediaId] = response.annotations || [];
          } else if (taskType === 'segmentation') {
            const response = await getSegmentationByMedia(datasetId, mediaId);
            if (isCancelled()) return;
            segMap[mediaId] = response.annotations || [];

            if (options?.studentAnnotations?.[mediaId]) {
              const studentAnns = options.studentAnnotations[mediaId];
              if (studentAnns.length > 0 || (response.annotations || []).length > 0) {
                const evalResult = await evaluateSegmentation(
                  datasetId,
                  mediaId,
                  studentAnns,
                  options.iouThreshold ?? 0.75,
                  options.scoreMode ?? 'recall'
                );
                if (isCancelled()) return;
                evalMap[mediaId] = { score: evalResult.score, matches: evalResult.matches };
              }
            }
          } else {
            const labels = await getLabelsForFile(datasetId, mediaId);
            if (isCancelled()) return;
            labelsMap[mediaId] = labels || [];
          }
        } catch (err) {
          if (!isCancelled()) {
            console.error(`Error loading annotations for media ${mediaId}:`, err);
            if (taskType === 'detection') cocoMap[mediaId] = [];
            else if (taskType === 'segmentation') segMap[mediaId] = [];
            else labelsMap[mediaId] = [];
          }
        }
      }

      if (!isCancelled()) {
        setData({
          cocoAnnotations: cocoMap,
          segmentationAnnotations: segMap,
          classificationLabels: labelsMap,
          segmentationEvaluations: evalMap,
        });
      }
    } catch (err) {
      if (!isCancelled()) {
        const message = err instanceof Error ? err.message : 'Erro ao carregar anotações';
        setError(message);
        console.error('Error loading annotations:', err);
      }
    } finally {
      if (!isCancelled()) {
        setLoading(false);
      }
    }
  }, [isCancelled, reset, cancel]);

  return {
    data,
    loading,
    error,
    loadAnnotationsForMedias,
    clearData,
  };
}
