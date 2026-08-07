import React, { useEffect, useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ExerciseProps, getExercisesList } from "../../services/ExercisesService";
import { useSelectedClass } from "../../contexts/SelectedClass";
import LoadingOverlay from "../../components/LoadingOverlay/LoadingOverlay";
import { PageHeader, EmptyState, Tag, FilterPill } from "../../components/dla";

const MESES_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"] as const;

type TaskType = "classification" | "segmentation" | "detection";

const ORDER: TaskType[] = ["classification", "segmentation", "detection"];

/** Formata data/hora ISO para dd/mmm/aaaa HH:mm em português (ex.: 24/fev/2026 23:59) */
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

const Exercises: React.FC = () => {
  const navigate = useNavigate();
  const { selectedClassId } = useSelectedClass();

  const [exercisesList, setExercisesList] = useState<ExerciseProps[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<"all" | TaskType>("all");
  const [filterClass, setFilterClass] = useState<string>("all");

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await getExercisesList(selectedClassId ?? undefined);
      setExercisesList(response.exercises || []);
    } catch (err) {
      console.error("Erro ao buscar exercícios:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedClassId]);

  const filteredByClass = useMemo(() => {
    if (filterClass === "all") return exercisesList;
    return exercisesList.filter((e) => (e.class || "") === filterClass);
  }, [exercisesList, filterClass]);

  const filteredExercises = useMemo(() => {
    if (filterType === "all") return filteredByClass;
    return filteredByClass.filter((e) => (e.task_type || "classification") === filterType);
  }, [filteredByClass, filterType]);

  const groupedFiltered = useMemo(() => {
    const list = filterType === "all" ? filteredByClass : filteredExercises;
    return {
      classification: list.filter((e) => (e.task_type || "classification") === "classification"),
      segmentation: list.filter((e) => (e.task_type || "classification") === "segmentation"),
      detection: list.filter((e) => (e.task_type || "classification") === "detection"),
      other: list.filter(
        (e) => !["classification", "segmentation", "detection"].includes(e.task_type || ""),
      ),
    };
  }, [filterType, filteredByClass, filteredExercises]);

  const uniqueClasses = useMemo(() => {
    const ids = new Set<string>();
    const names: Record<string, string> = {};
    exercisesList.forEach((e) => {
      const c = e.class || "Sem Turma";
      ids.add(c);
      if (e.class_name) names[c] = e.class_name;
    });
    return Array.from(ids).map((id) => ({ id, name: names[id] || id }));
  }, [exercisesList]);

  const showClassFilter = uniqueClasses.length > 1;

  const countInClass = (type: TaskType) =>
    filteredByClass.filter((e) => (e.task_type || "classification") === type).length;

  const renderExerciseCard = (exercise: ExerciseProps) => (
    <article
      key={exercise._id || ""}
      className="group flex flex-col rounded-lg border border-border bg-surface transition-colors duration-150 hover:border-secondary"
    >
      <button
        type="button"
        onClick={() => navigate(`/exercises/manage?id=${exercise._id}`)}
        className="flex-1 p-5 text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="num text-xs text-muted-foreground">
            Prazo {exercise.do_date ? formatDateTimePT(exercise.do_date) : "—"}
          </span>
          {exercise.class_name && (
            <span className="text-xs text-muted-foreground">{exercise.class_name}</span>
          )}
        </div>
        <h3 className="mt-3 font-display text-base font-semibold leading-snug">{exercise.title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Criado em {formatDateTimePT(exercise.created_at || undefined)}
        </p>
      </button>
      <footer className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
        <Tag tone="primary">{getTaskTypeLabel(exercise.task_type || "")}</Tag>
        {exercise.score > 0 && (
          <span className="num text-[11px] text-muted-foreground">Peso {exercise.score}</span>
        )}
      </footer>
    </article>
  );

  const renderGroup = (type: string, items: ExerciseProps[], label: string) => {
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

  if (loading) return <LoadingOverlay message="Carregando informações..." />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Supervisor"
        title="Exercícios"
        description="Cada exercício liga-se a um dataset e herda o tipo de tarefa dele — prática assistida com referência e prática livre sem nota imediata."
        actions={
          <button
            type="button"
            onClick={() => navigate("/exercises/manage")}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary/90"
          >
            <Plus className="size-3.5" />
            Criar exercício
          </button>
        }
      />

      <div className="flex flex-wrap gap-1.5">
        <FilterPill active={filterType === "all"} onClick={() => setFilterType("all")} count={filteredByClass.length}>
          Todos
        </FilterPill>
        {ORDER.map((type) => (
          <FilterPill
            key={type}
            active={filterType === type}
            onClick={() => setFilterType(type)}
            count={countInClass(type)}
          >
            {getTaskTypeLabel(type)}
          </FilterPill>
        ))}
      </div>

      {showClassFilter && (
        <div className="flex flex-wrap gap-1.5">
          <FilterPill active={filterClass === "all"} onClick={() => setFilterClass("all")}>
            Todas as turmas
          </FilterPill>
          {uniqueClasses.map(({ id, name }) => (
            <FilterPill key={id} active={filterClass === id} onClick={() => setFilterClass(id)}>
              {name}
            </FilterPill>
          ))}
        </div>
      )}

      {filteredExercises.length === 0 ? (
        <EmptyState
          title="Nenhum exercício encontrado."
          description="Ajuste o filtro ou crie um novo exercício."
        />
      ) : filterType === "all" ? (
        <div className="space-y-8">
          {renderGroup("classification", groupedFiltered.classification, "Classificação")}
          {renderGroup("segmentation", groupedFiltered.segmentation, "Segmentação")}
          {renderGroup("detection", groupedFiltered.detection, "Detecção de Objetos")}
          {renderGroup("other", groupedFiltered.other, "Outros")}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filteredExercises.map(renderExerciseCard)}</div>
      )}
    </div>
  );
};

export default Exercises;
