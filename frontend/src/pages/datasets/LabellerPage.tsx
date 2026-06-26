import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Labeller from '../../components/Labeller/Labeller';
import { getDatasetLabels } from '../../services/datasetsService';
import InlineLoader from '../../components/InlineLoader/InlineLoader';

const LabellerPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [labels, setLabels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    
    getDatasetLabels(id)
      .then((res: string[]) => setLabels(res || []))
      .catch((error: unknown) => console.error('Erro ao carregar labels:', error))
      .finally(() => setLoading(false));
  }, [id]);

  if (!id) {
    return <div className="labeller-page__error">Dataset não encontrado.</div>;
  }

  if (loading) {
    return <InlineLoader message="Carregando..." />;
  }

  return <Labeller datasetId={id} labels={labels} />;
};

export default LabellerPage;
