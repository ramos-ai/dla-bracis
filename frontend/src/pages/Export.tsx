import React, { useEffect, useState, useMemo } from "react";
import { Download } from "lucide-react";
import { getDatasetsList, TDataset } from "../services/datasetsService";
import { fetchExportResponses, downloadExportResponses } from "../services/ExportService";
import { useAuth, UserRoles } from "../contexts/Authentication";
import { useAlertConfirm } from "../contexts/AlertConfirmContext";
import Checkbox from "../components/Fields/Checkbox";
import InputField from "../components/Fields/InputField";
import InlineLoader from "../components/InlineLoader/InlineLoader";
import Card from "../components/Card/Card";
import { PageHeader, Panel, FilterPill, EmptyState } from "../components/dla";

const getTaskTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    classification: "Classificação",
    segmentation: "Segmentação",
    detection: "Detecção de Objetos",
    all: "Todos",
  };
  return labels[type] || type;
};

const Export: React.FC = () => {
  const { user } = useAuth();
  const { alert: showAlert } = useAlertConfirm();
  const [datasets, setDatasets] = useState<TDataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [includeLabelled, setIncludeLabelled] = useState(true);
  const [includeUnlabelled, setIncludeUnlabelled] = useState(true);

  const isAdmin = user?.role === UserRoles.ADMIN;

  useEffect(() => {
    async function load() {
      try {
        const data = await getDatasetsList();
        setDatasets(data);
      } catch (e) {
        console.error("Erro ao carregar datasets:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filteredBySearch = useMemo(() => {
    if (!search.trim()) return datasets;
    const q = search.trim().toLowerCase();
    return datasets.filter(
      (d) =>
        (d.dataset_name || "").toLowerCase().includes(q) ||
        (d.description || "").toLowerCase().includes(q)
    );
  }, [datasets, search]);

  const filteredDatasets = useMemo(() => {
    if (filterType === "all") return filteredBySearch;
    return filteredBySearch.filter((d) => (d.task_type || "classification") === filterType);
  }, [filteredBySearch, filterType]);

  const groupedByType = useMemo(() => {
    return {
      classification: filteredBySearch.filter((d) => (d.task_type || "classification") === "classification"),
      segmentation: filteredBySearch.filter((d) => (d.task_type || "classification") === "segmentation"),
      detection: filteredBySearch.filter((d) => (d.task_type || "classification") === "detection"),
      other: filteredBySearch.filter(
        (d) => !["classification", "segmentation", "detection"].includes(d.task_type || "")
      ),
    };
  }, [filteredBySearch]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const datasetIds = filteredDatasets.map((d) => d._id).filter(Boolean);
      const params: {
        dataset_ids?: string[];
        task_type?: string;
        include_labelled: boolean;
        include_unlabelled: boolean;
      } = {
        include_labelled: includeLabelled,
        include_unlabelled: includeUnlabelled,
      };
      if (datasetIds.length > 0) {
        params.dataset_ids = datasetIds;
      }
      if (filterType !== "all") {
        params.task_type = filterType;
      }
      const data = await fetchExportResponses(params);
      downloadExportResponses(data);
    } catch (e: unknown) {
      console.error("Erro ao exportar:", e);
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Erro ao exportar";
      showAlert(`Erro ao exportar: ${msg}`);
    } finally {
      setExporting(false);
    }
  };

  const renderDatasetGrid = (items: TDataset[]) => (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((d) => (
        <Card
          key={d._id}
          title={d.dataset_name}
          description={d.description || ""}
          footer={getTaskTypeLabel(d.task_type || "")}
          cardStyle="card card--default"
        />
      ))}
    </div>
  );

  if (!isAdmin) {
    return (
      <div className="export-page space-y-6">
        <PageHeader eyebrow="Administração" title="Exportar respostas" />
        <Panel>
          <p className="text-sm text-muted-foreground">Acesso restrito a administradores.</p>
        </Panel>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="export-page space-y-6">
        <PageHeader eyebrow="Administração" title="Exportar respostas" />
        <InlineLoader message="Carregando..." />
      </div>
    );
  }

  return (
    <div className="export-page space-y-6">
      <PageHeader
        eyebrow="Administração"
        title="Exportar respostas"
        description="Exporte as respostas dos alunos (prática assistida e/ou livre) em JSON. Use os filtros para limitar por dataset ou tipo."
        actions={
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary/90 disabled:opacity-40"
          >
            <Download className="size-3.5" />
            {exporting ? "A exportar…" : "Exportar JSON"}
          </button>
        }
      />

      <Panel title="Filtros" hint="Refine quais datasets e tipos de resposta entram no export.">
        <div className="space-y-4">
          <InputField
            label="Buscar dataset"
            name="search"
            type="text"
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            placeholder="Nome ou descrição do dataset"
          />
          <div className="flex flex-wrap gap-2">
            <FilterPill active={filterType === "all"} onClick={() => setFilterType("all")} count={filteredBySearch.length}>
              Todos
            </FilterPill>
            <FilterPill active={filterType === "classification"} onClick={() => setFilterType("classification")} count={groupedByType.classification.length}>
              Classificação
            </FilterPill>
            <FilterPill active={filterType === "segmentation"} onClick={() => setFilterType("segmentation")} count={groupedByType.segmentation.length}>
              Segmentação
            </FilterPill>
            <FilterPill active={filterType === "detection"} onClick={() => setFilterType("detection")} count={groupedByType.detection.length}>
              Detecção
            </FilterPill>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <Checkbox
              name="include_labelled"
              label="Incluir respostas da prática assistida"
              checked={includeLabelled}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIncludeLabelled(e.target.checked)}
            />
            <Checkbox
              name="include_unlabelled"
              label="Incluir respostas da prática livre"
              checked={includeUnlabelled}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIncludeUnlabelled(e.target.checked)}
            />
          </div>
        </div>
      </Panel>

      <Panel
        title={`Datasets incluídos (${filteredDatasets.length})`}
        hint={
          filteredDatasets.length === 0
            ? "Nenhum dataset corresponde aos filtros. Ao exportar, serão incluídas todas as submissões."
            : "O JSON incluirá submissões de exercícios cujo dataset está na lista abaixo."
        }
      >
        {filteredDatasets.length === 0 ? (
          <EmptyState title="Nenhum dataset nos filtros" description="Ajuste a busca ou o tipo de tarefa." />
        ) : filterType === "all" ? (
          <div className="space-y-6">
            {groupedByType.classification.length > 0 && (
              <div>
                <p className="rule-label mb-3">Classificação ({groupedByType.classification.length})</p>
                {renderDatasetGrid(groupedByType.classification)}
              </div>
            )}
            {groupedByType.segmentation.length > 0 && (
              <div>
                <p className="rule-label mb-3">Segmentação ({groupedByType.segmentation.length})</p>
                {renderDatasetGrid(groupedByType.segmentation)}
              </div>
            )}
            {groupedByType.detection.length > 0 && (
              <div>
                <p className="rule-label mb-3">Detecção ({groupedByType.detection.length})</p>
                {renderDatasetGrid(groupedByType.detection)}
              </div>
            )}
            {groupedByType.other.length > 0 && (
              <div>
                <p className="rule-label mb-3">Outros ({groupedByType.other.length})</p>
                {renderDatasetGrid(groupedByType.other)}
              </div>
            )}
          </div>
        ) : (
          renderDatasetGrid(filteredDatasets)
        )}
      </Panel>
    </div>
  );
};

export default Export;
