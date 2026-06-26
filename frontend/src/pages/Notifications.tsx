import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getReportsList, updateReportStatus, ReportProps } from '../services/ReportsService';
import { getAllActions, deleteAction, clearAllActions, UserAction } from '../services/ActionsService';
import Card from '../components/Card/Card';
import Button from '../components/Fields/Button';
import Modal from '../components/Modal/Modal';
import { useAuth } from '../contexts/Authentication';
import { useAlertConfirm } from '../contexts/AlertConfirmContext';
import { Icon } from '../components/Icons/Icons';
import InlineLoader from '../components/InlineLoader/InlineLoader';

const Notifications: React.FC = () => {
  const { user } = useAuth();
  const { alert: showAlert, confirm: showConfirm } = useAlertConfirm();
  const navigate = useNavigate();
  const [reports, setReports] = useState<ReportProps[]>([]);
  const [actions, setActions] = useState<UserAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<ReportProps | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const isStudent = user?.role === 'student';

  useEffect(() => {
    if (isStudent) {
      loadActions();
    } else {
      loadReports();
    }
  }, [isStudent]);

  const loadActions = async () => {
    try {
      setLoading(true);
      const list = await getAllActions();
      setActions(list);
    } catch (error) {
      console.error('Erro ao carregar notificações:', error);
      showAlert('Erro ao carregar notificações');
    } finally {
      setLoading(false);
    }
  };

  const loadReports = async () => {
    try {
      setLoading(true);
      const reportsList = await getReportsList();
      setReports(reportsList);
    } catch (error) {
      console.error('Erro ao carregar reportes:', error);
      showAlert('Erro ao carregar reportes');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (reportId: string, newStatus: 'pending' | 'resolved' | 'dismissed') => {
    try {
      await updateReportStatus(reportId, newStatus);
      await loadReports();
      if (selectedReport?._id === reportId) {
        setSelectedReport({ ...selectedReport, status: newStatus });
      }
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      showAlert('Erro ao atualizar status do reporte');
    }
  };

  const handleViewDetails = (report: ReportProps) => {
    setSelectedReport(report);
    setShowDetailModal(true);
  };

  const handleActionClick = (action: UserAction) => {
    const exerciseId = action.metadata?.exercise_id;
    if (exerciseId && (action.action_type === 'new_exercise_in_class' || action.action_type === 'exercise_manually_corrected')) {
      navigate('/exercises/resolution', { state: { openExerciseId: exerciseId } });
    } else {
      navigate('/exercises/resolution');
    }
  };

  const handleDeleteAction = async (e: React.MouseEvent, actionId: string) => {
    e.stopPropagation();
    try {
      await deleteAction(actionId);
      setActions((prev) => prev.filter((a) => a._id !== actionId));
    } catch (err) {
      console.error('Erro ao apagar notificação:', err);
      showAlert('Erro ao apagar notificação');
    }
  };

  const handleClearAllActions = async () => {
    if (actions.length === 0) return;
    const ok = await showConfirm('Apagar todas as notificações?');
    if (!ok) return;
    try {
      await clearAllActions();
      await loadActions();
    } catch (err) {
      console.error('Erro ao limpar notificações:', err);
      showAlert('Erro ao limpar notificações');
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: { bg: '#fff3cd', color: '#856404', border: '#ffc107', icon: <Icon name="clock" size={16} /> },
      resolved: { bg: '#d4edda', color: '#155724', border: '#28a745', icon: <Icon name="check" size={16} /> },
      dismissed: { bg: '#f8d7da', color: '#721c24', border: '#dc3545', icon: <Icon name="cancel" size={16} /> }
    };
    const style = styles[status as keyof typeof styles] || styles.pending;

    return (
      <span style={{
        padding: '0.4rem 0.8rem',
        borderRadius: '6px',
        fontSize: '0.85rem',
        fontWeight: '600',
        backgroundColor: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', marginRight: '6px' }}>
          {style.icon}
        </span>
        {status === 'pending' ? 'Pendente' : status === 'resolved' ? 'Resolvido' : 'Descartado'}
      </span>
    );
  };

  const getReportTypeBadge = (type: string) => {
    return type === 'error' ? (
      <span style={{
        padding: '0.4rem 0.8rem',
        borderRadius: '6px',
        fontSize: '0.85rem',
        fontWeight: '600',
        backgroundColor: '#ffebee',
        color: '#c62828',
        border: '1px solid #ef5350'
      }}>
        🐛 Erro na Pergunta
      </span>
    ) : (
      <span style={{
        padding: '0.4rem 0.8rem',
        borderRadius: '6px',
        fontSize: '0.85rem',
        fontWeight: '600',
        backgroundColor: '#fff3e0',
        color: '#e65100',
        border: '1px solid #ff9800'
      }}>
        ⚠️ Atividade Não Rotulada
      </span>
    );
  };

  const pendingCount = reports.filter(r => r.status === 'pending').length;

  if (loading) {
    return <div className="notifications"><InlineLoader message="Carregando..." /></div>;
  }

  // ——— Aluno: lista de notificações (ações) ———
  if (isStudent) {
    return (
      <div className="notifications">
        <div className="notifications__header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <h1 className="page-title" style={{ margin: 0 }}>Notificações</h1>
          {actions.length > 0 && (
            <Button variant="secondary" onClick={handleClearAllActions} style={{ fontSize: '0.9rem' }}>
              <Icon name="delete" size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
              Limpar todas
            </Button>
          )}
        </div>

        {actions.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '3rem',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            border: '1px solid #dee2e6'
          }}>
            <p style={{ fontSize: '1.1rem', color: '#6c757d', margin: 0 }}>
              Nenhuma notificação
            </p>
            <p style={{ fontSize: '0.9rem', color: '#868e96', marginTop: '0.5rem' }}>
              Quando houver novidades na sua turma (novos exercícios, correções), elas aparecerão aqui.
            </p>
          </div>
        ) : (
          <div className="notifications__list">
            {actions.map((action) => (
              <div key={action._id} style={{ position: 'relative' }}>
                <Card
                  title={action.action_type === 'new_exercise_in_class' ? 'Novo exercício' : action.action_type === 'exercise_manually_corrected' ? 'Correção do professor' : 'Notificação'}
                  description={
                    <div>
                      <p style={{ margin: 0, fontSize: '1rem', color: '#333' }}>{action.description}</p>
                      <span style={{ fontSize: '0.85rem', color: '#888', marginTop: '0.5rem', display: 'block' }}>
                        {action.created_at ? new Date(action.created_at).toLocaleString('pt-BR') : ''}
                      </span>
                    </div>
                  }
                  footer={
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteAction(e, action._id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#6c757d',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                          padding: '0.25rem 0.5rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                        title="Apagar notificação"
                      >
                        <Icon name="delete" size={14} />
                        Apagar
                      </button>
                    </div>
                  }
                  onClick={
                    action.metadata?.exercise_id
                      ? () => handleActionClick(action)
                      : undefined
                  }
                  cardStyle="card card--default"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ——— Professor/Admin: reportes ———
  return (
    <div className="notifications">
      <div className="notifications__header">
        <h1 className="page-title">Notificações e Reportes</h1>
        {pendingCount > 0 && (
          <div style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#ffc107',
            borderRadius: '20px',
            color: '#856404',
            fontWeight: '600',
            fontSize: '0.9rem'
          }}>
            {pendingCount} pendente{pendingCount !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {reports.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '3rem',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          border: '1px solid #dee2e6'
        }}>
          <p style={{ fontSize: '1.1rem', color: '#6c757d', margin: 0 }}>
            📭 Nenhum reporte encontrado
          </p>
          <p style={{ fontSize: '0.9rem', color: '#868e96', marginTop: '0.5rem' }}>
            Quando alunos reportarem problemas, eles aparecerão aqui.
          </p>
        </div>
      ) : (
        <div className="notifications__list">
          {reports.map((report) => (
            <Card
              key={report._id}
              title={report.exerciseTitle || 'Exercício desconhecido'}
              description={
                <div>
                  <div style={{ marginBottom: '0.5rem' }}>
                    {getReportTypeBadge(report.reportType)}
                  </div>
                  <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.5rem' }}>
                    <strong>Aluno:</strong> {report.userName || 'Usuário desconhecido'} ({report.userEmail || 'Email não disponível'})
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#888', maxHeight: '60px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {report.description}
                  </div>
                  <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {getStatusBadge(report.status)}
                    {report.createdAt && (
                      <span style={{ fontSize: '0.8rem', color: '#999' }}>
                        {new Date(report.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </div>
                </div>
              }
              footer={
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <Button
                    variant="secondary"
                    onClick={() => handleViewDetails(report)}
                    style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
                  >
                    Ver Detalhes
                  </Button>
                  {report.status === 'pending' && (
                    <>
                      <Button
                        onClick={() => report._id && handleStatusChange(report._id, 'resolved')}
                        style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem', backgroundColor: '#28a745', color: 'white' }}
                      >
                        <Icon name="check" size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                        Resolver
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => report._id && handleStatusChange(report._id, 'dismissed')}
                        style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
                      >
                        <Icon name="cancel" size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                        Descartar
                      </Button>
                    </>
                  )}
                </div>
              }
              cardStyle="card card--default"
            />
          ))}
        </div>
      )}

      <Modal
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedReport(null);
        }}
        size="lg"
        title={`Detalhes do Reporte - ${selectedReport?.exerciseTitle || 'Exercício desconhecido'}`}
      >
        {selectedReport && (
          <div style={{ padding: '1rem' }}>
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ marginBottom: '0.5rem', color: '#495057' }}>Tipo de Reporte</h4>
              {getReportTypeBadge(selectedReport.reportType)}
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ marginBottom: '0.5rem', color: '#495057' }}>Status</h4>
              {getStatusBadge(selectedReport.status)}
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ marginBottom: '0.5rem', color: '#495057' }}>Aluno</h4>
              <p style={{ margin: 0, color: '#666' }}>
                <strong>Nome:</strong> {selectedReport.userName || 'Usuário desconhecido'}<br />
                <strong>Email:</strong> {selectedReport.userEmail || 'Email não disponível'}
              </p>
            </div>

            {selectedReport.mediaId && (
              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ marginBottom: '0.5rem', color: '#495057' }}>Mídia</h4>
                <p style={{ margin: 0, color: '#666', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                  {selectedReport.mediaId}
                </p>
              </div>
            )}

            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ marginBottom: '0.5rem', color: '#495057' }}>Descrição</h4>
              <div style={{
                padding: '1rem',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                border: '1px solid #dee2e6',
                whiteSpace: 'pre-wrap',
                color: '#495057',
                lineHeight: '1.6'
              }}>
                {selectedReport.description}
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ marginBottom: '0.5rem', color: '#495057' }}>Datas</h4>
              <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>
                <strong>Criado em:</strong> {selectedReport.createdAt ? new Date(selectedReport.createdAt).toLocaleString('pt-BR') : 'Data não disponível'}<br />
                {selectedReport.updatedAt && selectedReport.updatedAt !== selectedReport.createdAt && (
                  <>
                    <strong>Atualizado em:</strong> {new Date(selectedReport.updatedAt).toLocaleString('pt-BR')}
                  </>
                )}
              </p>
            </div>

            {selectedReport.status === 'pending' && (
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid #dee2e6' }}>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowDetailModal(false);
                    setSelectedReport(null);
                  }}
                >
                  Fechar
                </Button>
                <Button
                  onClick={() => {
                    if (selectedReport._id) {
                      handleStatusChange(selectedReport._id, 'resolved');
                      setShowDetailModal(false);
                      setSelectedReport(null);
                    }
                  }}
                  style={{ backgroundColor: '#28a745', color: 'white' }}
                >
                  <Icon name="check" size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                  Marcar como Resolvido
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    if (selectedReport._id) {
                      handleStatusChange(selectedReport._id, 'dismissed');
                      setShowDetailModal(false);
                      setSelectedReport(null);
                    }
                  }}
                >
                  ❌ Descartar
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Notifications;
