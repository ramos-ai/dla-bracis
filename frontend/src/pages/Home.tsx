import { useEffect, useState } from "react";
import { useAuth } from "../contexts/Authentication";
import { useSelectedClass } from "../contexts/SelectedClass";
import { useNavigate } from "react-router-dom";
import { getTeacherDashboardStats, DashboardStats, getStudentDashboard, StudentStats, getRanking, RankingResponse, PendingExercise } from "../services/ExercisesService";
import { getRecentActions, getAllActions, UserAction } from "../services/ActionsService";
import Modal from "../components/Modal/Modal";
import LoadingOverlay from "../components/LoadingOverlay/LoadingOverlay";
import InlineLoader from "../components/InlineLoader/InlineLoader";
import { Icon, getActivityIcon, getExerciseTypeIconName } from "../components/Icons/Icons";

const getActivityTitle = (actionType: string, description?: string): string => {
  const titleMap: Record<string, string> = {
    'exercise_completed': 'Exercício concluído',
    'exercise_created': 'Novo exercício criado',
    'new_exercise_in_class': 'Novo exercício na sua turma',
    'submission_evaluated': 'Submissão avaliada',
    'dataset_created': 'Dataset criado',
    'dataset_updated': 'Dataset atualizado',
    'media_labeled': 'Mídia rotulada',
    'default': 'Ação realizada'
  };
  
  // For students, show more descriptive title for completed exercises
  if (actionType === 'exercise_completed' && description) {
    // Extract exercise name from description if available
    const match = description.match(/Exercício '([^']+)'/);
    if (match) {
      return `Exercício "${match[1]}" concluído`;
    }
  }
  
  return titleMap[actionType] || titleMap['default'];
};

const formatTimestamp = (timestamp: string): string => {
  const now = new Date();
  const actionDate = new Date(timestamp);
  const diffMs = now.getTime() - actionDate.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffHours < 1) return 'Agora';
  if (diffHours < 24) return `Há ${diffHours}h`;
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7) return `Há ${diffDays} dias`;
  return actionDate.toLocaleDateString('pt-BR');
};

const Home: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { selectedClassId } = useSelectedClass();
  const navigate = useNavigate();
  const [teacherStats, setTeacherStats] = useState<DashboardStats | null>(null);
  const [studentStats, setStudentStats] = useState<StudentStats | null>(null);
  const [pendingExercises, setPendingExercises] = useState<PendingExercise[]>([]);
  const [recentActivities, setRecentActivities] = useState<UserAction[]>([]);
  const [allActivities, setAllActivities] = useState<UserAction[]>([]);
  const [showActivitiesModal, setShowActivitiesModal] = useState(false);
  const [showRankingModal, setShowRankingModal] = useState(false);
  const [ranking, setRanking] = useState<RankingResponse | null>(null);
  const [rankingLoading, setRankingLoading] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      if (!user) {
        return;
      }

      try {
        // Load stats based on user role
        if (user.role === 'teacher') {
          const dashboardStats = await getTeacherDashboardStats(selectedClassId ?? undefined);
          setTeacherStats(dashboardStats);
        } else if (user.role === 'student') {
          const dashboard = await getStudentDashboard();
          setStudentStats(dashboard.stats);
          setPendingExercises(dashboard.pending_exercises || []);
        }

        // Load recent actions
        try {
          const actions = await getRecentActions(3);
          console.log('[DEBUG] Recent actions loaded:', actions);
          setRecentActivities(actions || []);
        } catch (actionError) {
          console.error('Erro ao carregar atividades recentes:', actionError);
          setRecentActivities([]);
        }
        
        // Load all actions for modal
        try {
          const allActions = await getAllActions();
          console.log('[DEBUG] All actions loaded:', allActions);
          setAllActivities(allActions || []);
        } catch (allActionsError) {
          console.error('Erro ao carregar todas as atividades:', allActionsError);
          setAllActivities([]);
        }
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
      }
    };

    if (isAuthenticated && user) {
      loadData();
    }
  }, [user, isAuthenticated, selectedClassId]);


  if (isLoading || (user?.role === 'teacher' && !teacherStats) || (user?.role === 'student' && !studentStats)) {
    return <LoadingOverlay />;
  }

  if (user && user.role === 'unassigned') {
    return (
      <div className="home">
        <div className="home__welcome home__welcome--unassigned">
          <h1>Bem-vindo, {user.name}!</h1>
          <p className="home__unassigned-message">
            Aguarde o administrador atribuir-lhe um papel (professor ou aluno de uma turma) para utilizar o sistema.
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="home">
        <div className="home__welcome">
          <h1>Data Labelling App</h1>
          <p>Por favor, faça login para continuar</p>
        </div>
      </div>
    );
  }

  // For student users, show student dashboard
  if (user.role === 'student') {
    const taskTypeLabel: Record<string, string> = { classification: 'Classificação', detection: 'Detecção', segmentation: 'Segmentação' };
    return (
      <div className="home">
        <h1 className="page-title">Início</h1>
        {/* Summary Cards for Student (3 cards como na imagem) */}
        <div className="home__summary-cards">
          <div className="home__summary-card home__summary-card--blue">
            <div className="home__summary-card-icon">
              <Icon name="check" size={32} />
            </div>
            <div className="home__summary-card-content">
              <h3 className="home__summary-card-title">Exercícios Respondidos</h3>
              <p className="home__summary-card-value">{studentStats?.total_completed ?? 0}</p>
            </div>
          </div>
          <div className="home__summary-card home__summary-card--blue-secondary">
            <div className="home__summary-card-icon">
              <Icon name="target" size={32} />
            </div>
            <div className="home__summary-card-content">
              <h3 className="home__summary-card-title">Taxa de Acerto</h3>
              <p className="home__summary-card-value">{studentStats ? `${studentStats.average_score.toFixed(0)}%` : '0%'}</p>
            </div>
          </div>
          <div className="home__summary-card home__summary-card--blue-light">
            <div className="home__summary-card-icon">
              <Icon name="assignment" size={32} />
            </div>
            <div className="home__summary-card-content">
              <h3 className="home__summary-card-title">Exercícios Pendentes</h3>
              <p className="home__summary-card-value">{pendingExercises.length}</p>
            </div>
          </div>
        </div>

        <div className="home__content-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '1rem' }}>
          {/* Exercícios Pendentes */}
          <div className="home__recent-activity">
            <div className="home__recent-activity-header">
              <h2 className="home__section-title">Exercícios Pendentes</h2>
              <button
                type="button"
                className="home__see-all-btn"
                onClick={() => navigate('/exercises/resolution')}
              >
                Ver todos
                <Icon name="arrowRight" size={14} style={{ marginLeft: '6px', verticalAlign: 'middle' }} />
              </button>
            </div>
            <div className="home__activity-list">
              {pendingExercises.length > 0 ? (
                pendingExercises.slice(0, 5).map((ex) => (
                  <div key={ex._id} className="home__activity-item" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        backgroundColor: ex.task_type === 'segmentation' ? '#e8f5e9' : '#e3f2fd',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Icon name={getExerciseTypeIconName(ex.task_type)} size={18} color={ex.task_type === 'segmentation' ? '#2e7d32' : '#1565c0'} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="home__activity-title" style={{ margin: 0, fontWeight: 600 }}>{ex.title}</p>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#666' }}>{taskTypeLabel[ex.task_type || 'classification'] || ex.task_type}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate('/exercises/resolution', { state: { openExerciseId: ex._id } })}
                      className="home__open-exercise-link"
                      style={{ background: 'none', border: 'none', padding: 0, color: '#1565c0', cursor: 'pointer', fontSize: '0.9rem', textDecoration: 'underline' }}
                    >
                      Abrir exercício
                    </button>
                  </div>
                ))
              ) : (
                <p className="home__no-activity">Nenhum exercício pendente</p>
              )}
            </div>
          </div>

          {/* Atividade Recente */}
          <div className="home__recent-activity">
            <div className="home__recent-activity-header">
              <h2 className="home__section-title">Atividade Recente</h2>
              <button
                type="button"
                className="home__see-all-btn"
                onClick={() => setShowActivitiesModal(true)}
              >
                Ver tudo
                <Icon name="arrowRight" size={14} style={{ marginLeft: '6px', verticalAlign: 'middle' }} />
              </button>
            </div>
            <div className="home__activity-list">
              {recentActivities.length > 0 ? (
                recentActivities.map((activity) => (
                  <div key={activity._id} className="home__activity-item">
                    <div className="home__activity-icon">{getActivityIcon(activity.action_type)}</div>
                    <div className="home__activity-content">
                      <p className="home__activity-title">{getActivityTitle(activity.action_type, activity.description)}</p>
                      <p className="home__activity-details">{activity.description}</p>
                      <p className="home__activity-timestamp">{formatTimestamp(activity.created_at)}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="home__no-activity">Nenhuma atividade recente</p>
              )}
            </div>
          </div>
        </div>

        {/* Activities Modal */}
        <Modal
          isOpen={showActivitiesModal}
          onClose={() => setShowActivitiesModal(false)}
          title="Todas as Atividades"
          size="lg"
        >
          <div className="home__all-activities">
            {allActivities.length > 0 ? (
              <div className="home__activities-list-full">
                {allActivities.map((activity) => (
                  <div key={activity._id} className="home__activity-item-full">
                    <div className="home__activity-icon">{getActivityIcon(activity.action_type)}</div>
                    <div className="home__activity-content-full">
                      <p className="home__activity-title-full">
                        {getActivityTitle(activity.action_type, activity.description)}
                      </p>
                      <p className="home__activity-details-full">{activity.description}</p>
                      <p className="home__activity-timestamp-full">
                        {new Date(activity.created_at).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="home__no-activity">Nenhuma atividade registrada</p>
            )}
          </div>
        </Modal>
      </div>
    );
  }

  // For other roles (admin), show simple welcome
  if (user.role !== 'teacher') {
    return (
      <div className="home">
        <div className="home__welcome">
          <h1>Bem-vindo, {user.name}!</h1>
          <p>Papel: {user.role}</p>
        </div>
      </div>
    );
  }

  const handleOpenRanking = () => {
    setShowRankingModal(true);
    setRankingLoading(true);
    setRanking(null);
    getRanking(50, selectedClassId ?? undefined)
      .then(setRanking)
      .catch(() => setRanking({ global: [], by_class: [] }))
      .finally(() => setRankingLoading(false));
  };

  return (
    <div className="home">
      <h1 className="page-title">Início</h1>
      {/* Summary Cards for Teacher (clicáveis -> dashboard) */}
      <div className="home__summary-cards">
        <div
          className="home__summary-card home__summary-card--white"
          onClick={() => navigate('/exercises/dashboard')}
          style={{ cursor: 'pointer' }}
          title="Ver detalhes no dashboard"
        >
          <div className="home__summary-card-icon">
            <Icon name="file" size={32} />
          </div>
          <div className="home__summary-card-content">
            <h3 className="home__summary-card-title">Exercícios Criados</h3>
            <p className="home__summary-card-value">{teacherStats?.total_exercises || 0}</p>
          </div>
        </div>
        <div
          className="home__summary-card home__summary-card--blue"
          onClick={() => navigate('/exercises/dashboard')}
          style={{ cursor: 'pointer' }}
          title="Ver detalhes no dashboard"
        >
          <div className="home__summary-card-icon">
            <Icon name="group" size={32} />
          </div>
          <div className="home__summary-card-content">
            <h3 className="home__summary-card-title">Total de Alunos</h3>
            <p className="home__summary-card-value">{teacherStats?.total_students || 0}</p>
          </div>
        </div>
        <div
          className="home__summary-card home__summary-card--blue-secondary"
          onClick={() => navigate('/exercises/dashboard')}
          style={{ cursor: 'pointer' }}
          title="Ver detalhes no dashboard"
        >
          <div className="home__summary-card-icon">
            <Icon name="check" size={32} />
          </div>
          <div className="home__summary-card-content">
            <h3 className="home__summary-card-title">Taxa de Conclusão</h3>
            <p className="home__summary-card-value">{teacherStats ? `${teacherStats.completion_rate.toFixed(0)}%` : '0%'}</p>
          </div>
        </div>
        <div
          className="home__summary-card home__summary-card--blue-light"
          onClick={() => navigate('/exercises/dashboard')}
          style={{ cursor: 'pointer' }}
          title="Ver detalhes no dashboard"
        >
          <div className="home__summary-card-icon">
            <Icon name="target" size={32} />
          </div>
          <div className="home__summary-card-content">
            <h3 className="home__summary-card-title">Média de Notas</h3>
            <p className="home__summary-card-value">{teacherStats ? `${teacherStats.average_score.toFixed(0)}%` : '0%'}</p>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="home__content-grid">
        {/* Quick Access */}
        <div className="home__quick-access">
          <h2 className="home__section-title">Acesso Rápido</h2>
          <div className="home__quick-access-cards">
            <div 
              className="home__quick-access-card home__quick-access-card--orange"
              onClick={() => navigate('/exercises')}
            >
              <div className="home__quick-access-icon">
                <Icon name="exercises" size={48} />
              </div>
              <h3 className="home__quick-access-title">Exercícios</h3>
              <p className="home__quick-access-description">
                Gerenciar exercícios e ver submissões
              </p>
            </div>
            <div 
              className="home__quick-access-card home__quick-access-card--blue-dark"
              onClick={() => navigate('/datasets')}
            >
              <div className="home__quick-access-icon">
                <Icon name="datasets" size={48} color="#fff" />
              </div>
              <h3 className="home__quick-access-title">Datasets</h3>
              <p className="home__quick-access-description">
                Gerenciar conjuntos de dados
              </p>
            </div>
          </div>
          <div 
            className="home__quick-access-card home__quick-access-card--green-small"
            onClick={() => navigate('/exercises/dashboard')}
          >
            <div className="home__quick-access-icon">
              <Icon name="trophy" size={48} />
            </div>
            <h3 className="home__quick-access-title">Dashboard</h3>
            <p className="home__quick-access-description">
              Visualizar estatísticas e desempenho dos alunos
            </p>
          </div>
          <div 
            className="home__quick-access-card home__quick-access-card--purple"
            onClick={handleOpenRanking}
            style={{ marginTop: '0.5rem' }}
          >
            <div className="home__quick-access-icon">
              <Icon name="chart" size={48} />
            </div>
            <h3 className="home__quick-access-title">Ranking</h3>
            <p className="home__quick-access-description">
              Alunos com maior pontuação por turma e global
            </p>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="home__recent-activity">
          <div className="home__recent-activity-header">
            <h2 className="home__section-title">Atividade Recente</h2>
            <button 
              className="home__see-all-btn"
              onClick={() => setShowActivitiesModal(true)}
            >
              Ver tudo
              <Icon name="arrowRight" size={14} style={{ marginLeft: '6px', verticalAlign: 'middle' }} />
            </button>
          </div>
          <div className="home__activity-list">
            {recentActivities.length > 0 ? (
              recentActivities.map((activity) => (
                <div key={activity._id} className="home__activity-item">
                  <div className="home__activity-icon">{getActivityIcon(activity.action_type)}</div>
                  <div className="home__activity-content">
                    <p className="home__activity-title">
                      {getActivityTitle(activity.action_type, activity.description)}
                    </p>
                    <p className="home__activity-details">{activity.description}</p>
                    <p className="home__activity-timestamp">{formatTimestamp(activity.created_at)}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="home__no-activity">Nenhuma atividade recente</p>
            )}
          </div>
        </div>
      </div>

      {/* Activities Modal */}
      <Modal
        isOpen={showActivitiesModal}
        onClose={() => setShowActivitiesModal(false)}
        title="Todas as Atividades"
        size="lg"
      >
        <div className="home__all-activities">
          {allActivities.length > 0 ? (
            <div className="home__activities-list-full">
              {allActivities.map((activity) => (
                <div key={activity._id} className="home__activity-item-full">
                  <div className="home__activity-icon">{getActivityIcon(activity.action_type)}</div>
                  <div className="home__activity-content-full">
                    <p className="home__activity-title-full">
                      {getActivityTitle(activity.action_type, activity.description)}
                    </p>
                    <p className="home__activity-details-full">{activity.description}</p>
                    <p className="home__activity-timestamp-full">
                      {new Date(activity.created_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="home__no-activity">Nenhuma atividade registrada</p>
          )}
        </div>
      </Modal>

      {/* Ranking Modal */}
      <Modal
        isOpen={showRankingModal}
        onClose={() => setShowRankingModal(false)}
        title="Ranking de Alunos"
        size="lg"
      >
        <div style={{ padding: '0.5rem 0' }}>
          {rankingLoading ? (
            <InlineLoader message="Carregando ranking..." />
          ) : ranking ? (
            <>
              <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Global</h3>
              {ranking.global.length === 0 ? (
                <p style={{ color: '#666' }}>Nenhum dado ainda.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {ranking.global.map((e) => (
                    <li key={e.user_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>
                      <span><strong>#{e.rank}</strong> {e.name}</span>
                      <span>{e.average_score.toFixed(1)}%</span>
                    </li>
                  ))}
                </ul>
              )}
              {ranking.by_class.length > 0 && (
                <>
                  <h3 style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>Por turma</h3>
                  {ranking.by_class.map((cls) => (
                    <div key={cls.class_id} style={{ marginBottom: '1.5rem' }}>
                      <h4 style={{ marginBottom: '0.5rem', color: '#333' }}>{cls.class_name}</h4>
                      <ul style={{ listStyle: 'none', padding: 0 }}>
                        {cls.students.map((e) => (
                          <li key={e.user_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid #f0f0f0' }}>
                            <span><strong>#{e.rank}</strong> {e.name}</span>
                            <span>{e.average_score.toFixed(1)}%</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </>
              )}
            </>
          ) : null}
        </div>
      </Modal>
    </div>
  );
};

export default Home;
