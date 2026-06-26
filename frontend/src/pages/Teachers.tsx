import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/Authentication';
import { getTeachersByClass, ClassMember, getClassesList, ClassesProps } from '../services/ClassesService';
import { getProfileImageUrl } from '../services/ProfileService';
import { Icon } from '../components/Icons/Icons';
import './Teachers.scss';

const Teachers: React.FC = () => {
  const { user } = useAuth();
  const [teachers, setTeachers] = useState<ClassMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [className, setClassName] = useState<string>('');

  useEffect(() => {
    const loadData = async () => {
      if (!user?.classId) {
        setTeachers([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const [teachersData, classes] = await Promise.all([
          getTeachersByClass(user.classId),
          getClassesList(),
        ]);
        
        setTeachers(teachersData);
        
        const currentClass = classes.find((c: ClassesProps) => c._id === user.classId);
        setClassName(currentClass?.name || 'Turma');
      } catch (err) {
        console.error('Error loading teachers:', err);
        setError('Erro ao carregar professores');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user?.classId]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (!user) {
    return (
      <div className="teachers-page">
        <p>Carregando...</p>
      </div>
    );
  }

  return (
    <div className="teachers-page">
      <div className="teachers-page__header">
        <h1 className="page-title">Professores</h1>
        {className && <span className="teachers-page__class-name">{className}</span>}
      </div>

      {!user.classId ? (
        <div className="teachers-page__empty">
          <Icon name="graduation" size={48} />
          <p>Você não está matriculado em nenhuma turma</p>
        </div>
      ) : loading ? (
        <div className="teachers-page__loading">
          <Icon name="refresh" size={24} className="teachers-page__spinner" />
          <p>Carregando professores...</p>
        </div>
      ) : error ? (
        <div className="teachers-page__error">
          <Icon name="warning" size={24} />
          <p>{error}</p>
        </div>
      ) : teachers.length === 0 ? (
        <div className="teachers-page__empty">
          <Icon name="graduation" size={48} />
          <p>Nenhum professor encontrado nesta turma</p>
        </div>
      ) : (
        <div className="teachers-page__grid">
          {teachers.map((teacher) => (
            <div key={teacher._id} className="teachers-page__card">
              <div className="teachers-page__avatar">
                {teacher.profile_image_id ? (
                  <img
                    src={getProfileImageUrl(teacher.profile_image_id) || ''}
                    alt={teacher.name}
                    className="teachers-page__avatar-img"
                  />
                ) : (
                  <span className="teachers-page__avatar-initials">
                    {getInitials(teacher.name)}
                  </span>
                )}
              </div>
              <div className="teachers-page__info">
                <h3 className="teachers-page__name">{teacher.name}</h3>
                <p className="teachers-page__email">
                  <Icon name="envelope" size={14} style={{ marginRight: 6 }} />
                  {teacher.email}
                </p>
                {teacher.contact_info && (
                  <div className="teachers-page__contact">
                    <Icon name="user" size={14} style={{ marginRight: 6, marginTop: 3, flexShrink: 0 }} />
                    <span>{teacher.contact_info}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="teachers-page__count">
        {!loading && teachers.length > 0 && (
          <span>{teachers.length} professor{teachers.length !== 1 ? 'es' : ''}</span>
        )}
      </div>
    </div>
  );
};

export default Teachers;
