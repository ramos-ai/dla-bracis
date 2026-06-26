import React, { useEffect, useState, useMemo } from 'react';
import { ExerciseProps, getExercisesList } from '../../services/ExercisesService';
import { useNavigate } from 'react-router-dom';
import { useSelectedClass } from '../../contexts/SelectedClass';
import Card from '../../components/Card/Card';
import LoadingOverlay from '../../components/LoadingOverlay/LoadingOverlay';
import Button from '../../components/Fields/Button';
import { Icon } from '../../components/Icons/Icons';

const MESES_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const;

/** Formata data/hora ISO para dd/mmm/aaaa HH:mm em português (ex.: 24/fev/2026 23:59) */
function formatDateTimePT(isoStr: string | undefined | null): string {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return isoStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = MESES_PT[d.getMonth()];
    const year = d.getFullYear();
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${h}:${min}`;
  } catch {
    return isoStr;
  }
}

const getTaskTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    classification: 'Classificação',
    segmentation: 'Segmentação',
    detection: 'Detecção de Objetos',
    all: 'Todos',
  };
  return labels[type] || type;
};

const Exercises: React.FC = () => {
  const navigate = useNavigate();
  const { selectedClassId } = useSelectedClass();

  const [exercisesList, setExercisesList] = useState<ExerciseProps[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterClass, setFilterClass] = useState<string>('all');

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await getExercisesList(selectedClassId ?? undefined);
      setExercisesList(response.exercises || []);
    } catch (err) {
      console.error('Erro ao buscar exercícios:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedClassId]);

  const filteredByClass = useMemo(() => {
    if (filterClass === 'all') return exercisesList;
    return exercisesList.filter((e) => (e.class || '') === filterClass);
  }, [exercisesList, filterClass]);

  const filteredExercises = useMemo(() => {
    if (filterType === 'all') return filteredByClass;
    return filteredByClass.filter((e) => (e.task_type || 'classification') === filterType);
  }, [filteredByClass, filterType]);

  const groupedByType = useMemo(() => {
    return {
      classification: exercisesList.filter((e) => (e.task_type || 'classification') === 'classification'),
      segmentation: exercisesList.filter((e) => (e.task_type || 'classification') === 'segmentation'),
      detection: exercisesList.filter((e) => (e.task_type || 'classification') === 'detection'),
      other: exercisesList.filter((e) => !['classification', 'segmentation', 'detection'].includes(e.task_type || '')),
    };
  }, [exercisesList]);

  const groupedFiltered = useMemo(() => {
    const list = filterType === 'all' ? filteredByClass : filteredExercises;
    return {
      classification: list.filter((e) => (e.task_type || 'classification') === 'classification'),
      segmentation: list.filter((e) => (e.task_type || 'classification') === 'segmentation'),
      detection: list.filter((e) => (e.task_type || 'classification') === 'detection'),
      other: list.filter((e) => !['classification', 'segmentation', 'detection'].includes(e.task_type || '')),
    };
  }, [filterType, filteredByClass, filteredExercises]);

  const uniqueClasses = useMemo(() => {
    const ids = new Set<string>();
    const names: Record<string, string> = {};
    exercisesList.forEach((e) => {
      const c = e.class || 'Sem Turma';
      ids.add(c);
      if (e.class_name) names[c] = e.class_name;
    });
    return Array.from(ids).map((id) => ({ id, name: names[id] || id }));
  }, [exercisesList]);

  const showClassFilter = uniqueClasses.length > 1;

  if (loading) return <LoadingOverlay message="Carregando informações..." />;

  return (
    <div className="exercises__content">
      <div className="exercises__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 className="page-title">Lista de Exercícios</h1>
        <Button onClick={() => navigate('/exercises/manage')}>
          <Icon name="add" size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
          Criar novo
        </Button>
      </div>

      {/* Filtro por tipo (sem label, como em datasets) */}
      <div className="exercises__filters" style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <Button
          variant={filterType === 'all' ? 'primary' : 'secondary'}
          onClick={() => setFilterType('all')}
          style={{ fontSize: '0.9rem' }}
        >
          Todos ({filteredByClass.length})
        </Button>
        <Button
          variant={filterType === 'classification' ? 'primary' : 'secondary'}
          onClick={() => setFilterType('classification')}
          style={{ fontSize: '0.9rem' }}
        >
          Classificação ({groupedByType.classification.length})
        </Button>
        <Button
          variant={filterType === 'segmentation' ? 'primary' : 'secondary'}
          onClick={() => setFilterType('segmentation')}
          style={{ fontSize: '0.9rem' }}
        >
          Segmentação ({groupedByType.segmentation.length})
        </Button>
        <Button
          variant={filterType === 'detection' ? 'primary' : 'secondary'}
          onClick={() => setFilterType('detection')}
          style={{ fontSize: '0.9rem' }}
        >
          Detecção ({groupedByType.detection.length})
        </Button>
      </div>

      {/* Filtro por turma (quando há mais de uma) */}
      {showClassFilter && (
        <div className="exercises__filters-class" style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Button
            variant={filterClass === 'all' ? 'primary' : 'secondary'}
            onClick={() => setFilterClass('all')}
            style={{ fontSize: '0.9rem' }}
          >
            Todas
          </Button>
          {uniqueClasses.map(({ id, name }) => (
            <Button
              key={id}
              variant={filterClass === id ? 'primary' : 'secondary'}
              onClick={() => setFilterClass(id)}
              style={{ fontSize: '0.9rem' }}
            >
              {name}
            </Button>
          ))}
        </div>
      )}

      {/* Listagem: agrupada por tipo quando "Todos", igual à lista de datasets */}
      {filterType === 'all' ? (
        <>
          {groupedFiltered.classification.length > 0 && (
            <div className="exercises__group" style={{ marginBottom: '2rem' }}>
              <h3 className="exercises__group-title" style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '1rem', color: '#333' }}>
                Classificação ({groupedFiltered.classification.length})
              </h3>
              <div className="exercises__list" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', width: '100%' }}>
                {groupedFiltered.classification.map((exercise) => (
                  <div key={exercise._id || ''} className="exercises__card-wrapper">
                    <Card
                      title={exercise.title}
                      description={exercise.do_date ? `Prazo: ${formatDateTimePT(exercise.do_date)}` : 'Sem prazo definido'}
                      footer={<><strong>{getTaskTypeLabel(exercise.task_type || '')}</strong> — Criado em {formatDateTimePT(exercise.created_at || undefined)}</>}
                      onClick={() => navigate(`/exercises/manage?id=${exercise._id}`)}
                      cardStyle="card card--exercise"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          {groupedFiltered.segmentation.length > 0 && (
            <div className="exercises__group" style={{ marginBottom: '2rem' }}>
              <h3 className="exercises__group-title" style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '1rem', color: '#333' }}>
                Segmentação ({groupedFiltered.segmentation.length})
              </h3>
              <div className="exercises__list" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', width: '100%' }}>
                {groupedFiltered.segmentation.map((exercise) => (
                  <div key={exercise._id || ''} className="exercises__card-wrapper">
                    <Card
                      title={exercise.title}
                      description={exercise.do_date ? `Prazo: ${formatDateTimePT(exercise.do_date)}` : 'Sem prazo definido'}
                      footer={<><strong>{getTaskTypeLabel(exercise.task_type || '')}</strong> — Criado em {formatDateTimePT(exercise.created_at || undefined)}</>}
                      onClick={() => navigate(`/exercises/manage?id=${exercise._id}`)}
                      cardStyle="card card--exercise"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          {groupedFiltered.detection.length > 0 && (
            <div className="exercises__group" style={{ marginBottom: '2rem' }}>
              <h3 className="exercises__group-title" style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '1rem', color: '#333' }}>
                Detecção de Objetos ({groupedFiltered.detection.length})
              </h3>
              <div className="exercises__list" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', width: '100%' }}>
                {groupedFiltered.detection.map((exercise) => (
                  <div key={exercise._id || ''} className="exercises__card-wrapper">
                    <Card
                      title={exercise.title}
                      description={exercise.do_date ? `Prazo: ${formatDateTimePT(exercise.do_date)}` : 'Sem prazo definido'}
                      footer={<><strong>{getTaskTypeLabel(exercise.task_type || '')}</strong> — Criado em {formatDateTimePT(exercise.created_at || undefined)}</>}
                      onClick={() => navigate(`/exercises/manage?id=${exercise._id}`)}
                      cardStyle="card card--exercise"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          {groupedFiltered.other.length > 0 && (
            <div className="exercises__group" style={{ marginBottom: '2rem' }}>
              <h3 className="exercises__group-title" style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '1rem', color: '#333' }}>
                Outros ({groupedFiltered.other.length})
              </h3>
              <div className="exercises__list" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', width: '100%' }}>
                {groupedFiltered.other.map((exercise) => (
                  <div key={exercise._id || ''} className="exercises__card-wrapper">
                    <Card
                      title={exercise.title}
                      description={exercise.do_date ? `Prazo: ${formatDateTimePT(exercise.do_date)}` : 'Sem prazo definido'}
                      footer={<>Criado em {formatDateTimePT(exercise.created_at || undefined)}</>}
                      onClick={() => navigate(`/exercises/manage?id=${exercise._id}`)}
                      cardStyle="card card--exercise"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          {filteredByClass.length === 0 && (
            <p style={{ color: '#666', fontStyle: 'italic' }}>Nenhum exercício encontrado.</p>
          )}
        </>
      ) : (
        <div className="exercises__list" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', width: '100%' }}>
          {filteredExercises.map((exercise) => (
            <div key={exercise._id || ''} className="exercises__card-wrapper">
              <Card
                title={exercise.title}
                description={exercise.do_date ? `Prazo: ${formatDateTimePT(exercise.do_date)}` : 'Sem prazo definido'}
                footer={<><strong>{getTaskTypeLabel(exercise.task_type || '')}</strong> — Criado em {formatDateTimePT(exercise.created_at || undefined)}</>}
                onClick={() => navigate(`/exercises/manage?id=${exercise._id}`)}
                cardStyle="card card--exercise"
              />
            </div>
          ))}
          {filteredExercises.length === 0 && (
            <p style={{ color: '#666', fontStyle: 'italic' }}>Nenhum exercício encontrado para este filtro.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default Exercises;
