import React, { useEffect, useState, useMemo } from "react";
import { getDatasetsList, TDataset } from "../services/datasetsService";
import { fetchExportResponses, downloadExportResponses } from "../services/ExportService";
import { useAuth, UserRoles } from "../contexts/Authentication";
import { useAlertConfirm } from "../contexts/AlertConfirmContext";
import Button from "../components/Fields/Button";
import { Icon } from "../components/Icons/Icons";
import Card from "../components/Card/Card";
import Checkbox from "../components/Fields/Checkbox";
import InputField from "../components/Fields/InputField";
import InlineLoader from "../components/InlineLoader/InlineLoader";

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

  if (!isAdmin) {
    return (
      <div className="export-page" style={{ padding: "2rem" }}>
        <p>Acesso restrito a administradores.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="export-page" style={{ padding: "2rem" }}>
        <InlineLoader message="Carregando..." />
      </div>
    );
  }

  return (
    <div className="export-page">
      <h1 className="page-title">Exportar respostas</h1>
      <p style={{ color: "#666", marginBottom: "1.5rem" }}>
        Exporte as respostas dos alunos (prática assistida e/ou livre) em JSON. Use os filtros para limitar por dataset ou tipo.
      </p>

      <div className="export-page__filters" style={{ marginBottom: "1.5rem" }}>
        <div style={{ marginBottom: "1rem" }}>
          <InputField
            label="Buscar dataset"
            name="search"
            type="text"
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            placeholder="Nome ou descrição do dataset"
          />
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <Button
            variant={filterType === "all" ? "primary" : "secondary"}
            onClick={() => setFilterType("all")}
            style={{ fontSize: "0.9rem" }}
          >
            Todos ({filteredBySearch.length})
          </Button>
          <Button
            variant={filterType === "classification" ? "primary" : "secondary"}
            onClick={() => setFilterType("classification")}
            style={{ fontSize: "0.9rem" }}
          >
            Classificação ({groupedByType.classification.length})
          </Button>
          <Button
            variant={filterType === "segmentation" ? "primary" : "secondary"}
            onClick={() => setFilterType("segmentation")}
            style={{ fontSize: "0.9rem" }}
          >
            Segmentação ({groupedByType.segmentation.length})
          </Button>
          <Button
            variant={filterType === "detection" ? "primary" : "secondary"}
            onClick={() => setFilterType("detection")}
            style={{ fontSize: "0.9rem" }}
          >
            Detecção ({groupedByType.detection.length})
          </Button>
        </div>
        <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "center" }}>
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

      <div style={{ marginBottom: "1.5rem" }}>
        <Button
          onClick={handleExport}
          disabled={exporting}
          style={{ minWidth: "180px" }}
        >
          <Icon name="download" size={18} style={{ marginRight: "8px", verticalAlign: "middle" }} />
          {exporting ? "A exportar…" : "Exportar JSON"}
        </Button>
      </div>

      <h2 style={{ fontSize: "1.2rem", fontWeight: "600", marginBottom: "1rem", color: "#333" }}>
        Datasets incluídos no export ({filteredDatasets.length})
      </h2>
      <p style={{ fontSize: "0.9rem", color: "#666", marginBottom: "1rem" }}>
        {filteredDatasets.length === 0
          ? "Nenhum dataset corresponde aos filtros. Ao exportar, serão incluídas todas as submissões de todos os datasets."
          : "O ficheiro JSON incluirá submissões de exercícios cujo dataset está na lista abaixo."}
      </p>

      {filterType === "all" ? (
        <>
          {groupedByType.classification.length > 0 && (
            <div style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: "600", marginBottom: "0.75rem", color: "#333" }}>
                Classificação ({groupedByType.classification.length})
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
                {groupedByType.classification.map((d) => (
                  <Card
                    key={d._id}
                    title={d.dataset_name}
                    description={d.description || ""}
                    footer={getTaskTypeLabel(d.task_type || "")}
                    cardStyle="card card--default"
                  />
                ))}
              </div>
            </div>
          )}
          {groupedByType.segmentation.length > 0 && (
            <div style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: "600", marginBottom: "0.75rem", color: "#333" }}>
                Segmentação ({groupedByType.segmentation.length})
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
                {groupedByType.segmentation.map((d) => (
                  <Card
                    key={d._id}
                    title={d.dataset_name}
                    description={d.description || ""}
                    footer={getTaskTypeLabel(d.task_type || "")}
                    cardStyle="card card--default"
                  />
                ))}
              </div>
            </div>
          )}
          {groupedByType.detection.length > 0 && (
            <div style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: "600", marginBottom: "0.75rem", color: "#333" }}>
                Detecção de Objetos ({groupedByType.detection.length})
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
                {groupedByType.detection.map((d) => (
                  <Card
                    key={d._id}
                    title={d.dataset_name}
                    description={d.description || ""}
                    footer={getTaskTypeLabel(d.task_type || "")}
                    cardStyle="card card--default"
                  />
                ))}
              </div>
            </div>
          )}
          {groupedByType.other.length > 0 && (
            <div style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: "600", marginBottom: "0.75rem", color: "#333" }}>
                Outros ({groupedByType.other.length})
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
                {groupedByType.other.map((d) => (
                  <Card
                    key={d._id}
                    title={d.dataset_name}
                    description={d.description || ""}
                    footer={d.task_type || "—"}
                    cardStyle="card card--default"
                  />
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
          {filteredDatasets.map((d) => (
            <Card
              key={d._id}
              title={d.dataset_name}
              description={d.description || ""}
              footer={getTaskTypeLabel(d.task_type || "")}
              cardStyle="card card--default"
            />
          ))}
        </div>
      )}

      {filteredDatasets.length === 0 && (
        <p style={{ color: "#666", fontStyle: "italic" }}>Nenhum dataset corresponde aos filtros.</p>
      )}
    </div>
  );
};

export default Export;
