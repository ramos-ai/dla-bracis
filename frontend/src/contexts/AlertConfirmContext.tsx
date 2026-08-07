import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import AlertConfirmModal from '../components/AlertConfirmModal/AlertConfirmModal';

type DialogType = 'alert' | 'confirm';

interface AlertConfirmContextValue {
  alert: (message: string) => Promise<void>;
  confirm: (message: string) => Promise<boolean>;
}

const AlertConfirmContext = createContext<AlertConfirmContextValue | undefined>(undefined);

export const useAlertConfirm = (): AlertConfirmContextValue => {
  const context = useContext(AlertConfirmContext);
  if (!context) {
    throw new Error('useAlertConfirm deve ser usado dentro de AlertConfirmProvider');
  }
  return context;
};

interface AlertConfirmProviderProps {
  children: ReactNode;
}

export const AlertConfirmProvider = ({ children }: AlertConfirmProviderProps) => {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [type, setType] = useState<DialogType>('alert');
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const handleClose = useCallback((result: boolean) => {
    if (resolverRef.current) {
      resolverRef.current(result);
      resolverRef.current = null;
    }
    setOpen(false);
  }, []);

  const alert = useCallback((msg: string) => {
    return new Promise<void>((resolve) => {
      resolverRef.current = (value: boolean) => { if (value) resolve(); };
      setMessage(msg);
      setType('alert');
      setOpen(true);
    });
  }, []);

  const confirm = useCallback((msg: string) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setMessage(msg);
      setType('confirm');
      setOpen(true);
    });
  }, []);

  const onConfirm = useCallback(() => handleClose(true), [handleClose]);
  const onCancel = useCallback(() => handleClose(false), [handleClose]);

  return (
    <AlertConfirmContext.Provider value={{ alert, confirm }}>
      {children}
      <AlertConfirmModal
        open={open}
        message={message}
        type={type}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </AlertConfirmContext.Provider>
  );
};
