import React from 'react';

interface ExplanationTabProps {
  didaticDetailing: string;
  onStartExercise: (e?: React.MouseEvent) => void;
  isFinalized: boolean;
}

const ExplanationTab: React.FC<ExplanationTabProps> = ({
  didaticDetailing,
  onStartExercise,
  isFinalized,
}) => {
  return (
    <div className="exercise-carousel__explanation">
      <div className="exercise-carousel__explanation-content">
        <h3>Explicação do Exercício</h3>
        <div 
          className="exercise-carousel__explanation-text"
          dangerouslySetInnerHTML={{ __html: didaticDetailing }}
        />
      </div>
      {!isFinalized && (
        <div className="exercise-carousel__explanation-actions">
          <button
            className="exercise-carousel__start-btn"
            onClick={onStartExercise}
            type="button"
          >
            Iniciar Exercício
          </button>
        </div>
      )}
    </div>
  );
};

export default React.memo(ExplanationTab);
