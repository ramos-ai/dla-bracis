import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  Bell,
  ChevronLeft,
  Database,
  Download,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  LogOut,
  PanelLeft,
  Settings,
  Users,
  UserCog,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type ComponentType } from "react";

import { useAuth, UserRoles } from "../../contexts/Authentication";
import { useLayout } from "../../contexts/LayoutContext";
import { useSelectedClass } from "../../contexts/SelectedClass";
import { getNotifications } from "../../services/NotificationsService";
import { getRecentActions, clearAllActions } from "../../services/ActionsService";
import { markAllReportsRead } from "../../services/ReportsService";
import { getClassesList, ClassesProps } from "../../services/ClassesService";
import { getProfileImageUrl } from "../../services/ProfileService";
import ProfileSettingsModal from "../ProfileSettingsModal/ProfileSettingsModal";
import { cn } from "../../lib/utils";
import "./AppShell.css";

type LucideIcon = ComponentType<{ className?: string; strokeWidth?: number }>;

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean };

const navByRole: Record<string, NavItem[]> = {
  [UserRoles.UNASSIGNED]: [{ to: "/", label: "Início", icon: LayoutDashboard, end: true }],
  [UserRoles.STUDENT]: [
    { to: "/", label: "Início", icon: LayoutDashboard, end: true },
    { to: "/exercises/resolution", label: "Exercícios", icon: ListChecks },
    { to: "/teachers", label: "Professores", icon: GraduationCap },
  ],
  [UserRoles.TEACHER]: [
    { to: "/", label: "Início", icon: LayoutDashboard, end: true },
    { to: "/exercises/dashboard", label: "Dashboard", icon: GraduationCap, end: true },
    { to: "/datasets", label: "Datasets", icon: Database },
    { to: "/exercises", label: "Exercícios", icon: ListChecks, end: true },
    { to: "/students", label: "Alunos", icon: Users },
  ],
  [UserRoles.ADMIN]: [
    { to: "/", label: "Início", icon: LayoutDashboard, end: true },
    { to: "/exercises/dashboard", label: "Dashboard", icon: GraduationCap, end: true },
    { to: "/datasets", label: "Datasets", icon: Database },
    { to: "/exercises", label: "Exercícios", icon: ListChecks, end: true },
    { to: "/exercises/resolution", label: "Resolver", icon: ListChecks },
    { to: "/export", label: "Exportar", icon: Download },
    { to: "/settings", label: "Gestão de Turmas", icon: Settings },
  ],
};

function roleLabel(role: string): string {
  if (role === UserRoles.TEACHER || role === UserRoles.ADMIN) return "Supervisor";
  if (role === UserRoles.STUDENT) return "Anotador";
  return "Conta";
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { isCollapsed, toggleSidebar, sidebarWidth } = useLayout();
  const { selectedClassId, setSelectedClassId } = useSelectedClass();
  const navigate = useNavigate();
  const location = useLocation();

  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [notifications, setNotifications] = useState<
    { _id: string; type: string; message: string; read: boolean; createdAt: string }[]
  >([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [teacherClasses, setTeacherClasses] = useState<ClassesProps[]>([]);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const classIds = user?.classIds ?? (user?.classId ? [user.classId] : []);
  const isTeacherWithMultipleClasses = user?.role === "teacher" && classIds.length > 1;
  const isTeacherOrAdmin = user?.role === "teacher" || user?.role === "admin";
  const role = (user?.role as string) || UserRoles.UNASSIGNED;
  const nav = navByRole[role] ?? navByRole[UserRoles.UNASSIGNED];

  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-width", `${sidebarWidth}px`);
  }, [sidebarWidth]);

  useEffect(() => {
    if (!user) return;
    const ids = user.classIds ?? (user.classId ? [user.classId] : []);
    if (user.role === "teacher" && ids.length > 1) {
      getClassesList()
        .then((list) => {
          const mine = list.filter((c) => c._id && ids.includes(c._id));
          setTeacherClasses(mine);
          setSelectedClassId((prev: string | null) =>
            prev && (mine.some((c) => c._id === prev) || ids.includes(prev))
              ? prev
              : (mine[0]?._id ?? ids[0] ?? null),
          );
        })
        .catch(() => setTeacherClasses([]));
    } else if (user.role === "teacher" && user.classId) {
      setSelectedClassId(user.classId);
    } else {
      setSelectedClassId(null);
    }
  }, [user?.role, user?.classId, user?.classIds, isTeacherWithMultipleClasses, setSelectedClassId, user]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    const load = async () => {
      try {
        if (isTeacherOrAdmin) {
          const data = await getNotifications();
          setNotifications(data.notifications || []);
          setUnreadCount(data.unread_count || 0);
        } else {
          const actions = await getRecentActions(10);
          setNotifications(
            actions.map((a) => ({
              _id: a._id,
              type: a.action_type,
              message: a.description,
              read: false,
              createdAt: a.created_at,
            })),
          );
          setUnreadCount(actions.length);
        }
      } catch (error) {
        console.error("Erro ao carregar notificações:", error);
      }
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [user, isTeacherOrAdmin]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfile(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

  const isWorkspaceRoute =
    location.pathname.includes("/labelling") ||
    /^\/exercises\/resolution\/[^/]+$/.test(location.pathname);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleClearAllNotifications = async () => {
    try {
      if (isTeacherOrAdmin) await markAllReportsRead();
      else await clearAllActions();
      setNotifications([]);
      setUnreadCount(0);
    } catch (e) {
      console.error("Erro ao limpar notificações:", e);
    }
  };

  return (
    <div className="dla-shell">
      <aside
        className={cn(
          "dla-shell__aside",
          isCollapsed ? "dla-shell__aside--collapsed" : "dla-shell__aside--expanded",
        )}
      >
        <div className="dla-shell__brand">
          <span className="dla-shell__brand-mark">DL</span>
          {!isCollapsed && (
            <div className="dla-shell__brand-text">
              <p className="dla-shell__brand-title">DataLabelling</p>
              <p className="dla-shell__brand-sub">Plataforma da RamosAI</p>
            </div>
          )}
        </div>

        <nav className="dla-shell__nav" aria-label="Principal">
          {!isCollapsed && (
            <p className="dla-shell__nav-label">{roleLabel(role)}</p>
          )}
          <ul className="dla-shell__nav-list">
            {nav.map((item) => {
              const active =
                item.to === "/"
                  ? location.pathname === "/"
                  : item.end
                    ? location.pathname === item.to
                    : location.pathname.startsWith(item.to);
              return (
                <li key={`${item.to}-${item.label}`}>
                  <NavLink
                    to={item.to}
                    end={item.end || item.to === "/"}
                    title={isCollapsed ? item.label : undefined}
                    className={cn(
                      "dla-shell__nav-link",
                      active && "dla-shell__nav-link--active",
                    )}
                  >
                    <item.icon className="dla-shell__nav-icon" strokeWidth={1.75} />
                    {!isCollapsed && (
                      <span className="dla-shell__nav-text">{item.label}</span>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <button
          type="button"
          onClick={toggleSidebar}
          className="dla-shell__collapse"
          aria-label={isCollapsed ? "Expandir menu" : "Recolher menu"}
        >
          {isCollapsed ? (
            <PanelLeft className="dla-shell__nav-icon" strokeWidth={1.75} />
          ) : (
            <>
              <ChevronLeft className="dla-shell__nav-icon" strokeWidth={1.75} />
              Recolher
            </>
          )}
        </button>
      </aside>

      <div className="dla-shell__body">
        <header className="dla-shell__header">
          {isTeacherWithMultipleClasses && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="hidden sm:inline">Turma:</span>
              <select
                value={selectedClassId ?? ""}
                onChange={(e) => setSelectedClassId(e.target.value || null)}
                className="h-8 rounded-md border border-border bg-surface px-2 text-xs font-medium text-foreground outline-none transition-colors duration-150 focus:border-ring"
              >
                {teacherClasses.length > 0
                  ? teacherClasses.map((c) => (
                      <option key={c._id} value={c._id ?? ""}>
                        {c.name}
                      </option>
                    ))
                  : classIds.map((id) => (
                      <option key={id} value={id}>
                        Turma {id.slice(-6)}
                      </option>
                    ))}
              </select>
            </label>
          )}

          <div className="dla-shell__header-actions">
            <div className="relative" ref={notificationsRef}>
              <button
                type="button"
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative grid size-8 place-items-center rounded-md border border-border bg-surface text-muted-foreground transition-colors duration-150 hover:text-foreground"
                aria-label="Notificações"
              >
                <Bell className="size-4" strokeWidth={1.75} />
                {unreadCount > 0 && (
                  <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-warning" />
                )}
              </button>
              {showNotifications && (
                <div className="dla-shell__popover dla-shell__popover--notify">
                  <div className="dla-shell__popover-head">
                    <h3 className="dla-shell__popover-title">Notificações</h3>
                    <button
                      type="button"
                      className="dla-shell__popover-link"
                      onClick={() => {
                        setShowNotifications(false);
                        navigate("/notifications");
                      }}
                    >
                      Ver todas
                    </button>
                  </div>
                  <div className="dla-shell__popover-body">
                    {notifications.length > 0 ? (
                      notifications.slice(0, 5).map((notif) => (
                        <button
                          key={notif._id}
                          type="button"
                          className={cn(
                            "dla-shell__popover-item",
                            !notif.read && "dla-shell__popover-item--unread",
                          )}
                          onClick={() => {
                            setShowNotifications(false);
                            navigate("/notifications");
                          }}
                        >
                          <p className="dla-shell__popover-item-text">{notif.message}</p>
                          <span className="dla-shell__popover-item-meta">
                            {new Date(notif.createdAt).toLocaleDateString("pt-BR")}
                          </span>
                        </button>
                      ))
                    ) : (
                      <p className="dla-shell__popover-empty">Nenhuma notificação</p>
                    )}
                  </div>
                  {notifications.length > 0 && (
                    <div className="dla-shell__popover-foot">
                      <button
                        type="button"
                        onClick={handleClearAllNotifications}
                        className="dla-shell__popover-link"
                      >
                        Limpar todas
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => setShowProfile(!showProfile)}
                className="flex items-center gap-2 rounded-md border border-border bg-surface py-1 pl-1 pr-2.5 transition-colors hover:border-secondary"
              >
                <span className="grid size-6 place-items-center overflow-hidden rounded bg-primary-soft text-[10px] font-bold text-primary">
                  {user.profile_image_id ? (
                    <img
                      src={getProfileImageUrl(user.profile_image_id) || ""}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    getInitials(user.name)
                  )}
                </span>
                <span className="hidden max-w-[120px] truncate text-xs font-medium sm:inline">
                  {user.name}
                </span>
              </button>
              {showProfile && (
                <div className="dla-shell__popover dla-shell__popover--profile">
                  <div className="dla-shell__popover-user">
                    <p className="dla-shell__popover-user-name">{user.name}</p>
                    <p className="dla-shell__popover-user-email">{user.email}</p>
                    <p className="dla-shell__popover-user-role">Papel: {user.role}</p>
                  </div>
                  {(user.role === "teacher" ||
                    user.role === "admin" ||
                    user.role === "student") && (
                    <button
                      type="button"
                      className="dla-shell__popover-action"
                      onClick={() => {
                        setShowProfile(false);
                        setShowSettingsModal(true);
                      }}
                    >
                      <UserCog strokeWidth={1.75} />
                      Configurações
                    </button>
                  )}
                  <button
                    type="button"
                    className="dla-shell__popover-action dla-shell__popover-action--danger"
                    onClick={handleLogout}
                  >
                    <LogOut strokeWidth={1.75} />
                    Sair
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main
          className={cn(
            "dla-shell__content",
            isWorkspaceRoute && "dla-shell__content--workspace",
          )}
        >
          {children}
        </main>

        {!isWorkspaceRoute && (
          <footer className="dla-shell__footer">
            <div className="dla-shell__footer-inner">
              <span>
                DLA — Data Labelling App · v{import.meta.env.VITE_APP_VERSION || "0.0.3"} ·{" "}
                {new Date().getFullYear()}
              </span>
              <span>UNISINOS / RamosAI</span>
            </div>
          </footer>
        )}
      </div>

      <ProfileSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />
    </div>
  );
}

export default AppShell;
