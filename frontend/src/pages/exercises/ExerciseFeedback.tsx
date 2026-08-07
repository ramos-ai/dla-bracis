import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import {
  ExerciseProps,
  getExercisesById,
  getSubmissionByUserAndExercise,
  saveSubmission,
  SubmissionProps,
} from "../../services/ExercisesService";
import { getDatasetById, getDatasetLabels } from "../../services/datasetsService";
import { getUser } from "../../services/AuthService";
import { useAuth } from "../../contexts/Authentication";
import { useAlertConfirm } from "../../contexts/AlertConfirmContext";
import InlineLoader from "../../components/InlineLoader/InlineLoader";
import AnnotationViewer from "../../components/AnnotationViewer/AnnotationViewer";
import SegmentationAnnotationViewer from "../../components/SegmentationAnnotationViewer/SegmentationAnnotationViewer";
import ClassificationViewer from "../../components/ClassificationViewer/ClassificationViewer";
import { PageHeader, Panel, Stat, EmptyState, Tag } from "../../components/dla";
import { COCOAnnotation, getCOCOAnnotation } from "../../services/COCOService";
import {
  SegmentationAnnotation,
  SegmentationMatch,
  getSegmentationByMedia,
  evaluateSegmentation,
} from "../../services/SegmentationService";
import { getLabelsForFile } from "../../services/TrainingService";
import { isSubmissionFinalized } from "../../components/ExerciseCarousel/utils/exerciseHelpers";
import type { AnswerItem } from "../../components/ExerciseCarousel/types";

type TaskType = "classification" | "detection" | "segmentation";

const ExerciseFeedback: React.FC = () => {
  const { exerciseId } = useParams<{ exerciseId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { alert: showAlert } = useAlertConfirm();

  const [exercise, setExercise] = useState<ExerciseProps | null>(null);
  const [submission, setSubmission] = useState<SubmissionProps | null>(null);
  const [taskType, setTaskType] = useState<TaskType>("classification");
  const [labels, setLabels] = useState<string[]>([]);
  const [teacherName, setTeacherName] = useState("");
  const [loading, setLoading] = useState(true);
  const [feedbackLoading, setFeedbackLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [correctCoco, setCorrectCoco] = useState<Record<string, COCOAnnotation[]>>({});
  const [correctSegmentation, setCorrectSegmentation] = useState<
    Record<string, SegmentationAnnotation[]>
  >({});
  const [segmentationEval, setSegmentationEval] = useState<
    Record<string, { score: number; matches: SegmentationMatch[] }>
  >({});
  const [correctLabels, setCorrectLabels] = useState<Record<string, string[]>>({});

  const labelledMedias = exercise?.supervised_practice || [];
  const unlabelledMedias = exercise?.unsupervised_practice || [];
  const labelledAnswers = (submission?.labelledAnswers || []) as AnswerItem[];
  const supervisedScore = submission?.supervisedScore ?? null;
  const isFinalized = isSubmissionFinalized(submission);
  const isDetectionMode = taskType === "detection";
  const isSegmentationMode = taskType === "segmentation";
  const iouThreshold = exercise?.iou_threshold ?? 0.85;
  const segmentationIoUThreshold = exercise?.segmentation_iou_threshold ?? 0.75;
  const segmentationScoreMode = exercise?.segmentation_score_mode ?? "recall";

  useEffect(() => {
    if (!exerciseId || !user?._id) {
      setLoading(false);
      setError(!user ? "Faça login para ver o feedback." : "Exercício não encontrado.");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const ex = await getExercisesById(exerciseId);
        if (cancelled) return;
        setExercise(ex);

        const sub = await getSubmissionByUserAndExercise(exerciseId, user._id);
        if (cancelled) return;
        setSubmission(sub);

        try {
          const dataset = await getDatasetById(ex.dataset);
          const type = dataset.task_type || "classification";
          if (type === "classification" || type === "detection" || type === "segmentation") {
            setTaskType(type);
          }
          const datasetLabels = await getDatasetLabels(ex.dataset);
          if (!cancelled) setLabels(datasetLabels || []);
        } catch {
          /* keep defaults */
        }

        if (ex.user_id) {
          try {
            const teacher = await getUser(ex.user_id);
            if (!cancelled) setTeacherName(teacher?.name || "");
          } catch {
            /* ignore */
          }
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("Não foi possível carregar o feedback.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [exerciseId, user?._id]);

  useEffect(() => {
    const medias = exercise?.supervised_practice || [];
    const answers = (submission?.labelledAnswers || []) as AnswerItem[];
    if (!exercise || !submission || medias.length === 0) {
      setFeedbackLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setFeedbackLoading(true);
      const cocoMap: Record<string, COCOAnnotation[]> = {};
      const segMap: Record<string, SegmentationAnnotation[]> = {};
      const segEvalMap: Record<string, { score: number; matches: SegmentationMatch[] }> = {};
      const labelsMap: Record<string, string[]> = {};
      const datasetId = exercise.dataset;

      try {
        for (const mediaId of medias) {
          if (cancelled) return;
          const answer = answers.find((a) => a.mediaId === mediaId);
          if (isSegmentationMode) {
            try {
              const studentAnns =
                (answer?.annotations as SegmentationAnnotation[] | undefined) || [];
              const correctRes = await getSegmentationByMedia(datasetId, mediaId);
              if (cancelled) return;
              const correctList = correctRes?.annotations || [];
              segMap[mediaId] = correctList;
              if (studentAnns.length > 0 || correctList.length > 0) {
                const evalRes = await evaluateSegmentation(
                  datasetId,
                  mediaId,
                  studentAnns,
                  segmentationIoUThreshold,
                  segmentationScoreMode,
                );
                if (cancelled) return;
                segEvalMap[mediaId] = {
                  score: evalRes?.score ?? 0,
                  matches: evalRes?.matches ?? [],
                };
              }
            } catch {
              /* ignore */
            }
          } else if (isDetectionMode) {
            try {
              const res = await getCOCOAnnotation(datasetId, mediaId);
              if (cancelled) return;
              cocoMap[mediaId] = res?.annotations || [];
            } catch {
              /* ignore */
            }
          } else {
            try {
              const gt = await getLabelsForFile(datasetId, mediaId);
              if (cancelled) return;
              labelsMap[mediaId] = gt || [];
            } catch {
              /* ignore */
            }
          }
        }
        if (!cancelled) {
          setCorrectCoco(cocoMap);
          setCorrectSegmentation(segMap);
          setSegmentationEval(segEvalMap);
          setCorrectLabels(labelsMap);
        }
      } finally {
        if (!cancelled) setFeedbackLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    exercise?._id,
    exercise?.dataset,
    submission?._id,
    submission?.labelledAnswers,
    isDetectionMode,
    isSegmentationMode,
    segmentationIoUThreshold,
    segmentationScoreMode,
  ]);

  const handleContinueUnsupervised = useCallback(() => {
    if (!exerciseId) return;
    navigate(`/exercises/resolution/${exerciseId}`, {
      state: { startUnsupervised: true },
    });
  }, [exerciseId, navigate]);

  const handleFinalize = useCallback(async () => {
    if (!user || !exerciseId || !exercise) return;
    setFinalizing(true);
    try {
      const response = await saveSubmission({
        userId: user._id,
        exerciseId,
        dataset_id: exercise.dataset,
        finalized: true,
      });
      if (response?.success === false) {
        throw new Error(response?.message || "Falha ao finalizar");
      }
      const teacherText = teacherName ? ` ao professor ${teacherName}` : "";
      showAlert(`Exercício finalizado com sucesso!\n\nSuas respostas foram enviadas${teacherText}.`);
      navigate("/exercises/resolution");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      showAlert(`Erro ao finalizar exercício: ${message}`);
    } finally {
      setFinalizing(false);
    }
  }, [user, exerciseId, exercise, teacherName, showAlert, navigate]);

  if (loading) {
    return <InlineLoader message="Carregando feedback…" />;
  }

  if (error || !exercise?._id) {
    return (
      <div className="space-y-3">
        <EmptyState title={error || "Exercício não encontrado."} />
        <Link
          to="/exercises/resolution"
          className="text-xs font-semibold text-secondary hover:underline"
        >
          Voltar aos exercícios
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/exercises/resolution")}
          className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
          Exercícios
        </button>
        {isFinalized && <Tag tone="success">Finalizado</Tag>}
      </div>

      <PageHeader
        eyebrow="Feedback"
        title={exercise.title}
        description="Comparação das suas respostas da prática assistida com a referência."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          label="Nota da prática assistida"
          value={
            supervisedScore !== null && supervisedScore !== undefined
              ? supervisedScore.toFixed(1)
              : "—"
          }
          note={
            supervisedScore === null || supervisedScore === undefined
              ? "Não foi possível calcular. Pode finalizar na mesma."
              : undefined
          }
        />
        <Stat label="Imagens assistidas" value={labelledMedias.length} />
        {unlabelledMedias.length > 0 && (
          <Stat label="Imagens prática livre" value={unlabelledMedias.length} />
        )}
      </div>

      {!isFinalized && (
        <p className="text-sm text-muted-foreground">
          {unlabelledMedias.length > 0
            ? "Você pode continuar para a prática livre (opcional) ou finalizar o exercício agora."
            : "Exercício concluído! Você pode finalizar agora."}
        </p>
      )}

      {labelledMedias.length > 0 ? (
        <Panel
          title="Feedback por imagem"
          hint="Linhas de comparação com a referência da prática assistida."
        >
          {feedbackLoading ? (
            <p className="text-sm text-muted-foreground">
              A carregar comparação com a referência…
            </p>
          ) : (
            <div
              className={
                isDetectionMode || isSegmentationMode
                  ? "grid gap-4 md:grid-cols-2"
                  : "grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
              }
            >
              {labelledMedias.map((mediaId, idx) => {
                const answer = labelledAnswers.find((a) => a.mediaId === mediaId);

                if (isSegmentationMode) {
                  const studentSeg =
                    (answer?.annotations as SegmentationAnnotation[] | undefined) || [];
                  const correctSeg = correctSegmentation[mediaId] || [];
                  const segEval = segmentationEval[mediaId];
                  if (studentSeg.length === 0 && correctSeg.length === 0) return null;
                  return (
                    <div
                      key={mediaId}
                      className="rounded-lg border border-border bg-background p-4"
                    >
                      <p className="rule-label mb-3">Imagem {idx + 1}</p>
                      <SegmentationAnnotationViewer
                        fileId={mediaId}
                        studentAnnotations={studentSeg}
                        correctAnnotations={correctSeg}
                        labels={labels}
                        iouThreshold={segmentationIoUThreshold}
                        scoreMode={segmentationScoreMode}
                        imageScore={segEval?.score}
                        matches={segEval?.matches ?? []}
                      />
                    </div>
                  );
                }

                if (isDetectionMode) {
                  const studentCoco =
                    (answer?.annotations as COCOAnnotation[] | undefined) || [];
                  const correct = correctCoco[mediaId] || [];
                  if (studentCoco.length === 0 && correct.length === 0) return null;
                  return (
                    <div
                      key={mediaId}
                      className="rounded-lg border border-border bg-background p-4"
                    >
                      <p className="rule-label mb-3">Imagem {idx + 1}</p>
                      <AnnotationViewer
                        fileId={mediaId}
                        studentAnnotations={studentCoco}
                        correctAnnotations={correct}
                        labels={labels}
                        iouThreshold={iouThreshold}
                      />
                    </div>
                  );
                }

                return (
                  <ClassificationViewer
                    key={mediaId}
                    fileId={mediaId}
                    studentLabels={answer?.labels || []}
                    correctLabels={correctLabels[mediaId] || []}
                    maxWidth={250}
                    maxHeight={180}
                  />
                );
              })}
            </div>
          )}
        </Panel>
      ) : (
        <EmptyState
          title="Sem imagens de prática assistida"
          description="Este exercício não tem feedback de comparação por imagem."
        />
      )}

      <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
        {!isFinalized && unlabelledMedias.length > 0 && (
          <button
            type="button"
            onClick={handleContinueUnsupervised}
            className="rounded-md bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Continuar para Prática Livre
          </button>
        )}
        {!isFinalized && (
          <button
            type="button"
            onClick={handleFinalize}
            disabled={finalizing}
            className="rounded-md border border-border px-3.5 py-2 text-xs font-semibold transition-colors hover:border-secondary disabled:opacity-50"
          >
            {finalizing ? "Finalizando…" : "Finalizar Exercício"}
          </button>
        )}
        {isFinalized && (
          <button
            type="button"
            onClick={() => navigate("/exercises/resolution")}
            className="rounded-md bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Voltar aos exercícios
          </button>
        )}
      </div>
    </div>
  );
};

export default ExerciseFeedback;
