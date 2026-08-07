import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/Authentication';
import { useSelectedClass } from '../contexts/SelectedClass';
import { getStudentsByClass, ClassMember, getClassesList, ClassesProps } from '../services/ClassesService';
import { getProfileImageUrl } from '../services/ProfileService';
import { Icon } from '../components/Icons/Icons';
import { PageHeader, Panel, EmptyState, Tag } from '../components/dla';
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
      <div className="students-page space-y-6">
        <PageHeader eyebrow="Turma" title="Alunos" />
        <Panel><p className="text-sm text-muted-foreground">Acesso não autorizado</p></Panel>
      </div>
    );
  }

  return (
    <div className="students-page space-y-6">
      <PageHeader
        eyebrow="Turma"
        title="Alunos"
        description="Membros da turma selecionada no cabeçalho."
        actions={className ? <Tag tone="primary">{className}</Tag> : undefined}
      />

      {!selectedClassId ? (
        <EmptyState
          title="Nenhuma turma selecionada"
          description="Selecione uma turma no header para ver os alunos."
        />
      ) : loading ? (
        <Panel>
          <div className="students-page__loading flex items-center gap-3 py-6 text-muted-foreground">
            <Icon name="refresh" size={24} className="students-page__spinner" />
            <p className="text-sm">Carregando alunos...</p>
          </div>
        </Panel>
      ) : error ? (
        <Panel>
          <div className="students-page__error flex items-center gap-3 text-destructive">
            <Icon name="warning" size={24} />
            <p className="text-sm">{error}</p>
          </div>
        </Panel>
      ) : students.length === 0 ? (
        <EmptyState title="Nenhum aluno nesta turma" description="Adicione alunos em Gestão de turmas." />
      ) : (
        <Panel
          title={`${students.length} aluno${students.length !== 1 ? 's' : ''}`}
          hint="Lista de alunos matriculados"
        >
          <div className="students-page__grid grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {students.map((student) => (
              <div key={student._id} className="students-page__card flex gap-4 rounded-md border border-border p-4">
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
                <div className="students-page__info min-w-0">
                  <h3 className="students-page__name truncate text-sm font-semibold text-foreground">{student.name}</h3>
                  <p className="students-page__email mt-1 flex items-center text-xs text-muted-foreground">
                    <Icon name="envelope" size={14} style={{ marginRight: 6 }} />
                    <span className="truncate">{student.email}</span>
                  </p>
                  {student.contact_info && (
                    <p className="students-page__contact mt-1 flex items-center text-xs text-muted-foreground">
                      <Icon name="user" size={14} style={{ marginRight: 6 }} />
                      {student.contact_info}
                    </p>
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

export default Students;
