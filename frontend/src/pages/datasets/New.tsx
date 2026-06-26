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
import Button from "../../components/Fields/Button";
import InputTagger from "../../components/Fields/InputTagger";
import { useAuth } from "../../contexts/Authentication";
import { useAlertConfirm } from "../../contexts/AlertConfirmContext";
import { imagesByDatasetId } from "../../services/GridFsService";
import { downloadDatasetZipWithConfig } from "../../services/ExportService";
import InlineLoader from "../../components/InlineLoader/InlineLoader";
import { Icon } from "../../components/Icons/Icons";
import Card from "../../components/Card/Card";
import ExportConfigModal, { type ExportConfig } from "../../components/ExportConfigModal/ExportConfigModal";

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
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

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

  const handleExportConfirm = async (config: ExportConfig) => {
    const targetId = datasetId || id || dataset._id;
    if (!targetId) return;
    setExporting(true);
    try {
      await downloadDatasetZipWithConfig(targetId, {
        mode: config.mode,
        split_mode: config.split_mode,
        train_pct: config.train_pct,
        val_pct: config.val_pct,
        test_pct: config.test_pct,
        include_train: config.include_train,
        include_val: config.include_val,
        include_test: config.include_test,
        manual_splits: config.manual_splits,
        max_width: config.max_width,
        jpeg_quality: config.jpeg_quality,
        keep_original_resolution: config.keep_original_resolution,
        include_unlabeled: config.include_unlabeled,
        seed: config.seed,
      });
      showAlert(`Dataset "${dataset.dataset_name}" exportado (ZIP) com sucesso!`);
      setExportModalOpen(false);
    } catch (error: unknown) {
      console.error("Erro ao exportar dataset:", error);
      const err = error as { response?: { data?: { message?: string } } };
      const errorMessage = err?.response?.data?.message || "Erro ao exportar dataset";
      showAlert(`Erro ao exportar: ${errorMessage}`);
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <InlineLoader message="Carregando informações..." />;

  return (
    <div className="new-dataset__content">
      <div className="new-dataset__header">
        <h1 className="page-title">{id ? "Editar dataset" : "Novo dataset"}</h1>
      </div>
      {isDirty && (id || datasetId || dataset._id) && (
        <div
          role="alert"
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: '#f8d7da',
            border: '1px solid #f5c6cb',
            borderRadius: '8px',
            color: '#721c24',
            marginBottom: '1rem',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <Icon name="error" size={20} />
          Há alterações não salvas no dataset. Clique em &quot;Salvar&quot; para guardar.
        </div>
      )}
      <div className="new-dataset__form">
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

        <div className="new-dataset__selectables">
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
            label={dataset.task_type === 'detection' ? 'Classes (ex: carro, moto, caminhão)' : 'Rótulos'}
            onChange={(newTags: string[]) => {
              setIsDirty(true);
              setDataset((prev: TDataset) => ({
                ...prev,
                labels: newTags,
              }));
            }}
          />
        </div>
        {saveSuccess && (
          <div style={{
            padding: '1rem',
            backgroundColor: '#d4edda',
            border: '1px solid #c3e6cb',
            borderRadius: '8px',
            color: '#155724',
            marginBottom: '1rem',
            fontWeight: '600'
          }}>
            <Icon name="check" size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
            Dataset salvo com sucesso!
          </div>
        )}
        {id && imageCount === 0 && (
          <div style={{
            padding: '1rem',
            backgroundColor: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: '8px',
            color: '#856404',
            marginBottom: '1rem',
            fontWeight: '600'
          }}>
            Este dataset ainda não possui imagens. Use o botão "Adicionar mídias" abaixo para adicionar imagens ao dataset.
          </div>
        )}
        <div className="new-dataset__buttons" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          <Button onClick={() => handleSave()} disabled={isSaving}>
            {isSaving ? 'Salvando...' : 'Salvar'}
          </Button>
          {(datasetId || id || dataset._id) ? (
            <>
              <Button 
                onClick={() => {
                  const targetId = datasetId || id || dataset._id;
                  if (targetId) {
                    handleUploadPage(targetId);
                  }
                }} 
                variant="secondary"
                style={{ backgroundColor: '#4CAF50', color: 'white', border: 'none' }}
              >
                Adicionar mídias
              </Button>
              <Button 
                onClick={() => {
                  const targetId = datasetId || id || dataset._id;
                  if (targetId) {
                    handleGalleryPage(targetId);
                  }
                }} 
                variant="secondary"
              >
                Ver mídias cadastradas {imageCount > 0 && `(${imageCount})`}
              </Button>
              <Button 
                onClick={() => setExportModalOpen(true)}
                variant="secondary"
                disabled={exporting}
              >
                <Icon name="download" size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                {exporting ? 'A exportar…' : 'Exportar dataset'}
              </Button>
            </>
          ) : (
            <div style={{ 
              padding: '0.75rem 1rem', 
              backgroundColor: '#fff3cd', 
              border: '1px solid #ffc107', 
              borderRadius: '4px',
              fontSize: '0.9rem',
              color: '#856404'
            }}>
              Salve o dataset primeiro para adicionar mídias
            </div>
          )}
        </div>
      </div>

      {(id || datasetId) && (
        <div className="new-dataset__exercises" style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #e0e0e0' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#333', marginBottom: '1rem' }}>
            Exercícios que usam este dataset ({exercisesForDataset.length})
          </h2>
          {exercisesForDataset.length === 0 ? (
            <p style={{ color: '#666', fontStyle: 'italic' }}>Nenhum exercício foi criado com este dataset ainda.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
              {exercisesForDataset.map((ex) => (
                <Card
                  key={ex._id ?? ''}
                  title={ex.title}
                  description={
                    [
                      ex.class_name && `Turma: ${ex.class_name}`,
                      ex.do_date && `Prazo: ${new Date(ex.do_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`,
                    ].filter(Boolean).join(' · ') || '—'
                  }
                  footer={
                    <Button
                      variant="secondary"
                      onClick={() => navigate(`/exercises/manage?id=${ex._id}`)}
                      style={{ marginTop: '0.5rem' }}
                    >
                      <Icon name="edit" size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                      Abrir exercício
                    </Button>
                  }
                  cardStyle="card card--default"
                />
              ))}
            </div>
          )}
        </div>
      )}

      <ExportConfigModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        datasetId={datasetId || id || dataset._id || ""}
        datasetName={dataset.dataset_name || ""}
        taskType={dataset.task_type || "classification"}
        onExport={handleExportConfirm}
      />
    </div>
  );
}


export default NewDataset;