import React from 'react';
import Button from '../../Fields/Button';
import PolygonAnnotationEditor from '../../PolygonAnnotationEditor/PolygonAnnotationEditor';
import SegmentationAnnotationEditor from '../../SegmentationAnnotationEditor/SegmentationAnnotationEditor';
import ClassificationEditor from '../../ClassificationEditor/ClassificationEditor';
import type { COCOAnnotation } from '../../../services/COCOService';
import type { SegmentationAnnotation } from '../../../services/SegmentationService';
import type { AnswerItem, AnnotationTool } from '../types';
import { EmptyState } from '../../dla';

interface SupervisedPracticeProps {
  step: number;
  current: number;
  labelledMedias: string[];
  unlabelledMedias: string[];
  datasetId: string;
  labels: string[];
  selectedLabels: string[];
  isDetectionMode: boolean;
  isSegmentationMode: boolean;
  currentAnnotations: COCOAnnotation[];
  currentSegmentationAnnotations: SegmentationAnnotation[];
  labelledAnswers: AnswerItem[];
  iouThreshold: number;
  segmentationIoUThreshold: number;
  segmentationScoreMode: 'recall' | 'f1';
  onLabelChange: (label: string) => void;
  onSaveClassification: (labels: string[]) => Promise<void>;
  onSaveCOCOAnnotations: (annotations: COCOAnnotation[]) => Promise<void>;
  onSaveSegmentationAnnotations: (annotations: SegmentationAnnotation[]) => Promise<void>;
  onNextMedia: (mediaList: string[]) => Promise<void>;
  onPreviousMedia: () => Promise<void>;
  onContinueToUnsupervised: () => void;
  onFinalizeExercise: () => Promise<void>;
  setCurrent: React.Dispatch<React.SetStateAction<number>>;
  currentTool: AnnotationTool;
  selectedAnnotationLabel: string;
  onToolChange: (tool: AnnotationTool) => void;
  onSelectedLabelChange: (label: string) => void;
}

const SupervisedPractice: React.FC<SupervisedPracticeProps> = ({
  step,
  current,
  labelledMedias,
  unlabelledMedias,
  datasetId,
  labels,
  selectedLabels,
  isDetectionMode,
  isSegmentationMode,
  currentAnnotations,
  currentSegmentationAnnotations,
  onLabelChange,
  onSaveClassification,
  onSaveCOCOAnnotations,
  onSaveSegmentationAnnotations,
  onNextMedia,
  onContinueToUnsupervised,
  onFinalizeExercise,
  setCurrent,
  currentTool,
  selectedAnnotationLabel,
  onToolChange,
  onSelectedLabelChange,
}) => {
  const handleDetectionNext = async () => {
    if (current < labelledMedias.length - 1) {
      if (isSegmentationMode && currentSegmentationAnnotations.length > 0) {
        await onSaveSegmentationAnnotations(currentSegmentationAnnotations);
        await new Promise(resolve => setTimeout(resolve, 200));
      } else if (isDetectionMode && currentAnnotations.length > 0) {
        await onSaveCOCOAnnotations(currentAnnotations);
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      setCurrent((prev) => prev + 1);
    } else {
      if (isSegmentationMode && currentSegmentationAnnotations.length > 0) {
        await onSaveSegmentationAnnotations(currentSegmentationAnnotations);
        await new Promise(resolve => setTimeout(resolve, 300));
      } else if (isDetectionMode && currentAnnotations.length > 0) {
        await onSaveCOCOAnnotations(currentAnnotations);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      await onNextMedia(labelledMedias);
    }
  };

  const handleDetectionPrevious = async () => {
    if (isSegmentationMode && currentSegmentationAnnotations.length > 0) {
      await onSaveSegmentationAnnotations(currentSegmentationAnnotations);
    } else if (isDetectionMode && currentAnnotations.length > 0) {
      await onSaveCOCOAnnotations(currentAnnotations);
    }
    setCurrent((prev) => prev - 1);
  };

  if (step === 1 && labelledMedias.length === 0) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-8">
        <EmptyState
          title="Sem imagens de prática assistida"
          description="Este exercício não tem imagens rotuladas para a prática assistida."
        />
        <div className="flex flex-col gap-2">
          {unlabelledMedias.length > 0 && (
            <Button onClick={onContinueToUnsupervised}>Continuar para Prática Livre (Opcional)</Button>
          )}
          <Button onClick={onFinalizeExercise} variant="secondary">
            Finalizar Exercício
          </Button>
        </div>
      </div>
    );
  }

  if (step === 1 && labelledMedias.length > 0 && current < labelledMedias.length) {
    const isLast = current >= labelledMedias.length - 1;

    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="min-h-0 flex-1 overflow-hidden">
          {isSegmentationMode ? (
            <SegmentationAnnotationEditor
              key={labelledMedias[current]}
              fileId={labelledMedias[current]}
              datasetId={datasetId}
              labels={labels}
              existingAnnotations={currentSegmentationAnnotations}
              onSave={onSaveSegmentationAnnotations}
              initialTool={currentTool === 'rectangle' ? 'polygon' : (currentTool as 'hand' | 'polygon' | 'eraser')}
              initialSelectedLabel={selectedAnnotationLabel}
              onToolChange={(tool) => onToolChange(tool as AnnotationTool)}
              onSelectedLabelChange={onSelectedLabelChange}
              showNavigation
              canGoPrevious={current > 0}
              canGoNext={!isLast}
              onPrevious={handleDetectionPrevious}
              onNext={handleDetectionNext}
              isLastImage={isLast}
              currentIndex={current}
              totalImages={labelledMedias.length}
            />
          ) : isDetectionMode ? (
            <PolygonAnnotationEditor
              key={labelledMedias[current]}
              fileId={labelledMedias[current]}
              datasetId={datasetId}
              labels={labels}
              existingAnnotations={currentAnnotations}
              onSave={onSaveCOCOAnnotations}
              initialTool={currentTool === 'polygon' ? 'rectangle' : (currentTool as 'hand' | 'rectangle' | 'eraser')}
              initialSelectedLabel={selectedAnnotationLabel}
              onToolChange={(tool) => onToolChange(tool as AnnotationTool)}
              onSelectedLabelChange={onSelectedLabelChange}
              showNavigation
              canGoPrevious={current > 0}
              canGoNext={!isLast}
              onPrevious={handleDetectionPrevious}
              onNext={handleDetectionNext}
              isLastImage={isLast}
              currentIndex={current}
              totalImages={labelledMedias.length}
            />
          ) : (
            <ClassificationEditor
              key={labelledMedias[current]}
              fileId={labelledMedias[current]}
              labels={labels}
              selectedLabels={selectedLabels}
              onLabelChange={(newLabels) => onLabelChange(newLabels[0] || '')}
              onSave={onSaveClassification}
              showNavigation
              canGoPrevious={current > 0}
              canGoNext={!isLast}
              onPrevious={current > 0 ? () => setCurrent((p) => p - 1) : undefined}
              onNext={() => onNextMedia(labelledMedias)}
              isLastImage={isLast}
              currentIndex={current}
              totalImages={labelledMedias.length}
            />
          )}
        </div>
      </div>
    );
  }

  return null;
};

export default React.memo(SupervisedPractice);
