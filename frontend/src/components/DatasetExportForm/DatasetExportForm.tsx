import React, { useState, useCallback, useEffect } from "react";
import { Download, RefreshCw } from "lucide-react";
import "./DatasetExportForm.scss";
import Modal from "../Modal/Modal";
import Button from "../Fields/Button";
import Checkbox from "../Fields/Checkbox";
import InputField from "../Fields/InputField";
import TextareaField from "../Fields/TextareaField";
import { Icon } from "../Icons/Icons";
import {
  getLabelledMedias,
  getUnlabelledMedias,
  getExportPickerMedias,
  type PaginatedMediasResponse,
} from "../../services/MediasService";
import { getDatasetLabels } from "../../services/datasetsService";
import {
  fetchDatasetExportStats,
  downloadDatasetZipWithConfig,
  downloadDatasetZipAsync,
  type DatasetExportStats,
  type ExportConfigPayload,
} from "../../services/ExportService";
import {
  getCredentialsStatus,
  saveKaggleCredentials,
  validateKaggleCredentials,
  deleteKaggleCredentials,
  exportToKaggle,
  type KaggleExportResponse,
} from "../../services/KaggleService";
import Thumbnail from "../Thumbnail/Thumbnail";
import BoxSelector from "../BoxSelector/BoxSelector";
import InlineLoader from "../InlineLoader/InlineLoader";
import { PageHeader, Panel, Stat, FilterPill } from "../dla";
import { useAlertConfirm } from "../../contexts/AlertConfirmContext";
import { cn } from "../../lib/utils";

const STORAGE_KEY = "dla_export_config";
const LARGE_DATASET_THRESHOLD = 5000;
const PER_PAGE = 24;

export interface ExportConfig {
  mode: "simple" | "custom";
  split_mode: "auto" | "manual";
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
  mode: "simple",
  split_mode: "auto",
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

function formatLabel(taskType: string): string {
  if (taskType === "detection") return "COCO";
  if (taskType === "segmentation") return "YOLO";
  return "pastas por rótulo";
}

export interface DatasetExportFormProps {
  datasetId: string;
  datasetName: string;
  taskType: string;
  totalImages?: number;
  onBack?: () => void;
  onExportSuccess?: () => void;
}

const DatasetExportForm: React.FC<DatasetExportFormProps> = ({
  datasetId,
  datasetName,
  taskType,
  totalImages = 0,
  onBack,
  onExportSuccess,
}) => {
  const { alert: showAlert } = useAlertConfirm();
  const saved = loadSavedConfig();
  const [config, setConfig] = useState<ExportConfig>({
    ...DEFAULT_CONFIG,
    ...saved,
  });
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState<"train" | "val" | "test" | null>(null);
  const [pickerSelected, setPickerSelected] = useState<string[]>([]);
  const [pickerPage, setPickerPage] = useState(1);
  const [pickerItems, setPickerItems] = useState<PaginatedMediasResponse | null>(null);
  const [loadingPicker, setLoadingPicker] = useState(false);
  const [datasetStats, setDatasetStats] = useState<DatasetExportStats | null>(null);
  const [labels, setLabels] = useState<string[]>([]);
  const [pickerClassFilter, setPickerClassFilter] = useState<Set<number>>(new Set());

  const [showKaggle, setShowKaggle] = useState(false);
  const [kaggleHasCredentials, setKaggleHasCredentials] = useState<boolean | null>(null);
  const [kaggleUsername, setKaggleUsername] = useState("");
  const [kaggleApiKey, setKaggleApiKey] = useState("");
  const [kaggleTitle, setKaggleTitle] = useState("");
  const [kaggleDescription, setKaggleDescription] = useState("");
  const [kaggleIsPrivate, setKaggleIsPrivate] = useState(true);
  const [kaggleSavingCredentials, setKaggleSavingCredentials] = useState(false);
  const [kaggleCredentialError, setKaggleCredentialError] = useState("");
  const [kaggleExporting, setKaggleExporting] = useState(false);
  const [kaggleResult, setKaggleResult] = useState<KaggleExportResponse | null>(null);

  useEffect(() => {
    if (!datasetId) return;
    fetchDatasetExportStats(datasetId)
      .then(setDatasetStats)
      .catch(() => setDatasetStats(null));
    getDatasetLabels(datasetId)
      .then(setLabels)
      .catch(() => setLabels([]));
  }, [datasetId]);

  useEffect(() => {
    if (!datasetId) return;
    setConfig((prev) => ({ ...prev, manual_splits: undefined }));
    setPickerOpen(null);
    setPickerSelected([]);
    setPickerItems(null);
    setPickerClassFilter(new Set());
    setShowKaggle(false);
    setKaggleResult(null);
  }, [datasetId]);

  const totalPct = config.train_pct + config.val_pct + config.test_pct;
  const hasAnySplit = config.train_pct > 0 || config.val_pct > 0 || config.test_pct > 0;
  const pctValid = totalPct <= 100 && (config.split_mode !== "auto" || !hasAnySplit || totalPct > 0);

  const trainCount = config.manual_splits?.train?.length ?? 0;
  const valCount = config.manual_splits?.val?.length ?? 0;
  const testCount = config.manual_splits?.test?.length ?? 0;

  const effectiveTrainCount = pickerOpen === "train" ? pickerSelected.length : trainCount;
  const effectiveValCount = pickerOpen === "val" ? pickerSelected.length : valCount;
  const effectiveTestCount = pickerOpen === "test" ? pickerSelected.length : testCount;
  const manualExportCount = effectiveTrainCount + effectiveValCount + effectiveTestCount;
  const poolSize =
    datasetStats && config.include_unlabeled
      ? datasetStats.total
      : (datasetStats?.labelled ?? 0);
  const imagesToExport =
    config.mode === "custom" && config.split_mode === "manual" ? manualExportCount : poolSize;
  const autoTrainCount =
    config.split_mode === "auto" && hasAnySplit && config.train_pct > 0 && totalPct > 0
      ? Math.round((poolSize * config.train_pct) / totalPct)
      : 0;
  const autoValCount =
    config.split_mode === "auto" && hasAnySplit && config.val_pct > 0 && totalPct > 0
      ? Math.round((poolSize * config.val_pct) / totalPct)
      : 0;
  const autoTestCount =
    config.split_mode === "auto" && hasAnySplit && config.test_pct > 0 && totalPct > 0
      ? Math.round((poolSize * config.test_pct) / totalPct)
      : 0;
  const trainTarget = autoTrainCount;
  const showTrainCappedWarning =
    config.mode === "custom" &&
    config.split_mode === "auto" &&
    config.include_unlabeled &&
    hasAnySplit &&
    datasetStats &&
    trainTarget > datasetStats.labelled;

  const exportDisabled =
    exporting || (config.mode === "custom" && config.split_mode === "auto" && !pctValid);

  const fetchPickerPage = useCallback(
    async (page: number, split: "train" | "val" | "test", classFilterOverride?: Set<number>) => {
      if (!datasetId) return;
      setLoadingPicker(true);
      try {
        const alreadyInOtherSplits = new Set<string>();
        if (split !== "train") {
          (config.manual_splits?.train || []).forEach((id) => alreadyInOtherSplits.add(id));
        }
        if (split !== "val") {
          (config.manual_splits?.val || []).forEach((id) => alreadyInOtherSplits.add(id));
        }
        if (split !== "test") {
          (config.manual_splits?.test || []).forEach((id) => alreadyInOtherSplits.add(id));
        }

        const activeFilter = classFilterOverride ?? pickerClassFilter;
        let sourceIds: string[];
        if (activeFilter.size > 0) {
          sourceIds = await getExportPickerMedias(
            datasetId,
            split,
            config.include_unlabeled && split !== "train",
            taskType,
            [...activeFilter],
          );
        } else {
          const [labelled, unlabelled] = await Promise.all([
            getLabelledMedias(datasetId),
            split === "train"
              ? Promise.resolve([])
              : config.include_unlabeled
                ? getUnlabelledMedias(datasetId)
                : Promise.resolve([]),
          ]);
          sourceIds =
            split === "train"
              ? labelled || []
              : [...new Set([...(labelled || []), ...(unlabelled || [])])];
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
        console.error("Erro ao carregar imagens:", err);
        setPickerItems(null);
      } finally {
        setLoadingPicker(false);
      }
    },
    [datasetId, config.include_unlabeled, config.manual_splits, pickerClassFilter, taskType],
  );

  const openPicker = (split: "train" | "val" | "test") => {
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
      prev.includes(fileId) ? prev.filter((id) => id !== fileId) : [...prev, fileId],
    );
  };

  const toPayload = (c: ExportConfig): ExportConfigPayload => ({
    mode: c.mode,
    split_mode: c.split_mode,
    train_pct: c.train_pct,
    val_pct: c.val_pct,
    test_pct: c.test_pct,
    include_train: c.train_pct > 0,
    include_val: c.val_pct > 0,
    include_test: c.test_pct > 0,
    manual_splits: c.manual_splits,
    max_width: c.max_width,
    jpeg_quality: c.jpeg_quality,
    keep_original_resolution: c.keep_original_resolution,
    include_unlabeled: c.include_unlabeled,
    seed: c.seed,
  });

  const handleExport = async () => {
    if (config.mode === "custom" && config.split_mode === "auto" && !pctValid) return;
    setExporting(true);
    setExportProgress(null);
    try {
      saveConfig(config);
      const configToExport = toPayload(config);
      const totalToExport = datasetStats?.total ?? 0;
      const isLargeDataset = totalToExport > LARGE_DATASET_THRESHOLD;

      if (isLargeDataset) {
        setExportProgress("Iniciando exportação assíncrona para dataset grande...");
        const result = await downloadDatasetZipAsync(datasetId, configToExport, (msg) => {
          setExportProgress(msg);
        });
        if (!result.success) {
          throw new Error(result.error || "Erro na exportação assíncrona");
        }
      } else {
        await downloadDatasetZipWithConfig(datasetId, configToExport);
      }
      showAlert(`Dataset "${datasetName}" exportado (ZIP) com sucesso!`);
      onExportSuccess?.();
    } catch (error: unknown) {
      const err = error as Error & { response?: { data?: { message?: string } } };
      console.error("Erro ao exportar:", err);
      const msg = err.response?.data?.message || err.message || "Falha na exportação";
      setExportProgress(`Erro: ${msg}`);
      showAlert(`Erro ao exportar: ${msg}`);
    } finally {
      setExporting(false);
    }
  };

  const openKagglePanel = async () => {
    setShowKaggle(true);
    setKaggleTitle(datasetName || "");
    setKaggleDescription("");
    setKaggleIsPrivate(true);
    setKaggleResult(null);
    setKaggleCredentialError("");
    setKaggleHasCredentials(null);

    try {
      const status = await getCredentialsStatus();
      setKaggleHasCredentials(status.has_credentials);
    } catch {
      setKaggleHasCredentials(false);
    }
  };

  const handleSaveKaggleCredentials = async () => {
    if (!kaggleUsername.trim() || !kaggleApiKey.trim()) {
      setKaggleCredentialError("Username e API Token são obrigatórios.");
      return;
    }

    setKaggleSavingCredentials(true);
    setKaggleCredentialError("");

    try {
      await saveKaggleCredentials({
        username: kaggleUsername.trim(),
        api_key: kaggleApiKey.trim(),
      });

      const validation = await validateKaggleCredentials();
      if (!validation.valid) {
        setKaggleCredentialError(
          validation.error || "Credenciais inválidas. Verifique seu username e API token.",
        );
        await deleteKaggleCredentials();
        return;
      }

      setKaggleHasCredentials(true);
      setKaggleUsername("");
      setKaggleApiKey("");
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      setKaggleCredentialError(err.response?.data?.error || "Erro ao salvar credenciais.");
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

      const result = await exportToKaggle(datasetId, {
        title: kaggleTitle.trim(),
        description: kaggleDescription.trim(),
        is_private: kaggleIsPrivate,
        export_config: configToExport,
      });

      setKaggleResult(result);
    } catch {
      setKaggleResult({
        success: false,
        kaggle_url: null,
        error: { code: "UNKNOWN_ERROR", message: "Erro ao exportar para o Kaggle." },
      });
    } finally {
      setKaggleExporting(false);
    }
  };

  const resetToDefault = () => {
    setConfig({ ...DEFAULT_CONFIG });
  };

  return (
    <div className="dataset-export-form space-y-6">
      <PageHeader
        eyebrow="Dataset"
        title={`Exportar: ${datasetName}`}
        description="Configure splits, qualidade de imagem e destino — ZIP local ou Kaggle."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="rounded-md border border-border px-3.5 py-2 text-xs font-semibold transition-colors hover:border-secondary"
              >
                Voltar
              </button>
            )}
            <button
              type="button"
              onClick={resetToDefault}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3.5 py-2 text-xs font-semibold transition-colors hover:border-secondary"
            >
              <RefreshCw className="size-3.5" />
              Restaurar padrão
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={exportDisabled}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              <Download className="size-3.5" />
              {exporting ? "A exportar…" : "Exportar ZIP"}
            </button>
            <button
              type="button"
              onClick={openKagglePanel}
              disabled={exportDisabled}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3.5 py-2 text-xs font-semibold transition-colors hover:border-secondary disabled:opacity-40"
            >
              <Icon name="kaggle" size={16} />
              Kaggle
            </button>
          </div>
        }
      />

      <Panel title="Modo de exportação" hint="Escolha exportação rápida ou personalize splits e imagens.">
        <div className="flex flex-wrap gap-1.5">
          <FilterPill
            active={config.mode === "simple"}
            onClick={() => setConfig((c) => ({ ...c, mode: "simple" }))}
          >
            Rápida (66% / 34%)
          </FilterPill>
          <FilterPill
            active={config.mode === "custom"}
            onClick={() => setConfig((c) => ({ ...c, mode: "custom" }))}
          >
            Personalizada
          </FilterPill>
        </div>
        {config.mode === "simple" && (
          <p className="mt-3 text-xs text-muted-foreground">
            66% treino / 34% validação — apenas imagens rotuladas.
          </p>
        )}
      </Panel>

      {config.mode === "custom" && (
        <>
          {datasetStats && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Total" value={datasetStats.total} />
              <Stat label="Rotuladas" value={datasetStats.labelled} />
              <Stat label="Sem anotação" value={datasetStats.unlabelled} />
              <Stat
                label="A exportar"
                value={imagesToExport}
                note={
                  config.split_mode === "auto" && hasAnySplit
                    ? `Treino ${autoTrainCount} · Val ${autoValCount} · Teste ${autoTestCount}`
                    : config.split_mode === "manual" &&
                        (effectiveTrainCount > 0 ||
                          effectiveValCount > 0 ||
                          effectiveTestCount > 0)
                      ? `Treino ${effectiveTrainCount} · Val ${effectiveValCount} · Teste ${effectiveTestCount}`
                      : undefined
                }
              />
            </div>
          )}

          {showTrainCappedWarning && (
            <Panel title="Análise do dataset">
              <p className="text-sm text-muted-foreground">
                Treino solicitado: {config.train_pct}% ({trainTarget} imagens). Existem apenas{" "}
                {datasetStats?.labelled} imagens rotuladas. Treino terá{" "}
                {datasetStats?.labelled} imagens rotuladas; o restante vai para validação e teste.
              </p>
            </Panel>
          )}

          <Panel title="Configuração de split" hint="Automático por porcentagem ou escolha manual de imagens.">
            <div className="flex flex-wrap gap-1.5">
              <FilterPill
                active={config.split_mode === "auto"}
                onClick={() => setConfig((c) => ({ ...c, split_mode: "auto" }))}
              >
                Automático
              </FilterPill>
              <FilterPill
                active={config.split_mode === "manual"}
                onClick={() => setConfig((c) => ({ ...c, split_mode: "manual" }))}
              >
                Manual
              </FilterPill>
            </div>

            {config.split_mode === "auto" && (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-end gap-4">
                  <div className="w-[120px]">
                    <InputField
                      label="Treino (%)"
                      name="train_pct"
                      type="number"
                      min={0}
                      max={100 - config.val_pct - config.test_pct}
                      value={String(config.train_pct)}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          train_pct: Math.max(0, parseFloat(e.target.value) || 0),
                        }))
                      }
                      placeholder="0"
                    />
                  </div>
                  <div className="w-[120px]">
                    <InputField
                      label="Validação (%)"
                      name="val_pct"
                      type="number"
                      min={0}
                      max={100 - config.train_pct - config.test_pct}
                      value={String(config.val_pct)}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          val_pct: Math.max(0, parseFloat(e.target.value) || 0),
                        }))
                      }
                      placeholder="0"
                    />
                  </div>
                  <div className="w-[120px]">
                    <InputField
                      label="Teste (%)"
                      name="test_pct"
                      type="number"
                      min={0}
                      max={100 - config.train_pct - config.val_pct}
                      value={String(config.test_pct)}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          test_pct: Math.max(0, parseFloat(e.target.value) || 0),
                        }))
                      }
                      placeholder="0"
                    />
                  </div>
                  <span
                    className={cn(
                      "pb-2 text-sm font-medium",
                      totalPct <= 100 ? "text-success" : "text-destructive",
                    )}
                  >
                    Total: {totalPct.toFixed(0)}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Soma não pode exceder 100%. Com 0% num split, não é criada pasta para esse split.
                </p>
              </div>
            )}

            <div className="mt-4 border-t border-border pt-4">
              <Checkbox
                label="Incluir imagens sem anotação"
                checked={config.include_unlabeled}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, include_unlabeled: e.target.checked }))
                }
              />
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Além das imagens já rotuladas, inclui no export as imagens do dataset que ainda não
                têm anotação. O split <strong>treino</strong> usa apenas imagens rotuladas;
                validação e teste podem receber imagens sem anotação.
              </p>
            </div>

            {config.split_mode === "manual" && (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button variant="secondary" onClick={() => openPicker("train")}>
                  Treino: {trainCount} imagens
                </Button>
                <Button variant="secondary" onClick={() => openPicker("val")}>
                  Validação: {valCount} imagens
                </Button>
                <Button variant="secondary" onClick={() => openPicker("test")}>
                  Teste: {testCount} imagens
                </Button>
              </div>
            )}
          </Panel>

          <Panel title="Imagens" hint="Resolução e compressão do ZIP exportado.">
            <Checkbox
              label="Manter resolução original"
              checked={config.keep_original_resolution}
              onChange={(e) =>
                setConfig((c) => ({ ...c, keep_original_resolution: e.target.checked }))
              }
            />
            {!config.keep_original_resolution && (
              <div className="mt-4 flex flex-wrap gap-4">
                <div className="w-[140px]">
                  <InputField
                    label="Largura máx. (px)"
                    name="max_width"
                    type="number"
                    min={64}
                    max={4096}
                    value={String(config.max_width)}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        max_width: parseInt(e.target.value, 10) || 1024,
                      }))
                    }
                  />
                </div>
                <div className="w-[120px]">
                  <InputField
                    label="Qualidade JPEG"
                    name="jpeg_quality"
                    type="number"
                    min={1}
                    max={100}
                    value={String(config.jpeg_quality)}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        jpeg_quality: parseInt(e.target.value, 10) || 85,
                      }))
                    }
                  />
                </div>
              </div>
            )}
            {config.split_mode !== "manual" && (
              <div className="mt-4 max-w-[140px]">
                <InputField
                  label="Seed (reprodutibilidade)"
                  name="seed"
                  type="number"
                  value={String(config.seed)}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      seed: parseInt(e.target.value, 10) || 42,
                    }))
                  }
                />
              </div>
            )}
          </Panel>
        </>
      )}

      <Panel title="Resumo">
        <p className="text-sm text-muted-foreground">
          Formato <strong className="text-foreground">{formatLabel(taskType)}</strong>.
          {totalImages > 0 && <> ~{totalImages} imagens no dataset.</>}
          {datasetStats && datasetStats.total > LARGE_DATASET_THRESHOLD && (
            <>
              {" "}
              Dataset grande ({datasetStats.total.toLocaleString()} imagens) — exportação assíncrona.
            </>
          )}
        </p>
        {exporting && (
          <div className="mt-4 flex items-center gap-3 rounded-md border border-border bg-accent/40 px-4 py-3">
            <InlineLoader />
            <span className="text-sm">{exportProgress || "Exportando dataset..."}</span>
          </div>
        )}
      </Panel>

      {showKaggle && (
        <Panel
          title="Exportar para Kaggle"
          hint="Usa as mesmas configurações de split e imagem definidas acima."
          action={
            <button
              type="button"
              onClick={() => {
                setShowKaggle(false);
                setKaggleResult(null);
              }}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Fechar
            </button>
          }
        >
          {kaggleHasCredentials === null ? (
            <div className="flex justify-center py-8">
              <InlineLoader />
            </div>
          ) : kaggleResult ? (
            <div className="space-y-4 text-center">
              {kaggleResult.success ? (
                <>
                  <div className="flex justify-center text-success">
                    <Icon name="success" size={40} />
                  </div>
                  <h3 className="font-display text-base font-semibold text-success">
                    Dataset exportado com sucesso
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    O dataset foi enviado para o Kaggle e está disponível na sua conta.
                  </p>
                  {kaggleResult.kaggle_url && (
                    <Button onClick={() => window.open(kaggleResult.kaggle_url!, "_blank")}>
                      <Icon name="external" size={16} style={{ marginRight: "0.5rem" }} />
                      Ver no Kaggle
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <h3 className="font-display text-base font-semibold text-destructive">
                    Erro ao exportar
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {kaggleResult.error?.message || "Ocorreu um erro ao exportar o dataset."}
                  </p>
                  <Button onClick={() => setKaggleResult(null)}>Tentar novamente</Button>
                </>
              )}
            </div>
          ) : kaggleExporting ? (
            <div className="space-y-2 py-6 text-center">
              <InlineLoader />
              <p className="text-sm text-muted-foreground">Exportando o dataset para o Kaggle…</p>
              <p className="text-xs text-muted-foreground">
                Isto pode demorar alguns minutos dependendo do tamanho do dataset.
              </p>
            </div>
          ) : !kaggleHasCredentials ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Configure as credenciais de API do Kaggle para exportar diretamente.
              </p>
              <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                <li>
                  Acesse{" "}
                  <a
                    href="https://www.kaggle.com/settings"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-secondary hover:underline"
                  >
                    kaggle.com/settings
                  </a>
                </li>
                <li>
                  Em &quot;Legacy API Credentials&quot;, clique em &quot;Create Legacy API Key&quot;
                </li>
                <li>
                  Abra o <code className="text-foreground">kaggle.json</code> e copie username e key
                </li>
              </ol>
              <div className="grid gap-3 sm:grid-cols-2">
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
                <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {kaggleCredentialError}
                </p>
              )}
              <div className="flex justify-end">
                <Button
                  onClick={handleSaveKaggleCredentials}
                  disabled={
                    kaggleSavingCredentials || !kaggleUsername.trim() || !kaggleApiKey.trim()
                  }
                >
                  {kaggleSavingCredentials ? "A guardar…" : "Guardar e continuar"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
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
                <p className="mt-1 text-xs text-muted-foreground">
                  {kaggleIsPrivate
                    ? "Apenas você poderá ver este dataset."
                    : "O dataset será público e visível para todos."}
                </p>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleKaggleExport} disabled={!kaggleTitle.trim()}>
                  <Icon name="kaggle" size={16} style={{ marginRight: 6 }} />
                  Exportar para Kaggle
                </Button>
              </div>
            </div>
          )}
        </Panel>
      )}

      {pickerOpen && (
        <Modal
          isOpen
          onClose={closePicker}
          title={`Selecionar imagens para ${
            pickerOpen === "train" ? "Treino" : pickerOpen === "val" ? "Validação" : "Teste"
          }`}
          size="xl"
        >
          <div className="max-h-[70vh] overflow-auto">
            {labels.length > 0 && (
              <div className="mb-4 rounded-md border border-border bg-accent/30 p-3">
                <p className="mb-2 text-xs font-semibold">Filtrar por classe</p>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
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
                    >
                      Limpar filtro
                    </Button>
                  )}
                </div>
              </div>
            )}
            {loadingPicker ? (
              <p className="text-sm text-muted-foreground">A carregar…</p>
            ) : pickerItems && pickerItems.items?.length ? (
              <>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">
                    {pickerSelected.length} selecionada(s). Página {pickerPage} de{" "}
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
                <div className="mt-4 flex flex-wrap gap-2">
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
                  <Button onClick={closePicker} style={{ marginLeft: "auto" }}>
                    Confirmar
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {pickerClassFilter.size > 0
                  ? "Nenhuma imagem disponível com os filtros selecionados."
                  : "Nenhuma imagem disponível."}
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};

export default DatasetExportForm;
