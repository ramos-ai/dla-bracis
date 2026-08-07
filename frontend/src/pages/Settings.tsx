import React, { useEffect, useState } from "react";
import { Plus, UserMinus, Users, GraduationCap } from "lucide-react";
import {
  getClassesList,
  createClass,
  getStudentReliability,
  ClassesProps,
  ClassificationReliabilityDetail,
  ClassificationReliabilitySummary,
} from "../services/ClassesService";
import { api } from "../services/api";
import SelectField from "../components/Fields/SelectField";
import InputField from "../components/Fields/InputField";
import UserSearchModal from "../components/UserSearchModal/UserSearchModal";
import InlineLoader from "../components/InlineLoader/InlineLoader";
import { useAlertConfirm } from "../contexts/AlertConfirmContext";
import { PageHeader, Panel, EmptyState, Tag, Stat, Modal } from "../components/dla";

interface User {
  _id: string;
  name: string;
  email: string;
  classId?: string;
  role: string;
  classification_reliability?: ClassificationReliabilitySummary | null;
}

interface ClassWithUsers extends ClassesProps {
  students?: User[];
  teachers?: User[];
}

function formatKappa(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(3);
}

function formatWeight(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(3);
}

function ReliabilityBadge({
  reliability,
}: {
  reliability?: ClassificationReliabilitySummary | null;
}) {
  if (!reliability || !reliability.n_pairs) {
    return <Tag tone="neutral">Sem dados</Tag>;
  }
  if (reliability.weight == null) {
    return <Tag tone="warning">&lt;5 respostas</Tag>;
  }
  return <Tag tone="success">peso {formatWeight(reliability.weight)}</Tag>;
}

const Settings: React.FC = () => {
  const { alert: showAlert, confirm: showConfirm } = useAlertConfirm();
  const [classes, setClasses] = useState<ClassesProps[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [classData, setClassData] = useState<ClassWithUsers | null>(null);
  const [students, setStudents] = useState<User[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [unassignedUsers, setUnassignedUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddTeacherModal, setShowAddTeacherModal] = useState(false);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [showCreateClass, setShowCreateClass] = useState(false);
  const [newClassName, setNewClassName] = useState("");
  const [newClassCode, setNewClassCode] = useState("");
  const [newClassInstitution, setNewClassInstitution] = useState("");
  const [creatingClass, setCreatingClass] = useState(false);
  const [reliabilityStudent, setReliabilityStudent] = useState<User | null>(null);
  const [reliabilityDetail, setReliabilityDetail] =
    useState<ClassificationReliabilityDetail | null>(null);
  const [reliabilityLoading, setReliabilityLoading] = useState(false);

  useEffect(() => {
    loadClasses();
    loadAllUsers();
  }, []);

  useEffect(() => {
    if (selectedClass) {
      loadClassData(selectedClass);
    } else {
      setClassData(null);
    }
  }, [selectedClass]);

  const loadClasses = async () => {
    try {
      const response = await getClassesList();
      setClasses(response);
    } catch (error) {
      console.error("Erro ao carregar turmas:", error);
      showAlert("Erro ao carregar turmas");
    }
  };

  const loadClassData = async (classId: string) => {
    if (!classId) return;
    try {
      setLoading(true);
      const response = await api.get(`/classes/${classId}`);
      setClassData(response.data.class);
    } catch (error: unknown) {
      console.error("Erro ao carregar dados da turma:", error);
      const err = error as {
        response?: { status?: number; data?: { message?: string; error?: string } };
      };
      const errorMessage =
        err?.response?.data?.message || err?.response?.data?.error || "Erro ao carregar dados da turma";
      showAlert(err?.response?.status === 404 ? "Turma não encontrada" : errorMessage);
      setClassData(null);
    } finally {
      setLoading(false);
    }
  };

  const loadAllUsers = async () => {
    try {
      const [studentsRes, teachersRes, unassignedRes] = await Promise.all([
        api.get("/classes/users/student"),
        api.get("/classes/users/teacher"),
        api.get("/classes/users/unassigned"),
      ]);
      setStudents(studentsRes.data.users);
      setTeachers(teachersRes.data.users);
      setUnassignedUsers(unassignedRes.data.users || []);
    } catch (error) {
      console.error("Erro ao carregar usuários:", error);
    }
  };

  const handleAssignUsers = async (userIds: string[], userRole: "student" | "teacher") => {
    if (!selectedClass) {
      showAlert("Selecione uma turma primeiro");
      return;
    }
    if (!userIds?.length) {
      showAlert("Selecione pelo menos um usuário");
      return;
    }
    try {
      const response = await api.post("/classes/assign", {
        user_ids: userIds,
        class_id: selectedClass,
        role: userRole,
      });
      showAlert(
        response.data.message ||
          `${userRole === "student" ? "Aluno(s)" : "Professor(es)"} atribuído(s) com sucesso!`,
      );
      loadClassData(selectedClass);
      loadAllUsers();
    } catch (error: unknown) {
      const err = error as {
        response?: { status?: number; data?: { message?: string; error?: string } };
      };
      showAlert(
        err?.response?.status === 404
          ? "Turma não encontrada"
          : err?.response?.data?.message || err?.response?.data?.error || "Erro ao atribuir usuário",
      );
    }
  };

  const handleRemoveUser = async (userId: string) => {
    if (!selectedClass) {
      showAlert("Selecione uma turma primeiro");
      return;
    }
    const ok = await showConfirm("Tem certeza que deseja remover este usuário da turma?");
    if (!ok) return;
    try {
      await api.post("/classes/remove", { user_id: userId, class_id: selectedClass });
      showAlert("Usuário removido da turma com sucesso!");
      loadClassData(selectedClass);
      loadAllUsers();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      showAlert(err?.response?.data?.message || "Erro ao remover usuário");
    }
  };

  const openStudentReliability = async (student: User) => {
    setReliabilityStudent(student);
    setReliabilityDetail(null);
    setReliabilityLoading(true);
    try {
      const detail = await getStudentReliability(student._id);
      setReliabilityDetail(detail);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      showAlert(err?.response?.data?.message || "Erro ao carregar confiabilidade");
      setReliabilityStudent(null);
    } finally {
      setReliabilityLoading(false);
    }
  };

  const closeStudentReliability = () => {
    setReliabilityStudent(null);
    setReliabilityDetail(null);
  };

  const getAllUsers = (role: "student" | "teacher") => {
    const userList = role === "student" ? students : teachers;
    const unassigned = unassignedUsers.map((u) => ({ ...u, _unassigned: true }));
    return [...userList, ...unassigned].sort((a, b) =>
      (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase()),
    );
  };

  const getUsersInClass = (role: "student" | "teacher") => {
    if (!classData) return [];
    return role === "student" ? classData.students || [] : classData.teachers || [];
  };

  const getUsersAvailableToAdd = (role: "student" | "teacher") => {
    const inClassIds = new Set(getUsersInClass(role).map((u) => u._id));
    return getAllUsers(role).filter((u) => !inClassIds.has(u._id));
  };

  const handleCreateClass = async () => {
    const name = newClassName.trim();
    if (!name) {
      showAlert("Nome da turma é obrigatório");
      return;
    }
    try {
      setCreatingClass(true);
      const created = await createClass({
        name,
        code: newClassCode.trim() || undefined,
        institution: newClassInstitution.trim() || undefined,
      });
      await loadClasses();
      setSelectedClass(created._id || "");
      setShowCreateClass(false);
      setNewClassName("");
      setNewClassCode("");
      setNewClassInstitution("");
      showAlert("Turma criada com sucesso!");
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      showAlert(err?.response?.data?.message || err?.message || "Erro ao criar turma");
    } finally {
      setCreatingClass(false);
    }
  };

  const selectedMeta = classes.find((c) => c._id === selectedClass);
  const teacherCount = getUsersInClass("teacher").length;
  const studentCount = getUsersInClass("student").length;
  const matrixLabels = reliabilityDetail?.labels || [];
  const matrixRows = reliabilityDetail?.matrix || [];

  return (
    <div className="settings">
      <PageHeader
        eyebrow="Administração"
        title="Gestão de turmas"
        description="Organize professores e alunos por turma. A turma ativa define o contexto de exercícios e dashboard."
        actions={
          <button
            type="button"
            onClick={() => setShowCreateClass((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary/90"
          >
            <Plus className="size-3.5" strokeWidth={1.75} />
            Nova turma
          </button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:gap-8">
        <Panel title="Turma ativa" hint="Escolha qual turma administrar">
          <SelectField
            label="Selecione uma turma"
            name="class"
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            options={classes.map((cls) => ({
              value: cls._id || "",
              label: cls.name,
            }))}
          />
          {selectedMeta && (
            <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-5">
              {selectedMeta.code && <Tag tone="neutral">Código {selectedMeta.code}</Tag>}
              {selectedMeta.institution && <Tag tone="primary">{selectedMeta.institution}</Tag>}
              <Tag tone="neutral">{classes.length} turma{classes.length !== 1 ? "s" : ""} no sistema</Tag>
            </div>
          )}
        </Panel>

        <Panel title="Resumo" hint={selectedClass ? "Membros da turma selecionada" : "Sem turma ativa"}>
          {selectedClass && classData ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border border-border bg-muted/40 px-4 py-3">
                <p className="rule-label">Professores</p>
                <p className="num mt-1 font-display text-2xl font-semibold text-primary">{teacherCount}</p>
              </div>
              <div className="rounded-md border border-border bg-muted/40 px-4 py-3">
                <p className="rule-label">Alunos</p>
                <p className="num mt-1 font-display text-2xl font-semibold text-primary">{studentCount}</p>
              </div>
            </div>
          ) : (
            <EmptyState
              title="Nenhuma turma selecionada"
              description="Selecione uma turma à esquerda para ver o resumo e gerir membros."
            />
          )}
        </Panel>
      </div>

      {showCreateClass && (
        <Panel title="Criar turma" hint="Nome obrigatório; código e instituição são opcionais">
          <div className="grid gap-4 md:grid-cols-3">
            <InputField
              label="Nome"
              name="name"
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              placeholder="Ex.: Turma 1"
              required
            />
            <InputField
              label="Código (opcional)"
              name="code"
              value={newClassCode}
              onChange={(e) => setNewClassCode(e.target.value)}
              placeholder="Ex.: 123456"
            />
            <InputField
              label="Instituição (opcional)"
              name="institution"
              value={newClassInstitution}
              onChange={(e) => setNewClassInstitution(e.target.value)}
              placeholder="Ex.: Unisinos"
            />
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => {
                setShowCreateClass(false);
                setNewClassName("");
                setNewClassCode("");
                setNewClassInstitution("");
              }}
              className="rounded-md border border-border px-3.5 py-2 text-xs font-semibold transition-colors duration-150 hover:border-secondary"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleCreateClass}
              disabled={creatingClass}
              className="rounded-md bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary/90 disabled:opacity-50"
            >
              {creatingClass ? "Criando…" : "Criar turma"}
            </button>
          </div>
        </Panel>
      )}

      {selectedClass && loading && (
        <Panel>
          <InlineLoader message="Carregando turma…" />
        </Panel>
      )}

      {selectedClass && classData && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel
            title="Professores"
            hint={`${teacherCount} na turma`}
            action={
              <button
                type="button"
                onClick={() => setShowAddTeacherModal(true)}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-semibold transition-colors hover:border-secondary"
              >
                <Plus className="size-3" strokeWidth={1.75} />
                Adicionar
              </button>
            }
          >
            {teacherCount === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <GraduationCap className="size-8 text-muted-foreground/50" strokeWidth={1.5} />
                <p className="text-sm text-muted-foreground">Nenhum professor nesta turma.</p>
              </div>
            ) : (
              <ul className="settings__member-list">
                {getUsersInClass("teacher").map((teacher) => (
                  <li key={teacher._id} className="settings__member">
                    <div>
                      <p className="settings__member-name">{teacher.name}</p>
                      <p className="settings__member-email">{teacher.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveUser(teacher._id)}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-semibold text-destructive transition-colors hover:border-destructive"
                    >
                      <UserMinus className="size-3" strokeWidth={1.75} />
                      Remover
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Alunos"
            hint={`${studentCount} na turma — clique para ver confiabilidade`}
            action={
              <button
                type="button"
                onClick={() => setShowAddStudentModal(true)}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-semibold transition-colors hover:border-secondary"
              >
                <Plus className="size-3" strokeWidth={1.75} />
                Adicionar
              </button>
            }
          >
            {studentCount === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <Users className="size-8 text-muted-foreground/50" strokeWidth={1.5} />
                <p className="text-sm text-muted-foreground">Nenhum aluno nesta turma.</p>
              </div>
            ) : (
              <ul className="settings__member-list">
                {getUsersInClass("student").map((student) => (
                  <li key={student._id} className="settings__member">
                    <button
                      type="button"
                      onClick={() => openStudentReliability(student)}
                      className="min-w-0 flex-1 text-left transition-opacity hover:opacity-80"
                    >
                      <p className="settings__member-name">{student.name}</p>
                      <p className="settings__member-email">{student.email}</p>
                      <div className="mt-1.5">
                        <ReliabilityBadge reliability={student.classification_reliability} />
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveUser(student._id)}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-semibold text-destructive transition-colors hover:border-destructive"
                    >
                      <UserMinus className="size-3" strokeWidth={1.75} />
                      Remover
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}

      <Modal
        open={!!reliabilityStudent}
        onClose={closeStudentReliability}
        title={reliabilityStudent ? `Confiabilidade — ${reliabilityStudent.name}` : "Confiabilidade"}
        subtitle="Classificação assistida (Cohen κ → peso)"
        size="lg"
      >
        {reliabilityLoading && <InlineLoader message="Carregando confiabilidade…" />}
        {!reliabilityLoading && reliabilityDetail && (
          <div className="flex flex-col gap-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Cohen κ" value={formatKappa(reliabilityDetail.kappa)} />
              <Stat
                label="Peso"
                value={formatWeight(reliabilityDetail.weight)}
                note={
                  reliabilityDetail.weight == null
                    ? "Requer pelo menos 5 pares com GT"
                    : undefined
                }
              />
              <Stat label="Pares" value={reliabilityDetail.n_pairs} />
            </div>

            {reliabilityDetail.matrix_available && matrixLabels.length > 0 ? (
              <div>
                <p className="rule-label mb-2">Matriz de confusão</p>
                <p className="mb-3 text-xs text-muted-foreground">
                  Linhas = rótulo verdadeiro (GT) · Colunas = previsão do aluno
                </p>
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="settings__confusion-matrix">
                    <thead>
                      <tr>
                        <th scope="col">GT \\ Pred</th>
                        {matrixLabels.map((label) => (
                          <th key={label} scope="col" title={label}>
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {matrixLabels.map((actual, rowIdx) => (
                        <tr key={actual}>
                          <th scope="row" title={actual}>
                            {actual}
                          </th>
                          {(matrixRows[rowIdx] || []).map((count, colIdx) => (
                            <td
                              key={`${actual}-${matrixLabels[colIdx]}`}
                              className={rowIdx === colIdx ? "is-diagonal" : undefined}
                            >
                              {count}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                {reliabilityDetail.n_pairs === 0
                  ? "Ainda não há respostas de classificação assistida com GT para este aluno."
                  : "Matriz não exibida — demasiadas classes para visualizar com clareza."}
              </p>
            )}
          </div>
        )}
      </Modal>

      <UserSearchModal
        isOpen={showAddTeacherModal}
        onClose={() => setShowAddTeacherModal(false)}
        users={getUsersAvailableToAdd("teacher")}
        onAddUsers={(userIds) => handleAssignUsers(userIds, "teacher")}
        title="Adicionar Professor à Turma"
        allowMultiple={false}
      />

      <UserSearchModal
        isOpen={showAddStudentModal}
        onClose={() => setShowAddStudentModal(false)}
        users={getUsersAvailableToAdd("student")}
        onAddUsers={(userIds) => handleAssignUsers(userIds, "student")}
        title="Adicionar Aluno(s) à Turma"
        allowMultiple={true}
      />
    </div>
  );
};

export default Settings;
