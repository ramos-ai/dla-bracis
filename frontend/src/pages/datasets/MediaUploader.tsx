import { useParams } from "react-router-dom";
import { ImageUp } from "lucide-react";
import Uploader from "../../components/Uploader/Uploader";
import { useAuth } from "../../contexts/Authentication";
import { PageHeader, Panel } from "../../components/dla";
import InlineLoader from "../../components/InlineLoader/InlineLoader";

const MediaUploader: React.FC = () => {
  const { id } = useParams();
  const { user } = useAuth();

  if (!id || !user?._id) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Dataset" title="Enviar mídias" />
        <InlineLoader message="Carregando..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Dataset"
        title="Enviar mídias"
        description="Faça upload de imagens ou arquivos para o dataset selecionado."
        actions={
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <ImageUp className="size-3.5" />
            ID {id}
          </span>
        }
      />
      <Panel title="Upload" hint="Arraste arquivos ou selecione do computador.">
        <Uploader datasetId={id} userId={user._id} />
      </Panel>
    </div>
  );
};

export default MediaUploader;
