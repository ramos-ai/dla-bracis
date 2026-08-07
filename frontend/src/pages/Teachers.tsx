import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/Authentication';
import { getTeachersByClass, ClassMember, getClassesList, ClassesProps } from '../services/ClassesService';
import { getProfileImageUrl } from '../services/ProfileService';
import { Icon } from '../components/Icons/Icons';
import { PageHeader, Panel, EmptyState, Tag } from '../components/dla';
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
      <div className="teachers-page space-y-6">
        <PageHeader eyebrow="Turma" title="Professores" />
        <Panel><p className="text-sm text-muted-foreground">Carregando...</p></Panel>
      </div>
    );
  }

  return (
    <div className="teachers-page space-y-6">
      <PageHeader
        eyebrow="Turma"
        title="Professores"
        description="Docentes responsáveis pela sua turma."
        actions={className ? <Tag tone="primary">{className}</Tag> : undefined}
      />

      {!user.classId ? (
        <EmptyState title="Sem turma matriculada" description="Você não está matriculado em nenhuma turma." />
      ) : loading ? (
        <Panel>
          <div className="teachers-page__loading flex items-center gap-3 py-6 text-muted-foreground">
            <Icon name="refresh" size={24} className="teachers-page__spinner" />
            <p className="text-sm">Carregando professores...</p>
          </div>
        </Panel>
      ) : error ? (
        <Panel>
          <div className="teachers-page__error flex items-center gap-3 text-destructive">
            <Icon name="warning" size={24} />
            <p className="text-sm">{error}</p>
          </div>
        </Panel>
      ) : teachers.length === 0 ? (
        <EmptyState title="Nenhum professor encontrado" description="Esta turma ainda não tem professores atribuídos." />
      ) : (
        <Panel
          title={`${teachers.length} professor${teachers.length !== 1 ? 'es' : ''}`}
          hint="Lista de docentes da turma"
        >
          <div className="teachers-page__grid grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {teachers.map((teacher) => (
              <div key={teacher._id} className="teachers-page__card flex gap-4 rounded-md border border-border p-4">
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
                <div className="teachers-page__info min-w-0">
                  <h3 className="teachers-page__name truncate text-sm font-semibold text-foreground">{teacher.name}</h3>
                  <p className="teachers-page__email mt-1 flex items-center text-xs text-muted-foreground">
                    <Icon name="envelope" size={14} style={{ marginRight: 6 }} />
                    <span className="truncate">{teacher.email}</span>
                  </p>
                  {teacher.contact_info && (
                    <div className="teachers-page__contact mt-1 flex items-start text-xs text-muted-foreground">
                      <Icon name="user" size={14} style={{ marginRight: 6, marginTop: 3, flexShrink: 0 }} />
                      <span>{teacher.contact_info}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
};

export default Teachers;
