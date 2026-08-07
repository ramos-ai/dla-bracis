import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import Labeller from "../../components/Labeller/Labeller";
import { getDatasetLabels } from "../../services/datasetsService";
import InlineLoader from "../../components/InlineLoader/InlineLoader";

type LabellingLocationState = {
  imageIds?: string[];
  initialIndex?: number;
};

const LabellerPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state || {}) as LabellingLocationState;
  const [labels, setLabels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [modified, setModified] = useState(false);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    getDatasetLabels(id)
      .then((res: string[]) => setLabels(res || []))
      .catch((error: unknown) => console.error("Erro ao carregar labels:", error))
      .finally(() => setLoading(false));
  }, [id]);

  if (!id) {
    return <div className="text-sm text-muted-foreground">Dataset não encontrado.</div>;
  }

  if (loading) {
    return <InlineLoader message="Carregando…" />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 items-center gap-3">
        <Link
          to={`/datasets/${id}/gallery`}
          onClick={(e) => {
            e.preventDefault();
            navigate(`/datasets/${id}/gallery`, {
              state: modified ? { refresh: Date.now() } : undefined,
            });
          }}
          className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
          Galeria
        </Link>
        <span className="text-xs text-muted-foreground">·</span>
        <h1 className="font-display text-sm font-semibold tracking-tight">Rotulação</h1>
      </div>
      <div className="min-h-0 flex-1">
        <div className="h-full min-h-0">
          <Labeller
            datasetId={id}
            labels={labels}
            initialImageIds={state.imageIds}
            initialIndex={state.initialIndex ?? 0}
            onModification={() => setModified(true)}
            onComplete={() =>
              navigate(`/datasets/${id}/gallery`, {
                state: { refresh: Date.now() },
              })
            }
          />
        </div>
      </div>
    </div>
  );
};

export default LabellerPage;
