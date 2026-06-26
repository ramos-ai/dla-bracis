import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/Authentication';
import { useSelectedClass } from '../contexts/SelectedClass';
import { getStudentsByClass, ClassMember, getClassesList, ClassesProps } from '../services/ClassesService';
import { getProfileImageUrl } from '../services/ProfileService';
import { Icon } from '../components/Icons/Icons';
import './Students.scss';

const Students: React.FC = () => {
  const { user } = useAuth();
  const { selectedClassId } = useSelectedClass();
  const [students, setStudents] = useState<ClassMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [className, setClassName] = useState<string>('');

  useEffect(() => {
    const loadData = async () => {
      if (!selectedClassId) {
        setStudents([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const [studentsData, classes] = await Promise.all([
          getStudentsByClass(selectedClassId),
          getClassesList(),
        ]);
        
        setStudents(studentsData);
        
        const currentClass = classes.find((c: ClassesProps) => c._id === selectedClassId);
        setClassName(currentClass?.name || 'Turma');
      } catch (err) {
        console.error('Error loading students:', err);
        setError('Erro ao carregar alunos');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [selectedClassId]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    return (
      <div className="students-page">
        <p>Acesso não autorizado</p>
      </div>
    );
  }

  return (
    <div className="students-page">
      <div className="students-page__header">
        <h1 className="page-title">Alunos</h1>
        {className && <span className="students-page__class-name">{className}</span>}
      </div>

      {!selectedClassId ? (
        <div className="students-page__empty">
          <Icon name="group" size={48} />
          <p>Selecione uma turma no header para ver os alunos</p>
        </div>
      ) : loading ? (
        <div className="students-page__loading">
          <Icon name="refresh" size={24} className="students-page__spinner" />
          <p>Carregando alunos...</p>
        </div>
      ) : error ? (
        <div className="students-page__error">
          <Icon name="warning" size={24} />
          <p>{error}</p>
        </div>
      ) : students.length === 0 ? (
        <div className="students-page__empty">
          <Icon name="group" size={48} />
          <p>Nenhum aluno encontrado nesta turma</p>
        </div>
      ) : (
        <div className="students-page__grid">
          {students.map((student) => (
            <div key={student._id} className="students-page__card">
              <div className="students-page__avatar">
                {student.profile_image_id ? (
                  <img
                    src={getProfileImageUrl(student.profile_image_id) || ''}
                    alt={student.name}
                    className="students-page__avatar-img"
                  />
                ) : (
                  <span className="students-page__avatar-initials">
                    {getInitials(student.name)}
                  </span>
                )}
              </div>
              <div className="students-page__info">
                <h3 className="students-page__name">{student.name}</h3>
                <p className="students-page__email">
                  <Icon name="envelope" size={14} style={{ marginRight: 6 }} />
                  {student.email}
                </p>
                {student.contact_info && (
                  <p className="students-page__contact">
                    <Icon name="user" size={14} style={{ marginRight: 6 }} />
                    {student.contact_info}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="students-page__count">
        {!loading && students.length > 0 && (
          <span>{students.length} aluno{students.length !== 1 ? 's' : ''}</span>
        )}
      </div>
    </div>
  );
};

export default Students;
