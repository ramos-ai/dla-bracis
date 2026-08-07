import React from 'react';

interface AlertConfirmModalProps {
  open: boolean;
  message: string;
  type: 'alert' | 'confirm';
  onConfirm: () => void;
  onCancel: () => void;
}

const AlertConfirmModal: React.FC<AlertConfirmModalProps> = ({
  open,
  message,
  type,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <div className="alert-confirm-modal__backdrop" role="dialog" aria-modal="true" aria-labelledby="alert-confirm-title">
      <div className="alert-confirm-modal">
        <p id="alert-confirm-title" className="alert-confirm-modal__message">
          {message}
        </p>
        <div className="alert-confirm-modal__actions">
          {type === 'confirm' && (
            <button type="button" className="btn btn--secondary alert-confirm-modal__btn" onClick={onCancel}>
              Cancelar
            </button>
          )}
          <button type="button" className="btn btn--primary alert-confirm-modal__btn" onClick={onConfirm}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default AlertConfirmModal;
