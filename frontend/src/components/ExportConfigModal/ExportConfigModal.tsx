import React, { useState, useCallback } from 'react';
import './ExportConfigModal.scss';
import Modal from '../Modal/Modal';
import Button from '../Fields/Button';
import Checkbox from '../Fields/Checkbox';
import InputField from '../Fields/InputField';
import TextareaField from '../Fields/TextareaField';
import { Icon } from '../Icons/Icons';
import {
  getLabelledMedias,
  getUnlabelledMedias,
  getExportPickerMedias,
  type PaginatedMediasResponse,
} from '../../services/MediasService';
import { getDatasetLabels } from '../../services/datasetsService';
import {
  fetchDatasetExportStats,
  downloadDatasetZipWithConfig,
  downloadDatasetZipAsync,
  type DatasetExportStats,
  type ExportConfigPayload,
} from '../../services/ExportService';
import {
  getCredentialsStatus,
  saveKaggleCredentials,
  validateKaggleCredentials,
  deleteKaggleCredentials,
  exportToKaggle,
  type KaggleExportResponse,
} from '../../services/KaggleService';
import Thumbnail from '../Thumbnail/Thumbnail';
import BoxSelector from '../BoxSelector/BoxSelector';
import InlineLoader from '../InlineLoader/InlineLoader';

const STORAGE_KEY = 'dla_export_config';
const LARGE_DATASET_THRESHOLD = 5000;

export interface ExportConfig {
  mode: 'simple' | 'custom';
  split_mode: 'auto' | 'manual';
  train_pct: number;
  val_pct: number;
  test_pct: number;
  include_train: boolean;
  include_val: boolean;
  include_test: boolean;
  manual_splits?: { train: string[]; val: string[]; test: string[] };
  max_width: number;
  jpeg_quality: number;
  keep_original_resolution: boolean;
  include_unlabeled: boolean;
  seed: number;
}

const DEFAULT_CONFIG: ExportConfig = {
  mode: 'simple',
  split_mode: 'auto',
  train_pct: 66,
  val_pct: 34,
  test_pct: 0,
  include_train: true,
  include_val: true,
  include_test: false,
  max_width: 1024,
  jpeg_quality: 85,
  keep_original_resolution: false,
  include_unlabeled: false,
  seed: 42,
};

function loadSavedConfig(): Partial<ExportConfig> {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) {
      const parsed = JSON.parse(s) as Partial<ExportConfig>;
      delete parsed.manual_splits;
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function saveConfig(config: ExportConfig) {
  try {
    const toSave = { ...config, manual_splits: undefined };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    /* ignore */
  }
}

interface ExportConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  datasetId: string;
  datasetName: string;
  taskType: string;
  totalImages?: number;
  onExport?: (config: ExportConfig) => Promise<void>;
}

const PER_PAGE = 24;

const ExportConfigModal: React.FC<ExportConfigModalProps> = ({
  isOpen,
  onClose,
  datasetId,
  datasetName,
  taskType,
  totalImages = 0,
  onExport,
}) => {
  const saved = loadSavedConfig();
  const [config, setConfig] = useState<ExportConfig>({
    ...DEFAULT_CONFIG,
    ...saved,
  });
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState<'train' | 'val' | 'test' | null>(null);
  const [pickerSelected, setPickerSelected] = useState<string[]>([]);
  const [pickerPage, setPickerPage] = useState(1);
  const [pickerItems, setPickerItems] = useState<PaginatedMediasResponse | null>(null);
  const [loadingPicker, setLoadingPicker] = useState(false);
  const [datasetStats, setDatasetStats] = useState<DatasetExportStats | null>(null);
  const [labels, setLabels] = useState<string[]>([]);
  const [pickerClassFilter, setPickerClassFilter] = useState<Set<number>>(new Set());

  // Kaggle export state
  const [kaggleModalOpen, setKaggleModalOpen] = useState(false);
  const [kaggleHasCredentials, setKaggleHasCredentials] = useState<boolean | null>(null);
  const [kaggleUsername, setKaggleUsername] = useState('');
  const [kaggleApiKey, setKaggleApiKey] = useState('');
  const [kaggleTitle, setKaggleTitle] = useState('');
  const [kaggleDescription, setKaggleDescription] = useState('');
  const [kaggleIsPrivate, setKaggleIsPrivate] = useState(true);
  const [kaggleSavingCredentials, setKaggleSavingCredentials] = useState(false);
  const [kaggleCredentialError, setKaggleCredentialError] = useState('');
  const [kaggleExporting, setKaggleExporting] = useState(false);
  const [kaggleResult, setKaggleResult] = useState<KaggleExportResponse | null>(null);

  // Fetch dataset stats and labels when modal opens
  React.useEffect(() => {
    if (isOpen && datasetId) {
      fetchDatasetExportStats(datasetId)
        .then(setDatasetStats)
        .catch(() => setDatasetStats(null));
      getDatasetLabels(datasetId)
        .then(setLabels)
        .catch(() => setLabels([]));
    } else {
      setDatasetStats(null);
      setLabels([]);
    }
  }, [isOpen, datasetId]);

  // Reset dataset-specific state when switching datasets (manual_splits são file_ids do dataset)
  React.useEffect(() => {
    if (datasetId) {
      setConfig((prev) => ({
        ...prev,
        manual_splits: undefined,
      }));
      setPickerOpen(null);
      setPickerSelected([]);
      setPickerItems(null);
      setPickerClassFilter(new Set());
    }
  }, [datasetId]);

  const totalPct = config.train_pct + config.val_pct + config.test_pct;
  const hasAnySplit = config.train_pct > 0 || config.val_pct > 0 || config.test_pct > 0;
  const pctValid = totalPct <= 100 && (config.split_mode !== 'auto' || !hasAnySplit || totalPct > 0);

  const trainCount = config.manual_splits?.train?.length ?? 0;
  const valCount = config.manual_splits?.val?.length ?? 0;
  const testCount = config.manual_splits?.test?.length ?? 0;

  // Usar pickerSelected quando o picker está aberto para atualização em tempo real
  const effectiveTrainCount = pickerOpen === 'train' ? pickerSelected.length : trainCount;
  const effectiveValCount = pickerOpen === 'val' ? pickerSelected.length : valCount;
  const effectiveTestCount = pickerOpen === 'test' ? pickerSelected.length : testCount;
  const manualExportCount = effectiveTrainCount + effectiveValCount + effectiveTestCount;
  const poolSize =
    datasetStats && config.include_unlabeled
      ? datasetStats.total
      : datasetStats?.labelled ?? 0;
  const imagesToExport =
    config.mode === 'custom' && config.split_mode === 'manual'
      ? manualExportCount
      : poolSize;
  const autoTrainCount =
    config.split_mode === 'auto' && hasAnySplit && config.train_pct > 0 && totalPct > 0
      ? Math.round((poolSize * config.train_pct) / totalPct)
      : 0;
  const autoValCount =
    config.split_mode === 'auto' && hasAnySplit && config.val_pct > 0 && totalPct > 0
      ? Math.round((poolSize * config.val_pct) / totalPct)
      : 0;
  const autoTestCount =
    config.split_mode === 'auto' && hasAnySplit && config.test_pct > 0 && totalPct > 0
      ? Math.round((poolSize * config.test_pct) / totalPct)
      : 0;
  const trainTarget = autoTrainCount;
  const showTrainCappedWarning =
    config.mode === 'custom' &&
    config.split_mode === 'auto' &&
    config.include_unlabeled &&
    hasAnySplit &&
    datasetStats &&
    trainTarget > datasetStats.labelled;

  const fetchPickerPage = useCallback(
    async (page: number, split: 'train' | 'val' | 'test', classFilterOverride?: Set<number>) => {
      if (!datasetId) return;
      setLoadingPicker(true);
      try {
        const alreadyInOtherSplits = new Set<string>();
        if (split !== 'train') {
          (config.manual_splits?.train || []).forEach((id) => alreadyInOtherSplits.add(id));
        }
        if (split !== 'val') {
          (config.manual_splits?.val || []).forEach((id) => alreadyInOtherSplits.add(id));
        }
        if (split !== 'test') {
          (config.manual_splits?.test || []).forEach((id) => alreadyInOtherSplits.add(id));
        }

        const activeFilter = classFilterOverride ?? pickerClassFilter;
        let sourceIds: string[];
        if (activeFilter.size > 0) {
          sourceIds = await getExportPickerMedias(
            datasetId,
            split,
            config.include_unlabeled && split !== 'train',
            taskType,
            [...activeFilter]
          );
        } else {
          const [labelled, unlabelled] = await Promise.all([
            getLabelledMedias(datasetId),
            split === 'train' ? Promise.resolve([]) : (config.include_unlabeled ? getUnlabelledMedias(datasetId) : Promise.resolve([])),
          ]);
          sourceIds = split === 'train' ? (labelled || []) : [...new Set([...(labelled || []), ...(unlabelled || [])])];
        }

        const allIds = sourceIds.filter((id) => !alreadyInOtherSplits.has(id));
        const total = allIds.length;
        const start = (page - 1) * PER_PAGE;
        const pageIds = allIds.slice(start, start + PER_PAGE);
        const items = pageIds.map((file_id) => ({ file_id, media_name: String(file_id) }));
        setPickerItems({
          file_ids: pageIds,
          items,
          total,
          page,
          per_page: PER_PAGE,
        });
      } catch (err) {
        console.error('Erro ao carregar imagens:', err);
        setPickerItems(null);
      } finally {
        setLoadingPicker(false);
      }
    },
    [datasetId, config.include_unlabeled, config.manual_splits, pickerClassFilter, taskType]
  );

  const openPicker = (split: 'train' | 'val' | 'test') => {
    setPickerOpen(split);
    const current = config.manual_splits?.[split] || [];
    setPickerSelected([...current]);
    setPickerPage(1);
    fetchPickerPage(1, split);
  };

  const closePicker = () => {
    if (pickerOpen && pickerSelected.length >= 0) {
      setConfig((prev) => ({
        ...prev,
        manual_splits: {
          train: prev.manual_splits?.train || [],
          val: prev.manual_splits?.val || [],
          test: prev.manual_splits?.test || [],
          [pickerOpen]: [...pickerSelected],
        },
      }));
    }
    setPickerOpen(null);
  };

  const handlePickerSelect = (fileId: string) => {
    setPickerSelected((prev) =>
      prev.includes(fileId) ? prev.filter((id) => id !== fileId) : [...prev, fileId]
    );
  };

  const handleExport = async () => {
    if (config.mode === 'custom' && config.split_mode === 'auto' && !pctValid) return;
    setExporting(true);
    setExportProgress(null);
    try {
      saveConfig(config);
      const configToExport: ExportConfigPayload = {
        mode: config.mode,
        split_mode: config.split_mode,
        train_pct: config.train_pct,
        val_pct: config.val_pct,
        test_pct: config.test_pct,
        include_train: config.train_pct > 0,
        include_val: config.val_pct > 0,
        include_test: config.test_pct > 0,
        manual_splits: config.manual_splits,
        max_width: config.max_width,
        jpeg_quality: config.jpeg_quality,
        keep_original_resolution: config.keep_original_resolution,
        include_unlabeled: config.include_unlabeled,
        seed: config.seed,
      };

      const totalToExport = datasetStats?.total ?? 0;
      const isLargeDataset = totalToExport > LARGE_DATASET_THRESHOLD;

      if (isLargeDataset) {
        setExportProgress('Iniciando exportação assíncrona para dataset grande...');
        const result = await downloadDatasetZipAsync(datasetId, configToExport, (msg) => {
          setExportProgress(msg);
        });
        if (!result.success) {
          throw new Error(result.error || 'Erro na exportação assíncrona');
        }
      } else if (onExport) {
        await onExport(config);
      } else {
        await downloadDatasetZipWithConfig(datasetId, configToExport);
      }
      onClose();
    } catch (error: unknown) {
      const err = error as Error;
      console.error('Erro ao exportar:', err);
      setExportProgress(`Erro: ${err.message || 'Falha na exportação'}`);
    } finally {
      setExporting(false);
    }
  };

  // Kaggle export functions
  const openKaggleModal = async () => {
    setKaggleModalOpen(true);
    setKaggleTitle(datasetName || '');
    setKaggleDescription('');
    setKaggleIsPrivate(true);
    setKaggleResult(null);
    setKaggleCredentialError('');
    setKaggleHasCredentials(null);

    try {
      const status = await getCredentialsStatus();
      setKaggleHasCredentials(status.has_credentials);
    } catch {
      setKaggleHasCredentials(false);
    }
  };

  const closeKaggleModal = () => {
    setKaggleModalOpen(false);
    setKaggleUsername('');
    setKaggleApiKey('');
    setKaggleCredentialError('');
    setKaggleResult(null);
  };

  const handleSaveKaggleCredentials = async () => {
    if (!kaggleUsername.trim() || !kaggleApiKey.trim()) {
      setKaggleCredentialError('Username e API Token são obrigatórios.');
      return;
    }

    setKaggleSavingCredentials(true);
    setKaggleCredentialError('');

    try {
      await saveKaggleCredentials({ username: kaggleUsername.trim(), api_key: kaggleApiKey.trim() });
      
      const validation = await validateKaggleCredentials();
      if (!validation.valid) {
        setKaggleCredentialError(validation.error || 'Credenciais inválidas. Verifique seu username e API token.');
        await deleteKaggleCredentials();
        return;
      }

      setKaggleHasCredentials(true);
      setKaggleUsername('');
      setKaggleApiKey('');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      setKaggleCredentialError(err.response?.data?.error || 'Erro ao salvar credenciais.');
    } finally {
      setKaggleSavingCredentials(false);
    }
  };

  const handleKaggleExport = async () => {
    if (!kaggleTitle.trim()) return;

    setKaggleExporting(true);
    setKaggleResult(null);

    try {
      saveConfig(config);
      const configToExport: ExportConfig = {
        ...config,
        include_train: config.train_pct > 0,
        include_val: config.val_pct > 0,
        include_test: config.test_pct > 0,
      };

      const result = await exportToKaggle(
        datasetId,
        {
          title: kaggleTitle.trim(),
          description: kaggleDescription.trim(),
          is_private: kaggleIsPrivate,
          export_config: configToExport,
        }
      );

      setKaggleResult(result);
    } catch {
      setKaggleResult({
        success: false,
        kaggle_url: null,
        error: { code: 'UNKNOWN_ERROR', message: 'Erro ao exportar para o Kaggle.' },
      });
    } finally {
      setKaggleExporting(false);
    }
  };

  const resetToDefault = () => {
    setConfig({ ...DEFAULT_CONFIG });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Exportar dataset: ${datasetName}`} size="lg">
      <div className="export-config-modal" style={{ padding: '0.5rem 0' }}>
        {/* Mode toggle */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>
            Modo de exportação
          </label>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="radio"
                name="export_mode"
                checked={config.mode === 'simple'}
                onChange={() => setConfig((c) => ({ ...c, mode: 'simple' }))}
              />
              <span>Exportação rápida (66% treino / 34% validação) — apenas imagens rotuladas</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="radio"
                name="export_mode"
                checked={config.mode === 'custom'}
                onChange={() => setConfig((c) => ({ ...c, mode: 'custom' }))}
              />
              <span>Exportação personalizada</span>
            </label>
          </div>
        </div>

        {config.mode === 'custom' && (
          <>
            {/* Dataset statistics */}
            {datasetStats && (
              <div
                style={{
                  marginBottom: '1.5rem',
                  padding: '1rem',
                  backgroundColor: '#e8f5e9',
                  borderRadius: 8,
                  border: '1px solid #c8e6c9',
                }}
              >
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>
                  Estatísticas do dataset
                </h4>
                <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.9rem' }}>
                  <span>
                    <strong>Total de imagens:</strong> {datasetStats.total}
                  </span>
                  <span>
                    <strong>Rotuladas:</strong> {datasetStats.labelled}
                  </span>
                  <span>
                    <strong>Sem anotação:</strong> {datasetStats.unlabelled}
                  </span>
                  <span>
                    <strong>Imagens a exportar:</strong> {imagesToExport}
                  </span>
                  {config.mode === 'custom' &&
                    config.split_mode === 'auto' &&
                    hasAnySplit && (
                      <span>
                        <strong>Distribuição:</strong> Treino {autoTrainCount} · Validação{' '}
                        {autoValCount} · Teste {autoTestCount}
                      </span>
                    )}
                  {config.mode === 'custom' &&
                    config.split_mode === 'manual' &&
                    (effectiveTrainCount > 0 || effectiveValCount > 0 || effectiveTestCount > 0) && (
                      <span>
                        <strong>Distribuição:</strong> Treino {effectiveTrainCount} · Validação{' '}
                        {effectiveValCount} · Teste {effectiveTestCount}
                      </span>
                    )}
                </div>
              </div>
            )}

            {showTrainCappedWarning && (
              <div
                style={{
                  marginBottom: '1.5rem',
                  padding: '1rem',
                  backgroundColor: '#fff3e0',
                  borderRadius: 8,
                  border: '1px solid #ffe0b2',
                  fontSize: '0.9rem',
                }}
              >
                <strong>Análise do dataset</strong>
                <p style={{ margin: '0.5rem 0 0 0' }}>
                  Treino solicitado: {config.train_pct}% ({trainTarget} imagens). Mas
                  existem apenas {datasetStats?.labelled} imagens rotuladas.
                </p>
                <p style={{ margin: '0.25rem 0 0 0' }}>
                  Treino terá: {datasetStats?.labelled} imagens rotuladas. As restantes
                  serão distribuídas entre validação e teste.
                </p>
              </div>
            )}

            {/* Split config */}
            <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: 8 }}>
              <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>Configuração de split</h4>
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', marginBottom: 4 }}>Tipo de split</label>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="split_mode"
                      checked={config.split_mode === 'auto'}
                      onChange={() => setConfig((c) => ({ ...c, split_mode: 'auto' }))}
                    />
                    Automático (porcentagens)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="split_mode"
                      checked={config.split_mode === 'manual'}
                      onChange={() => setConfig((c) => ({ ...c, split_mode: 'manual' }))}
                    />
                    Manual (escolher imagens)
                  </label>
                </div>
              </div>

              {config.split_mode === 'auto' && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.75rem 1.5rem',
                    alignItems: 'flex-end',
                  }}
                >
                  <div className="export-config-input-compact" style={{ width: 120 }}>
                    <InputField
                      label="Treino (%)"
                      name="train_pct"
                      type="number"
                      min={0}
                      max={100 - config.val_pct - config.test_pct}
                      value={String(config.train_pct)}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, train_pct: Math.max(0, parseFloat(e.target.value) || 0) }))
                      }
                      placeholder="0"
                    />
                  </div>
                  <div className="export-config-input-compact" style={{ width: 120 }}>
                    <InputField
                      label="Validação (%)"
                      name="val_pct"
                      type="number"
                      min={0}
                      max={100 - config.train_pct - config.test_pct}
                      value={String(config.val_pct)}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, val_pct: Math.max(0, parseFloat(e.target.value) || 0) }))
                      }
                      placeholder="0"
                    />
                  </div>
                  <div className="export-config-input-compact" style={{ width: 120 }}>
                    <InputField
                      label="Teste (%)"
                      name="test_pct"
                      type="number"
                      min={0}
                      max={100 - config.train_pct - config.val_pct}
                      value={String(config.test_pct)}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, test_pct: Math.max(0, parseFloat(e.target.value) || 0) }))
                      }
                      placeholder="0"
                    />
                  </div>
                  <span
                    style={{
                      fontSize: '0.9rem',
                      color: totalPct <= 100 ? '#2e7d32' : '#c62828',
                      fontWeight: 500,
                    }}
                  >
                    Total: {totalPct.toFixed(0)}%
                  </span>
                </div>
              )}
              {config.split_mode === 'auto' && (
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.8rem', color: '#666' }}>
                  Soma não pode exceder 100%. Com 0% num split, não é criada pasta para esse split.
                </p>
              )}

              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e0e0e0' }}>
                <Checkbox
                  label="Incluir imagens sem anotação"
                  checked={config.include_unlabeled}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, include_unlabeled: e.target.checked }))
                  }
                />
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: '#555', lineHeight: 1.4 }}>
                  Além das imagens já rotuladas, inclui no export as imagens do dataset que ainda não têm anotação.
                  O split <strong>treino</strong> usa apenas imagens rotuladas; validação e teste podem receber imagens sem anotação.
                  Configuração essencial quando pretende exportar o dataset completo para uso em pipelines de ML.
                </p>
              </div>

              {config.split_mode === 'manual' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <Button variant="secondary" onClick={() => openPicker('train')} style={{ alignSelf: 'flex-start' }}>
                    Treino: {trainCount} imagens
                  </Button>
                  <Button variant="secondary" onClick={() => openPicker('val')} style={{ alignSelf: 'flex-start' }}>
                    Validação: {valCount} imagens
                  </Button>
                  <Button variant="secondary" onClick={() => openPicker('test')} style={{ alignSelf: 'flex-start' }}>
                    Teste: {testCount} imagens
                  </Button>
                </div>
              )}
            </div>

            {/* Image options */}
            <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: 8 }}>
              <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>Imagens</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem 1.5rem', alignItems: 'center' }}>
                  <Checkbox
                    label="Manter resolução original"
                    checked={config.keep_original_resolution}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, keep_original_resolution: e.target.checked }))
                    }
                  />
                </div>
                {!config.keep_original_resolution && (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '1rem 1.5rem',
                      alignItems: 'flex-end',
                    }}
                  >
                    <div style={{ width: 140 }}>
                      <InputField
                        label="Largura máx. (px)"
                        name="max_width"
                        type="number"
                        min={64}
                        max={4096}
                        value={String(config.max_width)}
                        onChange={(e) =>
                          setConfig((c) => ({ ...c, max_width: parseInt(e.target.value, 10) || 1024 }))
                        }
                      />
                    </div>
                    <div style={{ width: 120 }}>
                      <InputField
                        label="Qualidade JPEG"
                        name="jpeg_quality"
                        type="number"
                        min={1}
                        max={100}
                        value={String(config.jpeg_quality)}
                        onChange={(e) =>
                          setConfig((c) => ({ ...c, jpeg_quality: parseInt(e.target.value, 10) || 85 }))
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Seed - only show when split_mode is auto */}
            {config.split_mode !== 'manual' && (
              <div style={{ marginBottom: '1.5rem', maxWidth: 140 }}>
                <InputField
                  label="Seed (reprodutibilidade)"
                  name="seed"
                  type="number"
                  value={String(config.seed)}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, seed: parseInt(e.target.value, 10) || 42 }))
                  }
                />
              </div>
            )}
          </>
        )}

        {/* Preview */}
        <div
          style={{
            padding: '1rem',
            backgroundColor: '#e3f2fd',
            borderRadius: 8,
            marginBottom: '1.5rem',
            fontSize: '0.9rem',
          }}
        >
          <strong>Resumo:</strong> Formato {taskType === 'detection' ? 'COCO' : taskType === 'segmentation' ? 'YOLO' : 'pastas por rótulo'}.
          {totalImages > 0 && ` ~${totalImages} imagens no dataset.`}
        </div>

        {/* Large dataset warning */}
        {datasetStats && datasetStats.total > LARGE_DATASET_THRESHOLD && (
          <div
            style={{
              padding: '1rem',
              backgroundColor: '#fff3e0',
              borderRadius: 8,
              marginBottom: '1.5rem',
              fontSize: '0.9rem',
              border: '1px solid #ffcc80',
            }}
          >
            <strong>Dataset grande detectado ({datasetStats.total.toLocaleString()} imagens)</strong>
            <p style={{ margin: '0.5rem 0 0 0' }}>
              A exportação será feita de forma assíncrona para evitar timeout. O processo pode demorar alguns minutos.
            </p>
          </div>
        )}

        {/* Export progress */}
        {exporting && (
          <div
            style={{
              padding: '1rem',
              backgroundColor: '#e8f5e9',
              borderRadius: 8,
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
            }}
          >
            <InlineLoader />
            <span>{exportProgress || 'Exportando dataset...'}</span>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <Button variant="secondary" onClick={resetToDefault}>
            <Icon name="refresh" size={14} style={{ marginRight: 6 }} />
            Restaurar padrão
          </Button>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              onClick={handleExport}
              disabled={exporting || (config.mode === 'custom' && config.split_mode === 'auto' && !pctValid)}
            >
              <Icon name="download" size={14} style={{ marginRight: 6 }} />
              {exporting ? 'A exportar…' : 'Exportar ZIP'}
            </Button>
            <Button
              onClick={openKaggleModal}
              disabled={exporting || (config.mode === 'custom' && config.split_mode === 'auto' && !pctValid)}
            >
              <Icon name="kaggle" size={16} style={{ marginRight: 6 }} />
              Exportar para Kaggle
            </Button>
          </div>
        </div>
      </div>

      {/* Image picker sub-modal */}
      {pickerOpen && (
        <Modal
          isOpen={true}
          onClose={closePicker}
          title={`Selecionar imagens para ${
            pickerOpen === 'train' ? 'Treino' : pickerOpen === 'val' ? 'Validação' : 'Teste'
          }`}
          size="xl"
        >
          <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
            {labels.length > 0 && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#f5f5f5', borderRadius: 8 }}>
                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', fontWeight: 600 }}>
                  Filtrar por classe
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem' }}>
                  {labels.map((label, idx) => (
                    <Checkbox
                      key={idx}
                      label={label}
                      checked={pickerClassFilter.has(idx)}
                      onChange={() => {
                        const next = new Set(pickerClassFilter);
                        if (next.has(idx)) next.delete(idx);
                        else next.add(idx);
                        setPickerClassFilter(next);
                        setPickerPage(1);
                        if (pickerOpen) fetchPickerPage(1, pickerOpen, next);
                      }}
                    />
                  ))}
                  {pickerClassFilter.size > 0 && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setPickerClassFilter(new Set());
                        setPickerPage(1);
                        if (pickerOpen) fetchPickerPage(1, pickerOpen, new Set());
                      }}
                      style={{ fontSize: '0.85rem', padding: '0.25rem 0.5rem' }}
                    >
                      Limpar filtro
                    </Button>
                  )}
                </div>
              </div>
            )}
            {loadingPicker ? (
              <p>A carregar…</p>
            ) : pickerItems && pickerItems.items?.length ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                  <p style={{ margin: 0 }}>
                    {pickerSelected.length} selecionada(s). Página {pickerPage} de{' '}
                    {Math.ceil((pickerItems.total || 0) / PER_PAGE)}.
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() => setPickerSelected([])}
                    disabled={pickerSelected.length === 0}
                  >
                    Limpar seleção
                  </Button>
                </div>
                <div className="export-picker-grid">
                  {pickerItems.items.map((item) => (
                    <div key={item.file_id} className="export-picker-cell">
                      <BoxSelector
                        id={item.file_id}
                        selected={pickerSelected.includes(item.file_id)}
                        onSelect={() => handlePickerSelect(item.file_id)}
                      >
                        <Thumbnail fileId={item.file_id} />
                      </BoxSelector>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  <Button
                    variant="secondary"
                    disabled={pickerPage <= 1}
                    onClick={() => {
                      const next = pickerPage - 1;
                      setPickerPage(next);
                      if (pickerOpen) fetchPickerPage(next, pickerOpen);
                    }}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={pickerPage >= Math.ceil((pickerItems.total || 1) / PER_PAGE)}
                    onClick={() => {
                      const next = pickerPage + 1;
                      setPickerPage(next);
                      if (pickerOpen) fetchPickerPage(next, pickerOpen);
                    }}
                  >
                    Próxima
                  </Button>
                  <Button onClick={closePicker} style={{ marginLeft: 'auto' }}>
                    Confirmar
                  </Button>
                </div>
              </>
            ) : (
              <p>
                {pickerClassFilter.size > 0
                  ? 'Nenhuma imagem disponível com os filtros selecionados.'
                  : 'Nenhuma imagem disponível.'}
              </p>
            )}
          </div>
        </Modal>
      )}

      {/* Kaggle Export Modal */}
      {kaggleModalOpen && (
        <Modal
          isOpen={true}
          onClose={closeKaggleModal}
          title="Exportar para Kaggle"
          size="md"
        >
          <div style={{ padding: '0.5rem 0' }}>
            {kaggleHasCredentials === null ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                <InlineLoader />
              </div>
            ) : kaggleResult ? (
              // Result view
              <div>
                {kaggleResult.success ? (
                  <div style={{ textAlign: 'center', padding: '1rem' }}>
                    <div style={{ marginBottom: '1rem', color: '#2e7d32' }}>
                      <Icon name="success" size={48} />
                    </div>
                    <h3 style={{ color: '#2e7d32', marginBottom: '1rem' }}>Dataset exportado com sucesso</h3>
                    <p style={{ marginBottom: '1.5rem' }}>
                      O dataset foi enviado para o Kaggle e está disponível na sua conta.
                    </p>
                    {kaggleResult.kaggle_url && (
                      <Button
                        onClick={() => window.open(kaggleResult.kaggle_url!, '_blank')}
                      >
                        <Icon name="external" size={16} style={{ marginRight: '0.5rem' }} />
                        Ver no Kaggle
                      </Button>
                    )}
                    <div style={{ marginTop: '1.5rem' }}>
                      <Button variant="secondary" onClick={closeKaggleModal}>
                        Fechar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '1rem' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem', color: '#c62828' }}>✗</div>
                    <h3 style={{ color: '#c62828', marginBottom: '1rem' }}>Erro ao exportar</h3>
                    <p style={{ marginBottom: '1rem', color: '#666' }}>
                      {kaggleResult.error?.message || 'Ocorreu um erro ao exportar o dataset.'}
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                      <Button variant="secondary" onClick={closeKaggleModal}>
                        Fechar
                      </Button>
                      <Button onClick={() => setKaggleResult(null)}>
                        Tentar novamente
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : kaggleExporting ? (
              // Exporting view
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <InlineLoader />
                <p style={{ marginTop: '1rem', color: '#666' }}>
                  Exportando o dataset para o Kaggle...
                </p>
                <p style={{ fontSize: '0.85rem', color: '#999', marginTop: '0.5rem' }}>
                  Isto pode demorar alguns minutos dependendo do tamanho do dataset.
                </p>
              </div>
            ) : !kaggleHasCredentials ? (
              // Credentials setup view
              <div>
                <div style={{ marginBottom: '1.5rem' }}>
                  <h4 style={{ marginBottom: '0.5rem' }}>Configurar credenciais do Kaggle</h4>
                  <p style={{ color: '#666', fontSize: '0.9rem' }}>
                    Para exportar datasets diretamente para o Kaggle, você precisa configurar suas credenciais de API.
                  </p>
                </div>

                <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <span style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      width: 24, 
                      height: 24, 
                      backgroundColor: '#1976d2', 
                      color: 'white', 
                      borderRadius: '50%', 
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      flexShrink: 0,
                    }}>1</span>
                    <span>
                      Acesse as configurações do Kaggle:{' '}
                      <a href="https://www.kaggle.com/settings" target="_blank" rel="noopener noreferrer">
                        kaggle.com/settings
                      </a>
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <span style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      width: 24, 
                      height: 24, 
                      backgroundColor: '#1976d2', 
                      color: 'white', 
                      borderRadius: '50%', 
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      flexShrink: 0,
                    }}>2</span>
                    <span>Role até a seção "Legacy API Credentials" e clique em "Create Legacy API Key"</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                    <span style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      width: 24, 
                      height: 24, 
                      backgroundColor: '#1976d2', 
                      color: 'white', 
                      borderRadius: '50%', 
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      flexShrink: 0,
                    }}>3</span>
                    <span>Um arquivo <code>kaggle.json</code> será baixado. Abra-o e copie o <code>username</code> e <code>key</code> para os campos abaixo.</span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <InputField
                    label="Kaggle Username"
                    name="kaggle_username"
                    type="text"
                    value={kaggleUsername}
                    onChange={(e) => setKaggleUsername(e.target.value)}
                    placeholder="seu_username"
                  />
                  <InputField
                    label="API Token"
                    name="kaggle_api_key"
                    type="password"
                    value={kaggleApiKey}
                    onChange={(e) => setKaggleApiKey(e.target.value)}
                    placeholder="Seu API token do Kaggle"
                  />
                </div>

                {kaggleCredentialError && (
                  <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#ffebee', borderRadius: 6, color: '#c62828', fontSize: '0.9rem' }}>
                    {kaggleCredentialError}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem' }}>
                  <Button variant="secondary" onClick={closeKaggleModal}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleSaveKaggleCredentials}
                    disabled={kaggleSavingCredentials || !kaggleUsername.trim() || !kaggleApiKey.trim()}
                  >
                    {kaggleSavingCredentials ? 'A guardar...' : 'Guardar e continuar'}
                  </Button>
                </div>
              </div>
            ) : (
              // Export form view
              <div>
                <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#e8f5e9', borderRadius: 6 }}>
                  <strong>Dataset:</strong> {datasetName}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <InputField
                    label="Título no Kaggle"
                    name="kaggle_title"
                    type="text"
                    value={kaggleTitle}
                    onChange={(e) => setKaggleTitle(e.target.value)}
                    placeholder="Nome do dataset no Kaggle"
                  />
                  <TextareaField
                    label="Descrição"
                    name="kaggle_description"
                    value={kaggleDescription}
                    onChange={(e) => setKaggleDescription(e.target.value)}
                    placeholder="Descrição do dataset (opcional)"
                    rows={3}
                  />
                  <div>
                    <Checkbox
                      name="kaggle_is_private"
                      label="Dataset privado"
                      checked={kaggleIsPrivate}
                      onChange={(e) => setKaggleIsPrivate(e.target.checked)}
                    />
                    <p style={{ margin: '0.25rem 0 0 1.5rem', fontSize: '0.85rem', color: '#666' }}>
                      {kaggleIsPrivate
                        ? 'Apenas você poderá ver este dataset.'
                        : 'O dataset será público e visível para todos.'}
                    </p>
                  </div>
                </div>

                <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#fff3e0', borderRadius: 6, fontSize: '0.85rem' }}>
                  <strong>Configurações de exportação:</strong> As mesmas configurações de split, seed e redimensionamento definidas no modal anterior serão aplicadas.
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem' }}>
                  <Button variant="secondary" onClick={closeKaggleModal}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleKaggleExport}
                    disabled={!kaggleTitle.trim()}
                  >
                    <Icon name="kaggle" size={16} style={{ marginRight: 6 }} />
                    Exportar para Kaggle
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </Modal>
  );
};

export default ExportConfigModal;
