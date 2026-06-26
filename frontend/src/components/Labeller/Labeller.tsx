import { useEffect, useState, useRef } from 'react';
import { imagesByDatasetId } from '../../services/GridFsService';
import { saveTraining, TrainingProps, getLabelsForFile } from '../../services/TrainingService';
import { useAuth } from '../../contexts/Authentication';
import { useAlertConfirm } from '../../contexts/AlertConfirmContext';
import PolygonAnnotationEditor, { PolygonAnnotationEditorHandle } from '../PolygonAnnotationEditor/PolygonAnnotationEditor';
import SegmentationAnnotationEditor, { SegmentationAnnotationEditorHandle } from '../SegmentationAnnotationEditor/SegmentationAnnotationEditor';
import ClassificationEditor from '../ClassificationEditor/ClassificationEditor';
import { saveCOCOAnnotation, getCOCOAnnotation, COCOAnnotation } from '../../services/COCOService';
import { getSegmentationByMedia, saveSegmentation, SegmentationAnnotation } from '../../services/SegmentationService';
import { getDatasetById } from '../../services/datasetsService';
import { Icon } from '../Icons/Icons';

interface LabellerProps {
  datasetId: string;
  labels: string[];
  taskType?: string; // 'classification' or 'detection'
  onComplete?: () => void; // Callback quando todas as imagens forem rotuladas
  /** Chamado quando houve modificação (add/delete/edit) em anotações de detecção ou segmentação */
  onModification?: () => void;
  /** Lista de file_id para rotular; se fornecida, não faz fetch e usa initialIndex como início */
  initialImageIds?: string[];
  /** Índice inicial (0 = primeira imagem; usado com initialImageIds) */
  initialIndex?: number;
}

const Labeller: React.FC<LabellerProps> = ({ datasetId = '', labels = [], taskType = 'classification', onModification, initialImageIds, initialIndex = 0 }) => {
  const { user } = useAuth();
  const { alert: showAlert } = useAlertConfirm();
  const [medias, setMedias] = useState<string[]>(initialImageIds ?? []);
  const [currentIndex, setCurrentIndex] = useState<number>(initialIndex ?? 0);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [savedLabels, setSavedLabels] = useState<Record<string, string[]>>({}); // Track saved labels per file
  const [showSuccess, setShowSuccess] = useState<boolean>(false);
  const [isLoadingLabels, setIsLoadingLabels] = useState<boolean>(false);
  const [savedAnnotations, setSavedAnnotations] = useState<Record<string, COCOAnnotation[]>>({});
  const [currentAnnotations, setCurrentAnnotations] = useState<COCOAnnotation[]>([]);
  const [savedSegmentationAnnotations, setSavedSegmentationAnnotations] = useState<Record<string, SegmentationAnnotation[]>>({});
  const [currentSegmentationAnnotations, setCurrentSegmentationAnnotations] = useState<SegmentationAnnotation[]>([]);
  const [datasetTaskType, setDatasetTaskType] = useState<string>(taskType || 'classification');
  const isDetectionMode = datasetTaskType === 'detection' || datasetTaskType === 'segmentation';
  const isSegmentationMode = datasetTaskType === 'segmentation';
  const polygonEditorRef = useRef<PolygonAnnotationEditorHandle>(null);
  const segmentationEditorRef = useRef<SegmentationAnnotationEditorHandle>(null);
  const [preservedTool, setPreservedTool] = useState<string>('hand');
  const [preservedSelectedLabel, setPreservedSelectedLabel] = useState<string>('');

  useEffect(() => {
    if (!user) return;
    if (initialImageIds && initialImageIds.length > 0) {
      setMedias(initialImageIds);
      setCurrentIndex(Math.min(initialIndex, initialImageIds.length - 1));
      return;
    }
    if (datasetId) {
      async function fetchImages() {
        try {
          const res = await imagesByDatasetId(datasetId as string);
          setMedias(res);
        } catch (error) {
          console.error('Erro ao carregar imagens:', error);
        }
      }
      fetchImages();
    }
  }, [datasetId, initialImageIds, initialIndex]);

  useEffect(() => {
    if (!datasetId) return;
    getDatasetById(datasetId)
      .then((dataset) => setDatasetTaskType(dataset.task_type || 'classification'))
      .catch((error) => console.error('Erro ao carregar tipo de tarefa:', error));
  }, [datasetId]);

  // Load existing labels/annotations when changing media
  useEffect(() => {
    if (medias.length > 0 && currentIndex < medias.length && datasetId) {
      const fileId = medias[currentIndex];
      
      if (isSegmentationMode) {
        if (savedSegmentationAnnotations[fileId]) {
          setCurrentSegmentationAnnotations(savedSegmentationAnnotations[fileId]);
        } else {
          setIsLoadingLabels(true);
          getSegmentationByMedia(datasetId, fileId)
            .then((response) => {
              const annotations = response.annotations || [];
              setCurrentSegmentationAnnotations(annotations);
              setSavedSegmentationAnnotations((prev) => ({ ...prev, [fileId]: annotations }));
            })
            .catch((error) => {
              console.error('Erro ao carregar anotações de segmentação:', error);
              setCurrentSegmentationAnnotations([]);
            })
            .finally(() => setIsLoadingLabels(false));
        }
      } else if (isDetectionMode) {
        if (savedAnnotations[fileId]) {
          setCurrentAnnotations(savedAnnotations[fileId]);
        } else {
          setIsLoadingLabels(true);
          getCOCOAnnotation(datasetId, fileId)
            .then((response) => {
              const annotations = response.annotations || [];
              setCurrentAnnotations(annotations);
              setSavedAnnotations((prev) => ({ ...prev, [fileId]: annotations }));
            })
            .catch((error) => {
              console.error('Erro ao carregar anotações COCO:', error);
              setCurrentAnnotations([]);
            })
            .finally(() => setIsLoadingLabels(false));
        }
      } else {
        // Load classification labels
        if (savedLabels[fileId]) {
          setSelectedLabels(savedLabels[fileId]);
          setTimeout(() => {
            const checkboxes = document.querySelectorAll<HTMLInputElement>(
              '.labeller__label input[type="checkbox"]'
            );
            checkboxes.forEach((checkbox) => {
              checkbox.checked = savedLabels[fileId].includes(checkbox.value);
            });
          }, 0);
        } else {
          setIsLoadingLabels(true);
          getLabelsForFile(datasetId, fileId)
            .then((existingLabels) => {
              setSelectedLabels(existingLabels);
              setSavedLabels((prev) => ({
                ...prev,
                [fileId]: existingLabels
              }));
              setTimeout(() => {
                const checkboxes = document.querySelectorAll<HTMLInputElement>(
                  '.labeller__label input[type="checkbox"]'
                );
                checkboxes.forEach((checkbox) => {
                  checkbox.checked = existingLabels.includes(checkbox.value);
                });
              }, 0);
            })
            .catch((error) => {
              console.error('Erro ao carregar labels:', error);
              setSelectedLabels([]);
            })
            .finally(() => {
              setIsLoadingLabels(false);
            });
        }
      }
    }
  }, [currentIndex, medias, datasetId, isDetectionMode, isSegmentationMode, savedAnnotations, savedSegmentationAnnotations, savedLabels]);

  if (!user) {
    return <div>Por favor, faça login para acessar o labeller.</div>;
  }

  const currentFileId = medias.length > 0 && currentIndex < medias.length ? medias[currentIndex] : null;

  const handleSaveSegmentation = async (annotations: SegmentationAnnotation[], isExplicitSave?: boolean) => {
    if (!user || !currentFileId) {
      showAlert("Usuário não autenticado ou arquivo não encontrado");
      return;
    }
    try {
      await saveSegmentation({
        dataset_id: datasetId,
        file_id: currentFileId,
        annotations,
        update_user: user._id,
      });
      setSavedSegmentationAnnotations((prev) => ({ ...prev, [currentFileId]: annotations }));
      setCurrentSegmentationAnnotations(annotations);
      onModification?.();
      if (isExplicitSave) {
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 2000);
      }
    } catch (error: unknown) {
      console.error('Erro ao salvar anotações de segmentação:', error);
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      showAlert(`Erro ao salvar: ${err?.response?.data?.message || err?.message || 'Erro desconhecido'}`);
      throw error;
    }
  };

  const handleSaveCOCO = async (annotations: COCOAnnotation[], isExplicitSave?: boolean) => {
    if (!user || !currentFileId) {
      showAlert("Usuário não autenticado ou arquivo não encontrado");
      return;
    }

    try {
      await saveCOCOAnnotation({
        dataset_id: datasetId,
        file_id: currentFileId,
        annotations: annotations
      });

      // Update saved annotations cache
      const updatedSavedAnnotations = {
        ...savedAnnotations,
        [currentFileId]: annotations
      };
      setSavedAnnotations(updatedSavedAnnotations);
      setCurrentAnnotations(annotations);
      onModification?.();

      // Só mostrar "Anotações salvas com sucesso!" no guardar explícito (botão). Borracha = auto-save sem banner.
      if (isExplicitSave) {
        setShowSuccess(true);
        setTimeout(() => {
          setShowSuccess(false);
        }, 2000);
      }
    } catch (error: unknown) {
      console.error('Erro ao salvar anotações COCO:', error);
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      const errorMessage = err?.response?.data?.message || err?.message || "Erro desconhecido ao salvar anotações";
      showAlert(`Erro ao salvar anotações: ${errorMessage}`);
      throw error;
    }
  };

  // Navigation handlers for detection/segmentation with auto-save
  const handleNavigateWithSave = async (direction: 'prev' | 'next') => {
    const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
    
    // Check bounds
    if (newIndex < 0 || newIndex >= medias.length) return;
    
    // Use saveNow from the editor refs to save any pending changes
    if (isSegmentationMode && segmentationEditorRef.current) {
      try {
        const saved = await segmentationEditorRef.current.saveNow();
        // If something was saved, show success message
        if (saved) {
          setShowSuccess(true);
          setTimeout(() => setShowSuccess(false), 1500);
        }
      } catch {
        // Error already handled in save function
        return;
      }
    } else if (isDetectionMode && polygonEditorRef.current) {
      try {
        const saved = await polygonEditorRef.current.saveNow();
        // If something was saved, show success message
        if (saved) {
          setShowSuccess(true);
          setTimeout(() => setShowSuccess(false), 1500);
        }
      } catch {
        // Error already handled in save function
        return;
      }
    }
    
    setCurrentIndex(newIndex);
  };

  // Segmentation mode: editor poligonal (polígonos livres)
  if (isSegmentationMode) {
    return (
      <div className="labeller">
        {showSuccess && (
          <div className="labeller__success-message">
            <span className="labeller__success-icon"><Icon name="success" size={20} /></span>
            <span>Anotações salvas com sucesso!</span>
          </div>
        )}
        {medias && medias.length > 0 && currentFileId && (
          <SegmentationAnnotationEditor
            key={currentFileId}
            ref={segmentationEditorRef}
            fileId={currentFileId}
            datasetId={datasetId}
            labels={labels}
            existingAnnotations={currentSegmentationAnnotations}
            onSave={handleSaveSegmentation}
            initialTool={preservedTool as 'hand' | 'polygon' | 'eraser'}
            initialSelectedLabel={preservedSelectedLabel}
            onToolChange={(t) => setPreservedTool(t)}
            onSelectedLabelChange={setPreservedSelectedLabel}
            showNavigation
            canGoPrevious={currentIndex > 0}
            canGoNext={currentIndex < medias.length - 1}
            onPrevious={() => handleNavigateWithSave('prev')}
            onNext={() => handleNavigateWithSave('next')}
            isLastImage={currentIndex >= medias.length - 1}
            currentIndex={currentIndex}
            totalImages={medias.length}
          />
        )}
      </div>
    );
  }

  // Detection mode: editor com retângulos (COCO)
  if (isDetectionMode) {
    return (
      <div className="labeller">
        {showSuccess && (
          <div className="labeller__success-message">
            <span className="labeller__success-icon"><Icon name="success" size={20} /></span>
            <span>Anotações salvas com sucesso!</span>
          </div>
        )}
        {medias && medias.length > 0 && currentFileId && (
          <PolygonAnnotationEditor
            key={currentFileId}
            ref={polygonEditorRef}
            fileId={currentFileId}
            datasetId={datasetId}
            labels={labels}
            existingAnnotations={currentAnnotations}
            onSave={handleSaveCOCO}
            initialTool={preservedTool as 'hand' | 'rectangle' | 'eraser'}
            initialSelectedLabel={preservedSelectedLabel}
            onToolChange={(t) => setPreservedTool(t)}
            onSelectedLabelChange={setPreservedSelectedLabel}
            showNavigation
            canGoPrevious={currentIndex > 0}
            canGoNext={currentIndex < medias.length - 1}
            onPrevious={() => handleNavigateWithSave('prev')}
            onNext={() => handleNavigateWithSave('next')}
            isLastImage={currentIndex >= medias.length - 1}
            currentIndex={currentIndex}
            totalImages={medias.length}
          />
        )}
      </div>
    );
  }

  // Classification mode: use ClassificationEditor with same layout as detection/segmentation
  const handleSaveClassification = async (labelsToSave: string[]) => {
    if (!user || !currentFileId) {
      showAlert("Usuário não autenticado ou arquivo não encontrado");
      return;
    }
    try {
      const data: TrainingProps = {
        labels: labelsToSave,
        dataset_id: datasetId,
        file_id: currentFileId,
        update_user: user._id,
      };
      await saveTraining(data);
      setSavedLabels((prev) => ({ ...prev, [currentFileId]: labelsToSave }));
      setSelectedLabels(labelsToSave);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 1500);
    } catch (error: unknown) {
      console.error('Erro ao salvar rotulação:', error);
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      showAlert(`Erro ao salvar: ${err?.response?.data?.message || err?.message || 'Erro desconhecido'}`);
      throw error;
    }
  };

  const handleClassificationNavigate = (direction: 'prev' | 'next') => {
    const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= medias.length) return;
    setCurrentIndex(newIndex);
  };

  return (
    <div className="labeller">
      {showSuccess && (
        <div className="labeller__success-message">
          <span className="labeller__success-icon"><Icon name="success" size={20} /></span>
          <span>Rotulação salva com sucesso!</span>
        </div>
      )}
      {medias && medias.length > 0 && currentFileId && (
        <ClassificationEditor
          key={currentFileId}
          fileId={currentFileId}
          labels={labels}
          selectedLabels={selectedLabels}
          onLabelChange={setSelectedLabels}
          onSave={handleSaveClassification}
          isLoading={isLoadingLabels}
          showNavigation
          canGoPrevious={currentIndex > 0}
          canGoNext={currentIndex < medias.length - 1}
          onPrevious={() => handleClassificationNavigate('prev')}
          onNext={() => handleClassificationNavigate('next')}
          isLastImage={currentIndex >= medias.length - 1}
          currentIndex={currentIndex}
          totalImages={medias.length}
        />
      )}
    </div>
  );
};

export default Labeller;

