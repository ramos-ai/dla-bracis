import React, { useState, useEffect } from 'react';
import Modal from '../Modal/Modal';
import { useAlertConfirm } from '../../contexts/AlertConfirmContext';
import InputField from '../Fields/InputField';
import Button from '../Fields/Button';

interface User {
  _id: string;
  name: string;
  email: string;
  classId?: string;
  role: string;
}

interface UserSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: User[];
  onAddUsers: (userIds: string[]) => void;
  title: string;
  allowMultiple?: boolean;
}

const UserSearchModal: React.FC<UserSearchModalProps> = ({
  isOpen,
  onClose,
  users,
  onAddUsers,
  title,
  allowMultiple = false
}) => {
  const { alert: showAlert } = useAlertConfirm();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('');
      setSelectedUsers(new Set());
    }
  }, [isOpen]);

  // Sort users alphabetically by name
  const sortedUsers = [...users].sort((a, b) => {
    const nameA = (a.name || '').toLowerCase();
    const nameB = (b.name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });

  // Filter users based on search term (if empty, show all)
  const filteredUsers = searchTerm.trim() === '' 
    ? sortedUsers
    : sortedUsers.filter(user => {
        const searchLower = searchTerm.toLowerCase();
        return (
          user.name.toLowerCase().includes(searchLower) ||
          user.email.toLowerCase().includes(searchLower)
        );
      });

  const handleToggleUser = (userId: string) => {
    if (!allowMultiple) {
      setSelectedUsers(new Set([userId]));
      return;
    }
    
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
  };

  const handleAdd = () => {
    if (selectedUsers.size === 0) {
      showAlert('Selecione pelo menos um usuário');
      return;
    }
    onAddUsers(Array.from(selectedUsers));
    setSelectedUsers(new Set());
    setSearchTerm('');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="lg"
    >
      <div className="user-search-modal">
        <div className="user-search-modal__search">
          <InputField
            label="Pesquisar (opcional)"
            name="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Digite nome ou email para filtrar..."
          />
        </div>
        
        {searchTerm.trim() === '' && (
          <div className="user-search-modal__info">
            Mostrando todos os usuários ({sortedUsers.length})
          </div>
        )}
        
        {searchTerm.trim() !== '' && (
          <div className="user-search-modal__info">
            {filteredUsers.length} usuário(s) encontrado(s)
          </div>
        )}
        
        {allowMultiple && selectedUsers.size > 0 && (
          <div className="user-search-modal__selected-count">
            {selectedUsers.size} usuário(s) selecionado(s)
          </div>
        )}

        <div className="user-search-modal__list">
          {filteredUsers.length === 0 ? (
            <p className="user-search-modal__no-results">
              {searchTerm ? 'Nenhum usuário encontrado' : 'Nenhum usuário disponível'}
            </p>
          ) : (
            filteredUsers.map((user) => {
              const isSelected = selectedUsers.has(user._id);
              return (
                <div
                  key={user._id}
                  className={`user-search-modal__item ${isSelected ? 'user-search-modal__item--selected' : ''}`}
                  onClick={() => handleToggleUser(user._id)}
                >
                  <div className="user-search-modal__item-content">
                    <div className="user-search-modal__item-info">
                      <strong>{user.name}</strong>
                      <span>{user.email}</span>
                    </div>
                    {allowMultiple && (
                      <div className="user-search-modal__checkbox">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleUser(user._id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="user-search-modal__actions">
          <Button
            variant="secondary"
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleAdd}
            disabled={selectedUsers.size === 0}
          >
            {allowMultiple 
              ? `Adicionar ${selectedUsers.size} usuário(s)`
              : 'Adicionar'
            }
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default UserSearchModal;

