import React, { useEffect, useState, useCallback, useMemo } from "react";
import { CheckCircle2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ExerciseProps,
  getExercisesByClassId,
  getSubmissionByUserAndExercise,
  SubmissionProps,
} from "../../services/ExercisesService";
import { useAuth } from "../../contexts/Authentication";
import LoadingOverlay from "../../components/LoadingOverlay/LoadingOverlay";
import { PageHeader, EmptyState, Tag, FilterPill } from "../../components/dla";
import { cn } from "../../lib/utils";

const MESES_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"] as const;

type TaskType = "classification" | "segmentation" | "detection";
const ORDER: TaskType[] = ["classification", "segmentation", "detection"];

function formatDateTimePT(isoStr: string | undefined | null): string {
  if (!isoStr) return "—";
  try {
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return isoStr;
    const day = String(d.getDate()).padStart(2, "0");
    const month = MESES_PT[d.getMonth()];
    const year = d.getFullYear();
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${year} ${h}:${min}`;
  } catch {
    return isoStr;
  }
}

const getTaskTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    classification: "Classificação",
    segmentation: "Segmentação",
    detection: "Detecção de Objetos",
    all: "Todos",
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
  return (
    submission.isFinalized === true ||
    (submission.finalizedAt !== null &&
      submission.finalizedAt !== undefined &&
      submission.finalizedAt !== "")
  );
};

const Resolution: React.FC<ResolutionProps> = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [exercises, setExercises] = useState<ExerciseWithStatus[]>([]);
  const [resolutionLoading, setResolutionLoading] = useState<boolean>(true);
  const [filterType, setFilterType] = useState<"all" | TaskType>("all");
  const openExerciseIdFromState = (location.state as { openExerciseId?: string })?.openExerciseId;

  useEffect(() => {
    const classId = user?.classId ?? null;
    setSelectedClass(classId);
    if (classId === null) setResolutionLoading(false);
  }, [user]);

  const enrichExerciseWithStatus = async (
    exercise: ExerciseProps,
    userId: string,
  ): Promise<ExerciseWithStatus> => {
    if (!exercise._id) {
      return { ...exercise, isFinalized: false };
    }

    try {
      const submission = await getSubmissionByUserAndExercise(exercise._id, userId);
      return {
        ...exercise,
        isFinalized: isExerciseFinalized(submission),
        submission: submission || undefined,
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
        exercisesList.map((exercise: ExerciseProps) => enrichExerciseWithStatus(exercise, user._id)),
      );
      setExercises(exercisesWithStatus);
    } catch (error) {
      console.error("Error fetching exercises:", error);
    } finally {
      setResolutionLoading(false);
    }
  }, [selectedClass, user?._id]);

  useEffect(() => {
    loadExercises();
  }, [loadExercises]);

  useEffect(() => {
    if (!openExerciseIdFromState || exercises.length === 0) return;
    const ex = exercises.find((e) => e._id === openExerciseIdFromState);
    if (ex && ex._id) {
      if (ex.isFinalized) {
        navigate(`/exercises/resolution/${ex._id}/feedback`, { replace: true });
      } else {
        navigate(`/exercises/resolution/${ex._id}`, { replace: true });
      }
    } else {
      navigate("/exercises/resolution", { replace: true, state: {} });
    }
  }, [openExerciseIdFromState, exercises, navigate]);

  const handleExerciseClick = async (exercise: ExerciseWithStatus) => {
    if (exercise.isFinalized) {
      if (exercise._id) {
        navigate(`/exercises/resolution/${exercise._id}/feedback`);
      }
      return;
    }

    if (exercise._id && user?._id) {
      try {
        const submission = await getSubmissionByUserAndExercise(exercise._id, user._id);
        if (isExerciseFinalized(submission)) {
          setExercises((prev) =>
            prev.map((e) =>
              e._id === exercise._id
                ? { ...e, isFinalized: true, submission: submission || undefined }
                : e,
            ),
          );
          navigate(`/exercises/resolution/${exercise._id}/feedback`);
          return;
        }
      } catch (error) {
        console.error("Error checking submission:", error);
      }
    }

    if (exercise._id) {
      navigate(`/exercises/resolution/${exercise._id}`);
    }
  };

  const filteredExercises = useMemo(() => {
    if (filterType === "all") return exercises;
    return exercises.filter((e) => (e.task_type || "classification") === filterType);
  }, [exercises, filterType]);

  const groupedByType = useMemo(() => {
    return {
      classification: exercises.filter((e) => (e.task_type || "classification") === "classification"),
      segmentation: exercises.filter((e) => (e.task_type || "classification") === "segmentation"),
      detection: exercises.filter((e) => (e.task_type || "classification") === "detection"),
      other: exercises.filter(
        (e) => !["classification", "segmentation", "detection"].includes(e.task_type || ""),
      ),
    };
  }, [exercises]);

  const countByType = (type: TaskType) =>
    exercises.filter((e) => (e.task_type || "classification") === type).length;

  const renderExerciseCard = (exercise: ExerciseWithStatus) => {
    const score = exercise.submission?.supervisedScore;
    const tau =
      exercise.iou_threshold ?? exercise.segmentation_iou_threshold ?? undefined;

    return (
      <article
        key={exercise._id}
        className={cn(
          "flex flex-col rounded-lg border border-border bg-surface transition-colors duration-150",
          "hover:border-secondary",
        )}
      >
        <button
          type="button"
          onClick={() => handleExerciseClick(exercise)}
          className="flex-1 p-5 text-left"
        >
          <div className="flex items-start justify-between gap-3">
            <span className="num text-xs text-muted-foreground">
              Prazo {exercise.do_date ? formatDateTimePT(exercise.do_date) : "—"}
            </span>
            {exercise.isFinalized ? (
              <Tag tone="success">Finalizado</Tag>
            ) : (
              <Tag tone="warning">Pendente</Tag>
            )}
          </div>
          <h3 className="mt-3 font-display text-base font-semibold leading-snug">{exercise.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {tau !== undefined && <>τ = {tau.toFixed(2)} · </>}
            Criado em {formatDateTimePT(exercise.created_at || undefined)}
          </p>
          {exercise.isFinalized && score !== null && score !== undefined ? (
            <p className="num mt-4 flex items-center gap-1.5 font-display text-2xl font-semibold text-success">
              <CheckCircle2 className="size-4" strokeWidth={2} />
              {score.toFixed(1)}
            </p>
          ) : !exercise.isFinalized ? (
            <p className="mt-4 text-xs font-semibold text-primary">Abrir exercício →</p>
          ) : (
            <p className="mt-4 text-xs font-semibold text-primary">Ver feedback →</p>
          )}
        </button>
        <footer className="border-t border-border px-5 py-3">
          <Tag tone="primary">{getTaskTypeLabel(exercise.task_type || "")}</Tag>
        </footer>
      </article>
    );
  };

  const renderGroup = (type: string, items: ExerciseWithStatus[], label: string) => {
    if (!items.length) return null;
    return (
      <section key={type} className="space-y-3">
        <div className="flex items-center gap-3 border-b border-border pb-2">
          <h2 className="font-display text-sm font-semibold">{label}</h2>
          <span className="num text-xs text-muted-foreground">{items.length}</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map(renderExerciseCard)}</div>
      </section>
    );
  };

  if (resolutionLoading) {
    return <LoadingOverlay message="Carregando exercícios..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Anotador"
        title="Meus exercícios"
        description="Escolha um exercício pendente para abrir a prática assistida e livre — o editor segue o tipo do dataset."
      />

      {!selectedClass ? (
        <EmptyState
          title="Você não está atribuído a nenhuma turma."
          description="Entre em contato com o administrador para ser atribuído a uma turma."
        />
      ) : exercises.length === 0 ? (
        <EmptyState
          title="Nenhum exercício disponível."
          description="Aguarde a publicação pelo supervisor."
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            <FilterPill active={filterType === "all"} onClick={() => setFilterType("all")} count={exercises.length}>
              Todos
            </FilterPill>
            {ORDER.map((type) => (
              <FilterPill
                key={type}
                active={filterType === type}
                onClick={() => setFilterType(type)}
                count={countByType(type)}
              >
                {getTaskTypeLabel(type)}
              </FilterPill>
            ))}
          </div>

          {filteredExercises.length === 0 ? (
            <EmptyState
              title="Nenhum exercício deste tipo."
              description="Selecione outro filtro para ver mais exercícios."
            />
          ) : filterType === "all" ? (
            <div className="space-y-8">
              {renderGroup("classification", groupedByType.classification, "Classificação")}
              {renderGroup("segmentation", groupedByType.segmentation, "Segmentação")}
              {renderGroup("detection", groupedByType.detection, "Detecção de Objetos")}
              {renderGroup("other", groupedByType.other, "Outros")}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredExercises.map(renderExerciseCard)}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Resolution;
