import React, { useEffect, useState, useCallback } from "react";
import Thumbnail from "../Thumbnail/Thumbnail";
import {
  getLabelledMedias,
  getUnlabelledMedias,
  getLabelledMediasPaginated,
  type MediaItem,
  type PaginatedMediasResponse,
} from "../../services/MediasService";
import BoxSelector from "../BoxSelector/BoxSelector";
import { Icon } from "../Icons/Icons";
import { getDatasetById } from "../../services/datasetsService";

const PER_PAGE = 24;

export type MediaSelectorPhase = "supervised" | "free";

interface MediaSelectorProps {
  datasetId: string;
  phase: MediaSelectorPhase;
  onSelectionChange: (selection: { labelled: string[]; unlabelled: string[] }) => void;
  taskType?: string;
}

const MediaSelector: React.FC<MediaSelectorProps> = ({
  datasetId,
  phase,
  onSelectionChange,
  taskType: propTaskType,
}) => {
  const [selectedLabelledMedias, setSelectedLabelledMedias] = useState<string[]>([]);
  const [selectedUnlabelledMedias, setSelectedUnlabelledMedias] = useState<string[]>([]);
  const [taskType, setTaskType] = useState<string>(propTaskType || "classification");

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
        .then((dataset) => setTaskType(dataset.task_type || "classification"))
        .catch((err) => console.error("Error loading dataset task type:", err));
    } else if (propTaskType) {
      setTaskType(propTaskType);
    }
  }, [datasetId, propTaskType]);

  const isDetection = taskType === "detection";

  const fetchLabelledPage = useCallback(
    async (page: number) => {
      if (!datasetId) return;
      setLoadingLabelled(true);
      try {
        const data: PaginatedMediasResponse = await getLabelledMediasPaginated(
          datasetId,
          page,
          PER_PAGE,
        );
        setLabelledPageItems(data.items || []);
        setLabelledTotal(data.total ?? 0);
        setLabelledPage(data.page ?? page);
      } catch (err) {
        console.error("Erro ao buscar mídias rotuladas:", err);
        setLabelledPageItems([]);
        setLabelledTotal(0);
      } finally {
        setLoadingLabelled(false);
      }
    },
    [datasetId],
  );

  useEffect(() => {
    if (!datasetId) return;
    setSelectedLabelledMedias([]);
    setSelectedUnlabelledMedias([]);
    setLabelledPage(1);
    setUnlabelledPage(1);
    setAllAvailableForFreeIds([]);
  }, [datasetId]);

  useEffect(() => {
    if (datasetId && phase === "supervised" && labelledPage >= 1) {
      fetchLabelledPage(labelledPage);
    }
  }, [labelledPage, datasetId, phase, fetchLabelledPage]);

  const labelledSelectionRef = React.useRef(selectedLabelledMedias);
  labelledSelectionRef.current = selectedLabelledMedias;

  useEffect(() => {
    if (!datasetId || phase !== "free") return;

    let cancelled = false;
    const labelledSnapshot = labelledSelectionRef.current;

    const loadFree = async () => {
      setLoadingUnlabelled(true);
      try {
        const [labelledIds, unlabelledIds] = await Promise.all([
          getLabelledMedias(datasetId),
          getUnlabelledMedias(datasetId),
        ]);
        if (cancelled) return;
        const allIds = Array.from(new Set([...(labelledIds || []), ...(unlabelledIds || [])]));
        const available = allIds.filter((id) => !labelledSnapshot.includes(id));
        setAllAvailableForFreeIds(available);
        setSelectedUnlabelledMedias((prev) => prev.filter((id) => !labelledSnapshot.includes(id)));
        setUnlabelledPage(1);
      } catch (err) {
        console.error("Erro ao carregar mídias para prática livre:", err);
        if (!cancelled) setAllAvailableForFreeIds([]);
      } finally {
        if (!cancelled) setLoadingUnlabelled(false);
      }
    };

    void loadFree();
    return () => {
      cancelled = true;
    };
  }, [datasetId, phase]);

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

  const step2PageItems = allAvailableForFreeIds.slice(
    (unlabelledPage - 1) * PER_PAGE,
    unlabelledPage * PER_PAGE,
  );
  const totalLabelledPages = Math.max(1, Math.ceil(labelledTotal / PER_PAGE));
  const totalUnlabelledPages = Math.max(1, Math.ceil(allAvailableForFreeIds.length / PER_PAGE));

  const handleSelectAllOnPage = () => {
    if (phase === "supervised") {
      const pageIds = labelledPageItems.map((item) => item.file_id);
      setSelectedLabelledMedias((prev) => Array.from(new Set([...prev, ...pageIds])));
    } else {
      const pageIds = step2PageItems.filter((id) => !selectedLabelledMedias.includes(id));
      setSelectedUnlabelledMedias((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const handleClearPageSelection = () => {
    if (phase === "supervised") {
      const pageIds = new Set(labelledPageItems.map((item) => item.file_id));
      setSelectedLabelledMedias((prev) => prev.filter((id) => !pageIds.has(id)));
    } else {
      const pageIds = new Set(step2PageItems);
      setSelectedUnlabelledMedias((prev) => prev.filter((id) => !pageIds.has(id)));
    }
  };

  const renderPagination = (
    total: number,
    page: number,
    totalPages: number,
    onPrev: () => void,
    onNext: () => void,
    loading: boolean,
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

  const renderToolbar = (
    total: number,
    page: number,
    totalPages: number,
    onPrev: () => void,
    onNext: () => void,
    loading: boolean,
  ) => (
    <div className="media-selector__toolbar">
      {renderPagination(total, page, totalPages, onPrev, onNext, loading)}
      <div className="media-selector__actions">
        <button type="button" className="media-selector__actions-btn" onClick={handleSelectAllOnPage}>
          <Icon name="check" size={12} />
          Selecionar página
        </button>
        <button
          type="button"
          className="media-selector__actions-btn"
          onClick={handleClearPageSelection}
        >
          <Icon name="close" size={12} />
          Limpar página
        </button>
      </div>
    </div>
  );

  if (phase === "supervised") {
    return (
      <div className="media-selector">
        <div
          className={`media-selector__counter ${selectedLabelledMedias.length > 0 ? "media-selector__counter--has-selection" : ""}`}
        >
          <span className="media-selector__counter-icon">
            {selectedLabelledMedias.length > 0 ? (
              <Icon name="check" size={14} />
            ) : (
              <Icon name="file" size={14} />
            )}
          </span>
          {selectedLabelledMedias.length > 0
            ? `${selectedLabelledMedias.length} imagem(ns) selecionada(s)`
            : isDetection
              ? "Selecione pelo menos uma imagem anotada"
              : "Selecione pelo menos uma mídia rotulada"}
        </div>

        {labelledTotal > 0 &&
          renderToolbar(
            labelledTotal,
            labelledPage,
            totalLabelledPages,
            () => setLabelledPage((p) => Math.max(1, p - 1)),
            () => setLabelledPage((p) => Math.min(totalLabelledPages, p + 1)),
            loadingLabelled,
          )}

        <div className="media-selector__content">
          {loadingLabelled ? (
            <div className="media-selector__loading">Carregando imagens…</div>
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
                {isDetection
                  ? "Nenhuma imagem anotada disponível"
                  : "Nenhuma mídia rotulada disponível"}
              </p>
              <p className="media-selector__empty-text">
                {isDetection
                  ? "Anote pelo menos uma imagem no dataset antes de criar o exercício."
                  : "Rotule pelo menos uma imagem no dataset antes de criar o exercício."}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="media-selector">
      <div
        className={`media-selector__counter ${selectedUnlabelledMedias.length > 0 ? "media-selector__counter--has-selection" : ""}`}
      >
        <span className="media-selector__counter-icon">
          {selectedUnlabelledMedias.length > 0 ? (
            <Icon name="check" size={14} />
          ) : (
            <Icon name="file" size={14} />
          )}
        </span>
        {selectedUnlabelledMedias.length > 0
          ? `${selectedUnlabelledMedias.length} imagem(ns) selecionada(s) para prática livre`
          : "Nenhuma mídia selecionada (opcional)"}
      </div>

      <p className="media-selector__summary-line">
        Assistida: {selectedLabelledMedias.length} · Livre: {selectedUnlabelledMedias.length}
      </p>

      {allAvailableForFreeIds.length > 0 &&
        renderToolbar(
          allAvailableForFreeIds.length,
          unlabelledPage,
          totalUnlabelledPages,
          () => setUnlabelledPage((p) => Math.max(1, p - 1)),
          () => setUnlabelledPage((p) => Math.min(totalUnlabelledPages, p + 1)),
          loadingUnlabelled,
        )}

      <div className="media-selector__content">
        {loadingUnlabelled ? (
          <div className="media-selector__loading">Carregando imagens…</div>
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
              Todas as mídias já foram selecionadas para prática assistida ou não há mídias
              disponíveis no dataset.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MediaSelector;
