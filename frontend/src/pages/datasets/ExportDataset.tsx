import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { getDatasetById, type TDataset } from "../../services/datasetsService";
import DatasetExportForm from "../../components/DatasetExportForm/DatasetExportForm";
import InlineLoader from "../../components/InlineLoader/InlineLoader";

const ExportDataset: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [dataset, setDataset] = useState<TDataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError("Dataset não encontrado.");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const d = await getDatasetById(id);
        if (!cancelled) setDataset(d);
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("Não foi possível carregar o dataset.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return <InlineLoader message="Carregando exportação…" />;
  }

  if (error || !id || !dataset) {
    return (
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">{error || "Dataset não encontrado."}</p>
        <Link to="/datasets" className="text-xs font-semibold text-secondary hover:underline">
          Voltar aos datasets
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/datasets")}
          className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
          Datasets
        </button>
        <span className="text-xs text-muted-foreground">·</span>
        <button
          type="button"
          onClick={() => navigate(`/datasets/new?id=${id}`)}
          className="text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          Editar dataset
        </button>
      </div>

      <DatasetExportForm
        datasetId={id}
        datasetName={dataset.dataset_name || "Dataset"}
        taskType={dataset.task_type || "classification"}
        totalImages={undefined}
        onBack={() => navigate("/datasets")}
      />
    </div>
  );
};

export default ExportDataset;
