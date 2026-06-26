import { useEffect, useState } from "react";
import Card from "../../components/Card/Card";
import { useNavigate } from "react-router-dom";
import { getDatasetsList, deleteDataset, TDataset } from "../../services/datasetsService";
import { downloadDatasetZipWithConfig } from "../../services/ExportService";
import { useAuth, UserRoles } from "../../contexts/Authentication";
import { useSelectedClass } from "../../contexts/SelectedClass";
import { useAlertConfirm } from "../../contexts/AlertConfirmContext";
import Modal from "../../components/Modal/Modal";
import LoadingOverlay from "../../components/LoadingOverlay/LoadingOverlay";
import Button from "../../components/Fields/Button";
import { Icon } from "../../components/Icons/Icons";
import ExportConfigModal, { type ExportConfig } from "../../components/ExportConfigModal/ExportConfigModal";

interface Dataset extends TDataset {
  _id: string;
  dataset_name: string;
  description: string;
}

const Datasets: React.FC = () => {
  const { user } = useAuth();
  const { alert: showAlert } = useAlertConfirm();
  useSelectedClass();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [exercisesCount, setExercisesCount] = useState<number>(0);
  const [filterType, setFilterType] = useState<string>('all'); // 'all', 'classification', 'segmentation', 'detection'
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [exportModalDataset, setExportModalDataset] = useState<Dataset | null>(null);
  const navigate = useNavigate();

  const isAdminOrTeacher = user?.role === UserRoles.ADMIN || user?.role === UserRoles.TEACHER;

  // Listar sempre todos os datasets (não filtrar por turma), para a página Datasets mostrar a lista completa
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

  // Lista todos os datasets (não filtrar por turma: dataset novo ainda não está em nenhum exercício)
  const datasetsToShow = datasets;

  const handleDeleteClick = async (dataset: Dataset, event: React.MouseEvent) => {
    event.stopPropagation();
    setSelectedDataset(dataset);
    
    try {
      const { api } = await import("../../services/api");
      const response = await api.get('/exercises/list');
      if (response.data && response.data.exercises) {
        const count = response.data.exercises.filter((ex: { dataset?: string }) => ex.dataset === dataset._id).length;
        setExercisesCount(count);
      } else {
        setExercisesCount(0);
      }
    } catch (error) {
      console.error('Erro ao contar exercícios:', error);
      setExercisesCount(0);
    }
    
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedDataset) return;
    
    try {
      const response = await deleteDataset(selectedDataset._id);
      showAlert(`Dataset excluído com sucesso! ${response.deleted_exercises_count || 0} exercício(s) relacionado(s) também foram excluído(s).`);
      setDeleteModalOpen(false);
      setSelectedDataset(null);
      const data = await getDatasetsList();
      setDatasets(data);
    } catch (error: unknown) {
      console.error("Erro ao excluir dataset:", error);
      const err = error as { response?: { data?: { message?: string } } };
      const errorMessage = err?.response?.data?.message || "Erro ao excluir dataset";
      showAlert(`Erro ao excluir dataset: ${errorMessage}`);
    }
  };

  const handleExportClick = (dataset: Dataset, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!dataset._id) return;
    setExportModalDataset(dataset);
  };

  const handleExportConfirm = async (config: ExportConfig) => {
    if (!exportModalDataset?._id) return;
    setExportingId(exportModalDataset._id);
    try {
      await downloadDatasetZipWithConfig(exportModalDataset._id, {
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
      showAlert(`Dataset "${exportModalDataset.dataset_name}" exportado (ZIP) com sucesso!`);
      setExportModalDataset(null);
    } catch (error: unknown) {
      console.error("Erro ao exportar dataset:", error);
      const err = error as { response?: { data?: { message?: string } } };
      const errorMessage = err?.response?.data?.message || "Erro ao exportar dataset";
      showAlert(`Erro ao exportar: ${errorMessage}`);
    } finally {
      setExportingId(null);
    }
  };

  // Filter datasets by type
  const filteredDatasets = filterType === 'all' 
    ? datasetsToShow 
    : datasetsToShow.filter(dataset => dataset.task_type === filterType);

  // Group datasets by type for display
  const groupedDatasets = {
    classification: datasetsToShow.filter(d => d.task_type === 'classification'),
    segmentation: datasetsToShow.filter(d => d.task_type === 'segmentation'),
    detection: datasetsToShow.filter(d => d.task_type === 'detection'),
    other: datasetsToShow.filter(d => !['classification', 'segmentation', 'detection'].includes(d.task_type))
  };

  const getTaskTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      'classification': 'Classificação',
      'segmentation': 'Segmentação',
      'detection': 'Detecção de Objetos',
      'all': 'Todos'
    };
    return labels[type] || type;
  };

  if (loading) return <LoadingOverlay message="Carregando datasets..." />;

  return (
    <div className="datasets">
      <style>{`
        .datasets__card-container {
          min-width: 0;
          overflow: hidden;
        }
        .datasets__card-container .card__description {
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          word-break: break-word;
        }
      `}</style>
      <div className="datasets__header">
        <h1 className="page-title">Lista de Datasets</h1>
        <Button onClick={() => navigate("/datasets/new")}>
          <Icon name="add" size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
          Criar novo
        </Button>
      </div>

      {/* Filter by Type */}
      <div className="datasets__filters" style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <Button
          variant={filterType === 'all' ? 'primary' : 'secondary'}
          onClick={() => setFilterType('all')}
          style={{ fontSize: '0.9rem' }}
        >
          Todos ({datasetsToShow.length})
        </Button>
        <Button
          variant={filterType === 'classification' ? 'primary' : 'secondary'}
          onClick={() => setFilterType('classification')}
          style={{ fontSize: '0.9rem' }}
        >
          Classificação ({groupedDatasets.classification.length})
        </Button>
        <Button
          variant={filterType === 'segmentation' ? 'primary' : 'secondary'}
          onClick={() => setFilterType('segmentation')}
          style={{ fontSize: '0.9rem' }}
        >
          Segmentação ({groupedDatasets.segmentation.length})
        </Button>
        <Button
          variant={filterType === 'detection' ? 'primary' : 'secondary'}
          onClick={() => setFilterType('detection')}
          style={{ fontSize: '0.9rem' }}
        >
          Detecção de Objetos ({groupedDatasets.detection.length})
        </Button>
      </div>

      {/* Grouped Display */}
      {filterType === 'all' ? (
        <>
          {groupedDatasets.classification.length > 0 && (
            <div className="datasets__group" style={{ marginBottom: '2rem' }}>
              <h3 className="datasets__group-title" style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '1rem', color: '#333' }}>
                Classificação ({groupedDatasets.classification.length})
              </h3>
              <div className="datasets__list" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', width: '100%' }}>
                {groupedDatasets.classification.map((dataset) => (
                  <div key={dataset._id} className="datasets__card-wrapper">
                    <div className="datasets__card-container">
                      <Card
                        title={dataset.dataset_name}
                        description={dataset.description}
                        footer={`Tipo: ${getTaskTypeLabel(dataset.task_type)}`}
                        onClick={() => navigate(`/datasets/new?id=${dataset._id}`)}
                        cardStyle="card card--default"
                      />
                      {isAdminOrTeacher && (
                        <div className="datasets__card-actions">
                          <Button
                            variant="secondary"
                            onClick={(e) => handleExportClick(dataset, e)}
                            disabled={exportingId === dataset._id}
                            style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
                          >
                            <Icon name="download" size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                            {exportingId === dataset._id ? "A exportar…" : "Exportar dataset"}
                          </Button>
                          <Button
                            variant="danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClick(dataset, e);
                            }}
                            style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
                          >
                            <Icon name="delete" size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                            Excluir
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {groupedDatasets.segmentation.length > 0 && (
            <div className="datasets__group" style={{ marginBottom: '2rem' }}>
              <h3 className="datasets__group-title" style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '1rem', color: '#333' }}>
                Segmentação ({groupedDatasets.segmentation.length})
              </h3>
              <div className="datasets__list" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', width: '100%' }}>
                {groupedDatasets.segmentation.map((dataset) => (
                  <div key={dataset._id} className="datasets__card-wrapper">
                    <div className="datasets__card-container">
                      <Card
                        title={dataset.dataset_name}
                        description={dataset.description}
                        footer={`Tipo: ${getTaskTypeLabel(dataset.task_type)}`}
                        onClick={() => navigate(`/datasets/new?id=${dataset._id}`)}
                        cardStyle="card card--default"
                      />
                      {isAdminOrTeacher && (
                        <div className="datasets__card-actions">
                          <Button
                            variant="secondary"
                            onClick={(e) => handleExportClick(dataset, e)}
                            disabled={exportingId === dataset._id}
                            style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
                          >
                            <Icon name="download" size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                            {exportingId === dataset._id ? "A exportar…" : "Exportar dataset"}
                          </Button>
                          <Button
                            variant="danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClick(dataset, e);
                            }}
                            style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
                          >
                            <Icon name="delete" size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                            Excluir
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {groupedDatasets.detection.length > 0 && (
            <div className="datasets__group" style={{ marginBottom: '2rem' }}>
              <h3 className="datasets__group-title" style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '1rem', color: '#333' }}>
                Detecção de Objetos ({groupedDatasets.detection.length})
              </h3>
              <div className="datasets__list" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', width: '100%' }}>
                {groupedDatasets.detection.map((dataset) => (
                  <div key={dataset._id} className="datasets__card-wrapper">
                    <div className="datasets__card-container">
                      <Card
                        title={dataset.dataset_name}
                        description={dataset.description}
                        footer={`Tipo: ${getTaskTypeLabel(dataset.task_type)}`}
                        onClick={() => navigate(`/datasets/new?id=${dataset._id}`)}
                        cardStyle="card card--default"
                      />
                      {isAdminOrTeacher && (
                        <div className="datasets__card-actions">
                          <Button
                            variant="secondary"
                            onClick={(e) => handleExportClick(dataset, e)}
                            disabled={exportingId === dataset._id}
                            style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
                          >
                            <Icon name="download" size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                            {exportingId === dataset._id ? "A exportar…" : "Exportar dataset"}
                          </Button>
                          <Button
                            variant="danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClick(dataset, e);
                            }}
                            style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
                          >
                            <Icon name="delete" size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                            Excluir
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {groupedDatasets.other.length > 0 && (
            <div className="datasets__group" style={{ marginBottom: '2rem' }}>
              <h3 className="datasets__group-title" style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '1rem', color: '#333' }}>
                Outros ({groupedDatasets.other.length})
              </h3>
              <div className="datasets__list" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', width: '100%' }}>
                {groupedDatasets.other.map((dataset) => (
                  <div key={dataset._id} className="datasets__card-wrapper">
                    <div className="datasets__card-container">
                      <Card
                        title={dataset.dataset_name}
                        description={dataset.description}
                        footer={`Tipo: ${dataset.task_type}`}
                        onClick={() => navigate(`/datasets/new?id=${dataset._id}`)}
                        cardStyle="card card--default"
                      />
                      {isAdminOrTeacher && (
                        <div className="datasets__card-actions">
                          <Button
                            variant="secondary"
                            onClick={(e) => handleExportClick(dataset, e)}
                            disabled={exportingId === dataset._id}
                            style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
                          >
                            <Icon name="download" size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                            {exportingId === dataset._id ? "A exportar…" : "Exportar dataset"}
                          </Button>
                          <Button
                            variant="danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClick(dataset, e);
                            }}
                            style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
                          >
                            <Icon name="delete" size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                            Excluir
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="datasets__list" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', width: '100%' }}>
          {filteredDatasets.length > 0 ? (
            filteredDatasets.map((dataset) => (
              <div key={dataset._id} className="datasets__card-wrapper">
                <div className="datasets__card-container">
                  <Card
                    title={dataset.dataset_name}
                    description={dataset.description}
                    footer={`Tipo: ${getTaskTypeLabel(dataset.task_type)}`}
                    onClick={() => navigate(`/datasets/new?id=${dataset._id}`)}
                    cardStyle="card card--default"
                  />
                  {isAdminOrTeacher && (
                    <div className="datasets__card-actions">
                      <Button
                        variant="secondary"
                        onClick={(e) => handleExportClick(dataset, e)}
                        disabled={exportingId === dataset._id}
                        style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
                      >
                        <Icon name="download" size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                        {exportingId === dataset._id ? "A exportar…" : "Exportar dataset"}
                      </Button>
                      <Button
                        variant="danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClick(dataset, e);
                        }}
                        style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
                      >
                        <Icon name="delete" size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                        Excluir
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
              Nenhum dataset encontrado para o tipo "{getTaskTypeLabel(filterType)}"
            </p>
          )}
        </div>
      )}

      {/* Export Config Modal */}
      <ExportConfigModal
        isOpen={!!exportModalDataset}
        onClose={() => setExportModalDataset(null)}
        datasetId={exportModalDataset?._id || ""}
        datasetName={exportModalDataset?.dataset_name || ""}
        taskType={exportModalDataset?.task_type || "classification"}
        onExport={handleExportConfirm}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setSelectedDataset(null);
        }}
        title="Confirmar Exclusão"
        size="md"
      >
        <div className="datasets__delete-modal">
          <p><strong>Atenção!</strong></p>
          <p>
            Você está prestes a excluir o dataset <strong>"{selectedDataset?.dataset_name}"</strong>.
          </p>
          {exercisesCount > 0 && (
            <div className="datasets__delete-warning">
              <p><strong>⚠️ Esta ação também excluirá {exercisesCount} exercício(s) relacionado(s) a este dataset!</strong></p>
            </div>
          )}
          <p>Tem certeza que deseja continuar?</p>
          <div className="datasets__delete-actions">
            <Button
              variant="danger"
              onClick={handleConfirmDelete}
            >
              Sim, excluir
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setDeleteModalOpen(false);
                setSelectedDataset(null);
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>

      </div>
  );
}

export default Datasets;