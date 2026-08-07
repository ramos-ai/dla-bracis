import React, { useState, useEffect } from 'react';
import './KaggleExportModal.scss';
import Modal from '../Modal/Modal';
import Button from '../Fields/Button';
import InputField from '../Fields/InputField';
import TextareaField from '../Fields/TextareaField';
import Checkbox from '../Fields/Checkbox';
import { Icon } from '../Icons/Icons';
import InlineLoader from '../InlineLoader/InlineLoader';
import {
  saveKaggleCredentials,
  getCredentialsStatus,
  deleteKaggleCredentials,
  validateKaggleCredentials,
  exportToKaggle,
  type KaggleExportResponse,
} from '../../services/KaggleService';

interface KaggleExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  datasetId: string;
  datasetName: string;
}

type ModalView = 'loading' | 'credentials' | 'export' | 'exporting' | 'success' | 'error';

const KaggleExportModal: React.FC<KaggleExportModalProps> = ({
  isOpen,
  onClose,
  datasetId,
  datasetName,
}) => {
  const [view, setView] = useState<ModalView>('loading');

  // Credential form state
  const [username, setUsername] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [credentialError, setCredentialError] = useState('');

  // Export form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);

  // Result state
  const [exportResult, setExportResult] = useState<KaggleExportResponse | null>(null);

  // Check credentials status when modal opens
  useEffect(() => {
    if (isOpen && datasetId) {
      setView('loading');
      setTitle(datasetName || '');
      setDescription('');
      setIsPrivate(true);
      setExportResult(null);
      setCredentialError('');

      getCredentialsStatus()
        .then((status) => {
          setView(status.has_credentials ? 'export' : 'credentials');
        })
        .catch(() => {
          setView('credentials');
        });
    }
  }, [isOpen, datasetId, datasetName]);

  const handleSaveCredentials = async () => {
    if (!username.trim() || !apiKey.trim()) {
      setCredentialError('Username e API Token são obrigatórios.');
      return;
    }

    setSavingCredentials(true);
    setCredentialError('');

    try {
      await saveKaggleCredentials({ username: username.trim(), api_key: apiKey.trim() });
      
      // Validate credentials after saving
      const validation = await validateKaggleCredentials();
      if (!validation.valid) {
        setCredentialError(validation.error || 'Credenciais inválidas. Verifique seu username e API token.');
        await deleteKaggleCredentials();
        return;
      }

      setView('export');
      setUsername('');
      setApiKey('');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      setCredentialError(err.response?.data?.error || 'Erro ao salvar credenciais.');
    } finally {
      setSavingCredentials(false);
    }
  };

  const handleRemoveCredentials = async () => {
    try {
      await deleteKaggleCredentials();
      setView('credentials');
    } catch {
      // Ignore errors
    }
  };

  const handleExport = async () => {
    if (!title.trim()) {
      return;
    }

    setView('exporting');
    setExportResult(null);

    try {
      const result = await exportToKaggle(datasetId, {
        title: title.trim(),
        description: description.trim(),
        is_private: isPrivate,
      });

      setExportResult(result);
      setView(result.success ? 'success' : 'error');
    } catch {
      setExportResult({
        success: false,
        kaggle_url: null,
        error: { code: 'UNKNOWN', message: 'Erro ao exportar para o Kaggle.' },
      });
      setView('error');
    }
  };

  const handleRetry = () => {
    setView('export');
    setExportResult(null);
  };

  const handleClose = () => {
    setView('loading');
    setUsername('');
    setApiKey('');
    setCredentialError('');
    setExportResult(null);
    onClose();
  };

  const renderCredentialsView = () => (
    <div className="kaggle-export-modal__credentials">
      <div className="kaggle-export-modal__instructions">
        <h4>Configurar credenciais do Kaggle</h4>
        <p>Para exportar datasets diretamente para o Kaggle, você precisa configurar suas credenciais de API.</p>
        
        <div className="kaggle-export-modal__steps">
          <div className="kaggle-export-modal__step">
            <span className="kaggle-export-modal__step-number">1</span>
            <span>
              Acesse as configurações do Kaggle:{' '}
              <a href="https://www.kaggle.com/settings" target="_blank" rel="noopener noreferrer">
                kaggle.com/settings
              </a>
            </span>
          </div>
          <div className="kaggle-export-modal__step">
            <span className="kaggle-export-modal__step-number">2</span>
            <span>Role até a seção "Legacy API Credentials" e clique em "Create Legacy API Key"</span>
          </div>
          <div className="kaggle-export-modal__step">
            <span className="kaggle-export-modal__step-number">3</span>
            <span>Um arquivo <code>kaggle.json</code> será baixado. Abra-o e copie o <code>username</code> e <code>key</code> para os campos abaixo.</span>
          </div>
        </div>
      </div>

      <div className="kaggle-export-modal__form">
        <InputField
          label="Kaggle Username"
          name="kaggle_username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="seu_username"
          required
        />
        <InputField
          label="API Token"
          name="kaggle_api_key"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Seu API token do Kaggle"
          required
        />

        {credentialError && (
          <div className="kaggle-export-modal__error">
            {credentialError}
          </div>
        )}

        <div className="kaggle-export-modal__actions">
          <Button variant="secondary" onClick={handleClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleSaveCredentials}
            disabled={savingCredentials || !username.trim() || !apiKey.trim()}
          >
            {savingCredentials ? 'A guardar...' : 'Guardar e continuar'}
          </Button>
        </div>
      </div>
    </div>
  );

  const renderExportView = () => (
    <div className="kaggle-export-modal__export">
      <div className="kaggle-export-modal__dataset-info">
        <strong>Dataset:</strong> {datasetName}
      </div>

      <div className="kaggle-export-modal__form">
        <InputField
          label="Título no Kaggle"
          name="kaggle_title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nome do dataset no Kaggle"
          required
        />
        <TextareaField
          label="Descrição"
          name="kaggle_description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descrição do dataset (opcional)"
          rows={3}
        />
        <div className="kaggle-export-modal__privacy">
          <Checkbox
            name="is_private"
            label="Dataset privado"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
          />
          <p className="kaggle-export-modal__privacy-hint">
            {isPrivate
              ? 'Apenas você poderá ver este dataset no Kaggle.'
              : 'O dataset será público e visível para todos no Kaggle.'}
          </p>
        </div>

        <div className="kaggle-export-modal__actions">
          <Button variant="secondary" onClick={handleRemoveCredentials}>
            Alterar credenciais
          </Button>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button variant="secondary" onClick={handleClose}>
              Cancelar
            </Button>
            <Button onClick={handleExport} disabled={!title.trim()}>
              <Icon name="upload" size={14} style={{ marginRight: '6px' }} />
              Exportar para Kaggle
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderExportingView = () => (
    <div className="kaggle-export-modal__exporting">
      <InlineLoader message="A exportar para o Kaggle..." />
      <p className="kaggle-export-modal__exporting-hint">
        Isto pode demorar alguns minutos dependendo do tamanho do dataset.
      </p>
    </div>
  );

  const renderSuccessView = () => (
    <div className="kaggle-export-modal__success">
      <div className="kaggle-export-modal__success-icon">
        <Icon name="check" size={48} />
      </div>
      <h4>Dataset exportado com sucesso!</h4>
      <p>O seu dataset foi enviado para o Kaggle.</p>
      
      {exportResult?.kaggle_url && (
        <a
          href={exportResult.kaggle_url}
          target="_blank"
          rel="noopener noreferrer"
          className="kaggle-export-modal__kaggle-link"
        >
          <Icon name="external" size={14} style={{ marginRight: '6px' }} />
          Ver no Kaggle
        </a>
      )}

      <div className="kaggle-export-modal__actions">
        <Button onClick={handleClose}>Fechar</Button>
      </div>
    </div>
  );

  const renderErrorView = () => (
    <div className="kaggle-export-modal__error-view">
      <div className="kaggle-export-modal__error-icon">
        <Icon name="warning" size={48} />
      </div>
      <h4>Erro ao exportar</h4>
      <p className="kaggle-export-modal__error-message">
        {exportResult?.error?.message || 'Ocorreu um erro ao exportar o dataset.'}
      </p>
      {exportResult?.error?.code && (
        <p className="kaggle-export-modal__error-code">
          Código: {exportResult.error.code}
        </p>
      )}

      <div className="kaggle-export-modal__actions">
        <Button variant="secondary" onClick={handleClose}>
          Fechar
        </Button>
        <Button onClick={handleRetry}>Tentar novamente</Button>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (view) {
      case 'loading':
        return <InlineLoader message="A carregar..." />;
      case 'credentials':
        return renderCredentialsView();
      case 'export':
        return renderExportView();
      case 'exporting':
        return renderExportingView();
      case 'success':
        return renderSuccessView();
      case 'error':
        return renderErrorView();
      default:
        return null;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Exportar para Kaggle"
      size="md"
    >
      <div className="kaggle-export-modal">
        {renderContent()}
      </div>
    </Modal>
  );
};

export default KaggleExportModal;
