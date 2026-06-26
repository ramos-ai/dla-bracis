import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ExerciseProps, getExercisesByClassId, getSubmissionByUserAndExercise, SubmissionProps } from '../../services/ExercisesService';
import Card from '../../components/Card/Card';
import Modal from '../../components/Modal/Modal';
import ExerciseCarousel from '../../components/ExerciseCarousel/ExerciseCarousel';
import { useAuth } from '../../contexts/Authentication';
import { useAlertConfirm } from '../../contexts/AlertConfirmContext';
import { getDatasetById } from '../../services/datasetsService';
import { getUser } from '../../services/AuthService';
import Button from '../../components/Fields/Button';

const MESES_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const;

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

export interface ResolutionProps {
    classId: string | null;
}

interface ExerciseWithStatus extends ExerciseProps {
  isFinalized?: boolean;
  submission?: SubmissionProps;
}

const isExerciseFinalized = (submission: SubmissionProps | null | undefined): boolean => {
  if (!submission) return false;
  return submission.isFinalized === true || 
         (submission.finalizedAt !== null && submission.finalizedAt !== undefined && submission.finalizedAt !== '');
};

const Resolution: React.FC<ResolutionProps> = () => {
  const { user } = useAuth();
  const { alert: showAlert } = useAlertConfirm();
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [exercises, setExercises] = useState<ExerciseWithStatus[]>([]);
  const [resolutionLoading, setResolutionLoading] = useState<boolean>(true);
  const [openResolutionModal, setOpenResolutionModal] = useState<boolean>(false);
  const [selectedExercise, setSelectedExercise] = useState<ExerciseProps>();
  const [filterType, setFilterType] = useState<string>('all');
  const openExerciseIdFromState = (location.state as { openExerciseId?: string })?.openExerciseId;

  useEffect(() => {
    const classId = user?.classId ?? null;
    setSelectedClass(classId);
    if (classId === null) setResolutionLoading(false);
  }, [user]);

  const enrichExerciseWithStatus = async (exercise: ExerciseProps, userId: string): Promise<ExerciseWithStatus> => {
    if (!exercise._id) {
      return { ...exercise, isFinalized: false };
    }

    try {
      const submission = await getSubmissionByUserAndExercise(exercise._id, userId);
      return {
        ...exercise,
        isFinalized: isExerciseFinalized(submission),
        submission: submission || undefined
      };
    } catch (error) {
      console.error(`Error checking submission for exercise ${exercise._id}:`, error);
      return { ...exercise, isFinalized: false };
    }
  };

  const loadExercises = useCallback(async () => {
    if (!selectedClass || !user?._id) {
      setResolutionLoading(false);
      return;
    }
    setResolutionLoading(true);
    try {
      const exercisesList = await getExercisesByClassId(selectedClass);
      const exercisesWithStatus = await Promise.all(
        exercisesList.map((exercise: ExerciseProps) => enrichExerciseWithStatus(exercise, user._id))
      );
      setExercises(exercisesWithStatus);
    } catch (error) {
      console.error('Error fetching exercises:', error);
    } finally {
      setResolutionLoading(false);
    }
  }, [selectedClass, user?._id]);

  useEffect(() => {
    loadExercises();
  }, [loadExercises]);

  // Abrir modal do exercício quando vem da Home com state openExerciseId
  useEffect(() => {
    if (!openExerciseIdFromState || exercises.length === 0) return;
    const ex = exercises.find((e) => e._id === openExerciseIdFromState);
    if (ex && !ex.isFinalized) {
      setSelectedExercise(ex);
      setOpenResolutionModal(true);
      navigate('/exercises/resolution', { replace: true, state: {} });
    }
  }, [openExerciseIdFromState, exercises, navigate]);

  const handleExerciseClick = async (exercise: ExerciseWithStatus) => {
    if (exercise.isFinalized) {
      showAlert('Este exercício já foi finalizado e não pode ser alterado.');
      return;
    }

    if (exercise._id && user?._id) {
      try {
        const submission = await getSubmissionByUserAndExercise(exercise._id, user._id);
        if (isExerciseFinalized(submission)) {
          showAlert('Este exercício já foi finalizado e não pode ser alterado.');
          setExercises(prev => prev.map(e => 
            e._id === exercise._id 
              ? { ...e, isFinalized: true, submission: submission || undefined }
              : e
          ));
          return;
        }
      } catch (error) {
        console.error('Error checking submission:', error);
      }
    }
    
    setSelectedExercise(exercise);
    setOpenResolutionModal(true);
  };


  const formatExerciseDescription = (exercise: ExerciseWithStatus): string => {
    const prazo = exercise.do_date ? formatDateTimePT(exercise.do_date) : 'Sem prazo';
    if (exercise.isFinalized) {
      const score = exercise.submission?.supervisedScore;
      const scoreText = score !== null && score !== undefined ? ` (Nota: ${score.toFixed(1)})` : '';
      return `Prazo: ${prazo} — Finalizado${scoreText}`;
    }
    return `Prazo: ${prazo} — Pendente`;
  };

  const handleCloseModal = () => {
    setOpenResolutionModal(false);
    setSelectedExercise(undefined);
  };

  const filteredExercises = useMemo(() => {
    if (filterType === 'all') return exercises;
    return exercises.filter((e) => (e.task_type || 'classification') === filterType);
  }, [exercises, filterType]);

  const groupedByType = useMemo(() => {
    return {
      classification: exercises.filter((e) => (e.task_type || 'classification') === 'classification'),
      segmentation: exercises.filter((e) => (e.task_type || 'classification') === 'segmentation'),
      detection: exercises.filter((e) => (e.task_type || 'classification') === 'detection'),
      other: exercises.filter((e) => !['classification', 'segmentation', 'detection'].includes(e.task_type || '')),
    };
  }, [exercises]);

  const renderExerciseCard = (exercise: ExerciseWithStatus) => (
    <div className="exercises__resolution__item" key={exercise._id}>
      <Card
        title={exercise.title}
        description={formatExerciseDescription(exercise)}
        footer={<><strong>{getTaskTypeLabel(exercise.task_type || '')}</strong> — Criado em {formatDateTimePT(exercise.created_at || undefined)}</>}
        onClick={exercise.isFinalized ? undefined : () => handleExerciseClick(exercise)}
        cardStyle={exercise.isFinalized ? 'card card--disabled' : 'card card--exercise-student'}
      />
    </div>
  );

  if (resolutionLoading) {
    return (
      <div className="exercises__resolution exercises__resolution--loading" aria-busy="true">
        <h1 className="page-title">Exercícios para Resolver</h1>
        <div className="exercises__resolution__loading" />
      </div>
    );
  }

  return (
    <div className="exercises__resolution">
      <h1 className="page-title">Exercícios para Resolver</h1>
      
      {!selectedClass ? (
        <div className="exercises__resolution__no-class">
          <p>Você não está atribuído a nenhuma turma.</p>
          <p>Entre em contato com o administrador para ser atribuído a uma turma.</p>
        </div>
      ) : exercises.length > 0 ? (
        <>
          {/* Filtro por tipo (sem label) */}
          <div className="exercises__resolution__filters" style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Button variant={filterType === 'all' ? 'primary' : 'secondary'} onClick={() => setFilterType('all')} style={{ fontSize: '0.9rem' }}>
              Todos ({exercises.length})
            </Button>
            <Button variant={filterType === 'classification' ? 'primary' : 'secondary'} onClick={() => setFilterType('classification')} style={{ fontSize: '0.9rem' }}>
              Classificação ({groupedByType.classification.length})
            </Button>
            <Button variant={filterType === 'segmentation' ? 'primary' : 'secondary'} onClick={() => setFilterType('segmentation')} style={{ fontSize: '0.9rem' }}>
              Segmentação ({groupedByType.segmentation.length})
            </Button>
            <Button variant={filterType === 'detection' ? 'primary' : 'secondary'} onClick={() => setFilterType('detection')} style={{ fontSize: '0.9rem' }}>
              Detecção ({groupedByType.detection.length})
            </Button>
          </div>

          {filterType === 'all' ? (
            <div className="exercises__resolution__list">
              {groupedByType.classification.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '0.75rem', color: '#333' }}>
                    Classificação ({groupedByType.classification.length})
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', width: '100%' }}>
                    {groupedByType.classification.map(renderExerciseCard)}
                  </div>
                </div>
              )}
              {groupedByType.segmentation.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '0.75rem', color: '#333' }}>
                    Segmentação ({groupedByType.segmentation.length})
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', width: '100%' }}>
                    {groupedByType.segmentation.map(renderExerciseCard)}
                  </div>
                </div>
              )}
              {groupedByType.detection.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '0.75rem', color: '#333' }}>
                    Detecção de Objetos ({groupedByType.detection.length})
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', width: '100%' }}>
                    {groupedByType.detection.map(renderExerciseCard)}
                  </div>
                </div>
              )}
              {groupedByType.other.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '0.75rem', color: '#333' }}>
                    Outros ({groupedByType.other.length})
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', width: '100%' }}>
                    {groupedByType.other.map(renderExerciseCard)}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="exercises__resolution__list" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', width: '100%' }}>
              {filteredExercises.map(renderExerciseCard)}
              {filteredExercises.length === 0 && (
                <p style={{ color: '#666', fontStyle: 'italic' }}>Nenhum exercício deste tipo para sua turma.</p>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="exercises__resolution__no-exercises">
          <p>Não há exercícios disponíveis para sua turma no momento.</p>
        </div>
      )}
      
      {selectedExercise?._id && (
        <Modal
          isOpen={openResolutionModal && !exercises.find(e => e._id === selectedExercise._id)?.isFinalized}
          onClose={handleCloseModal}
          size="xl"
          title="Resolução de exercício"
          closeOnBackdropClick={false}
        >
          {!exercises.find(e => e._id === selectedExercise._id)?.isFinalized ? (
            <ExerciseCarouselWrapper 
              exercise={selectedExercise}
              onComplete={() => {
                handleCloseModal();
                // Reload exercises to update status
                loadExercises();
              }}
            />
          ) : (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
              <p>Este exercício já foi finalizado e não pode ser alterado.</p>
              <button onClick={handleCloseModal}>Fechar</button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
};

const ExerciseCarouselWrapper: React.FC<{ exercise: ExerciseProps; onComplete: () => void }> = ({ exercise, onComplete }) => {
  const [taskType, setTaskType] = useState<'classification' | 'detection' | 'segmentation'>('classification');
  const [teacherName, setTeacherName] = useState<string>('');

  useEffect(() => {
    const fetchTaskType = async () => {
      try {
        const dataset = await getDatasetById(exercise.dataset);
        const type = dataset.task_type || 'classification';
        if (type === 'classification' || type === 'detection' || type === 'segmentation') {
          setTaskType(type);
        }
      } catch (error) {
        console.error('Erro ao carregar tipo de tarefa:', error);
      }
    };
    fetchTaskType();
  }, [exercise.dataset]);

  useEffect(() => {
    const fetchTeacherName = async () => {
      if (exercise.user_id) {
        try {
          const teacher = await getUser(exercise.user_id);
          setTeacherName(teacher.name || '');
        } catch (error) {
          console.error('Erro ao carregar nome do professor:', error);
        }
      }
    };
    fetchTeacherName();
  }, [exercise.user_id]);

  if (!exercise._id) {
    return <div>Erro: ID do exercício não encontrado</div>;
  }

  return (
    <ExerciseCarousel
      exerciseId={exercise._id}
      datasetId={exercise.dataset}
      didaticDetailing={exercise.didactic_detailing}
      labelledMedias={exercise.supervised_practice}
      unlabelledMedias={exercise.unsupervised_practice}
      taskType={taskType}
      onComplete={onComplete}
      iouThreshold={exercise.iou_threshold}
      segmentationIoUThreshold={exercise.segmentation_iou_threshold}
      segmentationScoreMode={exercise.segmentation_score_mode}
      teacherName={teacherName}
    />
  );
};

export default Resolution;
