import React, { useEffect, useState, useCallback } from 'react';
import Thumbnail from '../Thumbnail/Thumbnail';
import Button from '../Fields/Button';
import {
  getLabelledMedias,
  getUnlabelledMedias,
  getLabelledMediasPaginated,
  type MediaItem,
  type PaginatedMediasResponse,
} from '../../services/MediasService';
import BoxSelector from '../BoxSelector/BoxSelector';
import { Icon } from '../Icons/Icons';
import { getDatasetById } from '../../services/datasetsService';

const PER_PAGE = 24;

interface MediaSelectorProps {
  datasetId: string;
  onSelectionChange: (selection: { labelled: string[]; unlabelled: string[] }) => void;
  taskType?: string;
}

const MediaSelector: React.FC<MediaSelectorProps> = ({ datasetId, onSelectionChange, taskType: propTaskType }) => {
  const [selectedLabelledMedias, setSelectedLabelledMedias] = useState<string[]>([]);
  const [selectedUnlabelledMedias, setSelectedUnlabelledMedias] = useState<string[]>([]);
  const [nextStep, setNextStep] = useState<number>(0);
  const [taskType, setTaskType] = useState<string>(propTaskType || 'classification');

  const [labelledPageItems, setLabelledPageItems] = useState<MediaItem[]>([]);
  const [labelledTotal, setLabelledTotal] = useState(0);
  const [labelledPage, setLabelledPage] = useState(1);
  const [loadingLabelled, setLoadingLabelled] = useState(false);

  const [allAvailableForFreeIds, setAllAvailableForFreeIds] = useState<string[]>([]);
  const [unlabelledPage, setUnlabelledPage] = useState(1);
  const [loadingUnlabelled, setLoadingUnlabelled] = useState(false);

  useEffect(() => {
    if (!propTaskType && datasetId) {
      getDatasetById(datasetId)
        .then((dataset) => setTaskType(dataset.task_type || 'classification'))
        .catch((err) => console.error('Error loading dataset task type:', err));
    } else if (propTaskType) {
      setTaskType(propTaskType);
    }
  }, [datasetId, propTaskType]);

  const isDetection = taskType === 'detection';

  const fetchLabelledPage = useCallback(async (page: number) => {
    if (!datasetId) return;
    setLoadingLabelled(true);
    try {
      const data: PaginatedMediasResponse = await getLabelledMediasPaginated(datasetId, page, PER_PAGE);
      setLabelledPageItems(data.items || []);
      setLabelledTotal(data.total ?? 0);
      setLabelledPage(data.page ?? page);
    } catch (err) {
      console.error('Erro ao buscar mídias rotuladas:', err);
      setLabelledPageItems([]);
      setLabelledTotal(0);
    } finally {
      setLoadingLabelled(false);
    }
  }, [datasetId]);

  useEffect(() => {
    if (datasetId) {
      setSelectedLabelledMedias([]);
      setSelectedUnlabelledMedias([]);
      setNextStep(0);
      setLabelledPage(1);
      setAllAvailableForFreeIds([]);
    }
  }, [datasetId]);

  useEffect(() => {
    if (datasetId && nextStep === 0 && labelledPage >= 1) {
      fetchLabelledPage(labelledPage);
    }
  }, [labelledPage, datasetId, nextStep, fetchLabelledPage]);

  useEffect(() => {
    onSelectionChange?.({ labelled: selectedLabelledMedias, unlabelled: selectedUnlabelledMedias });
  }, [selectedLabelledMedias, selectedUnlabelledMedias, onSelectionChange]);

  const handleSelectLabelled = (mediaId: string) => {
    if (selectedLabelledMedias.includes(mediaId)) {
      setSelectedLabelledMedias((prev) => prev.filter((id) => id !== mediaId));
      setSelectedUnlabelledMedias((prev) => prev.filter((id) => id !== mediaId));
    } else {
      setSelectedLabelledMedias((prev) => [...prev, mediaId]);
      setSelectedUnlabelledMedias((prev) => prev.filter((id) => id !== mediaId));
    }
  };

  const handleSelectUnlabelled = (mediaId: string) => {
    if (selectedUnlabelledMedias.includes(mediaId)) {
      setSelectedUnlabelledMedias((prev) => prev.filter((id) => id !== mediaId));
    } else if (!selectedLabelledMedias.includes(mediaId)) {
      setSelectedUnlabelledMedias((prev) => [...prev, mediaId]);
    }
  };

  const handleSelectAllOnPage = () => {
    if (nextStep === 0) {
      const pageIds = labelledPageItems.map((item) => item.file_id);
      const newSelection = Array.from(new Set([...selectedLabelledMedias, ...pageIds]));
      setSelectedLabelledMedias(newSelection);
    } else {
      const pageIds = step2PageItems.filter((id) => !selectedLabelledMedias.includes(id));
      const newSelection = Array.from(new Set([...selectedUnlabelledMedias, ...pageIds]));
      setSelectedUnlabelledMedias(newSelection);
    }
  };

  const handleClearPageSelection = () => {
    if (nextStep === 0) {
      const pageIds = new Set(labelledPageItems.map((item) => item.file_id));
      setSelectedLabelledMedias((prev) => prev.filter((id) => !pageIds.has(id)));
    } else {
      const pageIds = new Set(step2PageItems);
      setSelectedUnlabelledMedias((prev) => prev.filter((id) => !pageIds.has(id)));
    }
  };

  const handleNext = async () => {
    setLoadingUnlabelled(true);
    try {
      const [labelledIds, unlabelledIds] = await Promise.all([
        getLabelledMedias(datasetId),
        getUnlabelledMedias(datasetId),
      ]);
      const allIds = Array.from(new Set([...(labelledIds || []), ...(unlabelledIds || [])]));
      const available = allIds.filter((id) => !selectedLabelledMedias.includes(id));
      setAllAvailableForFreeIds(available);
      setSelectedUnlabelledMedias((prev) => prev.filter((id) => !selectedLabelledMedias.includes(id)));
      setUnlabelledPage(1);
      setNextStep(1);
    } catch (err) {
      console.error('Erro ao carregar mídias para prática livre:', err);
      setAllAvailableForFreeIds([]);
      setNextStep(1);
    } finally {
      setLoadingUnlabelled(false);
    }
  };

  const handleResetSelection = () => {
    setSelectedLabelledMedias([]);
    setSelectedUnlabelledMedias([]);
    setNextStep(0);
  };

  const handleBackToSupervised = () => {
    setNextStep(0);
  };

  const totalLabelledPages = Math.max(1, Math.ceil(labelledTotal / PER_PAGE));
  const step2PageItems = allAvailableForFreeIds.slice((unlabelledPage - 1) * PER_PAGE, unlabelledPage * PER_PAGE);
  const totalUnlabelledPages = Math.max(1, Math.ceil(allAvailableForFreeIds.length / PER_PAGE));

  const renderProgressBar = () => (
    <div className="media-selector__progress">
      <div className={`media-selector__progress-step ${nextStep === 0 ? 'media-selector__progress-step--active' : 'media-selector__progress-step--completed'}`}>
        <span className={`media-selector__progress-number ${nextStep === 0 ? 'media-selector__progress-number--active' : 'media-selector__progress-number--completed'}`}>
          {nextStep > 0 ? <Icon name="check" size={14} /> : '1'}
        </span>
        <span>Prática Assistida</span>
      </div>
      <div className={`media-selector__progress-line ${nextStep > 0 ? 'media-selector__progress-line--completed' : ''}`} />
      <div className={`media-selector__progress-step ${nextStep === 1 ? 'media-selector__progress-step--active' : ''}`}>
        <span className={`media-selector__progress-number ${nextStep === 1 ? 'media-selector__progress-number--active' : ''}`}>
          2
        </span>
        <span>Prática Livre</span>
      </div>
    </div>
  );

  const renderPagination = (
    total: number,
    page: number,
    totalPages: number,
    onPrev: () => void,
    onNext: () => void,
    loading: boolean
  ) => (
    <div className="media-selector__pagination">
      <button
        type="button"
        className="media-selector__pagination-btn"
        onClick={onPrev}
        disabled={page <= 1 || loading}
        title="Página anterior"
      >
        <Icon name="arrowLeft" size={16} />
      </button>
      <span className="media-selector__pagination-info">
        {page} / {totalPages} ({total} itens)
      </span>
      <button
        type="button"
        className="media-selector__pagination-btn"
        onClick={onNext}
        disabled={page >= totalPages || loading}
        title="Próxima página"
      >
        <Icon name="arrowRight" size={16} />
      </button>
    </div>
  );

  const renderToolbar = (total: number, page: number, totalPages: number, onPrev: () => void, onNext: () => void, loading: boolean) => (
    <div className="media-selector__toolbar">
      {renderPagination(total, page, totalPages, onPrev, onNext, loading)}
      <div className="media-selector__actions">
        <button type="button" className="media-selector__actions-btn" onClick={handleSelectAllOnPage}>
          <Icon name="check" size={12} />
          Selecionar página
        </button>
        <button type="button" className="media-selector__actions-btn" onClick={handleClearPageSelection}>
          <Icon name="close" size={12} />
          Limpar página
        </button>
      </div>
    </div>
  );

  return (
    <div className="media-selector">
      {renderProgressBar()}

      {nextStep === 0 && (
        <div className="media-selector__section media-selector__section--supervised">
          <div className="media-selector__header">
            <h3 className="media-selector__title">
              <Icon name="exercises" size={20} />
              Passo 1: Prática Assistida
            </h3>
            <p className="media-selector__subtitle">
              Selecione as imagens que serão corrigidas automaticamente
            </p>

            <div className="media-selector__info-box">
              <p className="media-selector__info-box-title">O que é Prática Assistida?</p>
              <p className="media-selector__info-box-text">
                {isDetection
                  ? 'Selecione as imagens que os alunos devem detectar objetos e que terão suas respostas corrigidas automaticamente usando IoU. Essas imagens já devem estar anotadas no dataset.'
                  : 'Selecione as imagens que os alunos devem rotular e que terão suas respostas corrigidas automaticamente. Essas imagens já devem estar rotuladas no dataset.'}
              </p>
            </div>

            <div className={`media-selector__counter ${selectedLabelledMedias.length > 0 ? 'media-selector__counter--has-selection' : ''}`}>
              <span className="media-selector__counter-icon">
                {selectedLabelledMedias.length > 0 ? <Icon name="check" size={14} /> : <Icon name="file" size={14} />}
              </span>
              {selectedLabelledMedias.length > 0
                ? `${selectedLabelledMedias.length} imagem(ns) selecionada(s)`
                : isDetection ? 'Selecione pelo menos uma imagem anotada' : 'Selecione pelo menos uma mídia rotulada'}
            </div>
          </div>

          {labelledTotal > 0 && renderToolbar(
            labelledTotal,
            labelledPage,
            totalLabelledPages,
            () => setLabelledPage((p) => Math.max(1, p - 1)),
            () => setLabelledPage((p) => Math.min(totalLabelledPages, p + 1)),
            loadingLabelled
          )}

          <div className="media-selector__content">
            {loadingLabelled ? (
              <div className="media-selector__loading">Carregando imagens...</div>
            ) : labelledPageItems.length > 0 ? (
              <div className="media-selector__grid">
                {labelledPageItems.map((item) => (
                  <div key={item.file_id} className="media-selector__media-item">
                    <BoxSelector
                      id={item.file_id}
                      selected={selectedLabelledMedias.includes(item.file_id)}
                      onSelect={() => handleSelectLabelled(item.file_id)}
                    >
                      <Thumbnail fileId={item.file_id} />
                    </BoxSelector>
                  </div>
                ))}
              </div>
            ) : (
              <div className="media-selector__empty">
                <div className="media-selector__empty-icon">
                  <Icon name="file" size={48} />
                </div>
                <p className="media-selector__empty-title">
                  {isDetection ? 'Nenhuma imagem anotada disponível' : 'Nenhuma mídia rotulada disponível'}
                </p>
                <p className="media-selector__empty-text">
                  {isDetection
                    ? 'Anote pelo menos uma imagem no dataset antes de criar o exercício.'
                    : 'Rotule pelo menos uma imagem no dataset antes de criar o exercício.'}
                </p>
              </div>
            )}
          </div>

          <div className="media-selector__footer">
            <Button onClick={handleResetSelection} variant="secondary" disabled={selectedLabelledMedias.length === 0}>
              <Icon name="refresh" size={14} style={{ marginRight: '6px' }} />
              Resetar Seleção
            </Button>
            <Button onClick={handleNext} disabled={selectedLabelledMedias.length === 0}>
              Próximo: Prática Livre
              <Icon name="arrowRight" size={14} style={{ marginLeft: '6px' }} />
            </Button>
          </div>
        </div>
      )}

      {nextStep === 1 && (
        <div className="media-selector__section media-selector__section--free">
          <div className="media-selector__header">
            <h3 className="media-selector__title">
              <Icon name="play" size={20} />
              Passo 2: Prática Livre (Opcional)
            </h3>
            <p className="media-selector__subtitle">
              Selecione imagens adicionais para prática sem correção automática
            </p>

            <div className="media-selector__info-box">
              <p className="media-selector__info-box-title">O que é Prática Livre?</p>
              <p className="media-selector__info-box-text">
                {isDetection
                  ? 'Selecione imagens adicionais para os alunos praticarem detecção sem correção automática (opcional, não conta pontos).'
                  : 'Selecione imagens adicionais para os alunos praticarem sem correção automática (opcional, não conta pontos).'}
              </p>
            </div>

            <div className={`media-selector__counter ${selectedUnlabelledMedias.length > 0 ? 'media-selector__counter--has-selection' : ''}`}>
              <span className="media-selector__counter-icon">
                {selectedUnlabelledMedias.length > 0 ? <Icon name="check" size={14} /> : <Icon name="file" size={14} />}
              </span>
              {selectedUnlabelledMedias.length > 0
                ? `${selectedUnlabelledMedias.length} imagem(ns) selecionada(s) para prática livre`
                : 'Nenhuma mídia selecionada (opcional)'}
            </div>
          </div>

          {allAvailableForFreeIds.length > 0 && renderToolbar(
            allAvailableForFreeIds.length,
            unlabelledPage,
            totalUnlabelledPages,
            () => setUnlabelledPage((p) => Math.max(1, p - 1)),
            () => setUnlabelledPage((p) => Math.min(totalUnlabelledPages, p + 1)),
            loadingUnlabelled
          )}

          <div className="media-selector__content">
            {loadingUnlabelled ? (
              <div className="media-selector__loading">Carregando imagens...</div>
            ) : step2PageItems.length > 0 ? (
              <div className="media-selector__grid">
                {step2PageItems.map((fileId) => (
                  <div key={fileId} className="media-selector__media-item">
                    <BoxSelector
                      selected={selectedUnlabelledMedias.includes(fileId)}
                      id={fileId}
                      onSelect={() => handleSelectUnlabelled(fileId)}
                    >
                      <Thumbnail fileId={fileId} />
                    </BoxSelector>
                  </div>
                ))}
              </div>
            ) : (
              <div className="media-selector__empty">
                <div className="media-selector__empty-icon">
                  <Icon name="file" size={48} />
                </div>
                <p className="media-selector__empty-title">Nenhuma mídia disponível para prática livre</p>
                <p className="media-selector__empty-text">
                  Todas as mídias já foram selecionadas para prática assistida ou não há mídias disponíveis no dataset.
                </p>
              </div>
            )}
          </div>

          <div className="media-selector__footer">
            <Button onClick={handleBackToSupervised} variant="secondary">
              <Icon name="arrowLeft" size={14} style={{ marginRight: '6px' }} />
              Voltar
            </Button>
            <div className="media-selector__summary">
              <strong>Resumo:</strong> {selectedLabelledMedias.length} assistida, {selectedUnlabelledMedias.length} livre
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MediaSelector;
