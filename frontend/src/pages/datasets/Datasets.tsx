import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Database, Download, Plus, Trash2 } from "lucide-react";
import { getDatasetsList, deleteDataset, TDataset } from "../../services/datasetsService";
import { useAuth, UserRoles } from "../../contexts/Authentication";
import { useSelectedClass } from "../../contexts/SelectedClass";
import { useAlertConfirm } from "../../contexts/AlertConfirmContext";
import Modal from "../../components/Modal/Modal";
import LoadingOverlay from "../../components/LoadingOverlay/LoadingOverlay";
import Button from "../../components/Fields/Button";
import { PageHeader, EmptyState, Tag, FilterPill } from "../../components/dla";

interface Dataset extends TDataset {
  _id: string;
  dataset_name: string;
  description: string;
}

type TaskType = "classification" | "segmentation" | "detection";
const ORDER: TaskType[] = ["classification", "segmentation", "detection"];

const getTaskTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    classification: "Classificação",
    segmentation: "Segmentação",
    detection: "Detecção de Objetos",
    all: "Todos",
  };
  return labels[type] || type;
};

const Datasets: React.FC = () => {
  const { user } = useAuth();
  const { alert: showAlert } = useAlertConfirm();
  useSelectedClass();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [exercisesCount, setExercisesCount] = useState<number>(0);
  const [filterType, setFilterType] = useState<"all" | TaskType>("all");
  const navigate = useNavigate();

  const isAdminOrTeacher = user?.role === UserRoles.ADMIN || user?.role === UserRoles.TEACHER;

  useEffect(() => {
    async function fetchData() {
      try {
        const data = await getDatasetsList();
        setDatasets(data);
      } catch (error) {
        console.error("Erro ao buscar datasets:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const handleDeleteClick = async (dataset: Dataset, event: React.MouseEvent) => {
    event.stopPropagation();
    setSelectedDataset(dataset);
    try {
      const { api } = await import("../../services/api");
      const response = await api.get("/exercises/list");
      if (response.data?.exercises) {
        setExercisesCount(
          response.data.exercises.filter((ex: { dataset?: string }) => ex.dataset === dataset._id)
            .length,
        );
      } else {
        setExercisesCount(0);
      }
    } catch {
      setExercisesCount(0);
    }
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedDataset) return;
    try {
      const response = await deleteDataset(selectedDataset._id);
      showAlert(
        `Dataset excluído com sucesso! ${response.deleted_exercises_count || 0} exercício(s) relacionado(s) também foram excluído(s).`,
      );
      setDeleteModalOpen(false);
      setSelectedDataset(null);
      setDatasets(await getDatasetsList());
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      showAlert(`Erro ao excluir dataset: ${err?.response?.data?.message || "Erro ao excluir dataset"}`);
    }
  };

  const count = (type: TaskType) => datasets.filter((d) => d.task_type === type).length;
  const list = datasets.filter((d) => filterType === "all" || d.task_type === filterType);
  const groups = filterType === "all" ? ORDER : [filterType];

  if (loading) return <LoadingOverlay message="Carregando datasets..." />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Supervisor"
        title="Datasets"
        description="Cada dataset tem um único tipo de tarefa, definido na criação — as mídias e os exercícios ligados herdam esse tipo."
        actions={
          <button
            type="button"
            onClick={() => navigate("/datasets/new")}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary/90"
          >
            <Plus className="size-3.5" />
            Novo dataset
          </button>
        }
      />

      <div className="flex flex-wrap gap-1.5">
        <FilterPill active={filterType === "all"} onClick={() => setFilterType("all")} count={datasets.length}>
          Todos
        </FilterPill>
        {ORDER.map((type) => (
          <FilterPill
            key={type}
            active={filterType === type}
            onClick={() => setFilterType(type)}
            count={count(type)}
          >
            {getTaskTypeLabel(type)}
          </FilterPill>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState
          title="Nenhum dataset neste tipo."
          description="Crie um novo dataset para começar."
        />
      ) : (
        <div className="space-y-8">
          {groups.map((type) => {
            const items = list.filter((d) => d.task_type === type);
            if (!items.length) return null;
            return (
              <section key={type} className="space-y-3">
                <div className="flex items-center gap-3 border-b border-border pb-2">
                  <h2 className="font-display text-sm font-semibold">{getTaskTypeLabel(type)}</h2>
                  <span className="num text-xs text-muted-foreground">{items.length}</span>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((d) => (
                    <article
                      key={d._id}
                      className="group flex flex-col rounded-lg border border-border bg-surface transition-colors duration-150 hover:border-secondary"
                    >
                      <button
                        type="button"
                        onClick={() => navigate(`/datasets/new?id=${d._id}`)}
                        className="flex-1 p-5 text-left"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="grid size-8 place-items-center rounded-md bg-primary-soft text-primary">
                            <Database className="size-4" strokeWidth={1.75} />
                          </span>
                          <Tag tone="primary">{getTaskTypeLabel(d.task_type)}</Tag>
                        </div>
                        <h3 className="mt-3 font-display text-base font-semibold leading-snug">
                          {d.dataset_name}
                        </h3>
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {d.description || "Sem descrição"}
                        </p>
                      </button>
                      {isAdminOrTeacher && (
                        <footer className="flex items-center justify-end gap-1 border-t border-border px-5 py-3">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/datasets/${d._id}/export`);
                            }}
                            title="Exportar dataset"
                            className="grid size-7 place-items-center rounded-md border border-border text-muted-foreground transition-colors duration-150 hover:border-secondary hover:text-foreground"
                          >
                            <Download className="size-3.5" strokeWidth={1.75} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteClick(d, e)}
                            title="Excluir"
                            className="grid size-7 place-items-center rounded-md border border-border text-muted-foreground transition-colors duration-150 hover:border-destructive hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" strokeWidth={1.75} />
                          </button>
                        </footer>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setSelectedDataset(null);
        }}
        title="Excluir dataset"
        size="sm"
      >
        <p className="text-sm text-muted-foreground">
          Você está prestes a excluir o dataset{" "}
          <strong className="text-foreground">"{selectedDataset?.dataset_name}"</strong>.
          {exercisesCount > 0 && (
            <> Esta ação também excluirá {exercisesCount} exercício(s) relacionado(s).</>
          )}
        </p>
        <div className="mt-4 flex justify-end gap-2 border-t border-border pt-4">
          <Button
            variant="secondary"
            onClick={() => {
              setDeleteModalOpen(false);
              setSelectedDataset(null);
            }}
          >
            Cancelar
          </Button>
          <Button variant="danger" onClick={handleConfirmDelete}>
            Excluir definitivamente
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default Datasets;
