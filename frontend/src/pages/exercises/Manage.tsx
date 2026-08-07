import React, { useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader, Panel, Tag } from '../../components/dla';
import { cn } from '../../lib/utils';
import { editExercise, ExerciseProps, getExercisesById, getSubmissionsByExerciseId, saveExercise, deleteExercise, SubmissionProps } from '../../services/ExercisesService';
import InputField from '../../components/Fields/InputField';
import SelectField from '../../components/Fields/SelectField';
import CheckboxField from '../../components/Fields/Checkbox';
import Button from '../../components/Fields/Button';
import DateField from '../../components/Fields/DateField';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getDatasetsList, TDataset } from '../../services/datasetsService';
import MediaSelector from '../../components/MediaSelector/MediaSelector';
import MarkdownEditor from '../../components/MarkdownEditor/MarkdownEditor';
import Card from '../../components/Card/Card';
import { useAuth, UserRoles } from '../../contexts/Authentication';
import { useSelectedClass } from '../../contexts/SelectedClass';
import { useAlertConfirm } from '../../contexts/AlertConfirmContext';
import type { COCOAnnotation } from '../../services/COCOService';
import { getDatasetById } from '../../services/datasetsService';
import { Icon } from '../../components/Icons/Icons';
import { useCancelledFlag } from '../../hooks/useAbortableFetch';
import InlineLoader from '../../components/InlineLoader/InlineLoader';
import { AggregatedAnnotationsModal } from '../../components/AggregatedAnnotationsModal';

// --- Configuração de correção (UX amigável para professores) ---
const IOU_PRESETS = [
  { value: 0.5, label: 'Alta tolerância — 50%', description: 'Pequenas diferenças de posição são aceitas.' },
  { value: 0.7, label: 'Equilibrado — 70%', description: 'Boa sobreposição é necessária.' },
  { value: 0.85, label: 'Preciso — 85%', description: 'A marcação precisa ser muito próxima da referência.' },
  { value: 0.9, label: 'Muito rigoroso — 90%', description: 'Apenas sobreposição quase perfeita conta como acerto.' },
] as const;

const PEDAGOGICAL_PRESETS = [
  { id: 'training' as const, label: 'Treino inicial', iou: 0.5, mode: 'recall' as const, summary: 'IoU 50% · Cobertura dos objetos' },
  { id: 'intermediate' as const, label: 'Prática intermediária', iou: 0.7, mode: 'f1' as const, summary: 'IoU 70% · Equilíbrio acerto/excesso' },
  { id: 'assessment' as const, label: 'Avaliação rigorosa', iou: 0.85, mode: 'f1' as const, summary: 'IoU 85% · Equilíbrio acerto/excesso' },
  { id: 'custom' as const, label: 'Personalizado', iou: null, mode: null, summary: '' },
];

const SCORE_MODE_OPTIONS: { value: 'recall' | 'f1'; label: string; description: string }[] = [
  { value: 'recall', label: 'Cobertura dos objetos (Recall)', description: 'Avalia quantos objetos reais o aluno conseguiu identificar.' },
  { value: 'f1', label: 'Equilíbrio entre acerto e excesso de marcações (F1)', description: 'Avalia tanto encontrar objetos quanto evitar marcações incorretas.' },
];

const TOOLTIPS = {
  iou: 'IoU (Intersection over Union): mede quanto a marcação do aluno se sobrepõe à referência. Quanto maior o valor, mais exata precisa ser a marcação.',
  recall: 'Recall: quantos dos objetos de referência o aluno encontrou. Favorece encontrar todos os objetos.',
  f1: 'F1 Score: equilíbrio entre encontrar os objetos e evitar marcar onde não há objeto.',
};

function HelpIcon({ text }: { text: string }) {
  return (
    <span
      className="manage-exercises__help-icon"
      title={text}
      role="img"
      aria-label="Ajuda"
      style={{ cursor: 'help', marginLeft: 4, opacity: 0.7, fontSize: '0.9rem' }}
    >
      (?)
    </span>
  );
}

function matchPedagogicalPreset(iou: number, mode: 'recall' | 'f1'): 'training' | 'intermediate' | 'assessment' | 'custom' {
  if (Math.abs(iou - 0.5) < 0.01 && mode === 'recall') return 'training';
  if (Math.abs(iou - 0.7) < 0.01 && mode === 'f1') return 'intermediate';
  if (Math.abs(iou - 0.85) < 0.01 && mode === 'f1') return 'assessment';
  return 'custom';
}

const ManageExercises: React.FC = () => {
  const { user } = useAuth();
  const { selectedClassId } = useSelectedClass();
  const { alert: showAlert, confirm: showConfirm } = useAlertConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const id = searchParams.get("id");
  const [exercise, setExercise] = useState<ExerciseProps>({
    _id: null,
    didactic_detailing: '',
    title: '',
    do_date: '',
    class: '',
    score: 0,
    dataset: '',
    user_id: user?._id || '',
    whole_dataset: false,
    supervised_practice: [],
    created_at: new Date().toISOString(),
    last_update: new Date().toISOString(),
    unsupervised_practice: [],
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [formattedDatasets, setFormattedDatasets] = useState<{ value: string; label: string }[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionProps[]>([]);
  const [overwriteMedias, setOverwriteMedias] = useState<boolean>(true);
  const [mediaSelection, setMediaSelection] = useState<{ labelled: string[]; unlabelled: string[] }>({ labelled: [], unlabelled: [] });
  const [datasetTaskType, setDatasetTaskType] = useState<string>('classification');
  const [iouThreshold, setIouThreshold] = useState<number>(0.85);
  const [detectionScoreMode, setDetectionScoreMode] = useState<'recall' | 'f1'>('f1');
  const [segmentationIoUThreshold, setSegmentationIoUThreshold] = useState<number>(0.7);
  const [segmentationScoreMode, setSegmentationScoreMode] = useState<'recall' | 'f1'>('f1');
  const [correctionPresetDetection, setCorrectionPresetDetection] = useState<'training' | 'intermediate' | 'assessment' | 'custom'>('assessment');
  const [correctionPresetSegmentation, setCorrectionPresetSegmentation] = useState<'training' | 'intermediate' | 'assessment' | 'custom'>('intermediate');
  const [iouPresetCustomDetection, setIouPresetCustomDetection] = useState<string>('0.85');
  const [iouPresetCustomSegmentation, setIouPresetCustomSegmentation] = useState<string>('0.7');
  const [showAggregatedModal, setShowAggregatedModal] = useState<boolean>(false);
  const [step, setStep] = useState(0);
  const steps = ['Definições', 'Mídias assistidas', 'Mídias livres', 'Resultados'];
  const { isCancelled: isCancelledExercise, reset: resetCancelledExercise, cancel: cancelExercise } = useCancelledFlag();

  useEffect(() => {
    if (user?._id) {
      setExercise((prev) => ({
        ...prev,
        user_id: user._id,
        class: selectedClassId || prev.class,
      }));
    }
  }, [user, selectedClassId]);

  const handleSave = async (opts?: { navigateAway?: boolean }): Promise<boolean> => {
    const navigateAway = opts?.navigateAway ?? false;
    try {
      if (!user?._id) {
        showAlert("Usuário não autenticado");
        return false;
      }
      if (id && exercise.do_date) {
        const deadlineDate = new Date(exercise.do_date);
        if (deadlineDate.getTime() <= Date.now()) {
          showAlert("Este exercício já passou do prazo, não pode ser editado.");
          return false;
        }
      }
      if (!exercise.title || !exercise.title.trim()) {
        showAlert("Por favor, preencha o título do exercício.");
        return false;
      }
      if (!exercise.class && !selectedClassId) {
        showAlert("Você precisa selecionar uma turma no menu superior antes de criar um exercício.");
        return false;
      }

      const classToUse = exercise.class || selectedClassId;
      if (!classToUse) {
        showAlert("Você precisa selecionar uma turma no menu superior antes de criar um exercício.");
        return false;
      }
      if (!exercise.do_date) {
        showAlert("Por favor, selecione a data de prazo do exercício.");
        return false;
      }
      if (!id) {
        const deadlineDate = new Date(exercise.do_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (deadlineDate < today) {
          showAlert("A data de prazo não pode ser anterior a hoje.");
          return false;
        }
      }
      if (!exercise.dataset) {
        showAlert("Por favor, selecione um dataset.");
        return false;
      }
      if (!exercise.didactic_detailing || !exercise.didactic_detailing.trim()) {
        showAlert("Por favor, preencha o detalhamento didático.");
        return false;
      }
      const supervisedPractice = overwriteMedias ? (mediaSelection?.labelled ?? []) : (exercise.supervised_practice ?? []);
      const unsupervisedPractice = overwriteMedias ? (mediaSelection?.unlabelled ?? []) : (exercise.unsupervised_practice ?? []);
      if (supervisedPractice.length === 0 && unsupervisedPractice.length === 0) {
        showAlert("É necessário adicionar pelo menos uma imagem na Prática Assistida ou na Prática Livre antes de salvar o exercício.");
        return false;
      }
      try {
        const payload: Record<string, unknown> = {
          ...exercise,
          user_id: user._id,
          class: classToUse,
          supervised_practice: supervisedPractice,
          unsupervised_practice: unsupervisedPractice,
        };
        const effectiveTaskType = datasetTaskType || exercise.task_type || 'classification';
        if (effectiveTaskType === 'detection') {
          payload.iou_threshold = iouThreshold;
          payload.detection_score_mode = detectionScoreMode;
        }
        if (effectiveTaskType === 'segmentation') {
          payload.segmentation_iou_threshold = segmentationIoUThreshold;
          payload.segmentation_score_mode = segmentationScoreMode;
        }
        if (id) {
          await editExercise(payload as unknown as ExerciseProps);
          showAlert("Exercício atualizado com sucesso!");
          if (navigateAway) navigate('/exercises');
          return true;
        }

        const created = await saveExercise(payload as unknown as ExerciseProps);
        const createdRecord = created as Record<string, unknown> | null;
        const nested = createdRecord?.exercise as Record<string, unknown> | undefined;
        const newId = String(
          nested?._id ?? createdRecord?._id ?? createdRecord?.id ?? "",
        );
        showAlert("Exercício criado com sucesso!");
        if (navigateAway) {
          navigate('/exercises');
        } else if (newId) {
          setExercise((prev) => ({ ...prev, _id: newId }));
          setSearchParams({ id: newId });
        }
        return true;
      } catch (error: unknown) {
        console.error('Erro ao salvar exercício:', error);
        const err = error as { response?: { data?: { message?: string } }; message?: string };
        const msg = err?.response?.data?.message ?? err?.message ?? "Erro desconhecido ao salvar exercício";
        showAlert(`Erro ao salvar exercício: ${msg}`);
        return false;
      }
    } catch (err: unknown) {
      console.error('handleSave error:', err);
      const error = err as { message?: string };
      showAlert(error?.message ?? 'Erro ao salvar o exercício.');
      return false;
    }
  };

  const handleNext = async () => {
    if (step >= 3) return;

    if (step === 1 && overwriteMedias) {
      const labelled = mediaSelection.labelled?.length ?? 0;
      const existing = exercise.supervised_practice?.length ?? 0;
      if (labelled === 0 && existing === 0) {
        showAlert('Selecione pelo menos uma mídia na prática assistida antes de continuar.');
        return;
      }
    }

    // Persist when leaving the last config step (prática livre → resultados).
    if (step === 2) {
      const ok = await handleSave({ navigateAway: false });
      if (!ok) return;
    }
    setStep((s) => Math.min(3, s + 1));
  };
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setExercise((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const getSubmissionsData = async (exerciseId: string) => {
    try {
      setLoading(true);
      const response = await getSubmissionsByExerciseId(exerciseId);
      setSubmissions(response);
    } catch (err) {
      console.error('Erro ao buscar submissões:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadData = async () => {
    if(id){ 
      getSubmissionsData(id);
      setOverwriteMedias(false);
      setLoading(true);
      getExercisesById(id)
      .then((data) => {
        setExercise(data);
        // Load iou_threshold if present
        if (data.iou_threshold !== undefined && data.iou_threshold !== null) {
          setIouThreshold(data.iou_threshold);
        }
        if (data.detection_score_mode === 'recall' || data.detection_score_mode === 'f1') {
          setDetectionScoreMode(data.detection_score_mode);
        }
        const detIou = Number(data.iou_threshold ?? 0.85);
        const detMode = (data.detection_score_mode === 'recall' || data.detection_score_mode === 'f1') 
          ? data.detection_score_mode 
          : 'f1';
        setCorrectionPresetDetection(matchPedagogicalPreset(detIou, detMode));
        const presetsDet = [0.5, 0.7, 0.85, 0.9];
        setIouPresetCustomDetection(presetsDet.some(p => Math.abs(detIou - p) < 0.01) ? String(detIou) : 'custom');
        if (data.segmentation_iou_threshold !== undefined && data.segmentation_iou_threshold !== null) {
          setSegmentationIoUThreshold(Number(data.segmentation_iou_threshold));
        }
        if (data.segmentation_score_mode === 'recall' || data.segmentation_score_mode === 'f1') {
          setSegmentationScoreMode(data.segmentation_score_mode);
        }
        const segIou = Number(data.segmentation_iou_threshold ?? 0.75);
        const segMode = (data.segmentation_score_mode === 'recall' || data.segmentation_score_mode === 'f1') 
          ? data.segmentation_score_mode 
          : 'f1';
        setCorrectionPresetSegmentation(matchPedagogicalPreset(segIou, segMode));
        setIouPresetCustomSegmentation(presetsDet.some(p => Math.abs(segIou - p) < 0.01) ? String(segIou) : 'custom');
        // Load dataset task type
        if (data.dataset) {
          getDatasetById(data.dataset)
            .then((dataset) => {
              setDatasetTaskType(dataset.task_type || 'classification');
            })
            .catch((error) => {
              console.error('Error loading dataset:', error);
            });
        }
      })
    }
    try {
      setLoading(true);
      const datasetsResponse = await getDatasetsList();
      setFormattedDatasets(datasetsResponse.map((dataset: TDataset) => ({
          value: dataset._id,
          label: dataset.dataset_name,
        }))
      );
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    handleLoadData();
  }, [id]);

  // When Manage is opened with exercise id in URL, load exercise so iou_threshold (and labels) are set for submission view
  useEffect(() => {
    if (!id) return;
    resetCancelledExercise();
    (async () => {
      try {
        const exerciseData = await getExercisesById(id);
        if (isCancelledExercise()) return;
        setExercise(exerciseData);
        if (exerciseData.iou_threshold !== undefined && exerciseData.iou_threshold !== null) {
          setIouThreshold(Number(exerciseData.iou_threshold));
        }
        if (exerciseData.detection_score_mode === 'recall' || exerciseData.detection_score_mode === 'f1') {
          setDetectionScoreMode(exerciseData.detection_score_mode);
        }
        const detIou = Number(exerciseData.iou_threshold ?? 0.85);
        const detMode = (exerciseData.detection_score_mode === 'recall' || exerciseData.detection_score_mode === 'f1') 
          ? exerciseData.detection_score_mode 
          : 'f1';
        setCorrectionPresetDetection(matchPedagogicalPreset(detIou, detMode));
        setIouPresetCustomDetection([0.5, 0.7, 0.85, 0.9].some(p => Math.abs(detIou - p) < 0.01) ? String(detIou) : 'custom');
        if (exerciseData.segmentation_iou_threshold !== undefined && exerciseData.segmentation_iou_threshold !== null) {
          setSegmentationIoUThreshold(Number(exerciseData.segmentation_iou_threshold));
        }
        if (exerciseData.segmentation_score_mode === 'recall' || exerciseData.segmentation_score_mode === 'f1') {
          setSegmentationScoreMode(exerciseData.segmentation_score_mode);
        }
        const segIou = Number(exerciseData.segmentation_iou_threshold ?? 0.75);
        const segMode = (exerciseData.segmentation_score_mode === 'recall' || exerciseData.segmentation_score_mode === 'f1') 
          ? exerciseData.segmentation_score_mode 
          : 'f1';
        setCorrectionPresetSegmentation(matchPedagogicalPreset(segIou, segMode));
        setIouPresetCustomSegmentation([0.5, 0.7, 0.85, 0.9].some(p => Math.abs(segIou - p) < 0.01) ? String(segIou) : 'custom');
        if (exerciseData.dataset) {
          try {
            const dataset = await getDatasetById(exerciseData.dataset);
            if (!isCancelledExercise()) setDatasetTaskType(dataset.task_type || 'classification');
          } catch {
            // ignore
          }
        }
      } catch (e) {
        if (!isCancelledExercise()) {
          console.error('Error loading exercise by id:', e);
        }
      }
    })();
    return () => { cancelExercise(); };
  }, [id]);

  const calculateResults = (submission: SubmissionProps): string => {
    const supervisedCount = exercise?.supervised_practice?.length || 0;
    const unsupervisedCount = exercise?.unsupervised_practice?.length || 0;
    const totalMedias = supervisedCount + unsupervisedCount;
    const labelledCount = 
      (submission.labelledAnswers && submission.unlabelledAnswers)
        ? submission.labelledAnswers.length + submission.unlabelledAnswers.length
        : (submission.labelledAnswers?.length || 0) + (submission.unlabelledAnswers?.length || 0);
    
    let resultText = `Rotuladas: ${labelledCount} mídias de ${totalMedias}`;
    
    // Use finalScore if available (manual correction), otherwise use supervisedScore
    const displayScore = submission.hasManualCorrection && submission.manualScore !== null && submission.manualScore !== undefined
      ? submission.manualScore
      : (submission.finalScore !== null && submission.finalScore !== undefined
        ? submission.finalScore
        : submission.supervisedScore);
    
    if (submission.finalized && displayScore !== null && displayScore !== undefined) {
      // Calculate from supervised practice answers count, not total supervised practice media count
      const supervisedAnswersCount = submission.labelledAnswers?.length || 0;
      
      if (supervisedAnswersCount > 0) {
        // Calculate correct/wrong based on score percentage of actual answers
        // If manual corrections exist, use the manual score to calculate
        let correctCount = 0;
        let wrongCount = 0;
        
        if (submission.hasManualCorrection && submission.manualCorrections && Object.keys(submission.manualCorrections).length > 0) {
          // Count total correct annotations from manual corrections
          let totalCorrectAnnotations = 0;
          let totalExpectedAnnotations = 0;
          
          submission.labelledAnswers?.forEach((answer) => {
            const mediaCorrections = (submission.manualCorrections || {})[answer.mediaId] || {};
            const studentAnnotations = (answer.annotations as unknown as COCOAnnotation[]) || [];
            
            // Count how many annotations are marked as correct
            studentAnnotations.forEach((_, idx) => {
              const annotationKey = idx.toString();
              if (mediaCorrections[annotationKey] === true) {
                totalCorrectAnnotations++;
              }
            });
            
            // For expected, we'll use the number of student annotations as proxy
            // This is approximate but better than nothing
            totalExpectedAnnotations += studentAnnotations.length;
          });
          
          // If we have corrections, use them
          if (totalExpectedAnnotations > 0) {
            correctCount = totalCorrectAnnotations;
            wrongCount = Math.max(0, totalExpectedAnnotations - totalCorrectAnnotations);
          } else {
            const percentageScore = (exercise.score && exercise.score > 0)
              ? (displayScore / exercise.score) * 100
              : displayScore;
            correctCount = Math.round((percentageScore / 100) * supervisedAnswersCount);
            wrongCount = Math.max(0, supervisedAnswersCount - correctCount);
          }
        } else {
          // displayScore is weighted (e.g. 10.0); convert to percentage using exercise score weight
          const percentageScore = (exercise.score && exercise.score > 0)
            ? (displayScore / exercise.score) * 100
            : displayScore;
          correctCount = Math.round((percentageScore / 100) * supervisedAnswersCount);
          wrongCount = Math.max(0, supervisedAnswersCount - correctCount);
        }
        
        const scoreText = submission.hasManualCorrection 
          ? `${displayScore.toFixed(1)} (Manual)`
          : displayScore.toFixed(1);
        resultText += ` | Nota: ${scoreText} | Acertos: ${correctCount} | Erros: ${wrongCount}`;
      } else {
        const scoreText = submission.hasManualCorrection 
          ? `${displayScore.toFixed(1)} (Manual)`
          : displayScore.toFixed(1);
        resultText += ` | Nota: ${scoreText}`;
      }
    } else if (displayScore !== null && displayScore !== undefined) {
      const scoreText = submission.hasManualCorrection 
        ? `${displayScore.toFixed(1)} (Manual)`
        : displayScore.toFixed(1);
      resultText += ` | Nota: ${scoreText}`;
    }
    
    return resultText;
  }

  const handleViewSubmission = (submission: SubmissionProps) => {
    if (!id || !submission.userId) return;
    navigate(`/exercises/${id}/submissions/${submission.userId}`);
  };

  const canDeleteExercise = id && user && (user.role === UserRoles.ADMIN || (exercise.user_id && String(exercise.user_id) === String(user._id)));
  const datasetLabel = exercise.dataset && formattedDatasets.length > 0
    ? formattedDatasets.find((d: { value: string; label: string }) => d.value === exercise.dataset)?.label
    : null;

  const handleDeleteExercise = async () => {
    if (!id) return;
    const ok = await showConfirm('Excluir este exercício? Todas as submissões serão removidas e ele deixará de aparecer para os alunos.');
    if (!ok) return;
    try {
      const result = await deleteExercise(id);
      showAlert(`Exercício excluído. ${result.deleted_submissions ?? 0} submissão(ões) removida(s).`);
      navigate('/exercises');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      const msg = err?.response?.data?.message || err?.message || 'Erro ao excluir exercício';
      showAlert(`Erro ao excluir: ${msg}`);
    }
  };

  if (loading) return <InlineLoader message="Carregando informações..." />;

  const deadlineTag = exercise.do_date
    ? (() => {
        const deadlineDate = new Date(exercise.do_date);
        const now = new Date();
        const tone = deadlineDate > now ? 'warning' : 'danger';
        const label = deadlineDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        return <Tag tone={tone as 'warning' | 'danger'}>Prazo {label}</Tag>;
      })()
    : null;

  return (
    <div className="manage-exercises__content space-y-6">
      <PageHeader
        eyebrow="Supervisor"
        title={exercise.title || 'Gerenciar exercício'}
        description="Configuração dividida em passos: definições, mídias de prática assistida e livre, e resultados dos anotadores."
        actions={
          <>
            {deadlineTag}
            {exercise.dataset && (
              <a
                href={`/datasets/new?id=${exercise.dataset}`}
                onClick={(e) => { e.preventDefault(); navigate(`/datasets/new?id=${exercise.dataset}`); }}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors duration-150 hover:border-secondary"
              >
                {datasetLabel ?? 'Abrir dataset'}
              </a>
            )}
            {canDeleteExercise && (
              <Button variant="danger" onClick={handleDeleteExercise}>
                <Icon name="delete" size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                Excluir
              </Button>
            )}
          </>
        }
      />

      <ol className="flex flex-wrap items-center gap-2">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStep(i)}
              className={cn(
                'flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors duration-150',
                i === step
                  ? 'border-primary bg-primary text-primary-foreground'
                  : i < step
                    ? 'border-success/30 bg-success/10 text-success'
                    : 'border-border text-muted-foreground hover:border-secondary',
              )}
            >
              {i < step ? <Check className="size-3.5" /> : <span className="num">{i + 1}</span>}
              {s}
            </button>
            {i < steps.length - 1 && <ChevronRight className="size-3.5 text-muted-foreground" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
      <Panel title="Definições" hint="Título, prazo, peso, detalhamento didático e configuração de correção.">
      <div className='manage-exercises__form'>
        <div className='manage-exercises__form-row'>
          <InputField
            label="Título do exercício"
            name="title"
            required
            value={exercise.title}
            onChange={handleChange}
            placeholder="Digite o Título"
          />
          <DateField
            label="Prazo do exercício"
            name="do_date"
            required
            value={exercise.do_date}
            onChange={handleChange}
          />
          <InputField
            label="Peso"
            name="score"
            required
            value={exercise.score}  
            onChange={handleChange}
            placeholder="Digite o peso"
          />
        </div>
        <div className='manage-exercises__form-row'>
          <MarkdownEditor
            label="Detalhamento didático"
            value={exercise.didactic_detailing}
            onChange={(value) =>
              setExercise((prev) => ({
                ...prev!,
                didactic_detailing: value,
              }))
            }
            placeholder="Ex: explicação deste exercício em Markdown. Use o botão ou cole uma imagem."
            minHeight={520}
          />
        </div>
        <div className='manage-exercises__form-row' style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '1.5rem' }}>
          
          { overwriteMedias &&
            <SelectField
              label="Dataset"
              name="dataset"
              value={exercise.dataset}
              required
              errorMessage="Escolha uma das opções"
              onChange={async (e) => {
                const datasetId = e.target.value;
                setExercise((prev) => ({
                  ...prev!,
                  dataset: datasetId
                }));
                // Load dataset task type to show/hide iou_threshold field
                if (datasetId) {
                  try {
                    const dataset = await getDatasetById(datasetId);
                    setDatasetTaskType(dataset.task_type || 'classification');
                  } catch (error) {
                    console.error('Error loading dataset:', error);
                    setDatasetTaskType('classification');
                  }
                }
              }}
              options={formattedDatasets}
            /> 
          }
          {
            id && 
            <CheckboxField
              label="Sobrescrever mídias"
              checked={overwriteMedias}
              onChange={(e) => {setOverwriteMedias(e.target.checked)}}
            />
          }
          {datasetTaskType === 'detection' && (
            <div className="manage-exercises__correction-config">
              <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1rem' }}>Configuração de correção</h3>
              <div style={{ marginBottom: correctionPresetDetection === 'custom' ? '0.5rem' : 0 }}>
                <select
                  className="select-field__select"
                  value={correctionPresetDetection}
                  onChange={(e) => {
                    const v = e.target.value as 'training' | 'intermediate' | 'assessment' | 'custom';
                    setCorrectionPresetDetection(v);
                    const p = PEDAGOGICAL_PRESETS.find(x => x.id === v);
                    if (p && p.iou != null && p.mode) {
                      setIouThreshold(p.iou);
                      setDetectionScoreMode(p.mode);
                      setIouPresetCustomDetection(String(p.iou));
                    } else if (v === 'custom') {
                      const match = [0.5, 0.7, 0.85, 0.9].find(x => Math.abs(iouThreshold - x) < 0.01);
                      setIouPresetCustomDetection(match != null ? String(match) : 'custom');
                    }
                  }}
                >
                  {PEDAGOGICAL_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
                {correctionPresetDetection !== 'custom' && (
                  <p style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.25rem', marginBottom: 0 }}>
                    {PEDAGOGICAL_PRESETS.find(p => p.id === correctionPresetDetection)?.summary}
                  </p>
                )}
              </div>
              {correctionPresetDetection === 'custom' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e0e0e0' }}>
                  <div>
                    <label className="select-field__label" style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                      Precisão da correspondência
                      <HelpIcon text={TOOLTIPS.iou} />
                    </label>
                    <select
                      className="select-field__select"
                      value={iouPresetCustomDetection}
                      onChange={(e) => {
                        const v = e.target.value;
                        setIouPresetCustomDetection(v);
                        if (v !== 'custom') setIouThreshold(Number(v));
                      }}
                    >
                      {IOU_PRESETS.map((p) => (
                        <option key={p.value} value={String(p.value)}>{p.label}</option>
                      ))}
                      <option value="custom">Personalizado</option>
                    </select>
                    {iouPresetCustomDetection !== 'custom' && (
                      <p style={{ fontSize: '0.8rem', color: '#666', marginTop: 4, marginBottom: 0 }}>
                        {IOU_PRESETS.find(p => String(p.value) === iouPresetCustomDetection)?.description}
                      </p>
                    )}
                    {iouPresetCustomDetection === 'custom' && (
                      <InputField
                        label=""
                        name="iou_custom"
                        type="number"
                        min="0"
                        max="1"
                        step="0.01"
                        value={iouThreshold}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val >= 0 && val <= 1) setIouThreshold(val);
                        }}
                        placeholder="0.75"
                      />
                    )}
                    <p style={{ fontSize: '0.8rem', color: '#888', marginTop: 4, marginBottom: 0 }}>
                      A sobreposição é medida com IoU (Intersection over Union). 0,75–0,85 é um bom padrão para ensino.
                    </p>
                  </div>
                  <div>
                    <label className="select-field__label" style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                      Modo de avaliação
                      <HelpIcon text={TOOLTIPS.recall + ' ' + TOOLTIPS.f1} />
                    </label>
                    {SCORE_MODE_OPTIONS.map((opt) => (
                      <label key={opt.value} style={{ display: 'block', marginBottom: 8, cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="detection_score_mode"
                          value={opt.value}
                          checked={detectionScoreMode === opt.value}
                          onChange={() => setDetectionScoreMode(opt.value)}
                          style={{ marginRight: 8 }}
                        />
                        <span style={{ fontWeight: 500 }}>{opt.label}</span>
                        <p style={{ fontSize: '0.8rem', color: '#666', margin: '2px 0 0 26px', marginBottom: 4 }}>{opt.description}</p>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {datasetTaskType === 'segmentation' && (
            <div className="manage-exercises__correction-config">
              <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1rem' }}>Configuração de correção</h3>
              <div style={{ marginBottom: correctionPresetSegmentation === 'custom' ? '0.5rem' : 0 }}>
                <select
                  className="select-field__select"
                  value={correctionPresetSegmentation}
                  onChange={(e) => {
                    const v = e.target.value as 'training' | 'intermediate' | 'assessment' | 'custom';
                    setCorrectionPresetSegmentation(v);
                    const p = PEDAGOGICAL_PRESETS.find(x => x.id === v);
                    if (p && p.iou != null && p.mode) {
                      setSegmentationIoUThreshold(p.iou);
                      setSegmentationScoreMode(p.mode);
                      setIouPresetCustomSegmentation(String(p.iou));
                    } else if (v === 'custom') {
                      const match = [0.5, 0.7, 0.85, 0.9].find(x => Math.abs(segmentationIoUThreshold - x) < 0.01);
                      setIouPresetCustomSegmentation(match != null ? String(match) : 'custom');
                    }
                  }}
                >
                  {PEDAGOGICAL_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
                {correctionPresetSegmentation !== 'custom' && (
                  <p style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.25rem', marginBottom: 0 }}>
                    {PEDAGOGICAL_PRESETS.find(p => p.id === correctionPresetSegmentation)?.summary}
                  </p>
                )}
              </div>
              {correctionPresetSegmentation === 'custom' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e0e0e0' }}>
                  <div>
                    <label className="select-field__label" style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                      Precisão da correspondência
                      <HelpIcon text={TOOLTIPS.iou} />
                    </label>
                    <select
                      className="select-field__select"
                      value={iouPresetCustomSegmentation}
                      onChange={(e) => {
                        const v = e.target.value;
                        setIouPresetCustomSegmentation(v);
                        if (v !== 'custom') setSegmentationIoUThreshold(Number(v));
                      }}
                    >
                      {IOU_PRESETS.map((p) => (
                        <option key={p.value} value={String(p.value)}>{p.label}</option>
                      ))}
                      <option value="custom">Personalizado</option>
                    </select>
                    {iouPresetCustomSegmentation !== 'custom' && (
                      <p style={{ fontSize: '0.8rem', color: '#666', marginTop: 4, marginBottom: 0 }}>
                        {IOU_PRESETS.find(p => String(p.value) === iouPresetCustomSegmentation)?.description}
                      </p>
                    )}
                    {iouPresetCustomSegmentation === 'custom' && (
                      <InputField
                        label=""
                        name="segmentation_iou_custom"
                        type="number"
                        min="0"
                        max="1"
                        step="0.01"
                        value={segmentationIoUThreshold}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val >= 0 && val <= 1) setSegmentationIoUThreshold(val);
                        }}
                        placeholder="0.75"
                      />
                    )}
                    <p style={{ fontSize: '0.8rem', color: '#888', marginTop: 4, marginBottom: 0 }}>
                      A sobreposição é medida com IoU. 0,75–0,85 é um bom padrão para ensino.
                    </p>
                  </div>
                  <div>
                    <label className="select-field__label" style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                      Modo de avaliação
                      <HelpIcon text={TOOLTIPS.recall + ' ' + TOOLTIPS.f1} />
                    </label>
                    {SCORE_MODE_OPTIONS.map((opt) => (
                      <label key={opt.value} style={{ display: 'block', marginBottom: 8, cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="segmentation_score_mode"
                          value={opt.value}
                          checked={segmentationScoreMode === opt.value}
                          onChange={() => setSegmentationScoreMode(opt.value)}
                          style={{ marginRight: 8 }}
                        />
                        <span style={{ fontWeight: 500 }}>{opt.label}</span>
                        <p style={{ fontSize: '0.8rem', color: '#666', margin: '2px 0 0 26px', marginBottom: 4 }}>{opt.description}</p>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      </Panel>
      )}

      {(step === 1 || step === 2) && (
        <Panel
          title={step === 1 ? 'Passo 2 · Prática assistida' : 'Passo 3 · Prática livre (opcional)'}
          hint={
            step === 1
              ? 'Mídias com rotulação de referência do supervisor. Geram nota automática.'
              : 'Sem referência: as anotações alimentam a geração de dataset sob curadoria.'
          }
        >
          {exercise.dataset && overwriteMedias ? (
            <MediaSelector
              datasetId={exercise.dataset}
              phase={step === 1 ? 'supervised' : 'free'}
              onSelectionChange={setMediaSelection}
              taskType={datasetTaskType}
            />
          ) : !exercise.dataset ? (
            <p className="text-sm text-muted-foreground">Selecione um dataset no passo Definições para escolher mídias.</p>
          ) : (
            <p className="text-sm text-muted-foreground">Desmarque &quot;Sobrescrever mídias&quot; para manter a seleção atual do exercício.</p>
          )}
        </Panel>
      )}

      {step === 3 && id && (
      <Panel title="Resultados" hint="Submissões dos alunos e detalhes de correção.">
      <div className='exercises__results-content'>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {(datasetTaskType === 'detection' || datasetTaskType === 'segmentation') && submissions.length > 0 && exercise._id && (
            <Button
              onClick={() => setShowAggregatedModal(true)}
              variant="secondary"
              className="btn--sm ml-auto"
            >
              <Icon name="layers" size={16} style={{ marginRight: '6px' }} />
              Visualizar sobreposição das marcações
            </Button>
          )}
        </div>
        <div className='exercises__results'>
          {submissions.map((submission) => {
            const status = submission.finalized 
              ? 'completed' 
              : submission.labelledAnswers?.length 
                ? 'in-progress' 
                : 'not-started';
            const statusLabel = submission.finalized 
              ? 'Finalizado' 
              : submission.labelledAnswers?.length 
                ? 'Em progresso' 
                : 'Não iniciado';
            const score = submission.finalScore ?? submission.supervisedScore ?? null;
            const scoreClass = score !== null 
              ? score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low'
              : '';
            
            return (
              <Card
                key={submission.exerciseId + submission.userId}
                title={submission.studentName || submission.userId}
                description={
                  <div>
                    {submission.studentEmail && (
                      <span style={{ display: 'block', marginBottom: '4px' }}>{submission.studentEmail}</span>
                    )}
                    <span className={`card--submission__status-badge`}>
                      {statusLabel}
                    </span>
                  </div>
                }
                footer={
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      {score !== null && (
                        <span className={`card--submission__score card--submission__score--${scoreClass}`}>
                          Nota: {score.toFixed(1)}
                        </span>
                      )}
                      <span className="card--submission__meta">
                        {calculateResults(submission)}
                      </span>
                    </div>
                    <Button 
                      onClick={() => handleViewSubmission(submission)}
                      variant="secondary"
                      className="btn--sm"
                    >
                      Ver Detalhes
                    </Button>
                  </div>
                }
                cardStyle={`card card--submission card--submission--${status}`}
              />
            );
          })}
        </div>
      </div>
      </Panel>
      )}

      {step === 3 && !id && (
        <Panel title="Resultados" hint="Salve o exercício para visualizar submissões dos alunos.">
          <p className="text-sm text-muted-foreground">Os resultados ficam disponíveis após criar e publicar o exercício.</p>
        </Panel>
      )}

      <div className="sticky bottom-0 z-10 -mx-4 mt-2 flex justify-between gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-sm md:-mx-8 md:px-8">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="flex items-center gap-1.5 rounded-md border border-border px-3.5 py-2 text-xs font-semibold transition-colors duration-150 hover:border-secondary disabled:opacity-40"
        >
          <ChevronLeft className="size-3.5" />
          Anterior
        </button>
        <button
          type="button"
          onClick={() => void handleNext()}
          disabled={step === 3}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary/90 disabled:opacity-40"
        >
          {step === 2 ? 'Salvar e continuar' : 'Próximo'}
          <ChevronRight className="size-3.5" />
        </button>
      </div>

      {exercise._id && (
        <AggregatedAnnotationsModal
          exerciseId={exercise._id}
          isOpen={showAggregatedModal}
          onClose={() => setShowAggregatedModal(false)}
        />
      )}
    </div>
  );
};

export default ManageExercises;
