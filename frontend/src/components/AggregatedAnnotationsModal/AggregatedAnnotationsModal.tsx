import React, { useState, useEffect, useCallback } from 'react';
import Modal from '../Modal/Modal';
import AggregatedAnnotationViewer from './AggregatedAnnotationViewer';
import { getAggregatedAnnotations, AggregatedAnnotationsResponse } from '../../services/ExercisesService';
import { Icon } from '../Icons/Icons';
import InlineLoader from '../InlineLoader/InlineLoader';
import './AggregatedAnnotationsModal.scss';

interface AggregatedAnnotationsModalProps {
  exerciseId: string;
  isOpen: boolean;
  onClose: () => void;
}

const AggregatedAnnotationsModal: React.FC<AggregatedAnnotationsModalProps> = ({
  exerciseId,
  isOpen,
  onClose
}) => {
  const [data, setData] = useState<AggregatedAnnotationsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const fetchData = useCallback(async () => {
    if (!exerciseId) return;

    setLoading(true);
    setError(null);

    try {
      const result = await getAggregatedAnnotations(exerciseId);
      setData(result);
      setCurrentIndex(0);
    } catch (err) {
      console.error('Error fetching aggregated annotations:', err);
      setError('Erro ao carregar marcações agregadas');
    } finally {
      setLoading(false);
    }
  }, [exerciseId]);

  useEffect(() => {
    if (isOpen && !data) {
      fetchData();
    }
  }, [isOpen, data, fetchData]);

  useEffect(() => {
    if (!isOpen) {
      setData(null);
      setCurrentIndex(0);
      setError(null);
    }
  }, [isOpen]);

  const handlePrev = () => {
    if (data && currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (data && currentIndex < data.images.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen || !data) return;

    if (e.key === 'ArrowLeft') {
      handlePrev();
    } else if (e.key === 'ArrowRight') {
      handleNext();
    }
  }, [isOpen, data, currentIndex]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const currentImage = data?.images[currentIndex];
  const totalImages = data?.images.length || 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Sobreposição das Marcações dos Alunos"
      size="xl"
    >
      <div className="aggregated-modal">
        {loading && (
          <div className="aggregated-modal__loading">
            <InlineLoader message="Carregando marcações..." />
          </div>
        )}

        {error && (
          <div className="aggregated-modal__error">
            <Icon name="warning" size={24} />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && data && (
          <>
            <div className="aggregated-modal__header">
              <p className="aggregated-modal__description">
                Visualização de todas as marcações dos alunos sobrepostas.
                Regiões mais escuras indicam maior concordância entre os alunos.
              </p>
              <div className="aggregated-modal__stats">
                <span>Tipo: <strong>{data.task_type === 'detection' ? 'Detecção' : 'Segmentação'}</strong></span>
                <span>Classes: <strong>{data.labels.length}</strong></span>
              </div>
            </div>

            {totalImages === 0 ? (
              <div className="aggregated-modal__empty">
                <Icon name="info" size={32} />
                <p>Nenhuma marcação encontrada para este exercício.</p>
              </div>
            ) : (
              <>
                <div className="aggregated-modal__navigation">
                  <button
                    type="button"
                    className="aggregated-modal__nav-btn"
                    onClick={handlePrev}
                    disabled={currentIndex === 0}
                    aria-label="Imagem anterior"
                  >
                    <Icon name="chevron-left" size={24} />
                  </button>

                  <span className="aggregated-modal__counter">
                    Imagem {currentIndex + 1} de {totalImages}
                  </span>

                  <button
                    type="button"
                    className="aggregated-modal__nav-btn"
                    onClick={handleNext}
                    disabled={currentIndex === totalImages - 1}
                    aria-label="Próxima imagem"
                  >
                    <Icon name="chevron-right" size={24} />
                  </button>
                </div>

                <div className="aggregated-modal__viewer">
                  {currentImage && (
                    <AggregatedAnnotationViewer
                      fileId={currentImage.image_id}
                      annotations={currentImage.annotations}
                      taskType={data.task_type}
                      labels={data.labels}
                      maxWidth={900}
                      maxHeight={600}
                    />
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};

export default AggregatedAnnotationsModal;
