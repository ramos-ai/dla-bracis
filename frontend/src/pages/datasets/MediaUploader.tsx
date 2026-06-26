import { useParams } from "react-router-dom";
import Uploader from "../../components/Uploader/Uploader";
import { useAuth } from "../../contexts/Authentication";

const MediaUploader: React.FC = () => {
  const { id } = useParams();
  const { user } = useAuth();

  if (!id || !user?._id) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
        Carregando...
      </div>
    );
  }

  return <Uploader datasetId={id} userId={user._id} />;
};

export default MediaUploader; 
