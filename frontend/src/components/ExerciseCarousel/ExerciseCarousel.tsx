import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, Check, Flag, Pencil } from 'lucide-react';
import Button from '../Fields/Button';
import { saveSubmission, SubmissionProps, getSubmissionByUserAndExercise } from '../../services/ExercisesService';
import { getDatasetLabels, getDatasetById } from '../../services/datasetsService';
import { useAuth } from '../../contexts/Authentication';
import { useAlertConfirm } from '../../contexts/AlertConfirmContext';
import Modal from '../Modal/Modal';
import TextareaField from '../Fields/TextareaField';
import MarkdownViewer from '../MarkdownViewer/MarkdownViewer';
import { createReport } from '../../services/ReportsService';
import { COCOAnnotation } from '../../services/COCOService';
import type { SegmentationAnnotation } from '../../services/SegmentationService';
import { useCancelledFlag } from '../../hooks/useAbortableFetch';
import { SupervisedPractice, UnsupervisedPractice } from './components';
import { isSubmissionFinalized } from './utils/exerciseHelpers';
import type { ExerciseCarouselProps, TabType, AnswerItem, AnnotationTool } from './types';
import { FilterPill, Panel, EmptyState } from '../dla';
import { cn } from '../../lib/utils';

const ExerciseCarousel: React.FC<ExerciseCarouselProps> = ({
  labelledMedias,
  unlabelledMedias,
  didaticDetailing,
  datasetId,
  exerciseId,
  taskType = 'classification',
  onComplete,
  iouThreshold = 0.85,
  segmentationIoUThreshold = 0.75,
  segmentationScoreMode = 'recall',
  teacherName,
}) => {
  const { user } = useAuth();
  const { alert: showAlert } = useAlertConfirm();
  const navigate = useNavigate();
  const location = useLocation();
  const startUnsupervised = Boolean(
    (location.state as { startUnsupervised?: boolean } | null)?.startUnsupervised,
  );
  
  // State
  const [currentTab, setCurrentTab] = useState<TabType>('explanation');
  const [current, setCurrent] = useState<number>(0);
  const [step, setStep] = useState<number>(0);
  const [labels, setLabels] = useState<string[]>([]);
  const totalSteps = labelledMedias.length + unlabelledMedias.length;
  const [barStep, setBarStep] = useState<number>(0);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [labelledAnswers, setLabelledAnswers] = useState<AnswerItem[]>([]);
  const [unlabelledAnswers, setUnlabelledAnswers] = useState<AnswerItem[]>([]);
  const [isFinalized, setIsFinalized] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  const hasUnsavedChanges = useRef<boolean>(false);
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const [reportText, setReportText] = useState<string>('');
  const [reportType, setReportType] = useState<'error' | 'unlabelled'>('error');
  const [isDetectionMode, setIsDetectionMode] = useState<boolean>(taskType === 'detection' || taskType === 'segmentation');
  const isSegmentationMode = taskType === 'segmentation';
  const [currentAnnotations, setCurrentAnnotations] = useState<COCOAnnotation[]>([]);
  const [currentSegmentationAnnotations, setCurrentSegmentationAnnotations] = useState<SegmentationAnnotation[]>([]);
  
  // Estado persistente de ferramenta e classe selecionada (não reseta ao mudar de imagem)
  const [currentTool, setCurrentTool] = useState<AnnotationTool>('rectangle');
  const [selectedAnnotationLabel, setSelectedAnnotationLabel] = useState<string>('');
  
  const { isCancelled: isCancelledInit, reset: resetCancelledInit, cancel: cancelInit } = useCancelledFlag();
  const { isCancelled: isCancelledFetch, reset: resetCancelledFetch, cancel: cancelFetch } = useCancelledFlag();

  const goToFeedback = useCallback(() => {
    navigate(`/exercises/resolution/${exerciseId}/feedback`);
  }, [navigate, exerciseId]);

  // Load submission on mount
  useEffect(() => {
    if (!user) return;
    resetCancelledInit();
    const checkIfFinalized = async () => {
      try {
        const submission = await getSubmissionByUserAndExercise(exerciseId, user._id);
        if (isCancelledInit()) return;
        const finalized = isSubmissionFinalized(submission);
        setIsFinalized(finalized);
        
        if (finalized) {
          navigate(`/exercises/resolution/${exerciseId}/feedback`, { replace: true });
          return;
        }

        if (startUnsupervised && unlabelledMedias.length > 0) {
          setHasStarted(true);
          setStep(3);
          setCurrentTab('unsupervised');
          setCurrent(0);
          if (submission?.labelledAnswers) {
            setLabelledAnswers(submission.labelledAnswers as AnswerItem[]);
          }
          if (submission?.unlabelledAnswers) {
            setUnlabelledAnswers(submission.unlabelledAnswers as AnswerItem[]);
          }
          navigate(location.pathname, { replace: true, state: {} });
          return;
        }

        if (submission) {
          const hasLabelledAnswers = (submission.labelledAnswers?.length ?? 0) > 0;
          const hasUnlabelledAnswers = (submission.unlabelledAnswers?.length ?? 0) > 0;
          
          if (hasLabelledAnswers || hasUnlabelledAnswers) {
            setHasStarted(true);
            if (submission.labelledAnswers) setLabelledAnswers(submission.labelledAnswers as AnswerItem[]);
            if (submission.unlabelledAnswers) setUnlabelledAnswers(submission.unlabelledAnswers as AnswerItem[]);
            
            if (submission.supervisedScore !== null && submission.supervisedScore !== undefined) {
              navigate(`/exercises/resolution/${exerciseId}/feedback`, { replace: true });
              return;
            } else if (hasLabelledAnswers) {
              setStep(1);
              setCurrentTab('supervised');
            } else if (hasUnlabelledAnswers) {
              setStep(3);
              setCurrentTab('unsupervised');
            }
          }
        }
      } catch (error) {
        if (!isCancelledInit()) console.error('Error checking if exercise is finalized:', error);
      } finally {
        if (!isCancelledInit()) setIsLoading(false);
      }
    };
    checkIfFinalized();
    return () => { cancelInit(); };
  }, [exerciseId, user?._id, isCancelledInit, resetCancelledInit, cancelInit, startUnsupervised, unlabelledMedias.length, navigate, location.pathname]);

  // Load labels
  useEffect(() => {
    resetCancelledFetch();
    const fetchLabels = async () => {
      try {
        const response = await getDatasetLabels(datasetId);
        if (!isCancelledFetch()) setLabels(response);
      } catch (err) {
        if (!isCancelledFetch()) console.error(err);
      }
    };
    const fetchTaskType = async () => {
      try {
        const dataset = await getDatasetById(datasetId);
        if (!isCancelledFetch()) {
          setIsDetectionMode(dataset.task_type === 'detection' || dataset.task_type === 'segmentation');
        }
      } catch (err) {
        if (!isCancelledFetch()) console.error('Erro ao carregar tipo de tarefa:', err);
      }
    };
    fetchLabels();
    fetchTaskType();
    return () => { cancelFetch(); };
  }, [datasetId, isCancelledFetch, resetCancelledFetch, cancelFetch]);

  const handleLabelChange = useCallback((label: string) => setSelectedLabels([label]), []);
  
  // Carregar anotações/rótulos salvos ao mudar de imagem (navegação anterior/próxima)
  useEffect(() => {
    const mediaId = currentTab === 'supervised' && step === 1 
      ? labelledMedias[current] 
      : unlabelledMedias[current];
    
    if (!mediaId) return;
    
    const answers = currentTab === 'supervised' && step === 1 ? labelledAnswers : unlabelledAnswers;
    const savedAnswer = answers.find(a => a.mediaId === mediaId);
    
    if (isDetectionMode || isSegmentationMode) {
      // Carregar anotações para detecção/segmentação
      if (savedAnswer?.annotations) {
        if (isSegmentationMode) {
          setCurrentSegmentationAnnotations(savedAnswer.annotations as SegmentationAnnotation[]);
        } else {
          setCurrentAnnotations(savedAnswer.annotations as COCOAnnotation[]);
        }
      } else {
        if (isSegmentationMode) {
          setCurrentSegmentationAnnotations([]);
        } else {
          setCurrentAnnotations([]);
        }
      }
    } else {
      // Carregar rótulos para classificação
      if (savedAnswer?.labels && savedAnswer.labels.length > 0) {
        setSelectedLabels(savedAnswer.labels);
      } else {
        setSelectedLabels([]);
      }
    }
  }, [current, currentTab, step, isDetectionMode, isSegmentationMode, labelledMedias, unlabelledMedias, labelledAnswers, unlabelledAnswers]);
  
  const resetLabels = useCallback(() => {
    setSelectedLabels([]);
    document.querySelectorAll('.exercise-carousel__label-item input[type="radio"]').forEach((r) => {
      (r as HTMLInputElement).checked = false;
    });
  }, []);

  const updateAnswerList = useCallback((answer: AnswerItem, isLabelled: boolean) => {
    const setter = isLabelled ? setLabelledAnswers : setUnlabelledAnswers;
    setter(prev => [...prev.filter(a => a.mediaId !== answer.mediaId), answer]);
  }, []);

  const handleSaveCOCOAnnotations = useCallback(async (annotations: COCOAnnotation[]) => {
    if (!user) return;
    const mediaId = currentTab === 'supervised' && step === 1 ? labelledMedias[current] : unlabelledMedias[current];
    if (!mediaId?.trim()) return;
    const submission: SubmissionProps = { userId: user._id, exerciseId, dataset_id: datasetId };
    const answer = { mediaId, annotations };
    if (currentTab === 'supervised' && step === 1) {
      submission.labelledAnswers = [answer];
      updateAnswerList(answer, true);
    } else {
      submission.unlabelledAnswers = [answer];
      updateAnswerList(answer, false);
    }
    setCurrentAnnotations(annotations);
    try {
      await saveSubmission(submission);
      hasUnsavedChanges.current = false;
    } catch (error) {
      console.error('Error saving COCO annotations:', error);
      throw error;
    }
  }, [currentTab, step, current, labelledMedias, unlabelledMedias, user, exerciseId, datasetId, updateAnswerList]);

  const handleSaveSegmentationAnnotations = useCallback(async (annotations: SegmentationAnnotation[]) => {
    if (!user) return;
    const mediaId = currentTab === 'supervised' && step === 1 ? labelledMedias[current] : unlabelledMedias[current];
    if (!mediaId?.trim()) return;
    const submission: SubmissionProps = { userId: user._id, exerciseId, dataset_id: datasetId };
    const answer = { mediaId, annotations };
    if (currentTab === 'supervised' && step === 1) {
      submission.labelledAnswers = [answer];
      updateAnswerList(answer, true);
    } else {
      submission.unlabelledAnswers = [answer];
      updateAnswerList(answer, false);
    }
    setCurrentSegmentationAnnotations(annotations);
    try {
      await saveSubmission(submission);
      hasUnsavedChanges.current = false;
    } catch (error) {
      console.error('Error saving segmentation annotations:', error);
      throw error;
    }
  }, [currentTab, step, current, labelledMedias, unlabelledMedias, user, exerciseId, datasetId, updateAnswerList]);

  const saveAnswer = useCallback(async () => {
    if (!user) return;
    const mediaId = currentTab === 'supervised' && step === 1 ? labelledMedias[current] : unlabelledMedias[current];
    if (!mediaId?.trim()) return;
    const submission: SubmissionProps = { userId: user._id, exerciseId, dataset_id: datasetId };
    const answer = { mediaId, labels: selectedLabels };
    if (currentTab === 'supervised' && step === 1) {
      submission.labelledAnswers = [answer];
      updateAnswerList(answer, true);
    } else {
      submission.unlabelledAnswers = [answer];
      updateAnswerList(answer, false);
    }
    try {
      await saveSubmission(submission);
      resetLabels();
      hasUnsavedChanges.current = false;
    } catch (error) {
      console.error('Error saving answer:', error);
    }
  }, [currentTab, step, current, labelledMedias, unlabelledMedias, user, exerciseId, datasetId, selectedLabels, updateAnswerList, resetLabels]);

  const handleSaveClassification = useCallback(async (labelsToSave: string[]) => {
    if (!user) return;
    const mediaId = currentTab === 'supervised' && step === 1 ? labelledMedias[current] : unlabelledMedias[current];
    if (!mediaId?.trim()) return;
    const submission: SubmissionProps = { userId: user._id, exerciseId, dataset_id: datasetId };
    const answer = { mediaId, labels: labelsToSave };
    if (currentTab === 'supervised' && step === 1) {
      submission.labelledAnswers = [answer];
      updateAnswerList(answer, true);
    } else {
      submission.unlabelledAnswers = [answer];
      updateAnswerList(answer, false);
    }
    try {
      await saveSubmission(submission);
      setSelectedLabels(labelsToSave);
      hasUnsavedChanges.current = false;
    } catch (error) {
      console.error('Error saving classification:', error);
      throw error;
    }
  }, [currentTab, step, current, labelledMedias, unlabelledMedias, user, exerciseId, datasetId, updateAnswerList]);

  const calculateAndSaveScore = useCallback(async () => {
    if (!user) return;
    try {
      // Recompute from DB only. Do NOT resend labelledAnswers from React state —
      // stale/empty entries would overwrite good answers and zero the score.
      const response = await saveSubmission({
        userId: user._id,
        exerciseId,
        dataset_id: datasetId,
        finalized: false,
      });
      if (response?.success === false) {
        console.error('Erro ao calcular nota:', response?.message);
        showAlert('Não foi possível calcular a nota. Tente finalizar novamente.');
        return;
      }
    } catch (error) {
      console.error('Erro ao calcular nota:', error);
      showAlert('Erro ao calcular a nota da prática assistida.');
    }
  }, [user, exerciseId, datasetId, showAlert]);

  const finalizeExercise = useCallback(async () => {
    if (!user) return;
    try {
      if (currentTab === 'supervised' && step === 1) {
        if (isSegmentationMode && currentSegmentationAnnotations.length > 0) {
          await handleSaveSegmentationAnnotations(currentSegmentationAnnotations);
        } else if (isDetectionMode && currentAnnotations.length > 0) {
          await handleSaveCOCOAnnotations(currentAnnotations);
        } else if (!isSegmentationMode && !isDetectionMode) {
          await saveAnswer();
        }
      } else if (currentTab === 'unsupervised' && step === 3) {
        if (isSegmentationMode && currentSegmentationAnnotations.length > 0) {
          await handleSaveSegmentationAnnotations(currentSegmentationAnnotations);
        } else if (isDetectionMode && currentAnnotations.length > 0) {
          await handleSaveCOCOAnnotations(currentAnnotations);
        } else if (!isSegmentationMode && !isDetectionMode) {
          await saveAnswer();
        }
      }

      // Finalize + recompute from persisted DB answers (no bulk client overwrite)
      const response = await saveSubmission({
        userId: user._id,
        exerciseId,
        dataset_id: datasetId,
        finalized: true,
      });
      if (response?.success === false) {
        throw new Error(response?.message || 'Falha ao finalizar');
      }

      setBarStep(totalSteps);
      setIsFinalized(true);

      const teacherText = teacherName ? ` ao professor ${teacherName}` : '';
      showAlert(`Exercício finalizado com sucesso!\n\nSuas respostas foram enviadas${teacherText}.`);

      navigate(`/exercises/resolution/${exerciseId}/feedback`);
    } catch (error: unknown) {
      console.error('Erro ao finalizar exercício:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      showAlert(`Erro ao finalizar exercício: ${errorMessage}`);
    }
  }, [currentTab, step, isSegmentationMode, isDetectionMode, currentSegmentationAnnotations, currentAnnotations, user, exerciseId, datasetId, totalSteps, handleSaveSegmentationAnnotations, handleSaveCOCOAnnotations, saveAnswer, showAlert, teacherName, navigate]);

  const handleNextMedia = useCallback(async (mediaArray: string[]) => {
    if (!isDetectionMode && !isSegmentationMode && selectedLabels.length === 0) {
      showAlert("Por favor, selecione pelo menos um rótulo antes de avançar.");
      return;
    }
    
    if (isSegmentationMode && currentSegmentationAnnotations.length > 0) {
      await handleSaveSegmentationAnnotations(currentSegmentationAnnotations);
    } else if (isDetectionMode && currentAnnotations.length > 0) {
      await handleSaveCOCOAnnotations(currentAnnotations);
    } else if (!isSegmentationMode && !isDetectionMode) {
      await saveAnswer();
    }
    
    if (current < mediaArray.length - 1) {
      setCurrent(prev => prev + 1);
      resetLabels();
      setBarStep(barStep + 1);
    } else {
      if (currentTab === 'supervised' && step === 1) {
        await calculateAndSaveScore();
        resetLabels();
        setBarStep(barStep + 1);
        goToFeedback();
      } else if (currentTab === 'unsupervised' && step === 3) {
        resetLabels();
        setBarStep(barStep + 1);
        setTimeout(() => finalizeExercise(), 1000);
      }
    }
  }, [isDetectionMode, isSegmentationMode, selectedLabels, currentSegmentationAnnotations, currentAnnotations, current, currentTab, step, barStep, handleSaveSegmentationAnnotations, handleSaveCOCOAnnotations, saveAnswer, resetLabels, calculateAndSaveScore, finalizeExercise, showAlert, goToFeedback]);

  const handlePreviousMedia = useCallback(async () => {
    await saveAnswer();
    setCurrent(prev => prev - 1);
    resetLabels();
  }, [saveAnswer, resetLabels]);

  const handleStartExercise = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setHasStarted(true);
    if (labelledMedias.length > 0) {
      setCurrentTab('supervised');
      setStep(1);
      setCurrent(0);
      setBarStep(0);
    } else if (unlabelledMedias.length > 0) {
      setCurrentTab('unsupervised');
      setStep(3);
      setCurrent(0);
      setBarStep(0);
    } else {
      goToFeedback();
    }
  }, [labelledMedias.length, unlabelledMedias.length, goToFeedback]);

  const handleContinueToUnsupervised = useCallback(() => {
    setStep(3);
    setCurrentTab('unsupervised');
    setCurrent(0);
    setCurrentAnnotations([]);
    setCurrentSegmentationAnnotations([]);
  }, []);

  const handleSaveAndFinalize = useCallback(async () => {
    await saveAnswer();
    await finalizeExercise();
  }, [saveAnswer, finalizeExercise]);

  const handleReport = useCallback(async () => {
    if (!reportText.trim()) {
      showAlert('Por favor, descreva o problema antes de enviar.');
      return;
    }
    try {
      const currentMediaId = currentTab === 'supervised' && step === 1 
        ? labelledMedias[current] 
        : unlabelledMedias[current];
      
      await createReport({ exerciseId, reportType, description: reportText, mediaId: currentMediaId });
      setShowReportModal(false);
      setReportText('');
      setIsFinalized(true);
      if (onComplete) onComplete();
      showAlert('Reporte enviado com sucesso.\n\nO exercício foi finalizado.');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      showAlert(`Erro ao enviar reporte: ${errorMessage}`);
    }
  }, [reportText, currentTab, step, labelledMedias, unlabelledMedias, current, exerciseId, reportType, onComplete, showAlert]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Carregando exercício…
      </div>
    );
  }

  if (!user) {
    return (
      <EmptyState
        title="Faça login para acessar os exercícios."
        description="Sua sessão expirou ou você não está autenticado."
      />
    );
  }

  const tabBar = (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border pb-3">
      <FilterPill active={currentTab === "explanation"} onClick={() => setCurrentTab("explanation")}>
        <span className="inline-flex items-center gap-1.5">
          <BookOpen className="size-3.5" strokeWidth={1.75} />
          Explicação
        </span>
      </FilterPill>
      {hasStarted && (
        <>
          <FilterPill
            active={currentTab === "supervised"}
            onClick={() => step >= 1 && setCurrentTab("supervised")}
          >
            <span className="inline-flex items-center gap-1.5">
              <Check className="size-3.5" strokeWidth={1.75} />
              Prática Assistida
            </span>
          </FilterPill>
          {step >= 3 && (
            <FilterPill
              active={currentTab === "unsupervised"}
              onClick={() => setCurrentTab("unsupervised")}
            >
              <span className="inline-flex items-center gap-1.5">
                <Pencil className="size-3.5" strokeWidth={1.75} />
                Prática Livre
              </span>
            </FilterPill>
          )}
        </>
      )}
      {(step === 1 || step === 3) && !isFinalized && (
        <button
          type="button"
          title="Reportar problema"
          onClick={() => {
            setReportType(step === 1 ? "error" : "unlabelled");
            setShowReportModal(true);
          }}
          className="ml-auto grid size-8 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:border-secondary hover:text-foreground"
        >
          <Flag className="size-3.5" strokeWidth={1.75} />
        </button>
      )}
    </div>
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-3">
      {tabBar}

      <div
        className={cn(
          "min-h-0 flex-1",
          currentTab === "explanation" ? "overflow-auto" : "overflow-hidden",
        )}
      >
        {currentTab === "explanation" && (
          <Panel
            title="Material didático"
            hint="Leia as instruções antes de iniciar a prática."
            action={
              !hasStarted && !isFinalized ? (
                <button
                  type="button"
                  onClick={handleStartExercise}
                  className="rounded-md bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Iniciar Exercício
                </button>
              ) : undefined
            }
          >
            <MarkdownViewer content={didaticDetailing} />
          </Panel>
        )}

        {currentTab === "supervised" && hasStarted && (
          <div className="h-full min-h-0">
            <SupervisedPractice
              step={1}
              current={current}
              labelledMedias={labelledMedias}
              unlabelledMedias={unlabelledMedias}
              datasetId={datasetId}
              labels={labels}
              selectedLabels={selectedLabels}
              isDetectionMode={isDetectionMode}
              isSegmentationMode={isSegmentationMode}
              currentAnnotations={currentAnnotations}
              currentSegmentationAnnotations={currentSegmentationAnnotations}
              labelledAnswers={labelledAnswers}
              iouThreshold={iouThreshold}
              segmentationIoUThreshold={segmentationIoUThreshold}
              segmentationScoreMode={segmentationScoreMode}
              onLabelChange={handleLabelChange}
              onSaveClassification={handleSaveClassification}
              onSaveCOCOAnnotations={handleSaveCOCOAnnotations}
              onSaveSegmentationAnnotations={handleSaveSegmentationAnnotations}
              onNextMedia={handleNextMedia}
              onPreviousMedia={handlePreviousMedia}
              onContinueToUnsupervised={handleContinueToUnsupervised}
              onFinalizeExercise={finalizeExercise}
              setCurrent={setCurrent}
              currentTool={currentTool}
              selectedAnnotationLabel={selectedAnnotationLabel}
              onToolChange={setCurrentTool}
              onSelectedLabelChange={setSelectedAnnotationLabel}
            />
          </div>
        )}

        {currentTab === "unsupervised" && hasStarted && step >= 3 && (
          <div className="h-full min-h-0">
            <UnsupervisedPractice
              current={current}
              unlabelledMedias={unlabelledMedias}
              datasetId={datasetId}
              labels={labels}
              selectedLabels={selectedLabels}
              isDetectionMode={isDetectionMode}
              isSegmentationMode={isSegmentationMode}
              currentAnnotations={currentAnnotations}
              currentSegmentationAnnotations={currentSegmentationAnnotations}
              onLabelChange={handleLabelChange}
              onSaveClassification={handleSaveClassification}
              onSaveCOCOAnnotations={handleSaveCOCOAnnotations}
              onSaveSegmentationAnnotations={handleSaveSegmentationAnnotations}
              onNextMedia={handleNextMedia}
              onPreviousMedia={handlePreviousMedia}
              onFinalizeExercise={finalizeExercise}
              onSaveAndFinalize={handleSaveAndFinalize}
              setCurrent={setCurrent}
              currentTool={currentTool}
              selectedAnnotationLabel={selectedAnnotationLabel}
              onToolChange={setCurrentTool}
              onSelectedLabelChange={setSelectedAnnotationLabel}
            />
          </div>
        )}
      </div>

      <Modal
        isOpen={showReportModal}
        onClose={() => {
          setShowReportModal(false);
          setReportText("");
        }}
        size="md"
        title={reportType === "error" ? "Reportar Erro" : "Reportar Atividade Não Rotulada"}
      >
        <div className="space-y-4 p-1">
          <p className="text-sm text-muted-foreground">Descreva o problema encontrado:</p>
          <TextareaField
            label="Descrição"
            name="report"
            value={reportText}
            onChange={(e) => setReportText(e.target.value)}
            placeholder="Descreva o problema..."
            rows={5}
            required
          />
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setShowReportModal(false);
                setReportText("");
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleReport} disabled={!reportText.trim()}>
              Enviar Reporte
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ExerciseCarousel;
