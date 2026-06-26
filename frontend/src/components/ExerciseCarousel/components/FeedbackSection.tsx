import React from 'react';
import type { COCOAnnotation } from '../../../services/COCOService';
import type { AnswerItem, FeedbackData } from '../types';

interface FeedbackSectionProps {
  mediaId: string;
  userAnswer: AnswerItem | undefined;
  feedbackData: FeedbackData;
  isSegmentationMode: boolean;
  isDetectionMode: boolean;
}

const FeedbackSection: React.FC<FeedbackSectionProps> = ({
  mediaId,
  userAnswer,
  feedbackData,
  isSegmentationMode,
  isDetectionMode,
}) => {
  if (!isDetectionMode) {
    const userLabels = userAnswer?.labels || [];
    const isCorrect = userLabels.length > 0;
    
    return (
      <div className={`exercise-carousel__feedback ${isCorrect ? 'exercise-carousel__feedback--correct' : 'exercise-carousel__feedback--incorrect'}`}>
        <div className="exercise-carousel__feedback-header">
          {isCorrect ? '✓ Resposta registrada' : '✗ Nenhum rótulo selecionado'}
        </div>
        {userLabels.length > 0 && (
          <div className="exercise-carousel__feedback-labels">
            Rótulos selecionados: {userLabels.join(', ')}
          </div>
        )}
      </div>
    );
  }

  if (isSegmentationMode) {
    const evalResult = feedbackData.segmentationEval[mediaId];
    const correctAnnotations = feedbackData.correctSegmentation[mediaId] || [];
    
    if (!evalResult) {
      return (
        <div className="exercise-carousel__feedback exercise-carousel__feedback--loading">
          Carregando feedback...
        </div>
      );
    }
    
    const score = evalResult.score;
    const isGood = score >= 0.7;
    const isMedium = score >= 0.4 && score < 0.7;
    
    return (
      <div className={`exercise-carousel__feedback ${isGood ? 'exercise-carousel__feedback--correct' : isMedium ? 'exercise-carousel__feedback--partial' : 'exercise-carousel__feedback--incorrect'}`}>
        <div className="exercise-carousel__feedback-header">
          Score: {(score * 100).toFixed(1)}%
        </div>
        <div className="exercise-carousel__feedback-details">
          <span>Anotações corretas: {correctAnnotations.length}</span>
          <span>Matches: {evalResult.matches.length}</span>
        </div>
      </div>
    );
  }

  const correctAnnotations = feedbackData.correctCoco[mediaId] || [];
  const userAnnotations = (userAnswer?.annotations as COCOAnnotation[]) || [];
  
  return (
    <div className="exercise-carousel__feedback">
      <div className="exercise-carousel__feedback-header">
        Feedback de Detecção
      </div>
      <div className="exercise-carousel__feedback-details">
        <span>Suas anotações: {userAnnotations.length}</span>
        <span>Anotações corretas: {correctAnnotations.length}</span>
      </div>
    </div>
  );
};

export default React.memo(FeedbackSection);
