import React, { useState, useEffect, useRef } from 'react';
import Modal from '../Modal/Modal';
import Button from '../Fields/Button';
import InputField from '../Fields/InputField';
import { Icon } from '../Icons/Icons';
import { useAuth } from '../../contexts/Authentication';
import { updateProfile, uploadProfileImage, deleteProfileImage, getProfileImageUrl } from '../../services/ProfileService';
import { getCredentialsStatus, saveKaggleCredentials, deleteKaggleCredentials, KaggleCredentialsStatus } from '../../services/KaggleService';
import './ProfileSettingsModal.scss';

type TabType = 'contact' | 'kaggle' | 'photo';

interface ProfileSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ProfileSettingsModal: React.FC<ProfileSettingsModalProps> = ({ isOpen, onClose }) => {
  const { user, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('contact');
  
  // Contact info state
  const [contactInfo, setContactInfo] = useState('');
  const [savingContact, setSavingContact] = useState(false);
  const [contactSaved, setContactSaved] = useState(false);
  
  // Kaggle state
  const [kaggleStatus, setKaggleStatus] = useState<KaggleCredentialsStatus | null>(null);
  const [kaggleUsername, setKaggleUsername] = useState('');
  const [kaggleApiKey, setKaggleApiKey] = useState('');
  const [savingKaggle, setSavingKaggle] = useState(false);
  const [kaggleError, setKaggleError] = useState('');
  const [kaggleSaved, setKaggleSaved] = useState(false);
  
  // Photo state
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && user) {
      setContactInfo(user.contact_info || '');
      setContactSaved(false);
      setKaggleSaved(false);
      setKaggleError('');
      setPhotoError('');
      
      // Load Kaggle status
      getCredentialsStatus()
        .then(setKaggleStatus)
        .catch(() => setKaggleStatus({ has_credentials: false }));
    }
  }, [isOpen, user]);

  const handleSaveContact = async () => {
    setSavingContact(true);
    setContactSaved(false);
    try {
      await updateProfile({ contact_info: contactInfo });
      await refreshUser();
      setContactSaved(true);
      setTimeout(() => setContactSaved(false), 3000);
    } catch {
      console.error('Error saving contact info');
    } finally {
      setSavingContact(false);
    }
  };

  const handleSaveKaggle = async () => {
    if (!kaggleUsername.trim() || !kaggleApiKey.trim()) {
      setKaggleError('Preencha o username e a API key');
      return;
    }
    
    setSavingKaggle(true);
    setKaggleError('');
    setKaggleSaved(false);
    
    try {
      await saveKaggleCredentials({ username: kaggleUsername.trim(), api_key: kaggleApiKey.trim() });
      setKaggleStatus({ has_credentials: true });
      setKaggleUsername('');
      setKaggleApiKey('');
      setKaggleSaved(true);
      setTimeout(() => setKaggleSaved(false), 3000);
    } catch {
      setKaggleError('Erro ao salvar credenciais');
    } finally {
      setSavingKaggle(false);
    }
  };

  const handleDeleteKaggle = async () => {
    setSavingKaggle(true);
    try {
      await deleteKaggleCredentials();
      setKaggleStatus({ has_credentials: false });
    } catch {
      setKaggleError('Erro ao remover credenciais');
    } finally {
      setSavingKaggle(false);
    }
  };

  const handlePhotoSelect = () => {
    fileInputRef.current?.click();
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      setPhotoError('Arquivo muito grande. Máximo 5MB');
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setPhotoError('Tipo de arquivo inválido. Use: jpg, png, gif ou webp');
      return;
    }

    setUploadingPhoto(true);
    setPhotoError('');

    try {
      await uploadProfileImage(file);
      await refreshUser();
    } catch {
      setPhotoError('Erro ao enviar foto');
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeletePhoto = async () => {
    setUploadingPhoto(true);
    setPhotoError('');
    try {
      await deleteProfileImage();
      await refreshUser();
    } catch {
      setPhotoError('Erro ao remover foto');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (!user) return null;

  const isTeacherOrAdmin = user.role === 'teacher' || user.role === 'admin';
  
  const tabs: { id: TabType; label: string; icon: 'envelope' | 'kaggle' | 'camera' }[] = isTeacherOrAdmin
    ? [
        { id: 'contact', label: 'Contato', icon: 'envelope' },
        { id: 'kaggle', label: 'Kaggle', icon: 'kaggle' },
        { id: 'photo', label: 'Foto', icon: 'camera' },
      ]
    : [
        { id: 'contact', label: 'Contato', icon: 'envelope' },
        { id: 'photo', label: 'Foto', icon: 'camera' },
      ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Configurações" size="md">
      <div className="profile-settings">
        {/* User info header */}
        <div className="profile-settings__header">
          <div className="profile-settings__avatar">
            {user.profile_image_id ? (
              <img 
                src={getProfileImageUrl(user.profile_image_id) || ''} 
                alt={user.name}
                className="profile-settings__avatar-img"
              />
            ) : (
              <span className="profile-settings__avatar-initials">{getInitials(user.name)}</span>
            )}
          </div>
          <div className="profile-settings__user-info">
            <h4 className="profile-settings__name">{user.name}</h4>
            <p className="profile-settings__email">{user.email}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="profile-settings__tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`profile-settings__tab ${activeTab === tab.id ? 'profile-settings__tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon name={tab.icon} size={16} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="profile-settings__content">
          {/* Contact Tab */}
          {activeTab === 'contact' && (
            <div className="profile-settings__section">
              <p className="profile-settings__description">
                Defina como os alunos podem entrar em contato com você. Esta informação será exibida para os alunos da sua turma.
              </p>
              
              <div className="profile-settings__field">
                <label className="profile-settings__label">Email (não editável)</label>
                <input 
                  type="email" 
                  value={user.email} 
                  disabled 
                  className="profile-settings__input profile-settings__input--disabled"
                />
              </div>

              <div className="profile-settings__field">
                <label className="profile-settings__label">Informações de contato</label>
                <textarea
                  value={contactInfo}
                  onChange={(e) => setContactInfo(e.target.value)}
                  placeholder="Ex: Horário de atendimento: Seg-Qua 14h-16h, Sala 302. WhatsApp: (11) 99999-9999"
                  className="profile-settings__textarea"
                  maxLength={500}
                  rows={4}
                />
                <span className="profile-settings__char-count">{contactInfo.length}/500</span>
              </div>

              <div className="profile-settings__actions">
                <Button onClick={handleSaveContact} disabled={savingContact}>
                  {savingContact ? 'Salvando...' : 'Salvar'}
                </Button>
                {contactSaved && (
                  <span className="profile-settings__success">
                    <Icon name="check" size={14} /> Salvo
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Kaggle Tab */}
          {activeTab === 'kaggle' && (
            <div className="profile-settings__section">
              <p className="profile-settings__description">
                Configure suas credenciais do Kaggle para exportar datasets diretamente para sua conta.
              </p>

              {kaggleStatus?.has_credentials ? (
                <div className="profile-settings__kaggle-configured">
                  <div className="profile-settings__kaggle-status">
                    <Icon name="check" size={20} color="#2e7d32" />
                    <span>Credenciais configuradas</span>
                  </div>
                  <p className="profile-settings__kaggle-hint">
                    Suas credenciais do Kaggle estão salvas. Você pode exportar datasets diretamente para o Kaggle.
                  </p>
                  <Button variant="danger" onClick={handleDeleteKaggle} disabled={savingKaggle}>
                    {savingKaggle ? 'Removendo...' : 'Remover credenciais'}
                  </Button>
                  {kaggleSaved && (
                    <span className="profile-settings__success">
                      <Icon name="check" size={14} /> Atualizado
                    </span>
                  )}
                </div>
              ) : (
                <div className="profile-settings__kaggle-setup">
                  <div className="profile-settings__instructions">
                    <div className="profile-settings__instruction">
                      <span className="profile-settings__instruction-number">1</span>
                      <span>
                        Acesse{' '}
                        <a href="https://www.kaggle.com/settings" target="_blank" rel="noopener noreferrer">
                          kaggle.com/settings
                        </a>
                      </span>
                    </div>
                    <div className="profile-settings__instruction">
                      <span className="profile-settings__instruction-number">2</span>
                      <span>Role até "Legacy API Credentials" e clique em "Create Legacy API Key"</span>
                    </div>
                    <div className="profile-settings__instruction">
                      <span className="profile-settings__instruction-number">3</span>
                      <span>Abra o arquivo <code>kaggle.json</code> baixado e copie os dados abaixo</span>
                    </div>
                  </div>

                  <div className="profile-settings__field">
                    <InputField
                      label="Username"
                      name="kaggle-username"
                      value={kaggleUsername}
                      onChange={(e) => setKaggleUsername(e.target.value)}
                      placeholder="seu_username"
                    />
                  </div>

                  <div className="profile-settings__field">
                    <InputField
                      label="API Key"
                      name="kaggle-api-key"
                      type="password"
                      value={kaggleApiKey}
                      onChange={(e) => setKaggleApiKey(e.target.value)}
                      placeholder="sua_api_key"
                    />
                  </div>

                  {kaggleError && (
                    <p className="profile-settings__error">{kaggleError}</p>
                  )}

                  <div className="profile-settings__actions">
                    <Button onClick={handleSaveKaggle} disabled={savingKaggle}>
                      {savingKaggle ? 'Salvando...' : 'Salvar credenciais'}
                    </Button>
                    {kaggleSaved && (
                      <span className="profile-settings__success">
                        <Icon name="check" size={14} /> Salvo
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Photo Tab */}
          {activeTab === 'photo' && (
            <div className="profile-settings__section">
              <p className="profile-settings__description">
                Adicione uma foto de perfil para personalizar sua conta.
              </p>

              <div className="profile-settings__photo-preview">
                {user.profile_image_id ? (
                  <img 
                    src={getProfileImageUrl(user.profile_image_id) || ''} 
                    alt={user.name}
                    className="profile-settings__photo-img"
                  />
                ) : (
                  <div className="profile-settings__photo-placeholder">
                    <Icon name="user" size={48} />
                    <span>Sem foto</span>
                  </div>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handlePhotoChange}
                style={{ display: 'none' }}
              />

              {photoError && (
                <p className="profile-settings__error">{photoError}</p>
              )}

              <div className="profile-settings__photo-actions">
                <Button onClick={handlePhotoSelect} disabled={uploadingPhoto}>
                  <Icon name="camera" size={16} style={{ marginRight: 8 }} />
                  {uploadingPhoto ? 'Enviando...' : 'Escolher foto'}
                </Button>
                {user.profile_image_id && (
                  <Button variant="danger" onClick={handleDeletePhoto} disabled={uploadingPhoto}>
                    <Icon name="delete" size={16} style={{ marginRight: 8 }} />
                    Remover
                  </Button>
                )}
              </div>

              <p className="profile-settings__photo-hint">
                Formatos aceitos: JPG, PNG, GIF, WebP. Tamanho máximo: 5MB.
              </p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default ProfileSettingsModal;
