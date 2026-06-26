import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Icon } from '../Icons/Icons';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'xxl';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: ModalSize;
  closeOnBackdropClick?: boolean;
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  closeOnBackdropClick = true,
}) => {
  useEffect(() => {
    if (isOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const className = `modal modal--${size}`;

  return ReactDOM.createPortal(
    <div className="modal__backdrop" onClick={closeOnBackdropClick ? onClose : undefined}>
      <div className={className} onClick={(e) => e.stopPropagation()}>
        <div className="modal__title-close-line">
          {title && <h3 className="modal__title">{title}</h3>}
          <button type="button" className="modal__close" onClick={onClose} aria-label="Fechar">
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="modal__body">{children}</div>
      </div>
    </div>,
    document.body
  );
}

export default Modal;