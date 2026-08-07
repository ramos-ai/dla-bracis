import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  editDataset,
  getDatasetById,
  saveDataset,
  TDataset,
  updateDatasetLabels,
} from "../../services/datasetsService";
import { getExercisesByDatasetId } from "../../services/ExercisesService";
import type { ExerciseProps } from "../../services/ExercisesService";
import InputField from "../../components/Fields/InputField";
import TextareaField from "../../components/Fields/TextareaField";
import SelectField from "../../components/Fields/SelectField";
import InputTagger from "../../components/Fields/InputTagger";
import { useAuth } from "../../contexts/Authentication";
import { useAlertConfirm } from "../../contexts/AlertConfirmContext";
import { imagesByDatasetId } from "../../services/GridFsService";
import InlineLoader from "../../components/InlineLoader/InlineLoader";
import { Icon } from "../../components/Icons/Icons";
import { PageHeader, Panel, EmptyState, Tag } from "../../components/dla";
import { Download, Images, ImageUp, Save } from "lucide-react";

const NewDataset: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { alert: showAlert } = useAlertConfirm();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const [datasetId, setDatasetId] = useState<string | undefined>(id || undefined);
  const [dataset, setDataset] = useState<TDataset>({
    _id: "",
    user_id: user?._id || "",
    dataset_name: "",
    description: "",
    task_type: "",
    visibility: "",
    labels: [],
  });
  const [loading, setLoading] = useState(true);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [imageCount, setImageCount] = useState<number>(0);
  const [isDirty, setIsDirty] = useState(false);
  const [exercisesForDataset, setExercisesForDataset] = useState<ExerciseProps[]>([]);

  useEffect(() => {
    async function fetchData() {
      try {
        const data = await getDatasetById(id!);
        setDataset(data);
        setDatasetId(id!);
        setIsDirty(false);
        setLoading(false);
      } catch (error) {
        console.error("Erro ao buscar dataset:", error);
        setLoading(false);
      }
    }

    if (id) {
      setDatasetId(id);
      fetchData();
    } else {
      setIsDirty(false);
      setLoading(false);
    }
  }, [id]);

  // Update user_id when user changes
  useEffect(() => {
    if (user?._id && !id) {
      setDataset((prev) => ({
        ...prev,
        user_id: user._id,
      }));
    }
  }, [user, id]);

  // Load image count when dataset ID is available
  useEffect(() => {
    const loadImageCount = async () => {
      const currentId = datasetId || id;
      if (currentId) {
        try {
          const images = await imagesByDatasetId(currentId);
          setImageCount(images.length);
        } catch (error) {
          console.error('Erro ao carregar contagem de imagens:', error);
          setImageCount(0);
        }
      } else {
        setImageCount(0);
      }
    };
    loadImageCount();
  }, [id, datasetId]);

  // Load exercises that use this dataset (when editing)
  useEffect(() => {
    const currentId = datasetId || id;
    if (!currentId) {
      setExercisesForDataset([]);
      return;
    }
    getExercisesByDatasetId(currentId)
      .then(setExercisesForDataset)
      .catch(() => setExercisesForDataset([]));
  }, [id, datasetId]);

  const handleSave = async () => {
    if (id) {
      await handleEdit();
    } else {
      try {
        setIsSaving(true);
        setSaveSuccess(false);
        
        // Ensure user_id is set from authenticated user
        if (!user?._id) {
          showAlert("Usuário não autenticado");
          setIsSaving(false);
          return;
        }
        
        // Validate required fields
        if (!dataset.dataset_name || dataset.dataset_name.trim().length < 3) {
          showAlert("O nome do dataset deve ter pelo menos 3 caracteres");
          setIsSaving(false);
          return;
        }
        
        if (!dataset.description || dataset.description.trim().length < 10) {
          showAlert("A descrição deve ter pelo menos 10 caracteres");
          setIsSaving(false);
          return;
        }
        
        if (!dataset.task_type) {
          showAlert("Selecione um tipo de tarefa");
          setIsSaving(false);
          return;
        }
        
        if (!dataset.visibility) {
          showAlert("Selecione uma visibilidade");
          setIsSaving(false);
          return;
        }
        
        // Validate labels/classes - obrigatório e deve ter pelo menos 1
        if (!dataset.labels || dataset.labels.length === 0) {
          const labelText = dataset.task_type === 'detection' 
            ? 'classe (ex: carro, moto, caminhão)' 
            : 'rótulo (label)';
          showAlert(`É obrigatório adicionar pelo menos uma ${labelText} ao dataset antes de salvar.`);
          setIsSaving(false);
          return;
        }
        
        // Note: Não validamos imagens aqui porque o usuário precisa salvar primeiro para ter o ID do dataset
        // antes de poder adicionar mídias. As imagens podem ser adicionadas após salvar.
        
        const datasetToSave = {
          ...dataset,
          user_id: user._id,
        };
        
        const response = await saveDataset(datasetToSave);
        const savedDatasetId = response.data.id;
        
        // Update ALL state immediately so buttons appear - THIS IS CRITICAL
        // Update dataset._id first
        setDataset((prev) => ({
          ...prev,
          _id: savedDatasetId
        }));
        
        // Then update datasetId state
        setDatasetId(savedDatasetId);
        setSaveSuccess(true);
        setIsDirty(false);
        
        // Update URL using navigate to ensure proper re-render
        navigate(`/datasets/new?id=${savedDatasetId}`, { replace: true });
        
        // Load image count for the new dataset
        try {
          const images = await imagesByDatasetId(savedDatasetId);
          setImageCount(images.length);
        } catch (error) {
          console.error('Erro ao carregar contagem de imagens:', error);
          setImageCount(0);
        }
        
        // Hide success message after 3 seconds
        setTimeout(() => {
          setSaveSuccess(false);
        }, 3000);

      } catch (error: unknown) {
        console.error("Erro ao salvar os dados:", error);
        const err = error as { message?: string };
        showAlert(`Erro ao salvar: ${err.message || "Erro desconhecido"}`);
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleEdit = async () => {
    try {
      setIsSaving(true);
      setSaveSuccess(false);
      
      // Validate labels/classes - obrigatório e deve ter pelo menos 1
      if (!dataset.labels || dataset.labels.length === 0) {
        const labelText = dataset.task_type === 'detection' 
          ? 'classe (ex: carro, moto, caminhão)' 
          : 'rótulo (label)';
        showAlert(`É obrigatório adicionar pelo menos uma ${labelText} ao dataset antes de salvar.`);
        setIsSaving(false);
        return;
      }
      
      // Save dataset basic info
      const response = await editDataset(dataset);
      const datasetId = response.data.id;

      // Update labels separately to ensure they're saved
      if (dataset.labels && dataset.labels.length > 0) {
        try {
          await updateDatasetLabels(datasetId, dataset.labels);
        } catch (labelError: unknown) {
          console.error("Erro ao atualizar labels:", labelError);
        }
      }

      setDatasetId(datasetId);
      setSaveSuccess(true);
      setIsDirty(false);
      
      // Reload dataset to get updated data
      try {
        const updatedData = await getDatasetById(datasetId);
        setDataset(updatedData);
      } catch (reloadError) {
        console.error("Erro ao recarregar dataset:", reloadError);
      }
      
      // Hide success message after 3 seconds
      setTimeout(() => {
        setSaveSuccess(false);
      }, 3000);
    } catch (error: unknown) {
      console.error("Erro ao salvar os dados:", error);
      const err = error as { message?: string };
      showAlert(`Erro ao salvar: ${err.message || "Erro desconhecido"}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUploadPage = (id: string) => {
    navigate(`/datasets/${id}/media-uploader`);
  };

  const handleGalleryPage = (datasetId: string) => {
    navigate(`/datasets/${datasetId}/gallery`);
  };

  if (loading) return <InlineLoader message="Carregando informações..." />;

  const targetId = datasetId || id || dataset._id;
  const taskLabel =
    dataset.task_type === "classification"
      ? "Classificação"
      : dataset.task_type === "segmentation"
        ? "Segmentação"
        : dataset.task_type === "detection"
          ? "Detecção de Objetos"
          : dataset.task_type;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={id ? `Dataset · ${id.slice(-6)}` : "Novo"}
        title={id ? dataset.dataset_name || "Editar dataset" : "Novo dataset"}
        description="O tipo de tarefa é escolhido uma única vez e define o editor usado na rotulação de todas as mídias."
        actions={
          <>
            <button
              type="button"
              onClick={() => navigate("/datasets")}
              className="rounded-md border border-border px-3.5 py-2 text-xs font-semibold transition-colors duration-150 hover:border-secondary"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={() => handleSave()}
              disabled={isSaving}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary/90 disabled:opacity-50"
            >
              <Save className="size-3.5" />
              {isSaving ? "Salvando…" : "Guardar"}
            </button>
          </>
        }
      />

      {isDirty && targetId && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
        >
          <Icon name="error" size={18} />
          Há alterações não salvas. Clique em &quot;Guardar&quot; para guardar.
        </div>
      )}

      {saveSuccess && (
        <div className="rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm font-medium text-success">
          Dataset salvo com sucesso!
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Definições" hint="Identificação e rótulos">
          <div className="space-y-1">
            <InputField
              label="Nome do dataset"
              name="dataset_name"
              value={dataset.dataset_name}
              onChange={(e) => {
                setIsDirty(true);
                setDataset((prev: TDataset) => ({
                  ...prev,
                  dataset_name: e.target.value,
                }));
              }}
              placeholder="Digite o nome"
            />
            <TextareaField
              label="Descrição do dataset"
              name="description"
              value={dataset.description}
              onChange={(e) => {
                setIsDirty(true);
                setDataset((prev: TDataset) => ({
                  ...prev,
                  description: e.target.value,
                }));
              }}
              placeholder="Ex: descreva o dataset aqui"
            />
            <SelectField
              label="Tipo de tarefa"
              name="task_type"
              value={dataset?.task_type || ""}
              onChange={(e) => {
                setIsDirty(true);
                setDataset((prev: TDataset) => ({
                  ...prev,
                  task_type: e.target.value,
                }));
              }}
              required
              disabled={!!id}
              errorMessage="Escolha um tipo de tarefa"
              options={[
                { value: "classification", label: "Classificação" },
                { value: "segmentation", label: "Segmentação" },
                { value: "detection", label: "Detecção de Objetos" },
              ]}
            />
            <SelectField
              label="Visibilidade"
              name="visibility"
              value={dataset?.visibility}
              required
              errorMessage="Escolha uma das opções"
              onChange={(e) => {
                setIsDirty(true);
                setDataset((prev: TDataset) => ({
                  ...prev,
                  visibility: e.target.value,
                }));
              }}
              options={[
                { value: "public", label: "Público" },
                { value: "private", label: "Privado" },
              ]}
            />
            <InputTagger
              tags={dataset.labels}
              label={
                dataset.task_type === "detection"
                  ? "Classes (ex: carro, moto, caminhão)"
                  : "Rótulos"
              }
              onChange={(newTags: string[]) => {
                setIsDirty(true);
                setDataset((prev: TDataset) => ({
                  ...prev,
                  labels: newTags,
                }));
              }}
            />
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel title="Mídias" hint={targetId ? `${imageCount} imagem(ns)` : "Salve o dataset primeiro"}>
            {id && imageCount === 0 && (
              <p className="mb-3 text-xs text-warning">
                Este dataset ainda não possui imagens. Use &quot;Adicionar mídias&quot; para começar.
              </p>
            )}
            {targetId ? (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => handleUploadPage(targetId)}
                  className="flex items-center justify-center gap-1.5 rounded-md border border-border px-3.5 py-2 text-xs font-semibold transition-colors hover:border-secondary"
                >
                  <ImageUp className="size-3.5" />
                  Adicionar mídias
                </button>
                <button
                  type="button"
                  onClick={() => handleGalleryPage(targetId)}
                  className="flex items-center justify-center gap-1.5 rounded-md border border-border px-3.5 py-2 text-xs font-semibold transition-colors hover:border-secondary"
                >
                  <Images className="size-3.5" />
                  Ver galeria {imageCount > 0 && `(${imageCount})`}
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/datasets/${targetId}/export`)}
                  className="flex items-center justify-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Download className="size-3.5" />
                  Exportar dataset
                </button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Salve o dataset primeiro para adicionar mídias.
              </p>
            )}
            {taskLabel && (
              <div className="mt-4 border-t border-border pt-3">
                <Tag tone="primary">{taskLabel}</Tag>
              </div>
            )}
          </Panel>

          {(id || datasetId) && (
            <Panel title="Exercícios ligados" hint={`${exercisesForDataset.length} exercício(s)`}>
              {exercisesForDataset.length === 0 ? (
                <EmptyState title="Nenhum exercício usa este dataset ainda." />
              ) : (
                <div className="space-y-2">
                  {exercisesForDataset.map((ex) => (
                    <button
                      key={ex._id ?? ""}
                      type="button"
                      onClick={() => navigate(`/exercises/manage?id=${ex._id}`)}
                      className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2.5 text-left transition-colors hover:border-secondary"
                    >
                      <div>
                        <p className="text-sm font-semibold">{ex.title}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {[
                            ex.class_name && `Turma: ${ex.class_name}`,
                            ex.do_date &&
                              `Prazo: ${new Date(ex.do_date).toLocaleDateString("pt-BR")}`,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </p>
                      </div>
                      <Icon name="edit" size={14} />
                    </button>
                  ))}
                </div>
              )}
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}


export default NewDataset;