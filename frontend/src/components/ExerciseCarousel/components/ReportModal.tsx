import React, { useState } from 'react';
import Modal from '../../Modal/Modal';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (text: string, type: 'error' | 'unlabelled') => Promise<void>;
  mediaId: string;
  reportType: 'error' | 'unlabelled';
}

const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  mediaId,
  reportType,
}) => {
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    
    setIsSubmitting(true);
    try {
      await onSubmit(text, reportType);
      setText('');
      onClose();
    } catch (error) {
      console.error('Error submitting report:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setText('');
    onClose();
  };

  const title = reportType === 'error' 
    ? 'Reportar Erro na Imagem' 
    : 'Reportar Imagem Sem Rótulo';
  
  const placeholder = reportType === 'error'
    ? 'Descreva o erro encontrado na imagem...'
    : 'Descreva por que esta imagem não pode ser rotulada...';

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title}>
      <form onSubmit={handleSubmit} className="exercise-carousel__report-form">
        <div className="exercise-carousel__report-info">
          <span>ID da Mídia: {mediaId}</span>
        </div>
        <textarea
          className="exercise-carousel__report-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          rows={4}
          required
        />
        <div className="exercise-carousel__report-actions">
          <button
            type="button"
            className="exercise-carousel__report-btn exercise-carousel__report-btn--cancel"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="exercise-carousel__report-btn exercise-carousel__report-btn--submit"
            disabled={isSubmitting || !text.trim()}
          >
            {isSubmitting ? 'Enviando...' : 'Enviar Reporte'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default React.memo(ReportModal);
