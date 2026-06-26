import React from 'react';
import Button from '../../Fields/Button';
import PolygonAnnotationEditor from '../../PolygonAnnotationEditor/PolygonAnnotationEditor';
import SegmentationAnnotationEditor from '../../SegmentationAnnotationEditor/SegmentationAnnotationEditor';
import ClassificationEditor from '../../ClassificationEditor/ClassificationEditor';
import AnnotationViewer from '../../AnnotationViewer/AnnotationViewer';
import SegmentationAnnotationViewer from '../../SegmentationAnnotationViewer/SegmentationAnnotationViewer';
import ClassificationViewer from '../../ClassificationViewer/ClassificationViewer';
import type { COCOAnnotation } from '../../../services/COCOService';
import type { SegmentationAnnotation, SegmentationMatch } from '../../../services/SegmentationService';
import type { AnswerItem, AnnotationTool } from '../types';

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
  supervisedScore: number | null;
  feedbackLoading: boolean;
  feedbackCorrectCoco: Record<string, COCOAnnotation[]>;
  feedbackCorrectSegmentation: Record<string, SegmentationAnnotation[]>;
  feedbackCorrectLabels: Record<string, string[]>;
  feedbackSegmentationEval: Record<string, { score: number; matches: SegmentationMatch[] }>;
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
  labelledAnswers,
  supervisedScore,
  feedbackLoading,
  feedbackCorrectCoco,
  feedbackCorrectSegmentation,
  feedbackCorrectLabels,
  feedbackSegmentationEval,
  iouThreshold,
  segmentationIoUThreshold,
  segmentationScoreMode,
  onLabelChange,
  onSaveClassification,
  onSaveCOCOAnnotations,
  onSaveSegmentationAnnotations,
  onNextMedia,
  onPreviousMedia,
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
      <div className="exercise-carousel__step-1" style={{ padding: '2rem' }}>
        <p>Este exercício não tem imagens de prática assistida.</p>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', flexDirection: 'column' }}>
          {unlabelledMedias.length > 0 && (
            <Button onClick={onContinueToUnsupervised}>
              Continuar para Prática Livre (Opcional)
            </Button>
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
      <div className="exercise-carousel__step-1">
        <p style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: '#666' }}>Prática Assistida</p>
        {isSegmentationMode ? (
          <SegmentationAnnotationEditor
            fileId={labelledMedias[current]}
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
            canGoNext
            onPrevious={handleDetectionPrevious}
            onNext={handleDetectionNext}
            isLastImage={isLast}
            nextButtonLabel="Finalizar Prática Assistida"
            currentIndex={current}
            totalImages={labelledMedias.length}
          />
        ) : isDetectionMode ? (
          <PolygonAnnotationEditor
            fileId={labelledMedias[current]}
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
            canGoNext
            onPrevious={handleDetectionPrevious}
            onNext={handleDetectionNext}
            isLastImage={isLast}
            nextButtonLabel="Finalizar Prática Assistida"
            currentIndex={current}
            totalImages={labelledMedias.length}
          />
        ) : (
          <ClassificationEditor
            fileId={labelledMedias[current]}
            labels={labels}
            selectedLabels={selectedLabels}
            onLabelChange={(newLabels) => onLabelChange(newLabels[0] || '')}
            onSave={onSaveClassification}
            showNavigation
            canGoPrevious={current > 0}
            canGoNext
            onPrevious={onPreviousMedia}
            onNext={() => onNextMedia(labelledMedias)}
            isLastImage={isLast}
            nextButtonLabel="Finalizar Prática Assistida"
            currentIndex={current}
            totalImages={labelledMedias.length}
          />
        )}
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="exercise-carousel__step-2">
        <h3>Sua nota foi: {supervisedScore !== null && supervisedScore !== undefined ? supervisedScore.toFixed(1) : 'Não foi possível calcular. Pode finalizar na mesma.'}</h3>
        <p style={{ marginBottom: '1rem', color: '#666' }}>
          {unlabelledMedias.length > 0
            ? 'Você pode continuar para a prática livre (opcional) ou finalizar o exercício agora.'
            : 'Exercício concluído! Você pode finalizar agora.'}
        </p>
        {labelledMedias.length > 0 && (
          <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
            <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>Feedback por imagem (prática assistida)</h4>
            {feedbackLoading ? (
              <p style={{ color: '#666' }}>A carregar comparação com a referência...</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: isDetectionMode || isSegmentationMode ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: '1rem' }}>
                {labelledMedias.map((mediaId, idx) => {
                  const answer = labelledAnswers.find(a => a.mediaId === mediaId);
                  
                  if (isSegmentationMode) {
                    const studentSeg = (answer?.annotations as SegmentationAnnotation[] | undefined) || [];
                    const correctSeg = feedbackCorrectSegmentation[mediaId] || [];
                    const segEval = feedbackSegmentationEval[mediaId];
                    const hasStudent = studentSeg.length > 0;
                    const hasCorrect = correctSeg.length > 0;
                    if (!hasStudent && !hasCorrect) return null;
                    return (
                      <div key={mediaId} style={{ border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem', backgroundColor: '#fafafa' }}>
                        <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Imagem {idx + 1}</strong>
                        <SegmentationAnnotationViewer
                          fileId={mediaId}
                          studentAnnotations={studentSeg}
                          correctAnnotations={correctSeg}
                          labels={labels}
                          iouThreshold={segmentationIoUThreshold}
                          scoreMode={segmentationScoreMode}
                          imageScore={segEval?.score}
                          matches={segEval?.matches ?? []}
                        />
                      </div>
                    );
                  } else if (isDetectionMode) {
                    const studentCoco = (answer?.annotations as COCOAnnotation[] | undefined) || [];
                    const correctCoco = feedbackCorrectCoco[mediaId] || [];
                    const hasStudent = studentCoco.length > 0;
                    const hasCorrect = correctCoco.length > 0;
                    if (!hasStudent && !hasCorrect) return null;
                    return (
                      <div key={mediaId} style={{ border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem', backgroundColor: '#fafafa' }}>
                        <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Imagem {idx + 1}</strong>
                        <AnnotationViewer
                          fileId={mediaId}
                          studentAnnotations={studentCoco}
                          correctAnnotations={correctCoco}
                          labels={labels}
                          iouThreshold={iouThreshold}
                        />
                      </div>
                    );
                  } else {
                    // Classification feedback
                    const studentLabels = answer?.labels || [];
                    const correctLabels = feedbackCorrectLabels[mediaId] || [];
                    return (
                      <ClassificationViewer
                        key={mediaId}
                        fileId={mediaId}
                        studentLabels={studentLabels}
                        correctLabels={correctLabels}
                        maxWidth={250}
                        maxHeight={180}
                      />
                    );
                  }
                })}
              </div>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column' }}>
          {unlabelledMedias.length > 0 && (
            <Button onClick={onContinueToUnsupervised}>
              Continuar para Prática Livre (Opcional)
            </Button>
          )}
          <Button onClick={onFinalizeExercise} variant="secondary">
            Finalizar Exercício
          </Button>
        </div>
      </div>
    );
  }

  return null;
};

export default React.memo(SupervisedPractice);
