import { useEffect, useState, useCallback, useRef } from 'react';
import { imagesByDatasetId, imagesByDatasetIdPaginated } from '../../services/GridFsService';
import { useParams, useNavigate } from 'react-router-dom';
import Thumbnail from '../Thumbnail/Thumbnail';
import Button from '../Fields/Button';
import Labeller from '../Labeller/Labeller';
import Modal from '../Modal/Modal';
import { getDatasetLabels, getDatasetById, deleteDatasetMedia } from '../../services/datasetsService';
import { useAlertConfirm } from '../../contexts/AlertConfirmContext';
import { Icon } from '../Icons/Icons';
import { getLabelsBatch } from '../../services/TrainingService';
import { getCOCOAnnotationsBatch } from '../../services/COCOService';
import { getSegmentationBatch } from '../../services/SegmentationService';
import Checkbox from '../Fields/Checkbox';
import { useCancelledFlag } from '../../hooks/useAbortableFetch';
import InlineLoader from '../InlineLoader/InlineLoader';

const PAGE_SIZE = 24;
const SCROLL_LOAD_MORE_THRESHOLD = 200;

const Gallery: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { alert: showAlert } = useAlertConfirm();
  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const [labelModalImageIds, setLabelModalImageIds] = useState<string[] | null>(null);
  const [labelModalInitialIndex, setLabelModalInitialIndex] = useState(0);
  const [labelModalLoading, setLabelModalLoading] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [labels, setLabels] = useState<string[]>([]);
  const [taskType, setTaskType] = useState<string>('classification');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const labellerModificationsRef = useRef(false);
  const { isCancelled: isCancelledFilter, reset: resetCancelledFilter } = useCancelledFlag();
  const { isCancelled: isCancelledLoad, reset: resetCancelledLoad, cancel: cancelLoad } = useCancelledFlag();

  const loadPage = useCallback(async (datasetId: string, pageNum: number, append: boolean) => {
    resetCancelledLoad();
    try {
      if (pageNum === 1) setLoading(true);
      else setLoadingMore(true);
      const res = await imagesByDatasetIdPaginated(datasetId, pageNum, PAGE_SIZE);
      if (!isCancelledLoad()) {
        setTotal(res.total);
        setImages((prev) => (append ? [...prev, ...res.file_ids] : res.file_ids));
      }
    } catch (error) {
      if (!isCancelledLoad()) {
        console.error('Erro ao carregar imagens:', error);
      }
    } finally {
      if (!isCancelledLoad()) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [isCancelledLoad, resetCancelledLoad]);

  useEffect(() => {
    if (id) {
      loadPage(id, 1, false);
    }
    return () => { cancelLoad(); };
  }, [id, loadPage, cancelLoad]);

  useEffect(() => {
    if (!id) return;
    getDatasetLabels(id).then((res: string[]) => setLabels(res)).catch((e) => console.error('Erro ao carregar labels:', e));
    getDatasetById(id).then((d) => setTaskType(d.task_type || 'classification')).catch((e) => console.error('Erro ao carregar dataset:', e));
  }, [id]);

  useEffect(() => {
    if (labelModalOpen) labellerModificationsRef.current = false;
  }, [labelModalOpen]);

  const hasMore = images.length < total && total > 0;
  const currentPage = Math.max(1, Math.ceil(images.length / PAGE_SIZE));
  const totalPages = total > 0 ? Math.ceil(total / PAGE_SIZE) : 0;

  const loadMore = useCallback(() => {
    if (!id || loadingMore || !hasMore) return;
    loadPage(id, currentPage + 1, true);
  }, [id, loadingMore, hasMore, currentPage, loadPage]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el || !id || loadingMore || !hasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight) return;
    if (scrollTop + clientHeight >= scrollHeight - SCROLL_LOAD_MORE_THRESHOLD) {
      const nextPage = currentPage + 1;
      if (nextPage <= totalPages) loadPage(id, nextPage, true);
    }
  }, [id, loadingMore, hasMore, currentPage, totalPages, loadPage]);

  const [selectedFilterLabels, setSelectedFilterLabels] = useState<Set<string>>(new Set());
  const [filterIncludeUnlabeled, setFilterIncludeUnlabeled] = useState(false);
  const [filterIncludeAnnotated, setFilterIncludeAnnotated] = useState(false);
  const [filterIncludeUnannotated, setFilterIncludeUnannotated] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filteredImages, setFilteredImages] = useState<string[]>([]);
  const [isFiltered, setIsFiltered] = useState(false);
  const [allIdsForFilter, setAllIdsForFilter] = useState<string[] | null>(null);
  const [loadingFilterIds, setLoadingFilterIds] = useState(false);

  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [imageToDelete, setImageToDelete] = useState<string | null>(null);
  const [deleteExercisesList, setDeleteExercisesList] = useState<{ id: string; title: string }[] | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleFilter = () => {
    setShowFilterModal(true);
  };

  useEffect(() => {
    if (showFilterModal && id && !allIdsForFilter) {
      setLoadingFilterIds(true);
      imagesByDatasetId(id)
        .then((ids) => setAllIdsForFilter(ids))
        .catch((e) => console.error('Erro ao carregar IDs para filtro:', e))
        .finally(() => setLoadingFilterIds(false));
    }
  }, [showFilterModal, id, allIdsForFilter]);

  const isAnnotationTask = taskType === 'detection' || taskType === 'segmentation';

  const [filterLoading, setFilterLoading] = useState(false);

  const handleApplyFilter = async () => {
    resetCancelledFilter();
    const idsToFilter = allIdsForFilter ?? images;
    if (idsToFilter.length === 0) {
      setShowFilterModal(false);
      return;
    }
    let hasSelection = false;
    if (isAnnotationTask) {
      hasSelection = filterIncludeAnnotated || filterIncludeUnannotated;
    } else {
      hasSelection = selectedFilterLabels.size > 0 || filterIncludeUnlabeled;
    }
    if (!hasSelection) {
      setIsFiltered(false);
      setFilteredImages([]);
      setShowFilterModal(false);
      return;
    }

    setFilterLoading(true);
    const selectedSet = new Set([...selectedFilterLabels].map((l) => l.toLowerCase()));

    try {
      const filtered: string[] = [];
      const BATCH_SIZE = 100;

      if (taskType === 'detection') {
        for (let i = 0; i < idsToFilter.length; i += BATCH_SIZE) {
          if (isCancelledFilter()) return;
          const batch = idsToFilter.slice(i, i + BATCH_SIZE);
          const annotationsMap = await getCOCOAnnotationsBatch(id as string, batch);
          if (isCancelledFilter()) return;
          for (const imageId of batch) {
            const hasAnnotation = annotationsMap[imageId] === true;
            if (filterIncludeAnnotated && hasAnnotation) filtered.push(imageId);
            else if (filterIncludeUnannotated && !hasAnnotation) filtered.push(imageId);
          }
        }
      } else if (taskType === 'segmentation') {
        for (let i = 0; i < idsToFilter.length; i += BATCH_SIZE) {
          if (isCancelledFilter()) return;
          const batch = idsToFilter.slice(i, i + BATCH_SIZE);
          const annotationsMap = await getSegmentationBatch(id as string, batch);
          if (isCancelledFilter()) return;
          for (const imageId of batch) {
            const hasAnnotation = annotationsMap[imageId] === true;
            if (filterIncludeAnnotated && hasAnnotation) filtered.push(imageId);
            else if (filterIncludeUnannotated && !hasAnnotation) filtered.push(imageId);
          }
        }
      } else {
        for (let i = 0; i < idsToFilter.length; i += BATCH_SIZE) {
          if (isCancelledFilter()) return;
          const batch = idsToFilter.slice(i, i + BATCH_SIZE);
          const labelsMap = await getLabelsBatch(id as string, batch);
          if (isCancelledFilter()) return;
          for (const imageId of batch) {
            const imageLabels = labelsMap[imageId] || [];
            const isUnlabeled = imageLabels.length === 0;
            const hasSelectedLabel = imageLabels.some((l) => selectedSet.has(l.toLowerCase()));
            if (hasSelectedLabel || (filterIncludeUnlabeled && isUnlabeled)) {
              filtered.push(imageId);
            }
          }
        }
      }

      if (!isCancelledFilter()) {
        setFilteredImages(filtered);
        setIsFiltered(true);
        setShowFilterModal(false);
      }
    } catch (error) {
      if (!isCancelledFilter()) {
        console.error('Error applying filter:', error);
        showAlert('Erro ao aplicar filtro. Tente novamente.');
      }
    } finally {
      setFilterLoading(false);
    }
  };

  const toggleFilterLabel = (label: string) => {
    setSelectedFilterLabels((prev) => {
      const next = new Set(prev);
      const key = label.toLowerCase();
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleFilterUnlabeled = () => setFilterIncludeUnlabeled((prev) => !prev);
  const toggleFilterAnnotated = () => setFilterIncludeAnnotated((prev) => !prev);
  const toggleFilterUnannotated = () => setFilterIncludeUnannotated((prev) => !prev);

  const handleTraining = async () => {
    if (!id) return;
    setLabelModalLoading(true);
    setLabelModalOpen(true);
    try {
      const allIds = await imagesByDatasetId(id);
      setLabelModalImageIds(allIds);
      setLabelModalInitialIndex(0);
    } catch (e) {
      console.error('Erro ao carregar imagens para rotulação:', e);
      setLabelModalOpen(false);
    } finally {
      setLabelModalLoading(false);
    }
  };

  const handleImageClick = async (imageId: string) => {
    if (!id) return;
    setLabelModalLoading(true);
    setLabelModalOpen(true);
    try {
      const allIds = await imagesByDatasetId(id);
      const idx = allIds.indexOf(imageId);
      setLabelModalImageIds(allIds);
      setLabelModalInitialIndex(idx >= 0 ? idx : 0);
    } catch (e) {
      console.error('Erro ao carregar imagens para rotulação:', e);
      setLabelModalOpen(false);
    } finally {
      setLabelModalLoading(false);
    }
  };

  const handleLabelModalComplete = () => {
    setLabelModalOpen(false);
    setLabelModalImageIds(null);
    if (id) loadPage(id, 1, false);
  };

  const removeImageFromState = (fileId: string) => {
    setImages((prev) => prev.filter((f) => f !== fileId));
    setFilteredImages((prev) => prev.filter((f) => f !== fileId));
    setTotal((prev) => Math.max(0, prev - 1));
    if (allIdsForFilter) setAllIdsForFilter((prev) => (prev ? prev.filter((f) => f !== fileId) : null));
  };

  const handleDeleteClick = async (e: React.MouseEvent, imageId: string) => {
    e.stopPropagation();
    if (!id) return;
    setDeleting(true);
    try {
      const res = await deleteDatasetMedia(id, imageId);
      if (res.deleted) {
        removeImageFromState(imageId);
        setShowDeleteConfirmModal(false);
        setImageToDelete(null);
        setDeleteExercisesList(null);
      } else if (res.in_exercises && res.exercises && res.exercises.length > 0) {
        setImageToDelete(imageId);
        setDeleteExercisesList(res.exercises);
        setShowDeleteConfirmModal(true);
      } else {
        showAlert(res.message || 'Não foi possível excluir a imagem.');
      }
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : null;
      showAlert(msg || 'Erro ao excluir imagem. Tente novamente.');
    } finally {
      setDeleting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!id || !imageToDelete) return;
    setDeleting(true);
    try {
      const res = await deleteDatasetMedia(id, imageToDelete, true);
      if (res.deleted) {
        removeImageFromState(imageToDelete);
        setShowDeleteConfirmModal(false);
        setImageToDelete(null);
        setDeleteExercisesList(null);
      } else {
        showAlert(res.message || 'Não foi possível excluir a imagem.');
      }
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : null;
      showAlert(msg || 'Erro ao excluir imagem. Tente novamente.');
    } finally {
      setDeleting(false);
    }
  };

  const displayImages = isFiltered ? filteredImages : images;

  if (loading && images.length === 0) return <InlineLoader message="Carregando imagens..." />;

  return (
    <div className="gallery" style={{ display: 'flex', flexDirection: 'column', minHeight: '70vh', height: '100%' }}>
      <div className="gallery__header" style={{ flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Button 
            variant="secondary"
            onClick={() => {
              if (id) navigate(`/datasets/new?id=${id}`);
            }}
            style={{ marginRight: 'auto' }}
          >
            <Icon name="arrowLeft" size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            Voltar para Dataset
          </Button>
          <h2 style={{ margin: 0 }}>Galeria de mídias</h2>
          {total > 0 && (
            <span style={{ fontSize: '0.9rem', color: '#666' }}>
              {isFiltered
                ? `${filteredImages.length} de ${total}`
                : `${images.length} de ${total}${totalPages > 1 ? ` · Página ${currentPage} de ${totalPages}` : ''}`}
            </span>
          )}
        </div>
        <div className="gallery__actions">
          <Button onClick={() => handleFilter()}>Filtrar</Button>
          <Button onClick={() => handleTraining()}>Rotular</Button>
        </div>
      </div>
      <div
        className="gallery__items"
        ref={scrollContainerRef}
        onScroll={handleScroll}
        style={{
          flex: '1 1 0',
          minHeight: 0,
          maxHeight: '60vh',
          overflowY: 'auto',
          overflowX: 'hidden',
          paddingBottom: 24,
        }}
      >
        {displayImages.map((imageId, index) => (
          <div
            key={`${imageId}-${index}`}
            className="gallery__item"
            style={{
              position: 'relative',
              cursor: 'pointer',
            }}
            onClick={() => handleImageClick(imageId)}
            title="Clique para rotular esta imagem"
          >
            <Thumbnail fileId={imageId} alt={`Image ${index + 1}`} />
            <button
              type="button"
              className="gallery__delete-btn"
              title="Excluir imagem do dataset"
              onClick={(e) => handleDeleteClick(e, imageId)}
              disabled={deleting}
              style={{
                position: 'absolute',
                top: '6px',
                right: '6px',
                width: '28px',
                height: '28px',
                borderRadius: '4px',
                border: 'none',
                background: 'rgba(0,0,0,0.6)',
                color: '#fff',
                cursor: deleting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
            >
              <Icon name="delete" size={14} />
            </button>
          </div>
        ))}
        {loadingMore && (
          <div style={{ width: '100%', padding: '1rem', textAlign: 'center', color: '#666' }}>
            Carregando mais...
          </div>
        )}
        {isFiltered && filteredImages.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', width: '100%' }}>
            <p>Nenhuma imagem encontrada com os filtros selecionados.</p>
          </div>
        )}
      </div>
      {!isFiltered && hasMore && total > 0 && (
        <div className="gallery__load-more" style={{ flexShrink: 0, padding: '1rem', textAlign: 'center', borderTop: '1px solid #eee' }}>
          <Button onClick={loadMore} disabled={loadingMore} variant="secondary">
            {loadingMore ? 'A carregar...' : `Carregar mais (${Math.min(images.length + PAGE_SIZE, total)} de ${total})`}
          </Button>
        </div>
      )}
      <Modal
        isOpen={labelModalOpen}
        onClose={() => {
          setLabelModalOpen(false);
          setLabelModalImageIds(null);
          labellerModificationsRef.current = false;
        }}
        size="xl"
        title="Rotular imagens do dataset"
        closeOnBackdropClick={false}
      >
        {labelModalLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando imagens...</div>
        ) : labelModalImageIds && labelModalImageIds.length > 0 ? (
          <Labeller
            datasetId={id as string}
            labels={labels}
            taskType={taskType}
            initialImageIds={labelModalImageIds}
            initialIndex={labelModalInitialIndex}
            onComplete={handleLabelModalComplete}
            onModification={() => { labellerModificationsRef.current = true; }}
          />
        ) : (
          <div style={{ padding: '2rem', textAlign: 'center' }}>Nenhuma imagem para rotular.</div>
        )}
      </Modal>

      {/* Filter Modal */}
      <Modal
        isOpen={showFilterModal}
        onClose={() => {
          setShowFilterModal(false);
          setAllIdsForFilter(null);
        }}
        size="md"
        title="Filtrar Imagens"
      >
        <div style={{ padding: '1rem' }}>
          {loadingFilterIds ? (
            <p>Carregando lista de imagens...</p>
          ) : (
            <>
              {isAnnotationTask ? (
                <>
                  <p style={{ marginBottom: '1rem', fontSize: '0.9rem', color: '#555' }}>
                    Filtrar imagens por presença de anotações:
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                    <Checkbox
                      label="Contém anotação"
                      checked={filterIncludeAnnotated}
                      onChange={toggleFilterAnnotated}
                    />
                    <Checkbox
                      label="Não contém anotação"
                      checked={filterIncludeUnannotated}
                      onChange={toggleFilterUnannotated}
                    />
                  </div>
                </>
              ) : (
                <>
                  <p style={{ marginBottom: '1rem', fontSize: '0.9rem', color: '#555' }}>
                    Selecione os rótulos ou &quot;Não rotulada&quot; para filtrar as imagens:
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                    {labels.map((label) => (
                      <Checkbox
                        key={label}
                        label={label}
                        checked={selectedFilterLabels.has(label.toLowerCase())}
                        onChange={() => toggleFilterLabel(label)}
                      />
                    ))}
                    <Checkbox
                      label="Não rotulada"
                      checked={filterIncludeUnlabeled}
                      onChange={toggleFilterUnlabeled}
                    />
                  </div>
                  {labels.length === 0 && (
                    <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '1rem' }}>
                      Este dataset ainda não tem classes definidas. Adicione classes primeiro.
                    </p>
                  )}
                </>
              )}
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <Button
                  onClick={handleApplyFilter}
                  disabled={
                    filterLoading ||
                    (isAnnotationTask
                      ? !filterIncludeAnnotated && !filterIncludeUnannotated
                      : labels.length === 0 && !filterIncludeUnlabeled)
                  }
                >
                  {filterLoading ? 'Filtrando...' : 'Aplicar Filtro'}
                </Button>
                <Button
                  variant="secondary"
                  disabled={filterLoading}
                  onClick={() => {
                    setSelectedFilterLabels(new Set());
                    setFilterIncludeUnlabeled(false);
                    setFilterIncludeAnnotated(false);
                    setFilterIncludeUnannotated(false);
                    setIsFiltered(false);
                    setFilteredImages([]);
                    setShowFilterModal(false);
                  }}
                >
                  Limpar
                </Button>
                {filterLoading && (
                  <span style={{ fontSize: '0.85rem', color: '#666' }}>
                    Processando {allIdsForFilter?.length || images.length} imagens...
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Modal de confirmação: imagem em exercícios */}
      <Modal
        isOpen={showDeleteConfirmModal}
        onClose={() => {
          if (!deleting) {
            setShowDeleteConfirmModal(false);
            setImageToDelete(null);
            setDeleteExercisesList(null);
          }
        }}
        size="md"
        title="Excluir imagem do dataset"
      >
        <div style={{ padding: '1rem' }}>
          <p style={{ marginBottom: '1rem', color: '#333' }}>
            Esta imagem está atribuída a <strong>{deleteExercisesList?.length ?? 0} exercício(s)</strong>. Ao confirmar, ela será removida do dataset e retirada desses exercícios.
          </p>
          {deleteExercisesList && deleteExercisesList.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.5rem' }}>Exercícios afetados:</p>
              <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.9rem' }}>
                {deleteExercisesList.map((ex) => (
                  <li key={ex.id}>{ex.title || ex.id}</li>
                ))}
              </ul>
            </div>
          )}
          <p style={{ marginBottom: '1.25rem', fontSize: '0.9rem', color: '#d32f2f' }}>
            Esta ação não pode ser desfeita. Deseja continuar?
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
            <Button
              variant="secondary"
              onClick={() => {
                setShowDeleteConfirmModal(false);
                setImageToDelete(null);
                setDeleteExercisesList(null);
              }}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? 'A excluir...' : 'Confirmar exclusão'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Gallery;
