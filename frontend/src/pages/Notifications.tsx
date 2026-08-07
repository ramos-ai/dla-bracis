import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, X, Trash2, Bell, ChevronRight } from "lucide-react";
import { getReportsList, updateReportStatus, ReportProps } from "../services/ReportsService";
import { getAllActions, deleteAction, clearAllActions, UserAction } from "../services/ActionsService";
import Modal from "../components/Modal/Modal";
import { useAuth } from "../contexts/Authentication";
import { useAlertConfirm } from "../contexts/AlertConfirmContext";
import InlineLoader from "../components/InlineLoader/InlineLoader";
import { PageHeader, Panel, Tag, EmptyState } from "../components/dla";

const Notifications: React.FC = () => {
  const { user } = useAuth();
  const { alert: showAlert, confirm: showConfirm } = useAlertConfirm();
  const navigate = useNavigate();
  const [reports, setReports] = useState<ReportProps[]>([]);
  const [actions, setActions] = useState<UserAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<ReportProps | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const isStudent = user?.role === "student";

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
      console.error("Erro ao carregar notificações:", error);
      showAlert("Erro ao carregar notificações");
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
      console.error("Erro ao carregar reportes:", error);
      showAlert("Erro ao carregar reportes");
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (
    reportId: string,
    newStatus: "pending" | "resolved" | "dismissed",
  ) => {
    try {
      await updateReportStatus(reportId, newStatus);
      await loadReports();
      if (selectedReport?._id === reportId) {
        setSelectedReport({ ...selectedReport, status: newStatus });
      }
    } catch (error) {
      console.error("Erro ao atualizar status:", error);
      showAlert("Erro ao atualizar status do reporte");
    }
  };

  const handleViewDetails = (report: ReportProps) => {
    setSelectedReport(report);
    setShowDetailModal(true);
  };

  const handleActionClick = (action: UserAction) => {
    const exerciseId = action.metadata?.exercise_id;
    if (
      exerciseId &&
      (action.action_type === "new_exercise_in_class" ||
        action.action_type === "exercise_manually_corrected")
    ) {
      navigate("/exercises/resolution", { state: { openExerciseId: exerciseId } });
    } else {
      navigate("/exercises/resolution");
    }
  };

  const handleDeleteAction = async (e: React.MouseEvent, actionId: string) => {
    e.stopPropagation();
    try {
      await deleteAction(actionId);
      setActions((prev) => prev.filter((a) => a._id !== actionId));
    } catch (err) {
      console.error("Erro ao apagar notificação:", err);
      showAlert("Erro ao apagar notificação");
    }
  };

  const handleClearAllActions = async () => {
    if (actions.length === 0) return;
    const ok = await showConfirm("Apagar todas as notificações?");
    if (!ok) return;
    try {
      await clearAllActions();
      await loadActions();
    } catch (err) {
      console.error("Erro ao limpar notificações:", err);
      showAlert("Erro ao limpar notificações");
    }
  };

  const getStatusTag = (status: string) => {
    const tones: Record<string, "warning" | "success" | "danger"> = {
      pending: "warning",
      resolved: "success",
      dismissed: "danger",
    };
    const labels: Record<string, string> = {
      pending: "Pendente",
      resolved: "Resolvido",
      dismissed: "Descartado",
    };
    return <Tag tone={tones[status] || "warning"}>{labels[status] || status}</Tag>;
  };

  const getReportTypeTag = (type: string) =>
    type === "error" ? (
      <Tag tone="danger">Erro na pergunta</Tag>
    ) : (
      <Tag tone="warning">Atividade não rotulada</Tag>
    );

  const actionTitle = (action: UserAction) => {
    if (action.action_type === "new_exercise_in_class") return "Novo exercício";
    if (action.action_type === "exercise_manually_corrected") return "Correção do professor";
    return "Notificação";
  };

  const pendingCount = reports.filter((r) => r.status === "pending").length;

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Comunicação" title="Notificações" />
        <InlineLoader message="Carregando…" />
      </div>
    );
  }

  if (isStudent) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Comunicação"
          title="Notificações"
          description="Novidades da turma: exercícios, correções e avisos."
          actions={
            actions.length > 0 ? (
              <button
                type="button"
                onClick={handleClearAllActions}
                className="rounded-md border border-border px-3.5 py-2 text-xs font-semibold transition-colors duration-150 hover:border-secondary"
              >
                Limpar todas
              </button>
            ) : undefined
          }
        />

        {actions.length === 0 ? (
          <EmptyState
            title="Nenhuma notificação"
            description="Quando houver novidades na sua turma, elas aparecerão aqui."
          />
        ) : (
          <Panel title={`${actions.length} notificação${actions.length !== 1 ? "ões" : ""}`}>
            <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
              {actions.map((action) => (
                <li key={action._id}>
                  <div className="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0">
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-primary-soft text-primary">
                      <Bell className="size-3.5" strokeWidth={1.75} />
                    </span>
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() =>
                        action.metadata?.exercise_id ? handleActionClick(action) : undefined
                      }
                      disabled={!action.metadata?.exercise_id}
                    >
                      <p className="font-display text-sm font-semibold tracking-tight text-foreground">
                        {actionTitle(action)}
                      </p>
                      <p className="mt-0.5 text-sm text-muted-foreground">{action.description}</p>
                      <span className="mt-1.5 block text-[11px] text-muted-foreground">
                        {action.created_at
                          ? new Date(action.created_at).toLocaleString("pt-BR")
                          : ""}
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      {action.metadata?.exercise_id && (
                        <button
                          type="button"
                          onClick={() => handleActionClick(action)}
                          className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          title="Abrir"
                        >
                          <ChevronRight className="size-4" strokeWidth={1.75} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleDeleteAction(e, action._id)}
                        className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                        title="Apagar"
                      >
                        <Trash2 className="size-3.5" strokeWidth={1.75} />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Comunicação"
        title="Notificações e reportes"
        description="Problemas reportados pelos alunos durante os exercícios."
        actions={
          pendingCount > 0 ? (
            <Tag tone="warning">
              {pendingCount} pendente{pendingCount !== 1 ? "s" : ""}
            </Tag>
          ) : undefined
        }
      />

      {reports.length === 0 ? (
        <EmptyState
          title="Nenhum reporte encontrado"
          description="Quando alunos reportarem problemas, eles aparecerão aqui."
        />
      ) : (
        <Panel title={`${reports.length} reporte${reports.length !== 1 ? "s" : ""}`}>
          <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
            {reports.map((report) => (
              <li key={report._id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      {getReportTypeTag(report.reportType)}
                      {getStatusTag(report.status)}
                    </div>
                    <p className="font-display text-sm font-semibold tracking-tight text-foreground">
                      {report.exerciseTitle || "Exercício desconhecido"}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {report.userName || "Usuário desconhecido"}
                      {report.userEmail ? ` · ${report.userEmail}` : ""}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      {report.description}
                    </p>
                    {report.createdAt && (
                      <span className="mt-2 block text-[11px] text-muted-foreground">
                        {new Date(report.createdAt).toLocaleString("pt-BR")}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleViewDetails(report)}
                      className="rounded-md border border-border px-3 py-1.5 text-[11px] font-semibold transition-colors hover:border-secondary"
                    >
                      Detalhes
                    </button>
                    {report.status === "pending" && (
                      <>
                        <button
                          type="button"
                          onClick={() => report._id && handleStatusChange(report._id, "resolved")}
                          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                        >
                          <Check className="size-3" strokeWidth={1.75} />
                          Resolver
                        </button>
                        <button
                          type="button"
                          onClick={() => report._id && handleStatusChange(report._id, "dismissed")}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-[11px] font-semibold text-destructive transition-colors hover:border-destructive"
                        >
                          <X className="size-3" strokeWidth={1.75} />
                          Descartar
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Modal
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedReport(null);
        }}
        size="lg"
        title={`Detalhes do reporte — ${selectedReport?.exerciseTitle || "Exercício desconhecido"}`}
      >
        {selectedReport && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              {getReportTypeTag(selectedReport.reportType)}
              {getStatusTag(selectedReport.status)}
            </div>

            <div>
              <p className="rule-label mb-1.5">Aluno</p>
              <p className="text-sm text-foreground">
                {selectedReport.userName || "Usuário desconhecido"}
              </p>
              <p className="text-xs text-muted-foreground">
                {selectedReport.userEmail || "Email não disponível"}
              </p>
            </div>

            {selectedReport.mediaId && (
              <div>
                <p className="rule-label mb-1.5">Mídia</p>
                <p className="font-mono text-xs text-muted-foreground">{selectedReport.mediaId}</p>
              </div>
            )}

            <div>
              <p className="rule-label mb-1.5">Descrição</p>
              <div className="rounded-md border border-border bg-muted/30 p-4 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                {selectedReport.description}
              </div>
            </div>

            <div>
              <p className="rule-label mb-1.5">Datas</p>
              <p className="text-sm text-muted-foreground">
                Criado em{" "}
                {selectedReport.createdAt
                  ? new Date(selectedReport.createdAt).toLocaleString("pt-BR")
                  : "—"}
                {selectedReport.updatedAt &&
                  selectedReport.updatedAt !== selectedReport.createdAt && (
                    <>
                      <br />
                      Atualizado em {new Date(selectedReport.updatedAt).toLocaleString("pt-BR")}
                    </>
                  )}
              </p>
            </div>

            {selectedReport.status === "pending" && (
              <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowDetailModal(false);
                    setSelectedReport(null);
                  }}
                  className="rounded-md border border-border px-3.5 py-2 text-xs font-semibold transition-colors hover:border-secondary"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedReport._id) {
                      handleStatusChange(selectedReport._id, "resolved");
                      setShowDetailModal(false);
                      setSelectedReport(null);
                    }
                  }}
                  className="rounded-md bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Marcar como resolvido
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedReport._id) {
                      handleStatusChange(selectedReport._id, "dismissed");
                      setShowDetailModal(false);
                      setSelectedReport(null);
                    }
                  }}
                  className="rounded-md border border-border px-3.5 py-2 text-xs font-semibold text-destructive transition-colors hover:border-destructive"
                >
                  Descartar
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Notifications;
