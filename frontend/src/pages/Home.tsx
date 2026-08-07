import { useEffect, useState } from "react";
import {
  ArrowRight,
  Database,
  GraduationCap,
  ListChecks,
  PenTool,
  Trophy,
} from "lucide-react";
import { useAuth } from "../contexts/Authentication";
import { useSelectedClass } from "../contexts/SelectedClass";
import { useNavigate } from "react-router-dom";
import {
  getTeacherDashboardStats,
  DashboardStats,
  getStudentDashboard,
  StudentStats,
  getRanking,
  RankingResponse,
  PendingExercise,
} from "../services/ExercisesService";
import { getRecentActions, getAllActions, UserAction } from "../services/ActionsService";
import Modal from "../components/Modal/Modal";
import LoadingOverlay from "../components/LoadingOverlay/LoadingOverlay";
import InlineLoader from "../components/InlineLoader/InlineLoader";
import { PageHeader, Stat, Panel, Tag, Meter, EmptyState } from "../components/dla";

const MESES_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"] as const;

function formatDateTimePT(isoStr: string | undefined | null): string {
  if (!isoStr) return "—";
  try {
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return isoStr;
    const day = String(d.getDate()).padStart(2, "0");
    const month = MESES_PT[d.getMonth()];
    const year = d.getFullYear();
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${year} ${h}:${min}`;
  } catch {
    return isoStr ?? "—";
  }
}

const getActivityTitle = (actionType: string, description?: string): string => {
  const titleMap: Record<string, string> = {
    exercise_completed: "Exercício concluído",
    exercise_created: "Novo exercício criado",
    new_exercise_in_class: "Novo exercício na sua turma",
    submission_evaluated: "Submissão avaliada",
    dataset_created: "Dataset criado",
    dataset_updated: "Dataset atualizado",
    media_labeled: "Mídia rotulada",
    default: "Ação realizada",
  };

  if (actionType === "exercise_completed" && description) {
    const match = description.match(/Exercício '([^']+)'/);
    if (match) {
      return `Exercício "${match[1]}" concluído`;
    }
  }

  return titleMap[actionType] || titleMap["default"];
};

const formatTimestamp = (timestamp: string): string => {
  const now = new Date();
  const actionDate = new Date(timestamp);
  const diffMs = now.getTime() - actionDate.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return "Agora";
  if (diffHours < 24) return `Há ${diffHours}h`;
  if (diffDays === 1) return "Ontem";
  if (diffDays < 7) return `Há ${diffDays} dias`;
  return actionDate.toLocaleDateString("pt-BR");
};

const getTaskTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    classification: "Classificação",
    segmentation: "Segmentação",
    detection: "Detecção",
  };
  return labels[type] || type;
};

function AllActivitiesModal({
  open,
  onClose,
  activities,
}: {
  open: boolean;
  onClose: () => void;
  activities: UserAction[];
}) {
  return (
    <Modal isOpen={open} onClose={onClose} title="Todas as Atividades" size="lg">
      {activities.length === 0 ? (
        <EmptyState title="Nenhuma atividade registrada." />
      ) : (
        <ul className="divide-y divide-border">
          {activities.map((activity) => (
            <li key={activity._id} className="py-3">
              <p className="text-sm font-medium">{getActivityTitle(activity.action_type, activity.description)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{activity.description}</p>
              <p className="num mt-1 text-xs text-muted-foreground">
                {new Date(activity.created_at).toLocaleString("pt-BR")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function RankingModal({
  open,
  onClose,
  loading,
  ranking,
}: {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  ranking: RankingResponse | null;
}) {
  return (
    <Modal isOpen={open} onClose={onClose} title="Ranking de Alunos" size="lg">
      {loading ? (
        <InlineLoader message="Carregando ranking..." />
      ) : ranking ? (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold">Global</h3>
            {ranking.global.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nenhum dado ainda.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border">
                {ranking.global.map((e) => (
                  <li key={e.user_id} className="flex items-center justify-between py-2 text-sm">
                    <span>
                      <strong className="num">#{e.rank}</strong> {e.name}
                    </span>
                    <span className="num font-semibold text-primary">{e.average_score.toFixed(1)}%</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {ranking.by_class.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold">Por turma</h3>
              {ranking.by_class.map((cls) => (
                <div key={cls.class_id} className="mt-3">
                  <h4 className="text-xs font-medium text-muted-foreground">{cls.class_name}</h4>
                  <ul className="mt-1 divide-y divide-border">
                    {cls.students.map((e) => (
                      <li key={e.user_id} className="flex items-center justify-between py-1.5 text-sm">
                        <span>
                          <strong className="num">#{e.rank}</strong> {e.name}
                        </span>
                        <span className="num text-muted-foreground">{e.average_score.toFixed(1)}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}

function TeacherHome({
  userName,
  stats,
  recentActivities,
  allActivities,
  showActivitiesModal,
  setShowActivitiesModal,
  showRankingModal,
  setShowRankingModal,
  ranking,
  rankingLoading,
  onOpenRanking,
}: {
  userName: string;
  stats: DashboardStats;
  recentActivities: UserAction[];
  allActivities: UserAction[];
  showActivitiesModal: boolean;
  setShowActivitiesModal: (v: boolean) => void;
  showRankingModal: boolean;
  setShowRankingModal: (v: boolean) => void;
  ranking: RankingResponse | null;
  rankingLoading: boolean;
  onOpenRanking: () => void;
}) {
  const navigate = useNavigate();

  const quick = [
    { to: "/exercises", label: "Exercícios", icon: ListChecks },
    { to: "/datasets", label: "Datasets", icon: Database },
    { to: "/exercises/dashboard", label: "Dashboard", icon: GraduationCap },
    { to: "/datasets/new", label: "Novo dataset", icon: PenTool },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Supervisor"
        title={`Bom trabalho, ${userName}`}
        description="Panorama da turma: prática assistida com avaliação geométrica automática e prática livre para geração de dataset."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Exercícios criados" value={stats.total_exercises} />
        <Stat label="Alunos ativos" value={stats.total_students} />
        <Stat
          label="Taxa de conclusão"
          value={stats.completion_rate.toFixed(1).replace(".", ",")}
          unit="%"
        />
        <Stat
          label="Média geral"
          value={stats.average_score.toFixed(1).replace(".", ",")}
          unit="%"
          note="Mistura detecção e segmentação"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Panel
          title="Exercícios da turma"
          action={
            <button
              type="button"
              onClick={() => navigate("/exercises")}
              className="flex items-center gap-1 text-xs font-semibold text-secondary transition-colors duration-150 hover:text-primary"
            >
              Ver todos
              <ArrowRight className="size-3.5" />
            </button>
          }
          bodyClassName="p-0"
        >
          {stats.exercises_stats.length === 0 ? (
            <div className="p-5">
              <EmptyState title="Nenhum exercício criado ainda." />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {stats.exercises_stats.map((ex) => (
                <li key={ex.exercise_id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{ex.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {ex.finalized_submissions} / {ex.total_submissions} submissões
                      </p>
                    </div>
                    <span className="num font-display text-lg font-semibold text-primary">
                      {ex.average_score.toFixed(1)}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <Meter value={ex.completion_rate} />
                    <span className="num w-10 shrink-0 text-right text-xs text-muted-foreground">
                      {ex.completion_rate.toFixed(0)}%
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Acesso rápido">
          <div className="grid gap-2">
            {quick.map((q) => (
              <button
                key={q.to}
                type="button"
                onClick={() => navigate(q.to)}
                className="flex items-center gap-3 rounded-md border border-border px-3.5 py-3 text-sm transition-colors duration-150 hover:border-secondary hover:bg-accent/50"
              >
                <q.icon className="size-4 text-secondary" strokeWidth={1.75} />
                {q.label}
                <ArrowRight className="ml-auto size-3.5 text-muted-foreground" />
              </button>
            ))}
            <button
              type="button"
              onClick={onOpenRanking}
              className="flex items-center gap-3 rounded-md border border-border px-3.5 py-3 text-sm transition-colors duration-150 hover:border-secondary hover:bg-accent/50"
            >
              <Trophy className="size-4 text-secondary" strokeWidth={1.75} />
              Ranking
              <ArrowRight className="ml-auto size-3.5 text-muted-foreground" />
            </button>
          </div>
        </Panel>
      </div>

      <Panel
        title="Atividade recente"
        action={
          <button
            type="button"
            onClick={() => setShowActivitiesModal(true)}
            className="flex items-center gap-1 text-xs font-semibold text-secondary transition-colors duration-150 hover:text-primary"
          >
            Ver tudo
            <ArrowRight className="size-3.5" />
          </button>
        }
        bodyClassName="p-0"
      >
        {recentActivities.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Nenhuma atividade recente." />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {recentActivities.map((activity) => (
              <li key={activity._id} className="flex items-baseline gap-3 px-5 py-3 text-sm">
                <span className="font-medium text-foreground">
                  {getActivityTitle(activity.action_type, activity.description)}
                </span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{activity.description}</span>
                <span className="num shrink-0 text-xs text-muted-foreground">
                  {formatTimestamp(activity.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <AllActivitiesModal
        open={showActivitiesModal}
        onClose={() => setShowActivitiesModal(false)}
        activities={allActivities}
      />
      <RankingModal
        open={showRankingModal}
        onClose={() => setShowRankingModal(false)}
        loading={rankingLoading}
        ranking={ranking}
      />
    </div>
  );
}

function StudentHome({
  userName,
  stats,
  pendingExercises,
  recentActivities,
  allActivities,
  showActivitiesModal,
  setShowActivitiesModal,
}: {
  userName: string;
  stats: StudentStats;
  pendingExercises: PendingExercise[];
  recentActivities: UserAction[];
  allActivities: UserAction[];
  showActivitiesModal: boolean;
  setShowActivitiesModal: (v: boolean) => void;
}) {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Anotador"
        title={`Olá, ${userName}`}
        description="Sua prática assistida recebe nota automática por IoU e F1; a prática livre estende a rotulação sem nota imediata."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Exercícios respondidos" value={stats.total_completed} />
        <Stat
          label="Taxa de acerto"
          value={stats.average_score.toFixed(1).replace(".", ",")}
          unit="%"
        />
        <Stat label="Pendentes" value={pendingExercises.length} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Panel
          title="Exercícios pendentes"
          action={
            <button
              type="button"
              onClick={() => navigate("/exercises/resolution")}
              className="flex items-center gap-1 text-xs font-semibold text-secondary transition-colors duration-150 hover:text-primary"
            >
              Ver todos
              <ArrowRight className="size-3.5" />
            </button>
          }
          bodyClassName="p-0"
        >
          {pendingExercises.length === 0 ? (
            <div className="p-5">
              <EmptyState title="Nada pendente por agora." />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {pendingExercises.slice(0, 5).map((ex) => (
                <li key={ex._id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <p className="text-sm font-medium">{ex.title}</p>
                    <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      {ex.do_date && (
                        <Tag tone="warning">Prazo {formatDateTimePT(ex.do_date)}</Tag>
                      )}
                      <span>{getTaskTypeLabel(ex.task_type || "classification")}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      navigate("/exercises/resolution", { state: { openExerciseId: ex._id } })
                    }
                    className="rounded-md bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary/90"
                  >
                    Abrir exercício
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Atividade recente"
          action={
            <button
              type="button"
              onClick={() => setShowActivitiesModal(true)}
              className="flex items-center gap-1 text-xs font-semibold text-secondary transition-colors duration-150 hover:text-primary"
            >
              Ver tudo
              <ArrowRight className="size-3.5" />
            </button>
          }
          bodyClassName="p-0"
        >
          {recentActivities.length === 0 ? (
            <div className="p-5">
              <EmptyState title="Nenhuma atividade recente." />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {recentActivities.map((activity) => (
                <li key={activity._id} className="px-5 py-3">
                  <p className="text-sm font-medium">
                    {getActivityTitle(activity.action_type, activity.description)}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{activity.description}</p>
                  <p className="num mt-1 text-xs text-muted-foreground">
                    {formatTimestamp(activity.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <AllActivitiesModal
        open={showActivitiesModal}
        onClose={() => setShowActivitiesModal(false)}
        activities={allActivities}
      />
    </div>
  );
}

const Home: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { selectedClassId } = useSelectedClass();
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
      if (!user) return;

      try {
        if (user.role === "teacher") {
          const dashboardStats = await getTeacherDashboardStats(selectedClassId ?? undefined);
          setTeacherStats(dashboardStats);
        } else if (user.role === "student") {
          const dashboard = await getStudentDashboard();
          setStudentStats(dashboard.stats);
          setPendingExercises(dashboard.pending_exercises || []);
        }

        try {
          const actions = await getRecentActions(3);
          setRecentActivities(actions || []);
        } catch (actionError) {
          console.error("Erro ao carregar atividades recentes:", actionError);
          setRecentActivities([]);
        }

        try {
          const all = await getAllActions();
          setAllActivities(all || []);
        } catch (allActionsError) {
          console.error("Erro ao carregar todas as atividades:", allActionsError);
          setAllActivities([]);
        }
      } catch (error) {
        console.error("Erro ao carregar dados:", error);
      }
    };

    if (isAuthenticated && user) {
      loadData();
    }
  }, [user, isAuthenticated, selectedClassId]);

  const handleOpenRanking = () => {
    setShowRankingModal(true);
    setRankingLoading(true);
    setRanking(null);
    getRanking(50, selectedClassId ?? undefined)
      .then(setRanking)
      .catch(() => setRanking({ global: [], by_class: [] }))
      .finally(() => setRankingLoading(false));
  };

  if (isLoading || (user?.role === "teacher" && !teacherStats) || (user?.role === "student" && !studentStats)) {
    return <LoadingOverlay />;
  }

  if (user && user.role === "unassigned") {
    return (
      <div className="space-y-4">
        <PageHeader eyebrow="DLA" title={`Bem-vindo, ${user.name}`} />
        <EmptyState
          title="Conta sem papel atribuído."
          description="Aguarde o administrador atribuir-lhe um papel (professor ou aluno de uma turma) para utilizar o sistema."
        />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="space-y-4">
        <PageHeader title="Data Labelling App" description="Por favor, faça login para continuar." />
      </div>
    );
  }

  if (user.role === "student") {
    return (
      <StudentHome
        userName={user.name}
        stats={studentStats!}
        pendingExercises={pendingExercises}
        recentActivities={recentActivities}
        allActivities={allActivities}
        showActivitiesModal={showActivitiesModal}
        setShowActivitiesModal={setShowActivitiesModal}
      />
    );
  }

  if (user.role !== "teacher") {
    return (
      <div className="space-y-4">
        <PageHeader title={`Bem-vindo, ${user.name}`} description={`Papel: ${user.role}`} />
      </div>
    );
  }

  return (
    <TeacherHome
      userName={user.name}
      stats={teacherStats!}
      recentActivities={recentActivities}
      allActivities={allActivities}
      showActivitiesModal={showActivitiesModal}
      setShowActivitiesModal={setShowActivitiesModal}
      showRankingModal={showRankingModal}
      setShowRankingModal={setShowRankingModal}
      ranking={ranking}
      rankingLoading={rankingLoading}
      onOpenRanking={handleOpenRanking}
    />
  );
};

export default Home;
