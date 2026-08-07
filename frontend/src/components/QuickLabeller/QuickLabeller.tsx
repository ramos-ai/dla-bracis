import { useEffect, useState } from 'react';
import MediaViewer from '../ImageViewer/MediaViewer';
import Button from '../Fields/Button';
import { saveTraining } from '../../services/TrainingService';
import { useAuth } from '../../contexts/Authentication';
import { useAlertConfirm } from '../../contexts/AlertConfirmContext';
import PolygonAnnotationEditor from '../PolygonAnnotationEditor/PolygonAnnotationEditor';
import SegmentationAnnotationEditor from '../SegmentationAnnotationEditor/SegmentationAnnotationEditor';
import { saveCOCOAnnotation, getCOCOAnnotation } from '../../services/COCOService';
import type { COCOAnnotation } from '../../services/COCOService';
import { getSegmentationByMedia, saveSegmentation } from '../../services/SegmentationService';
import type { SegmentationAnnotation } from '../../services/SegmentationService';
import { getDatasetById } from '../../services/datasetsService';
import { getLabelsForFile } from '../../services/TrainingService';
import { Icon } from '../Icons/Icons';
import './QuickLabeller.scss';

interface QuickLabellerProps {
  datasetId: string;
  fileId: string;
  labels: string[];
  taskType?: string; // 'classification' | 'detection' | 'segmentation'
  onComplete?: () => void; // Callback quando a imagem for rotulada
  onClose?: () => void; // Callback para fechar
}

const QuickLabeller: React.FC<QuickLabellerProps> = ({ 
  datasetId = '', 
  fileId = '', 
  labels = [], 
  taskType = 'classification',
  onComplete,
  onClose 
}) => {
  const { user } = useAuth();
  const { alert: showAlert } = useAlertConfirm();
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [showSuccess, setShowSuccess] = useState<boolean>(false);
  const [isLoadingLabels, setIsLoadingLabels] = useState<boolean>(false);
  const [currentAnnotations, setCurrentAnnotations] = useState<COCOAnnotation[]>([]);
  const [currentSegmentationAnnotations, setCurrentSegmentationAnnotations] = useState<SegmentationAnnotation[]>([]);
  const [datasetTaskType, setDatasetTaskType] = useState<string>(taskType || 'classification');
  const isDetectionMode = datasetTaskType === 'detection' || datasetTaskType === 'segmentation';
  const isSegmentationMode = datasetTaskType === 'segmentation';

  useEffect(() => {
    if (!user) return;
    async function fetchTaskType() {
      try {
        const dataset = await getDatasetById(datasetId);
        setDatasetTaskType(dataset.task_type || 'classification');
      } catch (error) {
        console.error('Erro ao carregar tipo de tarefa:', error);
      }
    }
    if (datasetId) fetchTaskType();
  }, [datasetId]);

  // Load existing labels/annotations
  useEffect(() => {
    if (!fileId || !datasetId) return;
    if (isSegmentationMode) {
      setIsLoadingLabels(true);
      getSegmentationByMedia(datasetId, fileId)
        .then((response) => {
          setCurrentSegmentationAnnotations(response.annotations || []);
        })
        .catch((error) => {
          console.error('Erro ao carregar anotações de segmentação:', error);
          setCurrentSegmentationAnnotations([]);
        })
        .finally(() => setIsLoadingLabels(false));
      return;
    }
    if (isDetectionMode) {
      setIsLoadingLabels(true);
      getCOCOAnnotation(datasetId, fileId)
        .then((response) => {
          setCurrentAnnotations(response.annotations || []);
        })
        .catch((error) => {
          console.error('Erro ao carregar anotações COCO:', error);
          setCurrentAnnotations([]);
        })
        .finally(() => setIsLoadingLabels(false));
      return;
    }
    {
        // Load classification labels
        setIsLoadingLabels(true);
        getLabelsForFile(datasetId, fileId)
          .then((labels) => {
            setSelectedLabels(labels || []);
            setTimeout(() => {
              const checkboxes = document.querySelectorAll<HTMLInputElement>(
                '.quick-labeller__label input[type="checkbox"]'
              );
              checkboxes.forEach((checkbox) => {
                checkbox.checked = labels.includes(checkbox.value);
              });
            }, 0);
          })
          .catch((error) => {
            console.error('Erro ao carregar labels:', error);
            setSelectedLabels([]);
          })
          .finally(() => setIsLoadingLabels(false));
    }
  }, [fileId, datasetId, isDetectionMode, isSegmentationMode]);

  if (!user) {
    return <div>Por favor, faça login para acessar o labeller.</div>;
  }

  const UNKNOWN_LABEL = 'Sem rótulo / desconhecido';

  const handleLabelChange = (label: string) => {
    setSelectedLabels((prev) => {
      if (prev.includes(label)) {
        return prev.filter((item) => item !== label);
      }
      if (label === UNKNOWN_LABEL) {
        return [UNKNOWN_LABEL];
      }
      return [label];
    });
  };

  const handleSave = async () => {
    if (!datasetId || !fileId || !user) return;
    try {
      if (isSegmentationMode) {
        await saveSegmentation({ dataset_id: datasetId, file_id: fileId, annotations: currentSegmentationAnnotations, update_user: user._id });
      } else if (isDetectionMode) {
        await saveCOCOAnnotation({ dataset_id: datasetId, file_id: fileId, annotations: currentAnnotations });
      } else {
        // Save classification labels
        await saveTraining({
          dataset_id: datasetId,
          file_id: fileId,
          labels: selectedLabels,
          update_user: user._id,
        });
      }

      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        if (onComplete) {
          onComplete();
        }
      }, 1500);
    } catch (error) {
      console.error('Erro ao salvar rótulos:', error);
      showAlert('Erro ao salvar rótulos. Tente novamente.');
    }
  };

  const handleSaveSegmentation = async (annotations: SegmentationAnnotation[], isExplicitSave?: boolean) => {
    if (!datasetId || !fileId || !user) return;
    try {
      await saveSegmentation({ dataset_id: datasetId, file_id: fileId, annotations, update_user: user._id });
      setCurrentSegmentationAnnotations(annotations);
      if (isExplicitSave) {
        setShowSuccess(true);
        setTimeout(() => { setShowSuccess(false); onComplete?.(); }, 1500);
      }
    } catch (error) {
      console.error('Erro ao salvar anotações de segmentação:', error);
      showAlert('Erro ao salvar anotações. Tente novamente.');
    }
  };

  const handleSaveCOCO = async (annotations: COCOAnnotation[], isExplicitSave?: boolean) => {
    if (!datasetId || !fileId || !user) return;

    try {
      await saveCOCOAnnotation({
        dataset_id: datasetId,
        file_id: fileId,
        annotations: annotations
      });

      setCurrentAnnotations(annotations);
      // Só mostrar "Rótulos salvos" e fechar (onComplete) quando for guardar explícito (botão).
      // Borracha/apagar anotação faz auto-save sem fechar o modal.
      if (isExplicitSave) {
        setShowSuccess(true);
        setTimeout(() => {
          setShowSuccess(false);
          if (onComplete) {
            onComplete();
          }
        }, 1500);
      }
    } catch (error) {
      console.error('Erro ao salvar anotações COCO:', error);
      showAlert('Erro ao salvar anotações. Tente novamente.');
    }
  };

  if (isLoadingLabels) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>;
  }

  return (
    <div className="quick-labeller">
      {isSegmentationMode ? (
        <div className="quick-labeller__detection">
          <SegmentationAnnotationEditor
            fileId={fileId}
            datasetId={datasetId}
            existingAnnotations={currentSegmentationAnnotations}
            onSave={handleSaveSegmentation}
            labels={labels}
          />
        </div>
      ) : isDetectionMode ? (
        <div className="quick-labeller__detection">
          <PolygonAnnotationEditor
            fileId={fileId}
            datasetId={datasetId}
            existingAnnotations={currentAnnotations}
            onSave={handleSaveCOCO}
            labels={labels}
          />
        </div>
      ) : (
        <>
          <div className="quick-labeller__viewer">
            <MediaViewer fileId={fileId} />
          </div>
        <div className="quick-labeller__classification">
          <h3 style={{ marginBottom: '1rem' }}>Selecione um rótulo (ou Sem rótulo):</h3>
          <div className="quick-labeller__labels">
            {labels.filter((l) => l !== UNKNOWN_LABEL).map((label) => (
              <label
                key={label}
                className={`quick-labeller__label ${
                  selectedLabels.includes(label) ? 'quick-labeller__label--selected' : ''
                }`}
              >
                <input
                  type="radio"
                  name="quick-labeller-single-label"
                  value={label}
                  checked={selectedLabels.includes(label)}
                  onChange={() => handleLabelChange(label)}
                  aria-label={label}
                  style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}
                />
                {label}
              </label>
            ))}
            <label
              className={`quick-labeller__label ${
                selectedLabels.includes(UNKNOWN_LABEL) ? 'quick-labeller__label--selected' : ''
              }`}
            >
              <input
                type="radio"
                name="quick-labeller-single-label"
                value={UNKNOWN_LABEL}
                checked={selectedLabels.includes(UNKNOWN_LABEL)}
                onChange={() => handleLabelChange(UNKNOWN_LABEL)}
                aria-label="Sem rótulo / desconhecido"
                style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}
              />
              Sem rótulo / desconhecido
            </label>
          </div>
        </div>
        </>
      )}

      {showSuccess && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            backgroundColor: '#4caf50',
            color: 'white',
            padding: '1rem 1.5rem',
            borderRadius: '8px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <Icon name="check" size={20} />
          <span>Rótulos salvos com sucesso!</span>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: '1rem',
          marginTop: '1.5rem',
          justifyContent: 'flex-end',
        }}
      >
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={handleSave}>
          <Icon name="check" size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
          Salvar
        </Button>
      </div>
    </div>
  );
};

export default QuickLabeller;
