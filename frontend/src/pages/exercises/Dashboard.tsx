import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Info } from 'lucide-react';
import { getTeacherDashboardStats, DashboardStats, getExerciseCommonErrors, CommonError } from '../../services/ExercisesService';
import { useSelectedClass } from '../../contexts/SelectedClass';
import { useAlertConfirm } from '../../contexts/AlertConfirmContext';
import { Icon } from '../../components/Icons/Icons';
import Modal from '../../components/Modal/Modal';
import { useCountUp } from '../../hooks/useCountUp';
import { ResponseMatrix, StudentEvolution, InsightsPanel, LabelPerformance } from '../../components/Dashboard';
import { PageHeader, Panel, Stat } from '../../components/dla';
import './Dashboard.scss';

const Dashboard: React.FC = () => {
  const { selectedClassId } = useSelectedClass();
  const { alert: showAlert } = useAlertConfirm();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [openDetail, setOpenDetail] = useState(false);
  const [showErrorsModal, setShowErrorsModal] = useState(false);
  const [selectedExerciseTitle, setSelectedExerciseTitle] = useState<string>('');
  const [commonErrors, setCommonErrors] = useState<CommonError[]>([]);
  const [errorsLoading, setErrorsLoading] = useState(false);
  const [totalSubmissions, setTotalSubmissions] = useState(0);

  useEffect(() => {
    const loadStats = async () => {
      setLoading(true);
      try {
        const data = await getTeacherDashboardStats(selectedClassId ?? undefined);
        setStats(data);
      } catch (error) {
        console.error('Erro ao carregar estatísticas:', error);
        showAlert('Erro ao carregar estatísticas do dashboard');
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [selectedClassId, showAlert]);

  const animatedTotalExercises = useCountUp(stats?.total_exercises ?? 0);
  const animatedTotalSubmissions = useCountUp(stats?.total_submissions ?? 0);
  const animatedTotalStudents = useCountUp(stats?.total_students ?? 0);
  const animatedAverageScore = useCountUp(stats?.average_score ?? 0, { duration: 1000, decimals: 1 });
  const animatedCompletionRate = useCountUp(stats?.completion_rate ?? 0, { duration: 1000, decimals: 1 });

  if (loading) {
    return (
      <div className="dashboard dashboard--loading space-y-6">
        <div className="dashboard__skeleton-header" />
        <div className="dashboard__skeleton-cards">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="dashboard__skeleton-card" />
          ))}
        </div>
        <div className="dashboard__skeleton-charts">
          <div className="dashboard__skeleton-chart" />
          <div className="dashboard__skeleton-chart" />
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="dashboard dashboard--empty space-y-6">
        <PageHeader eyebrow="Dashboard" title="Desempenho da turma" />
        <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
          <Icon name="chart" size={48} />
          <p>Nenhuma estatística disponível.</p>
        </div>
      </div>
    );
  }

  const handleExerciseClick = async (exerciseId: string, exerciseTitle: string) => {
    setSelectedExerciseTitle(exerciseTitle);
    setShowErrorsModal(true);
    setErrorsLoading(true);
    setCommonErrors([]);

    try {
      const errorsData = await getExerciseCommonErrors(exerciseId);
      setCommonErrors(errorsData.errors || []);
      setTotalSubmissions(errorsData.total_submissions || 0);
    } catch (error) {
      console.error('Erro ao carregar erros comuns:', error);
      showAlert('Erro ao carregar erros comuns do exercício');
    } finally {
      setErrorsLoading(false);
    }
  };

  const totalScoreCount = stats.score_distribution.reduce((sum, d) => sum + d.count, 0);

  const scoreRangeColors: Record<string, string> = {
    '0-20': '#C44536',
    '21-40': '#B45309',
    '41-60': '#D4A017',
    '61-80': '#5B9A4D',
    '81-100': '#0F7A6B',
  };

  const getScoreRangeColor = (range: string): string => scoreRangeColors[range] || '#4C7A9B';

  const getScoreColor = (score: number) => {
    if (score >= 70) return '#0F7A6B';
    if (score >= 50) return '#B45309';
    return '#C44536';
  };

  const insightLevelIcon = (type: string) => {
    if (type === 'success') return CheckCircle2;
    if (type === 'warning' || type === 'error') return AlertTriangle;
    return Info;
  };

  const insightLevelColor = (type: string) => {
    if (type === 'success') return 'text-success';
    if (type === 'warning' || type === 'error') return 'text-warning';
    return 'text-secondary';
  };

  return (
    <div className="dashboard space-y-6">
      <PageHeader
        eyebrow="Dashboard"
        title="Desempenho da turma"
        description="Indicadores e alertas automáticos. Gráficos e tabelas detalhados podem ser expandidos abaixo."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Exercícios" value={animatedTotalExercises} />
        <Stat label="Submissões" value={animatedTotalSubmissions} />
        <Stat label="Alunos com atividade" value={animatedTotalStudents} />
        <Stat label="Média geral" value={animatedAverageScore.toFixed(1)} unit="%" />
        <Stat label="Taxa de conclusão" value={animatedCompletionRate.toFixed(1)} unit="%" />
      </div>

      <Panel
        title="Insights automáticos"
        hint="Alertas descritivos emitidos pelo motor de avaliação"
        bodyClassName="p-0"
      >
        {(stats.insights || []).length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">Nenhum insight disponível no momento.</p>
        ) : (
          <ul className="divide-y divide-border">
            {(stats.insights || []).map((ins, i) => {
              const InsightIcon = insightLevelIcon(ins.type);
              return (
                <li key={i} className="flex gap-3 px-5 py-3.5">
                  <InsightIcon className={`mt-0.5 size-4 shrink-0 ${insightLevelColor(ins.type)}`} strokeWidth={1.75} />
                  <div>
                    <p className="text-sm font-medium text-foreground">{ins.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{ins.description}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <button
        type="button"
        onClick={() => setOpenDetail((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-border bg-surface px-5 py-3 text-sm font-semibold transition-colors duration-150 hover:border-secondary"
      >
        Análise detalhada
        <ChevronDown className={`size-4 transition-transform duration-200 ${openDetail ? 'rotate-180' : ''}`} />
      </button>

      {openDetail && (
        <>
          <div className="dashboard__charts-grid">
            <Panel title="Distribuição de notas" bodyClassName="dashboard__chart-card-body">
              <div className="dashboard__donut-container">
                <svg viewBox="0 0 200 200" className="dashboard__donut">
                  {stats.score_distribution.map((item, index) => {
                    const percentage = totalScoreCount > 0 ? (item.count / totalScoreCount) * 100 : 0;
                    const previousPercentages = stats.score_distribution
                      .slice(0, index)
                      .reduce((sum, d) => sum + (totalScoreCount > 0 ? (d.count / totalScoreCount) * 100 : 0), 0);

                    const circumference = 2 * Math.PI * 70;
                    const strokeDasharray = `${(percentage / 100) * circumference} ${circumference}`;
                    const rotation = (previousPercentages / 100) * 360 - 90;
                    const color = getScoreRangeColor(item.range);

                    return (
                      <circle
                        key={index}
                        cx="100"
                        cy="100"
                        r="70"
                        fill="none"
                        stroke={color}
                        strokeWidth="30"
                        strokeDasharray={strokeDasharray}
                        transform={`rotate(${rotation} 100 100)`}
                        className="dashboard__donut-segment"
                      >
                        <title>{item.range}: {item.count} ({percentage.toFixed(1)}%)</title>
                      </circle>
                    );
                  })}
                  <text x="100" y="95" textAnchor="middle" className="dashboard__donut-total">
                    {totalScoreCount}
                  </text>
                  <text x="100" y="115" textAnchor="middle" className="dashboard__donut-label">
                    alunos
                  </text>
                </svg>
                <div className="dashboard__donut-legend">
                  {stats.score_distribution.map((item, index) => {
                    const percentage = totalScoreCount > 0 ? ((item.count / totalScoreCount) * 100).toFixed(0) : '0';
                    const color = getScoreRangeColor(item.range);
                    return (
                      <div key={index} className="dashboard__legend-item">
                        <span className="dashboard__legend-color" style={{ backgroundColor: color }} />
                        <span className="dashboard__legend-text">{item.range}</span>
                        <span className="dashboard__legend-value">{item.count} ({percentage}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Panel>

            <Panel
              title="Insights automáticos (detalhado)"
              hint="Painel completo de alertas e recomendações"
              bodyClassName="dashboard__chart-card-body"
            >
              <InsightsPanel insights={stats.insights || []} />
            </Panel>
          </div>

          <div className="dashboard__charts-grid">
            {stats.confusion_matrix?.labels?.length > 0 ? (
              <Panel
                title="Respostas vs esperado"
                hint="Comparação entre respostas dos alunos e gabarito (classificação)"
                bodyClassName="dashboard__chart-card-body"
              >
                <ResponseMatrix
                  labels={stats.confusion_matrix?.labels || []}
                  matrix={stats.confusion_matrix?.matrix || []}
                  total={stats.confusion_matrix?.total || 0}
                />
              </Panel>
            ) : stats.label_performance?.length > 0 ? (
              <Panel
                title="Desempenho por rótulo"
                hint="Acurácia de classificação por classe"
                bodyClassName="dashboard__chart-card-body"
              >
                <LabelPerformance data={stats.label_performance || []} />
              </Panel>
            ) : (
              <Panel
                title="Respostas vs esperado"
                hint="Comparação entre respostas dos alunos e gabarito (classificação)"
                bodyClassName="dashboard__chart-card-body"
              >
                <ResponseMatrix labels={[]} matrix={[]} total={0} />
              </Panel>
            )}

            <Panel
              title="Evolução dos alunos"
              hint="Nota média e submissões por semana"
              bodyClassName="dashboard__chart-card-body"
            >
              <StudentEvolution data={stats.student_evolution || []} />
            </Panel>
          </div>

          <Panel
            title="Estatísticas por exercício"
            hint="Desempenho detalhado — clique no título para ver erros frequentes"
          >
            <div className="dashboard__table-wrapper">
              <table className="dashboard__table">
                <thead>
                  <tr>
                    <th>Exercício</th>
                    <th>Submissões</th>
                    <th>Finalizadas</th>
                    <th>Conclusão</th>
                    <th>Média</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.exercises_stats.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="dashboard__table-empty">
                        <Icon name="exercises" size={24} />
                        <span>Nenhum exercício encontrado</span>
                      </td>
                    </tr>
                  ) : (
                    stats.exercises_stats.map((exercise) => (
                      <tr key={exercise.exercise_id}>
                        <td>
                          <button
                            type="button"
                            className="dashboard__exercise-link"
                            onClick={() => handleExerciseClick(exercise.exercise_id, exercise.title)}
                            title="Clique para ver erros mais frequentes"
                          >
                            {exercise.title}
                          </button>
                        </td>
                        <td>{exercise.total_submissions}</td>
                        <td>{exercise.finalized_submissions}</td>
                        <td>
                          <div className="dashboard__progress-cell">
                            <div className="dashboard__mini-progress">
                              <div
                                className="dashboard__mini-progress-fill"
                                style={{ width: `${exercise.completion_rate}%` }}
                              />
                            </div>
                            <span>{exercise.completion_rate}%</span>
                          </div>
                        </td>
                        <td>
                          <span
                            className="dashboard__score-badge"
                            style={{
                              backgroundColor: `${getScoreColor(exercise.average_score)}15`,
                              color: getScoreColor(exercise.average_score),
                              borderColor: getScoreColor(exercise.average_score),
                            }}
                          >
                            {exercise.average_score.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}

      <Modal
        isOpen={showErrorsModal}
        onClose={() => {
          setShowErrorsModal(false);
          setSelectedExerciseTitle('');
          setCommonErrors([]);
        }}
        size="xl"
        title={`Erros Frequentes - ${selectedExerciseTitle}`}
      >
        <div className="dashboard__errors-modal">
          {errorsLoading ? (
            <div className="dashboard__errors-loading">
              <Icon name="refresh" size={24} className="dashboard__spinner" />
              <p>Carregando erros...</p>
            </div>
          ) : commonErrors.length === 0 ? (
            <div className="dashboard__errors-empty">
              <Icon name="check" size={48} />
              <p>Nenhum erro encontrado</p>
              {totalSubmissions > 0 && (
                <span className="dashboard__errors-info">
                  Total de submissões analisadas: {totalSubmissions}
                </span>
              )}
            </div>
          ) : (
            <>
              <div className="dashboard__errors-summary">
                <Icon name="clipboard" size={18} />
                <strong>Total de submissões analisadas:</strong> {totalSubmissions}
              </div>

              <div className="dashboard__errors-table-wrapper">
                <table className="dashboard__errors-table">
                  <thead>
                    <tr>
                      <th>Tipo de Erro</th>
                      <th>Label</th>
                      <th>Frequência</th>
                      <th>Porcentagem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commonErrors.map((error, index) => (
                      <tr key={index}>
                        <td>
                          <span className={`dashboard__error-type dashboard__error-type--${error.error_type}`}>
                            {error.error_type === 'wrong_label' ? 'Label Incorreto' : 'Label Faltando'}
                          </span>
                        </td>
                        <td className="dashboard__error-label">{error.label}</td>
                        <td className="dashboard__error-frequency">{error.frequency}</td>
                        <td>
                          <span
                            className="dashboard__error-percentage"
                            style={{
                              backgroundColor: error.percentage >= 50 ? '#FEE2E2' : error.percentage >= 25 ? '#FEF3C7' : '#D1FAF5',
                              color: error.percentage >= 50 ? '#C44536' : error.percentage >= 25 ? '#B45309' : '#0F7A6B',
                            }}
                          >
                            {error.percentage}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="dashboard__errors-legend">
                <strong>Legenda:</strong>
                <ul>
                  <li><strong>Label Incorreto:</strong> Label selecionado incorretamente pelo aluno</li>
                  <li><strong>Label Faltando:</strong> Label correto não selecionado pelo aluno</li>
                </ul>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default Dashboard;
