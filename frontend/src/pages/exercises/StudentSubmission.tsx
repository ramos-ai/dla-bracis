import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import {
  ExerciseProps,
  getExercisesById,
  getSubmissionByUserAndExercise,
  saveManualCorrection,
  SubmissionProps,
} from "../../services/ExercisesService";
import { getDatasetById, getDatasetLabels } from "../../services/datasetsService";
import { getUser } from "../../services/AuthService";
import { getLabelsForFile } from "../../services/TrainingService";
import { getCOCOAnnotation, COCOAnnotation } from "../../services/COCOService";
import {
  evaluateSegmentation,
  getSegmentationByMedia,
  SegmentationAnnotation,
  SegmentationMatch,
} from "../../services/SegmentationService";
import { useAuth } from "../../contexts/Authentication";
import { useAlertConfirm } from "../../contexts/AlertConfirmContext";
import InlineLoader from "../../components/InlineLoader/InlineLoader";
import MediaViewer from "../../components/ImageViewer/MediaViewer";
import AnnotationViewer from "../../components/AnnotationViewer/AnnotationViewer";
import SegmentationAnnotationViewer from "../../components/SegmentationAnnotationViewer/SegmentationAnnotationViewer";
import ManualCorrection from "../../components/ManualCorrection/ManualCorrection";
import ManualCorrectionSegmentation from "../../components/ManualCorrection/ManualCorrectionSegmentation";
import Button from "../../components/Fields/Button";
import { PageHeader, Panel, Stat, Tag, EmptyState } from "../../components/dla";
import { cn } from "../../lib/utils";

function calculateBboxIoU(bbox1: number[], bbox2: number[]): number {
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
  const unionArea = w1 * h1 + w2 * h2 - interArea;
  if (unionArea <= 0) return 0;
  return Math.max(0, Math.min(1, interArea / unionArea));
}

function findUnmatchedDetectionAnnotations(
  studentAnnotations: COCOAnnotation[],
  correctAnnotations: COCOAnnotation[],
  threshold: number,
): number[] {
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
}

function findUnmatchedSegmentationAnnotations(
  studentAnnotations: SegmentationAnnotation[],
  matches: SegmentationMatch[],
): number[] {
  const matchedStudentIndices = new Set(matches.map((m) => m.student_idx));
  return studentAnnotations
    .map((_, idx) => idx)
    .filter((idx) => !matchedStudentIndices.has(idx));
}

const StudentSubmission: React.FC = () => {
  const { exerciseId, userId } = useParams<{ exerciseId: string; userId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { alert: showAlert } = useAlertConfirm();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exercise, setExercise] = useState<ExerciseProps | null>(null);
  const [submission, setSubmission] = useState<SubmissionProps | null>(null);
  const [studentName, setStudentName] = useState("Aluno");
  const [datasetTaskType, setDatasetTaskType] = useState("classification");
  const [datasetLabels, setDatasetLabels] = useState<string[]>([]);
  const [correctLabelsMap, setCorrectLabelsMap] = useState<Record<string, string[]>>({});
  const [correctAnnotationsMap, setCorrectAnnotationsMap] = useState<Record<string, COCOAnnotation[]>>({});
  const [correctSegmentationMap, setCorrectSegmentationMap] = useState<
    Record<string, SegmentationAnnotation[]>
  >({});
  const [segmentationEvalMap, setSegmentationEvalMap] = useState<
    Record<string, { score: number; matches: SegmentationMatch[] }>
  >({});
  const [manualCorrections, setManualCorrections] = useState<Record<string, Record<string, boolean>>>({});
  const [editingManualCorrection, setEditingManualCorrection] = useState<string | null>(null);

  const iouThreshold = exercise?.iou_threshold ?? 0.85;
  const segmentationIoUThreshold = exercise?.segmentation_iou_threshold ?? 0.75;
  const segmentationScoreMode = exercise?.segmentation_score_mode ?? "recall";
  const canCorrect = user?.role === "teacher" || user?.role === "admin";

  const isAnswerCorrect = useCallback(
    (mediaId: string, studentLabels?: string[]): boolean => {
      if (datasetTaskType === "detection" || datasetTaskType === "segmentation") return true;
      const correctLabels = correctLabelsMap[mediaId] || [];
      const studentSet = new Set(studentLabels || []);
      const correctSet = new Set(correctLabels);
      if (studentSet.size === 0 && correctSet.size === 0) return true;
      if (studentSet.size !== correctSet.size) return false;
      for (const label of studentSet) {
        if (!correctSet.has(label)) return false;
      }
      return true;
    },
    [datasetTaskType, correctLabelsMap],
  );

  useEffect(() => {
    if (!exerciseId || !userId) {
      setLoading(false);
      setError("Parâmetros inválidos.");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const ex = await getExercisesById(exerciseId);
        if (cancelled) return;
        setExercise(ex);

        const sub = await getSubmissionByUserAndExercise(exerciseId, userId);
        if (cancelled) return;
        if (!sub) {
          setError("Submissão não encontrada.");
          return;
        }
        setSubmission(sub);
        setManualCorrections(sub.manualCorrections || {});

        if (sub.studentName) {
          setStudentName(sub.studentName);
        } else {
          try {
            const u = await getUser(userId);
            if (!cancelled) setStudentName(u?.name || "Aluno");
          } catch {
            if (!cancelled) setStudentName("Aluno");
          }
        }

        let taskType = "classification";
        try {
          const dataset = await getDatasetById(ex.dataset);
          if (cancelled) return;
          taskType = dataset.task_type || "classification";
          setDatasetTaskType(taskType);
          if (taskType === "detection" || taskType === "segmentation") {
            const labels = await getDatasetLabels(ex.dataset);
            if (!cancelled) setDatasetLabels(labels || []);
          }
        } catch {
          /* keep default */
        }

        const labelsMap: Record<string, string[]> = {};
        const annotationsMap: Record<string, COCOAnnotation[]> = {};
        const segmentationMap: Record<string, SegmentationAnnotation[]> = {};
        const allAnswers = [...(sub.labelledAnswers || []), ...(sub.unlabelledAnswers || [])];

        for (const answer of allAnswers) {
          if (cancelled) return;
          try {
            if (taskType === "detection") {
              const coco = await getCOCOAnnotation(ex.dataset, answer.mediaId);
              annotationsMap[answer.mediaId] = coco.annotations || [];
            } else if (taskType === "segmentation") {
              const seg = await getSegmentationByMedia(ex.dataset, answer.mediaId);
              segmentationMap[answer.mediaId] = seg.annotations || [];
            } else {
              labelsMap[answer.mediaId] = (await getLabelsForFile(ex.dataset, answer.mediaId)) || [];
            }
          } catch {
            if (taskType === "detection") annotationsMap[answer.mediaId] = [];
            else if (taskType === "segmentation") segmentationMap[answer.mediaId] = [];
            else labelsMap[answer.mediaId] = [];
          }
        }

        if (cancelled) return;
        setCorrectLabelsMap(labelsMap);
        setCorrectAnnotationsMap(annotationsMap);
        setCorrectSegmentationMap(segmentationMap);

        if (taskType === "segmentation") {
          const evalMap: Record<string, { score: number; matches: SegmentationMatch[] }> = {};
          const segIou = ex.segmentation_iou_threshold ?? 0.75;
          const segMode = ex.segmentation_score_mode ?? "recall";
          for (const answer of allAnswers) {
            if (cancelled) return;
            const studentAnn = answer.annotations as unknown as SegmentationAnnotation[] | undefined;
            if (!studentAnn || !Array.isArray(studentAnn)) continue;
            try {
              const result = await evaluateSegmentation(
                ex.dataset,
                answer.mediaId,
                studentAnn,
                segIou,
                segMode,
              );
              evalMap[answer.mediaId] = { score: result.score, matches: result.matches };
            } catch {
              evalMap[answer.mediaId] = { score: 0, matches: [] };
            }
          }
          if (!cancelled) setSegmentationEvalMap(evalMap);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("Não foi possível carregar as respostas.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [exerciseId, userId]);

  const handleSaveManualCorrection = async (
    mediaId: string,
    corrections: Record<string, boolean>,
  ) => {
    if (!submission || !exerciseId) return;
    try {
      const updated = { ...manualCorrections, [mediaId]: corrections };
      setManualCorrections(updated);
      await saveManualCorrection({
        exerciseId,
        userId: submission.userId,
        manualCorrections: updated,
      });
      const updatedSubmission = await getSubmissionByUserAndExercise(exerciseId, submission.userId);
      if (updatedSubmission) setSubmission(updatedSubmission);
      setEditingManualCorrection(null);
      showAlert("Correção manual salva com sucesso!");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      showAlert(
        `Erro ao salvar correção manual: ${e?.response?.data?.message || e?.message || "erro"}`,
      );
    }
  };

  if (loading) return <InlineLoader message="Carregando respostas…" />;

  if (error || !exercise || !submission) {
    return (
      <div className="space-y-3">
        <EmptyState title={error || "Respostas não encontradas"} />
        <Link to="/exercises" className="text-xs font-semibold text-secondary hover:underline">
          Voltar aos exercícios
        </Link>
      </div>
    );
  }

  const displayScore =
    submission.hasManualCorrection && submission.manualScore != null
      ? submission.manualScore
      : submission.finalScore != null
        ? submission.finalScore
        : submission.supervisedScore;

  const labelled = submission.labelledAnswers || [];
  const unlabelled = submission.unlabelledAnswers || [];

  let correctCount = 0;
  let wrongCount = 0;
  if (datasetTaskType === "classification") {
    labelled.forEach((answer) => {
      if (isAnswerCorrect(answer.mediaId, answer.labels || [])) correctCount += 1;
      else wrongCount += 1;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(`/exercises/manage?id=${exerciseId}`)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
          Gestão do exercício
        </button>
        {submission.finalized || submission.isFinalized ? (
          <Tag tone="success">Finalizado</Tag>
        ) : (
          <Tag tone="warning">Em progresso</Tag>
        )}
      </div>

      <PageHeader
        eyebrow="Respostas do aluno"
        title={studentName}
        description={exercise.title}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          label="Nota da prática assistida"
          value={displayScore != null ? displayScore.toFixed(1) : "—"}
          note={
            submission.hasManualCorrection
              ? `Correção manual · automática ${submission.supervisedScore?.toFixed(1) ?? "—"}`
              : undefined
          }
        />
        <Stat label="Prática assistida" value={labelled.length} />
        <Stat label="Prática livre" value={unlabelled.length} />
      </div>

      {datasetTaskType === "classification" && labelled.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Acertos: {correctCount} · Erros: {wrongCount}
        </p>
      )}

      {labelled.length > 0 && (
        <Panel title="Prática assistida" hint={`${labelled.length} resposta(s) com comparação ao GT`}>
          <div
            className={cn(
              "grid gap-4",
              datasetTaskType === "classification"
                ? "sm:grid-cols-2 xl:grid-cols-3"
                : "md:grid-cols-2",
            )}
          >
            {labelled.map((answer, index) => {
              const hasStudentAnnotations =
                Array.isArray(answer.annotations) && answer.annotations.length > 0;
              const hasCorrectAnnotations =
                (correctAnnotationsMap[answer.mediaId] || []).length > 0;
              const hasCorrectSeg =
                (correctSegmentationMap[answer.mediaId] || []).length > 0;
              const mediaCorrections = manualCorrections[answer.mediaId] || {};
              const isEditing = editingManualCorrection === answer.mediaId;

              if (datasetTaskType === "segmentation" && (hasStudentAnnotations || hasCorrectSeg)) {
                const studentSeg =
                  (answer.annotations as unknown as SegmentationAnnotation[]) || [];
                const correctSeg = correctSegmentationMap[answer.mediaId] || [];
                const evalData = segmentationEvalMap[answer.mediaId];
                const unmatched = findUnmatchedSegmentationAnnotations(
                  studentSeg,
                  evalData?.matches ?? [],
                );
                return (
                  <div key={answer.mediaId} className="rounded-lg border border-border bg-background p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="rule-label">Imagem {index + 1}</p>
                      {canCorrect && unmatched.length > 0 && (
                        <Button
                          variant="secondary"
                          onClick={() =>
                            setEditingManualCorrection(isEditing ? null : answer.mediaId)
                          }
                        >
                          {isEditing ? "Cancelar" : "Re-corrigir"}
                        </Button>
                      )}
                    </div>
                    <SegmentationAnnotationViewer
                      fileId={answer.mediaId}
                      studentAnnotations={studentSeg}
                      correctAnnotations={correctSeg}
                      labels={datasetLabels}
                      iouThreshold={segmentationIoUThreshold}
                      scoreMode={segmentationScoreMode}
                      imageScore={evalData?.score}
                      matches={evalData?.matches ?? []}
                      enableManualCorrection={!!submission.hasManualCorrection}
                      manualCorrections={mediaCorrections}
                      maxWidth={400}
                      maxHeight={300}
                    />
                    {isEditing && canCorrect && (
                      <div className="mt-3">
                        <ManualCorrectionSegmentation
                          studentAnnotations={studentSeg}
                          labels={datasetLabels}
                          initialCorrections={mediaCorrections}
                          unmatchedIndices={unmatched}
                          onSave={(corrections) =>
                            handleSaveManualCorrection(answer.mediaId, corrections)
                          }
                          onCancel={() => setEditingManualCorrection(null)}
                        />
                      </div>
                    )}
                  </div>
                );
              }

              if (
                datasetTaskType === "detection" &&
                (hasStudentAnnotations || hasCorrectAnnotations)
              ) {
                const studentAnnotations =
                  (answer.annotations as unknown as COCOAnnotation[]) || [];
                const correctAnnotations = correctAnnotationsMap[answer.mediaId] || [];
                const unmatched = findUnmatchedDetectionAnnotations(
                  studentAnnotations,
                  correctAnnotations,
                  iouThreshold,
                );
                const wrongAnnotations = unmatched.map((idx) => studentAnnotations[idx]);
                return (
                  <div key={answer.mediaId} className="rounded-lg border border-border bg-background p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="rule-label">Imagem {index + 1}</p>
                      {canCorrect && unmatched.length > 0 && (
                        <Button
                          variant="secondary"
                          onClick={() =>
                            setEditingManualCorrection(isEditing ? null : answer.mediaId)
                          }
                        >
                          {isEditing ? "Cancelar" : "Re-corrigir"}
                        </Button>
                      )}
                    </div>
                    <AnnotationViewer
                      fileId={answer.mediaId}
                      studentAnnotations={studentAnnotations}
                      correctAnnotations={correctAnnotations}
                      labels={datasetLabels}
                      iouThreshold={iouThreshold}
                      enableManualCorrection={!!submission.hasManualCorrection}
                      manualCorrections={mediaCorrections}
                      maxWidth={400}
                      maxHeight={300}
                    />
                    {isEditing && canCorrect && (
                      <div className="mt-3">
                        <ManualCorrection
                          studentAnnotations={wrongAnnotations}
                          labels={datasetLabels}
                          initialCorrections={mediaCorrections}
                          unmatchedIndices={unmatched}
                          onSave={(corrections) =>
                            handleSaveManualCorrection(answer.mediaId, corrections)
                          }
                          onCancel={() => setEditingManualCorrection(null)}
                        />
                      </div>
                    )}
                  </div>
                );
              }

              const isCorrect = isAnswerCorrect(answer.mediaId, answer.labels || []);
              const correctLabels = correctLabelsMap[answer.mediaId] || [];
              return (
                <div
                  key={answer.mediaId}
                  className={cn(
                    "rounded-lg border p-4",
                    isCorrect
                      ? "border-success/30 bg-success/5"
                      : "border-destructive/30 bg-destructive/5",
                  )}
                >
                  <p className="rule-label mb-2">Imagem {index + 1}</p>
                  <MediaViewer fileId={answer.mediaId} />
                  <div className="mt-3 space-y-2 text-sm">
                    <p>
                      <span className="font-semibold">Aluno: </span>
                      {(answer.labels || []).join(", ") || "Sem rótulos"}
                    </p>
                    <p>
                      <span className="font-semibold">GT: </span>
                      {correctLabels.join(", ") || "Sem rótulos"}
                    </p>
                    <Tag tone={isCorrect ? "success" : "danger"}>
                      {isCorrect ? "Correto" : "Incorreto"}
                    </Tag>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {unlabelled.length > 0 && (
        <Panel
          title="Prática livre"
          hint="Sem gabarito — apenas visualização das anotações do aluno"
        >
          <div
            className={cn(
              "grid gap-4",
              datasetTaskType === "classification"
                ? "sm:grid-cols-2 xl:grid-cols-3"
                : "md:grid-cols-2",
            )}
          >
            {unlabelled.map((answer, index) => {
              const hasAnnotations =
                Array.isArray(answer.annotations) && answer.annotations.length > 0;

              if (datasetTaskType === "segmentation" && hasAnnotations) {
                return (
                  <div key={answer.mediaId} className="rounded-lg border border-border bg-background p-4">
                    <p className="rule-label mb-3">Imagem {index + 1}</p>
                    <SegmentationAnnotationViewer
                      fileId={answer.mediaId}
                      studentAnnotations={
                        (answer.annotations as unknown as SegmentationAnnotation[]) || []
                      }
                      correctAnnotations={[]}
                      labels={datasetLabels}
                      iouThreshold={segmentationIoUThreshold}
                      scoreMode={segmentationScoreMode}
                      matches={[]}
                      maxWidth={400}
                      maxHeight={300}
                    />
                  </div>
                );
              }

              if (datasetTaskType === "detection" && hasAnnotations) {
                return (
                  <div key={answer.mediaId} className="rounded-lg border border-border bg-background p-4">
                    <p className="rule-label mb-3">Imagem {index + 1}</p>
                    <AnnotationViewer
                      fileId={answer.mediaId}
                      studentAnnotations={
                        (answer.annotations as unknown as COCOAnnotation[]) || []
                      }
                      correctAnnotations={[]}
                      labels={datasetLabels}
                      iouThreshold={iouThreshold}
                      enableManualCorrection={false}
                      manualCorrections={{}}
                      maxWidth={400}
                      maxHeight={300}
                    />
                  </div>
                );
              }

              return (
                <div key={answer.mediaId} className="rounded-lg border border-border bg-background p-4">
                  <p className="rule-label mb-2">Imagem {index + 1}</p>
                  <MediaViewer fileId={answer.mediaId} />
                  <p className="mt-3 text-sm">
                    <span className="font-semibold">Aluno: </span>
                    {(answer.labels || []).join(", ") || "Sem rótulos"}
                  </p>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {labelled.length === 0 && unlabelled.length === 0 && (
        <EmptyState title="Nenhuma resposta ainda." />
      )}
    </div>
  );
};

export default StudentSubmission;
