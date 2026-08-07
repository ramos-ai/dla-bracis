import React from 'react';
import type { TabType } from '../types';

interface ExerciseTabsProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
  hasLabelledMedias: boolean;
  hasUnlabelledMedias: boolean;
  isFinalized: boolean;
  step: number;
}

const ExerciseTabs: React.FC<ExerciseTabsProps> = ({
  currentTab,
  onTabChange,
  hasLabelledMedias,
  hasUnlabelledMedias,
  isFinalized,
  step,
}) => {
  const handleTabClick = (tab: TabType) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onTabChange(tab);
  };

  return (
    <div className="exercise-carousel__tabs">
      <button
        className={`exercise-carousel__tab ${currentTab === 'explanation' ? 'exercise-carousel__tab--active' : ''}`}
        onClick={handleTabClick('explanation')}
        type="button"
      >
        Explicação
      </button>
      {hasLabelledMedias && (
        <button
          className={`exercise-carousel__tab ${currentTab === 'supervised' ? 'exercise-carousel__tab--active' : ''}`}
          onClick={handleTabClick('supervised')}
          disabled={!isFinalized && step < 1}
          type="button"
        >
          Prática Assistida
        </button>
      )}
      {hasUnlabelledMedias && (
        <button
          className={`exercise-carousel__tab ${currentTab === 'unsupervised' ? 'exercise-carousel__tab--active' : ''}`}
          onClick={handleTabClick('unsupervised')}
          disabled={!isFinalized && step < 3}
          type="button"
        >
          Prática Livre
        </button>
      )}
    </div>
  );
};

export default React.memo(ExerciseTabs);
