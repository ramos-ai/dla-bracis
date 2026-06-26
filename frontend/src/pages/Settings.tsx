import React, { useEffect, useState } from 'react';
import { getClassesList, createClass, ClassesProps } from '../services/ClassesService';
import { api } from '../services/api';
import SelectField from '../components/Fields/SelectField';
import InputField from '../components/Fields/InputField';
import Button from '../components/Fields/Button';
import UserSearchModal from '../components/UserSearchModal/UserSearchModal';
import InlineLoader from '../components/InlineLoader/InlineLoader';
import { Icon } from '../components/Icons/Icons';
import { useAlertConfirm } from '../contexts/AlertConfirmContext';

interface User {
  _id: string;
  name: string;
  email: string;
  classId?: string;
  role: string;
}

interface ClassWithUsers extends ClassesProps {
  students?: User[];
  teachers?: User[];
}

const Settings: React.FC = () => {
  const { alert: showAlert, confirm: showConfirm } = useAlertConfirm();
  const [classes, setClasses] = useState<ClassesProps[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [classData, setClassData] = useState<ClassWithUsers | null>(null);
  const [students, setStudents] = useState<User[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [unassignedUsers, setUnassignedUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddTeacherModal, setShowAddTeacherModal] = useState(false);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [showCreateClass, setShowCreateClass] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassCode, setNewClassCode] = useState('');
  const [newClassInstitution, setNewClassInstitution] = useState('');
  const [creatingClass, setCreatingClass] = useState(false);

  useEffect(() => {
    loadClasses();
    loadAllUsers();
  }, []);

  useEffect(() => {
    if (selectedClass) {
      console.log('Loading class data for:', selectedClass);
      loadClassData(selectedClass);
    } else {
      setClassData(null);
    }
  }, [selectedClass]);

  const loadClasses = async () => {
    try {
      const response = await getClassesList();
      setClasses(response);
    } catch (error) {
      console.error('Erro ao carregar turmas:', error);
      showAlert('Erro ao carregar turmas');
    }
  };

  const loadClassData = async (classId: string) => {
    if (!classId) {
      console.error('classId está vazio');
      return;
    }
    
    try {
      setLoading(true);
      const response = await api.get(`/classes/${classId}`);
      setClassData(response.data.class);
    } catch (error: unknown) {
      console.error('Erro ao carregar dados da turma:', error);
      const err = error as { response?: { status?: number; data?: { message?: string; error?: string } } };
      const errorMessage = err?.response?.data?.message || err?.response?.data?.error || 'Erro ao carregar dados da turma';
      if (err?.response?.status === 404) {
        showAlert('Turma não encontrada');
      } else {
        showAlert(errorMessage);
      }
      setClassData(null);
    } finally {
      setLoading(false);
    }
  };

  const loadAllUsers = async () => {
    try {
      const [studentsRes, teachersRes, unassignedRes] = await Promise.all([
        api.get('/classes/users/student'),
        api.get('/classes/users/teacher'),
        api.get('/classes/users/unassigned')
      ]);
      setStudents(studentsRes.data.users);
      setTeachers(teachersRes.data.users);
      setUnassignedUsers(unassignedRes.data.users || []);
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
    }
  };

  const handleAssignUsers = async (userIds: string[], userRole: 'student' | 'teacher') => {
    if (!selectedClass) {
      showAlert('Selecione uma turma primeiro');
      return;
    }

    if (!userIds || userIds.length === 0) {
      showAlert('Selecione pelo menos um usuário');
      return;
    }

    try {
      console.log('Assigning users:', { userIds, class_id: selectedClass, role: userRole });
      const response = await api.post('/classes/assign', {
        user_ids: userIds,
        class_id: selectedClass,
        role: userRole
      });
      showAlert(response.data.message || `${userRole === 'student' ? 'Aluno(s)' : 'Professor(es)'} atribuído(s) com sucesso!`);
      loadClassData(selectedClass);
      loadAllUsers();
    } catch (error: unknown) {
      console.error('Erro ao atribuir usuário:', error);
      const err = error as { response?: { status?: number; data?: { message?: string; error?: string } } };
      const errorMessage = err?.response?.data?.message || err?.response?.data?.error || 'Erro ao atribuir usuário';
      if (err?.response?.status === 404) {
        showAlert('Turma não encontrada');
      } else {
        showAlert(errorMessage);
      }
    }
  };

  const handleRemoveUser = async (userId: string) => {
    if (!selectedClass) {
      showAlert('Selecione uma turma primeiro');
      return;
    }

    const ok = await showConfirm('Tem certeza que deseja remover este usuário da turma?');
    if (!ok) return;

    try {
      await api.post('/classes/remove', {
        user_id: userId,
        class_id: selectedClass  // Include class_id for teachers with multiple classes
      });
      showAlert('Usuário removido da turma com sucesso!');
      loadClassData(selectedClass);
      loadAllUsers();
    } catch (error: unknown) {
      console.error('Erro ao remover usuário:', error);
      const err = error as { response?: { data?: { message?: string } } };
      const errorMessage = err?.response?.data?.message || 'Erro ao remover usuário';
      showAlert(errorMessage);
    }
  };

  const getAllUsers = (role: 'student' | 'teacher') => {
    const userList = role === 'student' ? students : teachers;
    const unassigned = unassignedUsers.map(u => ({ ...u, _unassigned: true }));
    const combined = [...userList, ...unassigned];
    return combined.sort((a, b) => {
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  };

  const getUsersInClass = (role: 'student' | 'teacher') => {
    if (!classData) return [];
    return role === 'student' ? (classData.students || []) : (classData.teachers || []);
  };

  /** Users that can be added to the current class (excludes those already in the class). */
  const getUsersAvailableToAdd = (role: 'student' | 'teacher') => {
    const inClass = getUsersInClass(role);
    const inClassIds = new Set(inClass.map(u => u._id));
    return getAllUsers(role).filter(u => !inClassIds.has(u._id));
  };

  const handleCreateClass = async () => {
    const name = newClassName.trim();
    if (!name) {
      showAlert('Nome da turma é obrigatório');
      return;
    }
    try {
      setCreatingClass(true);
      const created = await createClass({
        name,
        code: newClassCode.trim() || undefined,
        institution: newClassInstitution.trim() || undefined,
      });
      await loadClasses();
      setSelectedClass(created._id || '');
      setShowCreateClass(false);
      setNewClassName('');
      setNewClassCode('');
      setNewClassInstitution('');
      showAlert('Turma criada com sucesso!');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      const msg = err?.response?.data?.message || err?.message || 'Erro ao criar turma';
      showAlert(msg);
    } finally {
      setCreatingClass(false);
    }
  };

  return (
    <div className="settings">
      <h1 className="page-title">Gestão de Turmas</h1>
      
      <div className="settings__section">
        <div className="settings__select-class" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 200px' }}>
            <SelectField
              label="Selecione uma turma"
              name="class"
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              options={classes.map(cls => ({
                value: cls._id || '',
                label: cls.name
              }))}
            />
          </div>
          <Button variant="primary" onClick={() => setShowCreateClass(!showCreateClass)}>
            <Icon name="add" size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            Nova turma
          </Button>
        </div>
        {showCreateClass && (
          <div className="settings__create-class" style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #e0e0e0', borderRadius: '8px', backgroundColor: '#fafafa' }}>
            <h4 style={{ marginTop: 0 }}>Criar turma</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '400px' }}>
              <InputField label="Nome" name="name" value={newClassName} onChange={(e) => setNewClassName(e.target.value)} placeholder="Ex: Turma 1" required />
              <InputField label="Código (opcional)" name="code" value={newClassCode} onChange={(e) => setNewClassCode(e.target.value)} placeholder="Ex: 123456" />
              <InputField label="Instituição (opcional)" name="institution" value={newClassInstitution} onChange={(e) => setNewClassInstitution(e.target.value)} placeholder="Ex: Unisinos" />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Button onClick={handleCreateClass} disabled={creatingClass}>{creatingClass ? 'Criando...' : 'Criar'}</Button>
                <Button variant="secondary" onClick={() => { setShowCreateClass(false); setNewClassName(''); setNewClassCode(''); setNewClassInstitution(''); }}>Cancelar</Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {selectedClass && loading && (
        <div className="settings__section" style={{ padding: '1.5rem' }}>
          <InlineLoader message="Carregando turma..." />
        </div>
      )}

      {selectedClass && classData && (
        <>
          <div className="settings__section">
            <div className="settings__section-header">
              <h3>Professores da Turma</h3>
              <Button
                onClick={() => setShowAddTeacherModal(true)}
                variant="secondary"
              >
                <Icon name="add" size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                Adicionar Professor
              </Button>
            </div>
            <div className="settings__users-list">
              {getUsersInClass('teacher').map((teacher) => (
                <div key={teacher._id} className="settings__user-card">
                  <div className="settings__user-info">
                    <strong>{teacher.name}</strong>
                    <span>{teacher.email}</span>
                  </div>
                  <Button
                    variant="danger"
                    onClick={() => handleRemoveUser(teacher._id)}
                  >
                    Remover
                  </Button>
                </div>
              ))}
              {getUsersInClass('teacher').length === 0 && (
                <p className="settings__empty-message">Nenhum professor atribuído a esta turma.</p>
              )}
            </div>
          </div>

          <div className="settings__section">
            <div className="settings__section-header">
              <h3>Alunos da Turma</h3>
              <Button
                onClick={() => setShowAddStudentModal(true)}
                variant="secondary"
              >
                <Icon name="add" size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                Adicionar Aluno(s)
              </Button>
            </div>
            <div className="settings__users-list">
              {getUsersInClass('student').map((student) => (
                <div key={student._id} className="settings__user-card">
                  <div className="settings__user-info">
                    <strong>{student.name}</strong>
                    <span>{student.email}</span>
                  </div>
                  <Button
                    variant="danger"
                    onClick={() => handleRemoveUser(student._id)}
                  >
                    Remover
                  </Button>
                </div>
              ))}
              {getUsersInClass('student').length === 0 && (
                <p className="settings__empty-message">Nenhum aluno atribuído a esta turma.</p>
              )}
            </div>
          </div>
        </>
      )}

      {selectedClass && loading && <p>Carregando...</p>}
      {!selectedClass && (
        <p>Selecione uma turma para começar a gerenciar.</p>
      )}

      {/* Modals */}
      <UserSearchModal
        isOpen={showAddTeacherModal}
        onClose={() => setShowAddTeacherModal(false)}
        users={getUsersAvailableToAdd('teacher')}
        onAddUsers={(userIds) => handleAssignUsers(userIds, 'teacher')}
        title="Adicionar Professor à Turma"
        allowMultiple={false}
      />

      <UserSearchModal
        isOpen={showAddStudentModal}
        onClose={() => setShowAddStudentModal(false)}
        users={getUsersAvailableToAdd('student')}
        onAddUsers={(userIds) => handleAssignUsers(userIds, 'student')}
        title="Adicionar Aluno(s) à Turma"
        allowMultiple={true}
      />
    </div>
  );
};

export default Settings;

