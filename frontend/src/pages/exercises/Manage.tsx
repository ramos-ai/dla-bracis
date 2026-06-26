import React, { useEffect, useState } from 'react';
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
import Modal from '../../components/Modal/Modal';
import { useAuth, UserRoles } from '../../contexts/Authentication';
import { useSelectedClass } from '../../contexts/SelectedClass';
import { useAlertConfirm } from '../../contexts/AlertConfirmContext';
import { getUser } from '../../services/AuthService';
import { getLabelsForFile } from '../../services/TrainingService';
import { getCOCOAnnotation, COCOAnnotation } from '../../services/COCOService';
import { getSegmentationByMedia, evaluateSegmentation } from '../../services/SegmentationService';
import type { SegmentationAnnotation, SegmentationMatch } from '../../services/SegmentationService';
import { getDatasetById, getDatasetLabels } from '../../services/datasetsService';
import MediaViewer from '../../components/ImageViewer/MediaViewer';
import { Icon } from '../../components/Icons/Icons';
import AnnotationViewer from '../../components/AnnotationViewer/AnnotationViewer';
import SegmentationAnnotationViewer from '../../components/SegmentationAnnotationViewer/SegmentationAnnotationViewer';
import ManualCorrection from '../../components/ManualCorrection/ManualCorrection';
import ManualCorrectionSegmentation from '../../components/ManualCorrection/ManualCorrectionSegmentation';
import { saveManualCorrection, getSubmissionByUserAndExercise } from '../../services/ExercisesService';
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
  const [searchParams] = useSearchParams();
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
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionProps | null>(null);
  const [showSubmissionModal, setShowSubmissionModal] = useState<boolean>(false);
  const [studentName, setStudentName] = useState<string>('');
  const [correctLabelsMap, setCorrectLabelsMap] = useState<Record<string, string[]>>({});
  const [correctAnnotationsMap, setCorrectAnnotationsMap] = useState<Record<string, COCOAnnotation[]>>({});
  const [correctSegmentationAnnotationsMap, setCorrectSegmentationAnnotationsMap] = useState<Record<string, SegmentationAnnotation[]>>({});
  const [segmentationEvaluateMap, setSegmentationEvaluateMap] = useState<Record<string, { score: number; matches: SegmentationMatch[] }>>({});
  const [datasetTaskType, setDatasetTaskType] = useState<string>('classification');
  const [iouThreshold, setIouThreshold] = useState<number>(0.85);
  const [detectionScoreMode, setDetectionScoreMode] = useState<'recall' | 'f1'>('f1');
  const [segmentationIoUThreshold, setSegmentationIoUThreshold] = useState<number>(0.7);
  const [segmentationScoreMode, setSegmentationScoreMode] = useState<'recall' | 'f1'>('f1');
  const [correctionPresetDetection, setCorrectionPresetDetection] = useState<'training' | 'intermediate' | 'assessment' | 'custom'>('assessment');
  const [correctionPresetSegmentation, setCorrectionPresetSegmentation] = useState<'training' | 'intermediate' | 'assessment' | 'custom'>('intermediate');
  const [iouPresetCustomDetection, setIouPresetCustomDetection] = useState<string>('0.85');
  const [iouPresetCustomSegmentation, setIouPresetCustomSegmentation] = useState<string>('0.7');
  const [datasetLabels, setDatasetLabels] = useState<string[]>([]);
  const [manualCorrections, setManualCorrections] = useState<Record<string, Record<string, boolean>>>({});
  const [editingManualCorrection, setEditingManualCorrection] = useState<string | null>(null); // mediaId sendo editado
  const [showAggregatedModal, setShowAggregatedModal] = useState<boolean>(false);
  const { isCancelled: isCancelledExercise, reset: resetCancelledExercise, cancel: cancelExercise } = useCancelledFlag();
  const { isCancelled: isCancelledLabels, reset: resetCancelledLabels } = useCancelledFlag();

  useEffect(() => {
    if (user?._id) {
      setExercise((prev) => ({
        ...prev,
        user_id: user._id,
        class: selectedClassId || prev.class,
      }));
    }
  }, [user, selectedClassId]);

  const loadCorrectLabels = async (submission: SubmissionProps) => {
    if (!exercise.dataset) return;
    resetCancelledLabels();
    
    // Load dataset task type first
    let taskType = 'classification';
    try {
      const dataset = await getDatasetById(exercise.dataset);
      if (isCancelledLabels()) return;
      taskType = dataset.task_type || 'classification';
      setDatasetTaskType(taskType);
      
      // Load dataset labels for detection/segmentation
      if (taskType === 'detection' || taskType === 'segmentation') {
        try {
          const labels = await getDatasetLabels(exercise.dataset);
          if (isCancelledLabels()) return;
          setDatasetLabels(labels || []);
        } catch (error) {
          if (!isCancelledLabels()) {
            console.error('Error loading dataset labels:', error);
            setDatasetLabels([]);
          }
        }
      }
    } catch (error) {
      if (!isCancelledLabels()) {
        console.error('Error loading dataset task type:', error);
      }
      return;
    }
    
    const labelsMap: Record<string, string[]> = {};
    const annotationsMap: Record<string, COCOAnnotation[]> = {};
    const segmentationMap: Record<string, SegmentationAnnotation[]> = {};
    
    const allAnswers = [
      ...(submission.labelledAnswers || []),
      ...(submission.unlabelledAnswers || [])
    ];
    
    for (const answer of allAnswers) {
      if (isCancelledLabels()) return;
      try {
        if (taskType === 'detection') {
          const cocoResponse = await getCOCOAnnotation(exercise.dataset, answer.mediaId);
          if (isCancelledLabels()) return;
          annotationsMap[answer.mediaId] = cocoResponse.annotations || [];
        } else if (taskType === 'segmentation') {
          const segResponse = await getSegmentationByMedia(exercise.dataset, answer.mediaId);
          if (isCancelledLabels()) return;
          segmentationMap[answer.mediaId] = segResponse.annotations || [];
        } else {
          const correctLabels = await getLabelsForFile(exercise.dataset, answer.mediaId);
          if (isCancelledLabels()) return;
          labelsMap[answer.mediaId] = correctLabels || [];
        }
      } catch (error) {
        if (!isCancelledLabels()) {
          console.error(`Error loading correct data for media ${answer.mediaId}:`, error);
          if (taskType === 'detection') annotationsMap[answer.mediaId] = [];
          else if (taskType === 'segmentation') segmentationMap[answer.mediaId] = [];
          else labelsMap[answer.mediaId] = [];
        }
      }
    }
    
    if (isCancelledLabels()) return;
    setCorrectLabelsMap(labelsMap);
    setCorrectAnnotationsMap(annotationsMap);
    setCorrectSegmentationAnnotationsMap(segmentationMap);

    if (taskType === 'segmentation') {
      const evalMap: Record<string, { score: number; matches: SegmentationMatch[] }> = {};
      for (const answer of allAnswers) {
        if (isCancelledLabels()) return;
        const studentAnn = answer.annotations as unknown as SegmentationAnnotation[] | undefined;
        if (!studentAnn || !Array.isArray(studentAnn)) continue;
        try {
          const result = await evaluateSegmentation(
            exercise.dataset,
            answer.mediaId,
            studentAnn,
            segmentationIoUThreshold,
            segmentationScoreMode
          );
          if (isCancelledLabels()) return;
          evalMap[answer.mediaId] = { score: result.score, matches: result.matches };
        } catch (e) {
          if (!isCancelledLabels()) {
            console.error(`Error evaluating segmentation for media ${answer.mediaId}:`, e);
            evalMap[answer.mediaId] = { score: 0, matches: [] };
          }
        }
      }
      if (!isCancelledLabels()) {
        setSegmentationEvaluateMap(evalMap);
      }
    }
  };

  const handleSave = async () => {
    try {
      if (!user?._id) {
        showAlert("Usuário não autenticado");
        return;
      }
      if (!exercise.title || !exercise.title.trim()) {
        showAlert("Por favor, preencha o título do exercício.");
        return;
      }
      if (!exercise.class && !selectedClassId) {
        showAlert("Você precisa selecionar uma turma no menu superior antes de criar um exercício.");
        return;
      }
      
      const classToUse = exercise.class || selectedClassId;
      if (!classToUse) {
        showAlert("Você precisa selecionar uma turma no menu superior antes de criar um exercício.");
        return;
      }
      if (!exercise.do_date) {
        showAlert("Por favor, selecione a data de prazo do exercício.");
        return;
      }
      if (!id) {
        const deadlineDate = new Date(exercise.do_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (deadlineDate < today) {
          showAlert("A data de prazo não pode ser anterior a hoje.");
          return;
        }
      }
      if (!exercise.dataset) {
        showAlert("Por favor, selecione um dataset.");
        return;
      }
      if (!exercise.didactic_detailing || !exercise.didactic_detailing.trim()) {
        showAlert("Por favor, preencha o detalhamento didático.");
        return;
      }
      const supervisedPractice = overwriteMedias ? (mediaSelection?.labelled ?? []) : (exercise.supervised_practice ?? []);
      const unsupervisedPractice = overwriteMedias ? (mediaSelection?.unlabelled ?? []) : (exercise.unsupervised_practice ?? []);
      if (supervisedPractice.length === 0 && unsupervisedPractice.length === 0) {
        showAlert("É necessário adicionar pelo menos uma imagem na Prática Assistida ou na Prática Livre antes de salvar o exercício.");
        return;
      }
      try {
        const payload: Record<string, unknown> = {
          ...exercise,
          user_id: user._id,
          class: classToUse,
          supervised_practice: supervisedPractice,
          unsupervised_practice: unsupervisedPractice,
        };
        // Always include detection/segmentation config if task type matches
        // Use exercise.task_type as fallback if datasetTaskType is not loaded yet
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
          navigate('/exercises');
        } else {
          await saveExercise(payload as unknown as ExerciseProps);
          showAlert("Exercício criado com sucesso!");
          navigate('/exercises');
        }
      } catch (error: unknown) {
        console.error('Erro ao salvar exercício:', error);
        const err = error as { response?: { data?: { message?: string } }; message?: string };
        const msg = err?.response?.data?.message ?? err?.message ?? "Erro desconhecido ao salvar exercício";
        showAlert(`Erro ao salvar exercício: ${msg}`);
      }
    } catch (err: unknown) {
      console.error('handleSave error:', err);
      const error = err as { message?: string };
      showAlert(error?.message ?? 'Erro ao salvar o exercício.');
    }
  }
  
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

  const handleViewSubmission = async (submission: SubmissionProps) => {
    setSelectedSubmission(submission);
    setShowSubmissionModal(true);
    
    // Load manual corrections if present
    if (submission.manualCorrections) {
      setManualCorrections(submission.manualCorrections);
    } else {
      setManualCorrections({});
    }
    setEditingManualCorrection(null);
    
    // Ensure exercise is loaded and iouThreshold is set before loading labels
    if (id && (!exercise._id || exercise._id !== id)) {
      try {
        const exerciseData = await getExercisesById(id);
        setExercise(exerciseData);
        // Load iou_threshold if present
        if (exerciseData.iou_threshold !== undefined && exerciseData.iou_threshold !== null) {
          setIouThreshold(Number(exerciseData.iou_threshold));
        } else {
          setIouThreshold(0.85);
        }
        if (exerciseData.segmentation_iou_threshold !== undefined && exerciseData.segmentation_iou_threshold !== null) {
          setSegmentationIoUThreshold(Number(exerciseData.segmentation_iou_threshold));
        }
        if (exerciseData.segmentation_score_mode === 'recall' || exerciseData.segmentation_score_mode === 'f1') {
          setSegmentationScoreMode(exerciseData.segmentation_score_mode);
        }
        // Load dataset task type
        if (exerciseData.dataset) {
          try {
            const dataset = await getDatasetById(exerciseData.dataset);
            setDatasetTaskType(dataset.task_type || 'classification');
          } catch (error) {
            console.error('Error loading dataset:', error);
          }
        }
      } catch (error) {
        console.error('Error loading exercise:', error);
      }
    } else if (exercise._id) {
      // If exercise is already loaded, ensure threshold is set from exercise config
      if (exercise.iou_threshold !== undefined && exercise.iou_threshold !== null) {
        setIouThreshold(Number(exercise.iou_threshold));
      } else {
        setIouThreshold(0.85);
      }
      if (exercise.segmentation_iou_threshold !== undefined && exercise.segmentation_iou_threshold !== null) {
        setSegmentationIoUThreshold(Number(exercise.segmentation_iou_threshold));
      }
      if (exercise.segmentation_score_mode === 'recall' || exercise.segmentation_score_mode === 'f1') {
        setSegmentationScoreMode(exercise.segmentation_score_mode);
      }
    }
    
    await loadCorrectLabels(submission);
    
    if (submission.studentName) {
      setStudentName(submission.studentName);
    } else {
      try {
        const userData = await getUser(submission.userId);
        setStudentName(userData.name || 'Aluno');
      } catch (error) {
        console.error('Erro ao buscar nome do aluno:', error);
        setStudentName('Aluno');
      }
    }
  };

  const handleSaveManualCorrection = async (mediaId: string, corrections: Record<string, boolean>) => {
    if (!selectedSubmission || !id) return;
    
    try {
      // Update local state
      const updatedCorrections = {
        ...manualCorrections,
        [mediaId]: corrections
      };
      setManualCorrections(updatedCorrections);
      
      // Save to backend
      await saveManualCorrection({
        exerciseId: id,
        userId: selectedSubmission.userId,
        manualCorrections: updatedCorrections
      });
      
      // Reload submission to get updated score
      const updatedSubmission = await getSubmissionByUserAndExercise(id, selectedSubmission.userId);
      if (updatedSubmission) {
        setSelectedSubmission(updatedSubmission);
        // Refresh submissions list
        await getSubmissionsData(id);
      }
      
      setEditingManualCorrection(null);
      showAlert('Correção manual salva com sucesso!');
    } catch (error: unknown) {
      console.error('Error saving manual correction:', error);
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      const errorMessage = err?.response?.data?.message || err?.message || 'Erro ao salvar correção manual';
      showAlert(`Erro ao salvar correção manual: ${errorMessage}`);
    }
  };

  const isAnswerCorrect = (mediaId: string, studentLabels?: string[]): boolean => {
    if (datasetTaskType === 'detection' || datasetTaskType === 'segmentation') {
      return true; // Scoring is done by backend (IoU / polygon mask)
    } else {
      // For classification: compare labels
      const correctLabels = correctLabelsMap[mediaId] || [];
      const studentSet = new Set(studentLabels || []);
      const correctSet = new Set(correctLabels);
      
      // Both empty (Sem rótulos) = correct
      if (studentSet.size === 0 && correctSet.size === 0) {
        return true;
      }
      
      if (studentSet.size !== correctSet.size) return false;
      
      for (const label of studentSet) {
        if (!correctSet.has(label)) return false;
      }
      
      return true;
    }
  };

  // Helper function to calculate IoU between two bounding boxes
  const calculateBboxIoU = (bbox1: number[], bbox2: number[]): number => {
    if (!bbox1 || !bbox2 || bbox1.length !== 4 || bbox2.length !== 4) return 0;
    
    const [x1_min, y1_min, w1, h1] = bbox1;
    const [x2_min, y2_min, w2, h2] = bbox2;
    
    if (w1 <= 0 || h1 <= 0 || w2 <= 0 || h2 <= 0) return 0;
    
    const x1_max = x1_min + w1;
    const y1_max = y1_min + h1;
    const x2_max = x2_min + w2;
    const y2_max = y2_min + h2;
    
    const inter_x_min = Math.max(x1_min, x2_min);
    const inter_y_min = Math.max(y1_min, y2_min);
    const inter_x_max = Math.min(x1_max, x2_max);
    const inter_y_max = Math.min(y1_max, y2_max);
    
    if (inter_x_max <= inter_x_min || inter_y_max <= inter_y_min) return 0;
    
    const interArea = (inter_x_max - inter_x_min) * (inter_y_max - inter_y_min);
    const area1 = w1 * h1;
    const area2 = w2 * h2;
    const unionArea = area1 + area2 - interArea;
    
    if (unionArea <= 0) return 0;
    return Math.max(0, Math.min(1, interArea / unionArea));
  };

  // Find unmatched (wrong) student annotations for detection
  const findUnmatchedDetectionAnnotations = (
    studentAnnotations: COCOAnnotation[],
    correctAnnotations: COCOAnnotation[],
    threshold: number
  ): number[] => {
    const unmatchedIndices: number[] = [];
    const usedCorrect = new Set<number>();
    
    studentAnnotations.forEach((studentAnn, studentIdx) => {
      if (!studentAnn.bbox || studentAnn.bbox.length !== 4) {
        unmatchedIndices.push(studentIdx);
        return;
      }
      
      let bestIoU = 0;
      let bestCorrectIdx = -1;
      
      correctAnnotations.forEach((correctAnn, correctIdx) => {
        if (usedCorrect.has(correctIdx)) return;
        if (!correctAnn.bbox || correctAnn.bbox.length !== 4) return;
        if (studentAnn.category_id !== correctAnn.category_id) return;
        
        const iou = calculateBboxIoU(studentAnn.bbox, correctAnn.bbox);
        if (iou > bestIoU) {
          bestIoU = iou;
          bestCorrectIdx = correctIdx;
        }
      });
      
      if (bestIoU >= threshold && bestCorrectIdx >= 0) {
        usedCorrect.add(bestCorrectIdx);
      } else {
        unmatchedIndices.push(studentIdx);
      }
    });
    
    return unmatchedIndices;
  };

  // Find unmatched (wrong) student annotations for segmentation using matches from API
  const findUnmatchedSegmentationAnnotations = (
    studentAnnotations: SegmentationAnnotation[],
    matches: SegmentationMatch[]
  ): number[] => {
    const matchedStudentIndices = new Set(matches.map(m => m.student_idx));
    const unmatchedIndices: number[] = [];
    
    studentAnnotations.forEach((_, idx) => {
      if (!matchedStudentIndices.has(idx)) {
        unmatchedIndices.push(idx);
      }
    });
    
    return unmatchedIndices;
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
  return (
    <div className='manage-exercises__content'>
      <h1 className="page-title">Gerenciar Exercícios</h1>
      {(exercise.dataset || canDeleteExercise) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          {exercise.dataset && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ color: '#666' }}>Dataset:</span>
              <a
                href={`/datasets/new?id=${exercise.dataset}`}
                onClick={(e) => { e.preventDefault(); navigate(`/datasets/new?id=${exercise.dataset}`); }}
                style={{ color: 'var(--color-primary, #0B3C5D)', fontWeight: 500, textDecoration: 'none' }}
              >
                {datasetLabel ?? 'Abrir dataset'}
              </a>
              <Icon name="datasets" size={16} style={{ color: '#888' }} />
            </span>
          )}
          {canDeleteExercise && (
            <Button variant="danger" onClick={handleDeleteExercise} style={{ marginLeft: 'auto' }}>
              <Icon name="delete" size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
              Excluir exercício
            </Button>
          )}
        </div>
      )}
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
      {
        exercise.dataset &&
        <>
          { overwriteMedias &&  
            <MediaSelector 
              datasetId={exercise.dataset}
              onSelectionChange={setMediaSelection}
              taskType={datasetTaskType}
            />
          }
        </>
      }
      <div className='manage-exercises__actions'>
        <Button onClick={() => window.history.back()}>
          Voltar
        </Button>
        {(() => {
          if (!id) {
            return (
              <Button type="button" onClick={() => handleSave()}>
                Salvar
              </Button>
            );
          }
          
          if (exercise.do_date) {
            const deadlineDate = new Date(exercise.do_date);
            const now = new Date();
            
            if (deadlineDate > now) {
              return (
                <Button type="button" onClick={() => handleSave()}>
                  Salvar
                </Button>
              );
            } else {
              return <span style={{ color: 'red' }}>Este exercício já passou do prazo, não pode ser editado.</span>;
            }
          }
          
          return (
            <Button type="button" onClick={() => handleSave()}>
              Salvar
            </Button>
          );
        })()}
      </div>
      <hr />
      <div className='exercises__results-content'>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>Resultados</h2>
          {(datasetTaskType === 'detection' || datasetTaskType === 'segmentation') && submissions.length > 0 && exercise._id && (
            <Button
              onClick={() => setShowAggregatedModal(true)}
              variant="secondary"
              className="btn--sm"
            >
              <Icon name="layers" size={16} style={{ marginRight: '6px' }} />
              Visualizar sobreposição das marcações
            </Button>
          )}
        </div>
        {exercise.do_date && (
          <div style={{ 
            padding: '1rem', 
            backgroundColor: '#e3f2fd', 
            borderRadius: '8px', 
            marginBottom: '1rem',
            border: '1px solid #90caf9'
          }}>
            <strong>Prazo do Exercício:</strong> {new Date(exercise.do_date).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric'
            })}
          </div>
        )}
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

      <Modal
        isOpen={showSubmissionModal}
        onClose={() => {
          setShowSubmissionModal(false);
          setSelectedSubmission(null);
          setStudentName('');
          setCorrectLabelsMap({});
          setCorrectAnnotationsMap({});
          setManualCorrections({});
          setEditingManualCorrection(null);
        }}
        title={`Respostas de ${studentName || 'Aluno'}`}
        size="xl"
      >
        {selectedSubmission && (
          <div className="submission-details">
            {(selectedSubmission.supervisedScore !== null && selectedSubmission.supervisedScore !== undefined) && (
              <div className="submission-details__score">
                {selectedSubmission.hasManualCorrection && selectedSubmission.manualScore !== null && selectedSubmission.manualScore !== undefined ? (
                  <>
                    <h3>
                      Nota da Prática Assistida: {selectedSubmission.manualScore.toFixed(1)}
                      <span style={{ fontSize: '0.8rem', color: '#ff9800', marginLeft: '0.5rem', fontWeight: 'normal' }}>
                        (Correção Manual)
                      </span>
                    </h3>
                    <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#666' }}>
                      Nota automática original: {selectedSubmission.supervisedScore.toFixed(1)}
                    </div>
                  </>
                ) : (
                  <h3>Nota da Prática Assistida: {selectedSubmission.finalScore !== null && selectedSubmission.finalScore !== undefined ? selectedSubmission.finalScore.toFixed(1) : selectedSubmission.supervisedScore.toFixed(1)}</h3>
                )}
                {selectedSubmission.finalized && selectedSubmission.labelledAnswers && selectedSubmission.labelledAnswers.length > 0 && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                    {(() => {
                      // Calculate correct/wrong based on individual answers when possible
                      const finalScore = selectedSubmission.hasManualCorrection && selectedSubmission.manualScore !== null && selectedSubmission.manualScore !== undefined
                        ? selectedSubmission.manualScore 
                        : (selectedSubmission.finalScore !== null && selectedSubmission.finalScore !== undefined 
                          ? selectedSubmission.finalScore 
                          : (selectedSubmission.supervisedScore !== null && selectedSubmission.supervisedScore !== undefined ? selectedSubmission.supervisedScore : 0));
                      
                      let correctCount = 0;
                      let wrongCount = 0;
                      
                      if (datasetTaskType === 'detection') {
                        // For detection, if manual corrections exist, count them
                        if (selectedSubmission.hasManualCorrection && manualCorrections && Object.keys(manualCorrections).length > 0) {
                          // Count total correct annotations across all media
                          let totalCorrectAnnotations = 0;
                          
                          selectedSubmission.labelledAnswers.forEach((answer) => {
                            const mediaCorrections = manualCorrections[answer.mediaId] || {};
                            
                            // Count how many annotations are marked as correct
                            Object.values(mediaCorrections).forEach((isCorrect) => {
                              if (isCorrect === true) {
                                totalCorrectAnnotations++;
                              }
                            });
                          });
                          
                          // Count total expected annotations (from correct annotations)
                          let totalExpectedAnnotations = 0;
                          selectedSubmission.labelledAnswers.forEach((answer) => {
                            const correctAnnotations = correctAnnotationsMap[answer.mediaId] || [];
                            totalExpectedAnnotations += correctAnnotations.length;
                          });
                          
                          correctCount = totalCorrectAnnotations;
                          wrongCount = totalExpectedAnnotations - totalCorrectAnnotations;
                        } else {
                          // finalScore is weighted (e.g. 10.0 when score weight is 10 and student got 100%)
                          const percentageScore = (exercise.score && exercise.score > 0)
                            ? (finalScore / exercise.score) * 100
                            : finalScore;
                          const totalExpectedAnnotations = selectedSubmission.labelledAnswers.reduce(
                            (sum, answer) => sum + (correctAnnotationsMap[answer.mediaId]?.length || 0),
                            0
                          );
                          correctCount = totalExpectedAnnotations > 0
                            ? Math.round((percentageScore / 100) * totalExpectedAnnotations)
                            : 0;
                          wrongCount = Math.max(0, totalExpectedAnnotations - correctCount);
                        }
                      } else {
                        // For classification, check each answer individually using correctLabelsMap
                        selectedSubmission.labelledAnswers.forEach((answer) => {
                          const isCorrect = isAnswerCorrect(answer.mediaId, answer.labels || []);
                          if (isCorrect) {
                            correctCount++;
                          } else {
                            wrongCount++;
                          }
                        });
                      }
                      
                      return `Acertos: ${correctCount} | Erros: ${wrongCount}`;
                    })()}
                  </div>
                )}
              </div>
            )}
            
            {selectedSubmission.labelledAnswers && selectedSubmission.labelledAnswers.length > 0 && (
              <div className="submission-details__section">
                <h4>Prática Assistida ({selectedSubmission.labelledAnswers.length} resposta(s)):</h4>
                <div className="submission-details__answers" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                  {selectedSubmission.labelledAnswers.map((answer, index) => {
                    const hasStudentAnnotations = 'annotations' in answer && answer.annotations && Array.isArray(answer.annotations) && answer.annotations.length > 0;
                    const hasCorrectAnnotations = correctAnnotationsMap[answer.mediaId] && Array.isArray(correctAnnotationsMap[answer.mediaId]) && correctAnnotationsMap[answer.mediaId].length > 0;
                    const shouldShowAnnotationViewer = datasetTaskType === 'detection' && (hasStudentAnnotations || hasCorrectAnnotations);
                    const shouldShowSegmentationViewer = datasetTaskType === 'segmentation' && (hasStudentAnnotations || (correctSegmentationAnnotationsMap[answer.mediaId] && correctSegmentationAnnotationsMap[answer.mediaId].length > 0));
                    const answerCardStyle: React.CSSProperties = { minHeight: '120px', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem', backgroundColor: '#fff' };
                    
                    if (shouldShowSegmentationViewer) {
                      const studentSeg = (answer.annotations as unknown as SegmentationAnnotation[]) || [];
                      const correctSeg = correctSegmentationAnnotationsMap[answer.mediaId] || [];
                      const evalData = segmentationEvaluateMap[answer.mediaId];
                      const isEditingThisMedia = editingManualCorrection === answer.mediaId;
                      const mediaCorrections = manualCorrections[answer.mediaId] || {};
                      
                      // Find unmatched (wrong) annotations for segmentation
                      const unmatchedIndices = findUnmatchedSegmentationAnnotations(
                        studentSeg,
                        evalData?.matches ?? []
                      );
                      const hasWrongAnnotations = unmatchedIndices.length > 0;
                      
                      return (
                        <div key={index} className="submission-details__answer" style={answerCardStyle}>
                          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                            <div style={{ flex: 1, overflow: 'hidden' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <strong>Mídia {index + 1} (ID: {answer.mediaId}):</strong>
                                {(user?.role === 'teacher' || user?.role === 'admin') && hasWrongAnnotations ? (
                                  <Button
                                    onClick={() => setEditingManualCorrection(isEditingThisMedia ? null : answer.mediaId)}
                                    variant="secondary"
                                    style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                                  >
                                    {isEditingThisMedia ? 'Cancelar Correção' : 'Re-Corrigir'}
                                  </Button>
                                ) : null}
                              </div>
                              <div style={{ marginTop: '0.5rem' }}>
                                <SegmentationAnnotationViewer
                                  fileId={answer.mediaId}
                                  studentAnnotations={studentSeg}
                                  correctAnnotations={correctSeg}
                                  labels={datasetLabels}
                                  iouThreshold={segmentationIoUThreshold}
                                  scoreMode={segmentationScoreMode}
                                  imageScore={evalData?.score}
                                  matches={evalData?.matches ?? []}
                                  enableManualCorrection={selectedSubmission.hasManualCorrection || false}
                                  manualCorrections={mediaCorrections}
                                  maxWidth={400}
                                  maxHeight={300}
                                />
                              </div>
                              {isEditingThisMedia && (user?.role === 'teacher' || user?.role === 'admin') && (
                                <ManualCorrectionSegmentation
                                  studentAnnotations={studentSeg}
                                  labels={datasetLabels}
                                  initialCorrections={mediaCorrections}
                                  unmatchedIndices={unmatchedIndices}
                                  onSave={async (corrections) => {
                                    await handleSaveManualCorrection(answer.mediaId, corrections);
                                  }}
                                  onCancel={() => setEditingManualCorrection(null)}
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }
                    
                    if (shouldShowAnnotationViewer) {
                      const studentAnnotations = (answer.annotations as unknown as COCOAnnotation[]) || [];
                      const correctAnnotations = correctAnnotationsMap[answer.mediaId] || [];
                      const isEditingThisMedia = editingManualCorrection === answer.mediaId;
                      const mediaCorrections = manualCorrections[answer.mediaId] || {};
                      
                      // Find unmatched (wrong) annotations
                      const unmatchedIndices = findUnmatchedDetectionAnnotations(
                        studentAnnotations,
                        correctAnnotations,
                        iouThreshold
                      );
                      const hasWrongAnnotations = unmatchedIndices.length > 0;
                      
                      // Filter student annotations to only show wrong ones in ManualCorrection
                      const wrongAnnotations = unmatchedIndices.map(idx => studentAnnotations[idx]);
                      
                      return (
                        <div key={index} className="submission-details__answer" style={answerCardStyle}>
                          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                            <div style={{ flex: 1, overflow: 'hidden' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <strong>Mídia {index + 1} (ID: {answer.mediaId}):</strong>
                                {(user?.role === 'teacher' || user?.role === 'admin') && hasWrongAnnotations ? (
                                  <Button
                                    onClick={() => setEditingManualCorrection(isEditingThisMedia ? null : answer.mediaId)}
                                    variant="secondary"
                                    style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                                  >
                                    {isEditingThisMedia ? 'Cancelar Correção' : 'Re-Corrigir'}
                                  </Button>
                                ) : null}
                              </div>
                              <div style={{ marginTop: '0.5rem' }}>
                                <AnnotationViewer
                                  fileId={answer.mediaId}
                                  studentAnnotations={studentAnnotations}
                                  correctAnnotations={correctAnnotations}
                                  labels={datasetLabels}
                                  iouThreshold={iouThreshold}
                                  enableManualCorrection={selectedSubmission.hasManualCorrection || false}
                                  manualCorrections={mediaCorrections}
                                  maxWidth={400}
                                  maxHeight={300}
                                />
                              </div>
                              {isEditingThisMedia && (user?.role === 'teacher' || user?.role === 'admin') && (
                                <ManualCorrection
                                  studentAnnotations={wrongAnnotations}
                                  labels={datasetLabels}
                                  initialCorrections={mediaCorrections}
                                  unmatchedIndices={unmatchedIndices}
                                  onSave={async (corrections) => {
                                    await handleSaveManualCorrection(answer.mediaId, corrections);
                                  }}
                                  onCancel={() => setEditingManualCorrection(null)}
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    } else {
                      const isCorrect = isAnswerCorrect(answer.mediaId, answer.labels || []);
                      const correctLabels = correctLabelsMap[answer.mediaId] || [];
                      return (
                        <div key={index} className={`submission-details__answer ${isCorrect ? 'submission-details__answer--correct' : 'submission-details__answer--wrong'}`} style={answerCardStyle}>
                          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                            <div style={{ flex: 1 }}>
                              <strong>Mídia {index + 1} (ID: {answer.mediaId}):</strong>
                              <div style={{ marginTop: '0.5rem' }}>
                                <MediaViewer fileId={answer.mediaId} />
                              </div>
                              <div className="submission-details__labels" style={{ marginTop: '0.5rem' }}>
                                <div>
                                  <strong style={{ fontSize: '0.9rem' }}>Resposta do aluno:</strong>
                                  {answer.labels && answer.labels.length > 0 ? (
                                    answer.labels.map((label, labelIndex) => (
                                      <span key={labelIndex} className="submission-details__label">{label}</span>
                                    ))
                                  ) : (
                                    <span className="submission-details__no-labels">Sem rótulos</span>
                                  )}
                                </div>
                                <div style={{ marginTop: '0.5rem' }}>
                                  <strong style={{ fontSize: '0.9rem' }}>Resposta correta:</strong>
                                  {correctLabels.length > 0 ? (
                                    correctLabels.map((label, labelIndex) => (
                                      <span key={labelIndex} className="submission-details__label submission-details__label--correct">{label}</span>
                                    ))
                                  ) : (
                                    <span className="submission-details__no-labels">Sem rótulos</span>
                                  )}
                                </div>
                              </div>
                              <div style={{ marginTop: '0.5rem', fontWeight: 'bold', color: isCorrect ? '#4caf50' : '#f44336' }}>
                                {isCorrect ? (
                                  <>
                                    <Icon name="correct" size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                                    Correto
                                  </>
                                ) : (
                                  <>
                                    <Icon name="incorrect" size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                                    Incorreto
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }
                  })}
                </div>
              </div>
            )}

            {selectedSubmission.unlabelledAnswers && selectedSubmission.unlabelledAnswers.length > 0 && (
              <div className="submission-details__section">
                <h4>Prática Livre ({selectedSubmission.unlabelledAnswers.length} resposta(s)):</h4>
                <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '1rem' }}>
                  A prática livre não possui gabarito - as anotações abaixo são apenas para visualização.
                </p>
                <div className="submission-details__answers" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                  {selectedSubmission.unlabelledAnswers.map((answer, index) => {
                    const hasAnnotations = 'annotations' in answer && answer.annotations && Array.isArray(answer.annotations) && answer.annotations.length > 0;
                    const shouldShowAnnotationViewer = datasetTaskType === 'detection' && hasAnnotations;
                    const shouldShowSegmentationViewer = datasetTaskType === 'segmentation' && hasAnnotations;
                    const answerCardStyleFree: React.CSSProperties = { minHeight: '120px', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem', backgroundColor: '#fff' };
                    
                    if (shouldShowSegmentationViewer) {
                      const studentSeg = (answer.annotations as unknown as SegmentationAnnotation[]) || [];
                      return (
                        <div key={index} className="submission-details__answer" style={answerCardStyleFree}>
                          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                            <div style={{ flex: 1, overflow: 'hidden' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <strong>Mídia {index + 1} (ID: {answer.mediaId}):</strong>
                              </div>
                              <div style={{ marginTop: '0.5rem' }}>
                                <SegmentationAnnotationViewer
                                  fileId={answer.mediaId}
                                  studentAnnotations={studentSeg}
                                  correctAnnotations={[]}
                                  labels={datasetLabels}
                                  iouThreshold={segmentationIoUThreshold}
                                  scoreMode={segmentationScoreMode}
                                  matches={[]}
                                  maxWidth={400}
                                  maxHeight={300}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    
                    if (shouldShowAnnotationViewer) {
                      const studentAnnotations = (answer.annotations as unknown as COCOAnnotation[]) || [];
                      return (
                        <div key={index} className="submission-details__answer" style={answerCardStyleFree}>
                          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                            <div style={{ flex: 1, overflow: 'hidden' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <strong>Mídia {index + 1} (ID: {answer.mediaId}):</strong>
                              </div>
                              <div style={{ marginTop: '0.5rem' }}>
                                <AnnotationViewer
                                  fileId={answer.mediaId}
                                  studentAnnotations={studentAnnotations}
                                  correctAnnotations={[]}
                                  labels={datasetLabels}
                                  iouThreshold={iouThreshold}
                                  enableManualCorrection={false}
                                  manualCorrections={{}}
                                  maxWidth={400}
                                  maxHeight={300}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    } else {
                      return (
                        <div key={index} className="submission-details__answer" style={answerCardStyleFree}>
                          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                            <div style={{ flex: 1 }}>
                              <strong>Mídia {index + 1} (ID: {answer.mediaId}):</strong>
                              <div style={{ marginTop: '0.5rem' }}>
                                <MediaViewer fileId={answer.mediaId} />
                              </div>
                              <div className="submission-details__labels" style={{ marginTop: '0.5rem' }}>
                                <div>
                                  <strong style={{ fontSize: '0.9rem' }}>Resposta do aluno:</strong>
                                  {answer.labels && answer.labels.length > 0 ? (
                                    answer.labels.map((label, labelIndex) => (
                                      <span key={labelIndex} className="submission-details__label">{label}</span>
                                    ))
                                  ) : (
                                    <span className="submission-details__no-labels">Sem rótulos</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }
                  })}
                </div>
              </div>
            )}

            {(!selectedSubmission.labelledAnswers || selectedSubmission.labelledAnswers.length === 0) &&
             (!selectedSubmission.unlabelledAnswers || selectedSubmission.unlabelledAnswers.length === 0) && (
              <p>Nenhuma resposta ainda.</p>
            )}
          </div>
        )}
      </Modal>

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
