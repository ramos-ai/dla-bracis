import React from 'react';

interface FinalizedViewProps {
  supervisedScore: number | null;
  totalLabelledMedias: number;
  totalUnlabelledMedias: number;
  onReviewExplanation: () => void;
  onReviewSupervised: () => void;
  onReviewUnsupervised: () => void;
}

const FinalizedView: React.FC<FinalizedViewProps> = ({
  supervisedScore,
  totalLabelledMedias,
  totalUnlabelledMedias,
  onReviewExplanation,
  onReviewSupervised,
  onReviewUnsupervised,
}) => {
  const scorePercentage = supervisedScore !== null ? (supervisedScore * 100).toFixed(1) : null;
  
  return (
    <div className="exercise-carousel__finalized">
      <div className="exercise-carousel__finalized-icon">✓</div>
      <h2 className="exercise-carousel__finalized-title">Exercício Finalizado!</h2>
      
      {scorePercentage !== null && (
        <div className="exercise-carousel__finalized-score">
          <span className="exercise-carousel__finalized-score-label">Pontuação na Prática Assistida:</span>
          <span className="exercise-carousel__finalized-score-value">{scorePercentage}%</span>
        </div>
      )}
      
      <div className="exercise-carousel__finalized-summary">
        {totalLabelledMedias > 0 && (
          <div className="exercise-carousel__finalized-stat">
            <span className="exercise-carousel__finalized-stat-value">{totalLabelledMedias}</span>
            <span className="exercise-carousel__finalized-stat-label">imagens na prática assistida</span>
          </div>
        )}
        {totalUnlabelledMedias > 0 && (
          <div className="exercise-carousel__finalized-stat">
            <span className="exercise-carousel__finalized-stat-value">{totalUnlabelledMedias}</span>
            <span className="exercise-carousel__finalized-stat-label">imagens na prática livre</span>
          </div>
        )}
      </div>
      
      <div className="exercise-carousel__finalized-actions">
        <button
          className="exercise-carousel__finalized-btn exercise-carousel__finalized-btn--secondary"
          onClick={onReviewExplanation}
          type="button"
        >
          Revisar Explicação
        </button>
        {totalLabelledMedias > 0 && (
          <button
            className="exercise-carousel__finalized-btn exercise-carousel__finalized-btn--secondary"
            onClick={onReviewSupervised}
            type="button"
          >
            Revisar Prática Assistida
          </button>
        )}
        {totalUnlabelledMedias > 0 && (
          <button
            className="exercise-carousel__finalized-btn exercise-carousel__finalized-btn--secondary"
            onClick={onReviewUnsupervised}
            type="button"
          >
            Revisar Prática Livre
          </button>
        )}
      </div>
    </div>
  );
};

export default React.memo(FinalizedView);
