import React, { useEffect, useState } from 'react';
import { getTeacherDashboardStats, DashboardStats, getExerciseCommonErrors, CommonError } from '../../services/ExercisesService';
import { useSelectedClass } from '../../contexts/SelectedClass';
import { useAlertConfirm } from '../../contexts/AlertConfirmContext';
import { Icon } from '../../components/Icons/Icons';
import Modal from '../../components/Modal/Modal';
import { useCountUp } from '../../hooks/useCountUp';
import { ResponseMatrix, StudentEvolution, InsightsPanel, LabelPerformance } from '../../components/Dashboard';
import './Dashboard.scss';

const Dashboard: React.FC = () => {
  const { selectedClassId } = useSelectedClass();
  const { alert: showAlert } = useAlertConfirm();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
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
  }, [selectedClassId]);

  const animatedTotalExercises = useCountUp(stats?.total_exercises ?? 0);
  const animatedTotalSubmissions = useCountUp(stats?.total_submissions ?? 0);
  const animatedTotalStudents = useCountUp(stats?.total_students ?? 0);
  const animatedAverageScore = useCountUp(stats?.average_score ?? 0, { duration: 1000, decimals: 1 });
  const animatedCompletionRate = useCountUp(stats?.completion_rate ?? 0, { duration: 1000, decimals: 1 });

  if (loading) {
    return (
      <div className="dashboard dashboard--loading">
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
      <div className="dashboard dashboard--empty">
        <Icon name="chart" size={48} />
        <p>Nenhuma estatística disponível.</p>
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

  // Semantic colors for score ranges (red to green)
  const scoreRangeColors: Record<string, string> = {
    '0-20': '#C44536',    // Red (critical)
    '21-40': '#B45309',   // Orange (low)
    '41-60': '#D4A017',   // Yellow (medium)
    '61-80': '#5B9A4D',   // Light green (good)
    '81-100': '#0F7A6B',  // Green (excellent)
  };

  const getScoreRangeColor = (range: string): string => {
    return scoreRangeColors[range] || '#4C7A9B';
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return '#0F7A6B';
    if (score >= 50) return '#B45309';
    return '#C44536';
  };

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <h1 className="page-title">Dashboard de Exercícios</h1>
      </div>
      
      {/* Summary Cards */}
      <div className="dashboard__summary">
        <div className="dashboard__stat-card dashboard__stat-card--primary">
          <div className="dashboard__stat-icon">
            <Icon name="exercises" size={24} />
          </div>
          <div className="dashboard__stat-content">
            <span className="dashboard__stat-value">{animatedTotalExercises}</span>
            <span className="dashboard__stat-label">Exercícios</span>
          </div>
        </div>

        <div className="dashboard__stat-card dashboard__stat-card--secondary">
          <div className="dashboard__stat-icon">
            <Icon name="clipboard" size={24} />
          </div>
          <div className="dashboard__stat-content">
            <span className="dashboard__stat-value">{animatedTotalSubmissions}</span>
            <span className="dashboard__stat-label">Submissões</span>
          </div>
        </div>

        <div className="dashboard__stat-card dashboard__stat-card--info">
          <div className="dashboard__stat-icon">
            <Icon name="group" size={24} />
          </div>
          <div className="dashboard__stat-content">
            <span className="dashboard__stat-value">{animatedTotalStudents}</span>
            <span className="dashboard__stat-label">Alunos</span>
          </div>
        </div>

        <div className="dashboard__stat-card dashboard__stat-card--success">
          <div className="dashboard__stat-icon">
            <Icon name="target" size={24} />
          </div>
          <div className="dashboard__stat-content">
            <span className="dashboard__stat-value">{animatedAverageScore.toFixed(1)}%</span>
            <span className="dashboard__stat-label">Média Geral</span>
          </div>
        </div>

        <div className="dashboard__stat-card dashboard__stat-card--accent">
          <div className="dashboard__stat-icon">
            <Icon name="check" size={24} />
          </div>
          <div className="dashboard__stat-content">
            <span className="dashboard__stat-value">{animatedCompletionRate.toFixed(1)}%</span>
            <span className="dashboard__stat-label">Taxa de Conclusão</span>
          </div>
        </div>
      </div>

      {/* Charts Grid - Row 1: Donut + Insights */}
      <div className="dashboard__charts-grid">
        {/* Donut Chart - Score Distribution */}
        <div className="dashboard__chart-card">
          <h2 className="dashboard__chart-title">Distribuição de Notas</h2>
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
                    <span 
                      className="dashboard__legend-color" 
                      style={{ backgroundColor: color }}
                    />
                    <span className="dashboard__legend-text">{item.range}</span>
                    <span className="dashboard__legend-value">{item.count} ({percentage}%)</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Insights Panel - Replaces Histogram */}
        <div className="dashboard__chart-card">
          <h2 className="dashboard__chart-title">Insights Automáticos</h2>
          <p className="dashboard__chart-subtitle">Alertas e recomendações baseados nos dados</p>
          <InsightsPanel insights={stats.insights || []} />
        </div>
      </div>

      {/* Charts Grid - Row 2: Response Matrix/Label Performance + Student Evolution */}
      <div className="dashboard__charts-grid">
        {/* Response Matrix (only for classification) or Label Performance */}
        {stats.confusion_matrix?.labels?.length > 0 ? (
          <div className="dashboard__chart-card">
            <h2 className="dashboard__chart-title">Respostas vs Esperado</h2>
            <p className="dashboard__chart-subtitle">Comparação entre respostas dos alunos e gabarito (classificação)</p>
            <ResponseMatrix 
              labels={stats.confusion_matrix?.labels || []}
              matrix={stats.confusion_matrix?.matrix || []}
              total={stats.confusion_matrix?.total || 0}
            />
          </div>
        ) : stats.label_performance?.length > 0 ? (
          <div className="dashboard__chart-card">
            <h2 className="dashboard__chart-title">Desempenho por Rótulo</h2>
            <p className="dashboard__chart-subtitle">Acurácia de classificação por classe</p>
            <LabelPerformance data={stats.label_performance || []} />
          </div>
        ) : (
          <div className="dashboard__chart-card">
            <h2 className="dashboard__chart-title">Respostas vs Esperado</h2>
            <p className="dashboard__chart-subtitle">Comparação entre respostas dos alunos e gabarito (classificação)</p>
            <ResponseMatrix 
              labels={[]}
              matrix={[]}
              total={0}
            />
          </div>
        )}

        {/* Student Evolution */}
        <div className="dashboard__chart-card">
          <h2 className="dashboard__chart-title">Evolução dos Alunos</h2>
          <p className="dashboard__chart-subtitle">Nota média e submissões por semana</p>
          <StudentEvolution data={stats.student_evolution || []} />
        </div>
      </div>

      {/* Exercises Table */}
      <div className="dashboard__table-section">
        <h2 className="dashboard__table-title">Estatísticas por Exercício</h2>
        <p className="dashboard__table-subtitle">Desempenho detalhado dos exercícios - clique no título para ver erros frequentes</p>
        
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
                          borderColor: getScoreColor(exercise.average_score)
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
      </div>

      {/* Errors Modal */}
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
                              color: error.percentage >= 50 ? '#C44536' : error.percentage >= 25 ? '#B45309' : '#0F7A6B'
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
