import React, { useEffect, useState, useRef, useCallback } from 'react';
import Button from '../Fields/Button';
import { saveSubmission, SubmissionProps, getSubmissionByUserAndExercise } from '../../services/ExercisesService';
import { getDatasetLabels, getDatasetById } from '../../services/datasetsService';
import { useAuth } from '../../contexts/Authentication';
import { useAlertConfirm } from '../../contexts/AlertConfirmContext';
import Modal from '../Modal/Modal';
import TextareaField from '../Fields/TextareaField';
import MarkdownViewer from '../MarkdownViewer/MarkdownViewer';
import { createReport } from '../../services/ReportsService';
import { COCOAnnotation, getCOCOAnnotation } from '../../services/COCOService';
import type { SegmentationAnnotation, SegmentationMatch } from '../../services/SegmentationService';
import { getSegmentationByMedia, evaluateSegmentation } from '../../services/SegmentationService';
import { getLabelsForFile } from '../../services/TrainingService';
import { Icon } from '../Icons/Icons';
import { useCancelledFlag } from '../../hooks/useAbortableFetch';
import { SupervisedPractice, UnsupervisedPractice } from './components';
import { isSubmissionFinalized } from './utils/exerciseHelpers';
import type { ExerciseCarouselProps, TabType, AnswerItem, AnnotationTool } from './types';

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
  
  // State
  const [currentTab, setCurrentTab] = useState<TabType>('explanation');
  const [current, setCurrent] = useState<number>(0);
  const [step, setStep] = useState<number>(0);
  const [labels, setLabels] = useState<string[]>([]);
  const totalSteps = labelledMedias.length + unlabelledMedias.length;
  const [barStep, setBarStep] = useState<number>(0);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [supervisedScore, setSupervisedScore] = useState<number | null>(null);
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
  const [feedbackCorrectCoco, setFeedbackCorrectCoco] = useState<Record<string, COCOAnnotation[]>>({});
  const [feedbackCorrectSegmentation, setFeedbackCorrectSegmentation] = useState<Record<string, SegmentationAnnotation[]>>({});
  const [feedbackSegmentationEval, setFeedbackSegmentationEval] = useState<Record<string, { score: number; matches: SegmentationMatch[] }>>({});
  const [feedbackCorrectLabels, setFeedbackCorrectLabels] = useState<Record<string, string[]>>({});
  const [feedbackLoading, setFeedbackLoading] = useState<boolean>(false);
  
  // Estado persistente de ferramenta e classe selecionada (não reseta ao mudar de imagem)
  const [currentTool, setCurrentTool] = useState<AnnotationTool>('rectangle');
  const [selectedAnnotationLabel, setSelectedAnnotationLabel] = useState<string>('');
  
  const { isCancelled: isCancelledInit, reset: resetCancelledInit, cancel: cancelInit } = useCancelledFlag();
  const { isCancelled: isCancelledFetch, reset: resetCancelledFetch, cancel: cancelFetch } = useCancelledFlag();
  const { isCancelled: isCancelledFeedback, reset: resetCancelledFeedback, cancel: cancelFeedback } = useCancelledFlag();

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
          setStep(4);
          setBarStep(totalSteps);
          setHasStarted(true);
          if (submission?.supervisedScore !== null && submission?.supervisedScore !== undefined) {
            setSupervisedScore(submission.supervisedScore);
          }
        } else if (submission) {
          const hasLabelledAnswers = (submission.labelledAnswers?.length ?? 0) > 0;
          const hasUnlabelledAnswers = (submission.unlabelledAnswers?.length ?? 0) > 0;
          
          if (hasLabelledAnswers || hasUnlabelledAnswers) {
            setHasStarted(true);
            if (submission.labelledAnswers) setLabelledAnswers(submission.labelledAnswers as AnswerItem[]);
            if (submission.unlabelledAnswers) setUnlabelledAnswers(submission.unlabelledAnswers as AnswerItem[]);
            
            if (submission.supervisedScore !== null && submission.supervisedScore !== undefined) {
              setSupervisedScore(submission.supervisedScore);
              setStep(2);
              setCurrentTab('supervised');
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
  }, [exerciseId, user?._id, totalSteps, isCancelledInit, resetCancelledInit, cancelInit]);

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

  // Load feedback for step 2
  useEffect(() => {
    if (step !== 2 || labelledMedias.length === 0) return;
    resetCancelledFeedback();
    setFeedbackLoading(true);
    const loadFeedback = async () => {
      const cocoMap: Record<string, COCOAnnotation[]> = {};
      const segMap: Record<string, SegmentationAnnotation[]> = {};
      const segEvalMap: Record<string, { score: number; matches: SegmentationMatch[] }> = {};
      const labelsMap: Record<string, string[]> = {};
      try {
        for (const mediaId of labelledMedias) {
          if (isCancelledFeedback()) return;
          const answer = labelledAnswers.find(a => a.mediaId === mediaId);
          if (isSegmentationMode) {
            try {
              const [correctRes, studentAnns] = await Promise.all([
                getSegmentationByMedia(datasetId, mediaId),
                Promise.resolve((answer?.annotations as SegmentationAnnotation[]) || []),
              ]);
              if (isCancelledFeedback()) return;
              const correctList = correctRes?.annotations || [];
              segMap[mediaId] = correctList;
              if (studentAnns.length > 0 || correctList.length > 0) {
                const evalRes = await evaluateSegmentation(datasetId, mediaId, studentAnns, segmentationIoUThreshold, segmentationScoreMode);
                if (isCancelledFeedback()) return;
                segEvalMap[mediaId] = { score: evalRes?.score ?? 0, matches: evalRes?.matches ?? [] };
              }
            } catch { /* ignore */ }
          } else if (isDetectionMode) {
            try {
              const res = await getCOCOAnnotation(datasetId, mediaId);
              if (isCancelledFeedback()) return;
              cocoMap[mediaId] = res?.annotations || [];
            } catch { /* ignore */ }
          } else {
            // Classification: load correct labels
            try {
              const correctLabels = await getLabelsForFile(datasetId, mediaId);
              if (isCancelledFeedback()) return;
              labelsMap[mediaId] = correctLabels || [];
            } catch { /* ignore */ }
          }
        }
        if (!isCancelledFeedback()) {
          setFeedbackCorrectCoco(cocoMap);
          setFeedbackCorrectSegmentation(segMap);
          setFeedbackSegmentationEval(segEvalMap);
          setFeedbackCorrectLabels(labelsMap);
        }
      } finally {
        if (!isCancelledFeedback()) setFeedbackLoading(false);
      }
    };
    loadFeedback();
    return () => { cancelFeedback(); };
  }, [step, isDetectionMode, isSegmentationMode, labelledMedias, labelledAnswers, datasetId, segmentationIoUThreshold, segmentationScoreMode, isCancelledFeedback, resetCancelledFeedback, cancelFeedback]);

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
      const validAnswers = labelledAnswers.filter(a => a.mediaId?.trim());
      const submission: SubmissionProps = {
        userId: user._id,
        exerciseId,
        labelledAnswers: validAnswers.length > 0 ? validAnswers : undefined,
        dataset_id: datasetId,
        finalized: false
      };
      const response = await saveSubmission(submission);
      if (response.supervisedScore !== undefined && response.supervisedScore !== null) {
        setSupervisedScore(response.supervisedScore);
      }
    } catch (error) {
      console.error('Erro ao calcular nota:', error);
    }
  }, [labelledAnswers, user, exerciseId, datasetId]);

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
      
      const validLabelled = labelledAnswers.filter(a => a.mediaId?.trim());
      const validUnlabelled = unlabelledAnswers.filter(a => a.mediaId?.trim());
      
      const submission: SubmissionProps = {
        userId: user._id,
        exerciseId,
        labelledAnswers: validLabelled.length > 0 ? validLabelled : undefined,
        unlabelledAnswers: validUnlabelled.length > 0 ? validUnlabelled : undefined,
        dataset_id: datasetId,
        finalized: true
      };
      
      const response = await saveSubmission(submission);
      if (response.supervisedScore !== null && response.supervisedScore !== undefined) {
        setSupervisedScore(response.supervisedScore);
      }
      
      setBarStep(totalSteps);
      setIsFinalized(true);
      setStep(4);
      
      const teacherText = teacherName ? ` ao professor ${teacherName}` : '';
      showAlert(`Exercício finalizado com sucesso!\n\nSuas respostas foram enviadas${teacherText}.`);
      
      if (onComplete) onComplete();
    } catch (error: unknown) {
      console.error('Erro ao finalizar exercício:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      showAlert(`Erro ao finalizar exercício: ${errorMessage}`);
    }
  }, [currentTab, step, isSegmentationMode, isDetectionMode, currentSegmentationAnnotations, currentAnnotations, labelledAnswers, unlabelledAnswers, user, exerciseId, datasetId, totalSteps, onComplete, handleSaveSegmentationAnnotations, handleSaveCOCOAnnotations, saveAnswer, showAlert, teacherName]);

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
        setStep(2);
        resetLabels();
        setBarStep(barStep + 1);
      } else if (currentTab === 'unsupervised' && step === 3) {
        resetLabels();
        setBarStep(barStep + 1);
        setTimeout(() => finalizeExercise(), 1000);
      }
    }
  }, [isDetectionMode, isSegmentationMode, selectedLabels, currentSegmentationAnnotations, currentAnnotations, current, currentTab, step, barStep, handleSaveSegmentationAnnotations, handleSaveCOCOAnnotations, saveAnswer, resetLabels, calculateAndSaveScore, finalizeExercise, showAlert]);

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
      setCurrentTab('supervised');
      setStep(2);
      setBarStep(0);
    }
  }, [labelledMedias.length, unlabelledMedias.length]);

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
      setStep(4);
      if (onComplete) onComplete();
      showAlert('Reporte enviado com sucesso.\n\nO exercício foi finalizado.');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      showAlert(`Erro ao enviar reporte: ${errorMessage}`);
    }
  }, [reportText, currentTab, step, labelledMedias, unlabelledMedias, current, exerciseId, reportType, onComplete, showAlert]);

  if (isLoading) return <div className="exercise-carousel">Carregando...</div>;

  if (!user) {
    return <div>Por favor, faça login para acessar os exercícios.</div>;
  }

  if (isFinalized && step === 4) {
    return (
      <div className="exercise-carousel">
        <div className="exercise-carousel__tabs">
          <button className={`exercise-carousel__tab ${currentTab === 'explanation' ? 'exercise-carousel__tab--active' : ''}`} onClick={() => setCurrentTab('explanation')}><Icon name="book" size={16} /> Explicação</button>
          <button className={`exercise-carousel__tab ${currentTab === 'supervised' ? 'exercise-carousel__tab--active' : ''}`} onClick={() => setCurrentTab('supervised')}><Icon name="check" size={16} /> Prática Assistida</button>
          <button className={`exercise-carousel__tab ${currentTab === 'unsupervised' ? 'exercise-carousel__tab--active' : ''}`} onClick={() => setCurrentTab('unsupervised')}><Icon name="edit" size={16} /> Prática Livre</button>
        </div>
        <div className="exercise-carousel__tab-content">
          {currentTab === 'explanation' && (
            <MarkdownViewer content={didaticDetailing} className="exercise-carousel__explanation-content" maxHeight="70vh" />
          )}
          {currentTab === 'supervised' && (
            <div className="exercise-carousel__finalized-message">
              <p>Prática Assistida concluída!</p>
              {supervisedScore !== null && <p style={{ marginTop: '1rem', fontSize: '1.2rem', fontWeight: 'bold' }}>Sua nota: {supervisedScore.toFixed(1)}</p>}
            </div>
          )}
          {currentTab === 'unsupervised' && <div className="exercise-carousel__finalized-message"><p>Prática Livre concluída!</p></div>}
        </div>
      </div>
    );
  }

  return (
    <div className="exercise-carousel" style={{ position: 'relative' }}>
      <div className="exercise-carousel__tabs">
        <button className={`exercise-carousel__tab ${currentTab === 'explanation' ? 'exercise-carousel__tab--active' : ''}`} onClick={() => setCurrentTab('explanation')}><Icon name="book" size={16} /> Explicação</button>
        {hasStarted && (
          <>
            <button className={`exercise-carousel__tab ${currentTab === 'supervised' ? 'exercise-carousel__tab--active' : ''}`} onClick={() => step >= 1 && setCurrentTab('supervised')} disabled={step < 1}><Icon name="check" size={16} /> Prática Assistida</button>
            <button className={`exercise-carousel__tab ${currentTab === 'unsupervised' ? 'exercise-carousel__tab--active' : ''}`} onClick={() => step >= 3 && setCurrentTab('unsupervised')} disabled={step < 3}><Icon name="edit" size={16} /> Prática Livre</button>
          </>
        )}
      </div>

      <div className="exercise-carousel__tab-content">
        {currentTab === 'explanation' && (
          <div className="exercise-carousel__explanation-wrapper">
            <MarkdownViewer content={didaticDetailing} className="exercise-carousel__explanation-content" maxHeight="60vh" />
            {!hasStarted && !isFinalized && <Button type="button" onClick={handleStartExercise} style={{ marginTop: '2rem' }}>Iniciar Exercício</Button>}
          </div>
        )}

        {currentTab === 'supervised' && hasStarted && (
            <SupervisedPractice
              step={step as 1 | 2}
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
            supervisedScore={supervisedScore}
            feedbackLoading={feedbackLoading}
            feedbackCorrectCoco={feedbackCorrectCoco}
            feedbackCorrectSegmentation={feedbackCorrectSegmentation}
            feedbackCorrectLabels={feedbackCorrectLabels}
            feedbackSegmentationEval={feedbackSegmentationEval}
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
        )}

        {currentTab === 'unsupervised' && hasStarted && step >= 3 && (
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
        )}
      </div>

      {(step === 1 || step === 3) && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem 0', marginTop: '0.5rem' }}>
          <button type="button" onClick={() => { setReportType(step === 1 ? 'error' : 'unlabelled'); setShowReportModal(true); }} style={{ width: 40, height: 40, borderRadius: '50%', border: '1px solid #ddd', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="report" size={18} />
          </button>
        </div>
      )}

      <Modal isOpen={showReportModal} onClose={() => { setShowReportModal(false); setReportText(''); }} size="md" title={reportType === 'error' ? 'Reportar Erro' : 'Reportar Atividade Não Rotulada'}>
        <div style={{ padding: '1rem' }}>
          <p style={{ marginBottom: '1rem', color: '#666' }}>Descreva o problema encontrado:</p>
          <TextareaField label="Descrição" name="report" value={reportText} onChange={(e) => setReportText(e.target.value)} placeholder="Descreva o problema..." rows={5} required />
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => { setShowReportModal(false); setReportText(''); }}>Cancelar</Button>
            <Button onClick={handleReport} disabled={!reportText.trim()}>Enviar Reporte</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ExerciseCarousel;
