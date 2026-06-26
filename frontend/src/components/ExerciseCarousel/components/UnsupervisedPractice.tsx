import React from 'react';
import Button from '../../Fields/Button';
import PolygonAnnotationEditor from '../../PolygonAnnotationEditor/PolygonAnnotationEditor';
import SegmentationAnnotationEditor from '../../SegmentationAnnotationEditor/SegmentationAnnotationEditor';
import ClassificationEditor from '../../ClassificationEditor/ClassificationEditor';
import type { COCOAnnotation } from '../../../services/COCOService';
import type { SegmentationAnnotation } from '../../../services/SegmentationService';
import type { AnnotationTool } from '../types';

interface UnsupervisedPracticeProps {
  current: number;
  unlabelledMedias: string[];
  datasetId: string;
  labels: string[];
  selectedLabels: string[];
  isDetectionMode: boolean;
  isSegmentationMode: boolean;
  currentAnnotations: COCOAnnotation[];
  currentSegmentationAnnotations: SegmentationAnnotation[];
  onLabelChange: (label: string) => void;
  onSaveClassification: (labels: string[]) => Promise<void>;
  onSaveCOCOAnnotations: (annotations: COCOAnnotation[]) => Promise<void>;
  onSaveSegmentationAnnotations: (annotations: SegmentationAnnotation[]) => Promise<void>;
  onNextMedia: (mediaList: string[]) => Promise<void>;
  onPreviousMedia: () => Promise<void>;
  onFinalizeExercise: () => Promise<void>;
  onSaveAndFinalize: () => Promise<void>;
  setCurrent: React.Dispatch<React.SetStateAction<number>>;
  currentTool: AnnotationTool;
  selectedAnnotationLabel: string;
  onToolChange: (tool: AnnotationTool) => void;
  onSelectedLabelChange: (label: string) => void;
}

const UnsupervisedPractice: React.FC<UnsupervisedPracticeProps> = ({
  current,
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
  onPreviousMedia,
  onFinalizeExercise,
  onSaveAndFinalize,
  setCurrent,
  currentTool,
  selectedAnnotationLabel,
  onToolChange,
  onSelectedLabelChange,
}) => {
  const handleDetectionPrevious = async () => {
    if (isSegmentationMode && currentSegmentationAnnotations.length > 0) {
      await onSaveSegmentationAnnotations(currentSegmentationAnnotations);
    } else if (isDetectionMode && currentAnnotations.length > 0) {
      await onSaveCOCOAnnotations(currentAnnotations);
    }
    setCurrent((prev) => prev - 1);
  };

  const handleDetectionNext = async () => {
    if (isSegmentationMode && currentSegmentationAnnotations.length > 0) {
      await onSaveSegmentationAnnotations(currentSegmentationAnnotations);
    } else if (isDetectionMode && currentAnnotations.length > 0) {
      await onSaveCOCOAnnotations(currentAnnotations);
    }
    setCurrent((prev) => prev + 1);
  };

  if (current >= unlabelledMedias.length) {
    return null;
  }

  const isLast = current >= unlabelledMedias.length - 1;

  const handleFinalize = async () => {
    if (isSegmentationMode && currentSegmentationAnnotations.length > 0) {
      await onSaveSegmentationAnnotations(currentSegmentationAnnotations);
    } else if (isDetectionMode && currentAnnotations.length > 0) {
      await onSaveCOCOAnnotations(currentAnnotations);
    }
    await onFinalizeExercise();
  };

  return (
    <div className="exercise-carousel__step-3">
      <p style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: '#666' }}>Prática Livre (Opcional)</p>
      
      {isSegmentationMode ? (
        <SegmentationAnnotationEditor
          fileId={unlabelledMedias[current]}
          datasetId={datasetId}
          labels={labels}
          existingAnnotations={currentSegmentationAnnotations}
          onSave={onSaveSegmentationAnnotations}
          initialTool={currentTool === 'rectangle' ? 'polygon' : currentTool as 'hand' | 'polygon' | 'eraser'}
          initialSelectedLabel={selectedAnnotationLabel}
          onToolChange={(tool) => onToolChange(tool as AnnotationTool)}
          onSelectedLabelChange={onSelectedLabelChange}
          showNavigation
          canGoPrevious={current > 0}
          canGoNext={!isLast}
          onPrevious={handleDetectionPrevious}
          onNext={handleDetectionNext}
          isLastImage={isLast}
          onFinalize={handleFinalize}
          currentIndex={current}
          totalImages={unlabelledMedias.length}
        />
      ) : isDetectionMode ? (
        <PolygonAnnotationEditor
          fileId={unlabelledMedias[current]}
          datasetId={datasetId}
          labels={labels}
          existingAnnotations={currentAnnotations}
          onSave={onSaveCOCOAnnotations}
          initialTool={currentTool === 'polygon' ? 'rectangle' : currentTool as 'hand' | 'rectangle' | 'eraser'}
          initialSelectedLabel={selectedAnnotationLabel}
          onToolChange={(tool) => onToolChange(tool as AnnotationTool)}
          onSelectedLabelChange={onSelectedLabelChange}
          showNavigation
          canGoPrevious={current > 0}
          canGoNext={!isLast}
          onPrevious={handleDetectionPrevious}
          onNext={handleDetectionNext}
          isLastImage={isLast}
          onFinalize={handleFinalize}
          currentIndex={current}
          totalImages={unlabelledMedias.length}
        />
      ) : (
        <ClassificationEditor
          fileId={unlabelledMedias[current]}
          labels={labels}
          selectedLabels={selectedLabels}
          onLabelChange={(newLabels) => onLabelChange(newLabels[0] || '')}
          onSave={onSaveClassification}
          showNavigation
          canGoPrevious={current > 0}
          canGoNext={!isLast}
          onPrevious={onPreviousMedia}
          onNext={() => onNextMedia(unlabelledMedias)}
          isLastImage={isLast}
          nextButtonLabel="Finalizar Exercício"
          currentIndex={current}
          totalImages={unlabelledMedias.length}
        />
      )}
      
      {/* Botão Finalizar Agora - sempre visível para detecção/segmentação */}
      {(isDetectionMode || isSegmentationMode) && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
          <Button
            onClick={onFinalizeExercise}
            variant={isLast ? 'primary' : 'secondary'}
          >
            {isLast ? 'Finalizar Exercício' : 'Finalizar Agora'}
          </Button>
        </div>
      )}
      
      {/* Botão Finalizar Agora para classificação (não última imagem) */}
      {!isDetectionMode && !isSegmentationMode && !isLast && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.5rem' }}>
          <Button 
            onClick={onSaveAndFinalize}
            variant="secondary"
          >
            Finalizar Agora
          </Button>
        </div>
      )}
    </div>
  );
};

export default React.memo(UnsupervisedPractice);
