import React, { useState, useRef, useEffect } from 'react';
import { NavLink, NavLinkProps } from 'react-router-dom';
import { useAuth } from '../../contexts/Authentication';
import { useLayout } from '../../contexts/LayoutContext';
import { Icon } from '../Icons/Icons';

type AppNavLink = Omit<NavLinkProps, 'to' | 'children'> & {
  to: string;
  icon: React.ReactNode;
  label: string;
};

enum UserRoles {
  STUDENT = 'student',
  TEACHER = 'teacher',
  ADMIN = 'admin',
  UNASSIGNED = 'unassigned',
}

const allowedPages: Record<UserRoles, AppNavLink[]> = {
  [UserRoles.UNASSIGNED]: [
    { to: '/', icon: <Icon name="home" size={20} />, label: 'Home' },
  ],
  [UserRoles.STUDENT]: [
    { to: '/',                    icon: <Icon name="home" size={20} />, label: 'Home' },
    { to: '/exercises/resolution', icon: <Icon name="resolution" size={20} />, label: 'Exercícios' },
    { to: '/teachers',            icon: <Icon name="graduation" size={20} />, label: 'Professores' },
  ],
  [UserRoles.TEACHER]: [
    { to: '/',                    icon: <Icon name="home" size={20} />, label: 'Home' },
    { to: '/exercises/dashboard', icon: <Icon name="dashboard" size={20} />, label: 'Dashboard' },
    { to: '/datasets',            icon: <Icon name="datasets" size={20} />, label: 'Datasets' },
    { to: '/exercises',           icon: <Icon name="exercises" size={20} />, label: 'Exercícios' },
    { to: '/students',            icon: <Icon name="group" size={20} />, label: 'Alunos' },
  ],
  [UserRoles.ADMIN]: [
    { to: '/',                    icon: <Icon name="home" size={20} />, label: 'Home' },
    { to: '/exercises/dashboard', icon: <Icon name="dashboard" size={20} />, label: 'Dashboard' },
    { to: '/datasets',            icon: <Icon name="datasets" size={20} />, label: 'Datasets' },
    { to: '/exercises',           icon: <Icon name="exercises" size={20} />, label: 'Exercícios' },
    { to: '/exercises/resolution',icon: <Icon name="resolution" size={20} />, label: 'Exercícios' },
    { to: '/export',              icon: <Icon name="export" size={20} />, label: 'Exportar' },
    { to: '/settings',            icon: <Icon name="settings" size={20} />, label: 'Gestão de Turmas' },
  ],
};

interface TooltipProps {
  label: string;
  children: React.ReactNode;
  show: boolean;
}

const Tooltip = ({ label, children, show }: TooltipProps) => {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0 });
  const ref = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (!show) return;
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPosition({ top: rect.top + rect.height / 2 });
    }
    setVisible(true);
  };

  const handleMouseLeave = () => setVisible(false);

  return (
    <div
      ref={ref}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="sidebar__tooltip-wrapper"
    >
      {children}
      {show && visible && (
        <div
          className="sidebar__tooltip"
          style={{ top: position.top }}
        >
          {label}
        </div>
      )}
    </div>
  );
};

export default function Sidebar() {
  const { user } = useAuth();
  const { isCollapsed, toggleSidebar, sidebarWidth } = useLayout();

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth}px`);
  }, [sidebarWidth]);

  if (!user) return <>Carregando menu…</>;

  const userRole = (user.role as UserRoles) || UserRoles.UNASSIGNED;
  const navLinks = allowedPages[userRole] ?? allowedPages[UserRoles.UNASSIGNED];
  
  if (navLinks.length === 0) {
    console.warn(`No navigation links found for role: ${userRole}`);
  }

  return (
    <div className="sidebar-wrapper">
      <nav className={`sidebar ${isCollapsed ? 'sidebar--collapsed' : ''}`}>
        <div className="sidebar__header">
          <div className="sidebar__logo">
            <Icon name="graduation" size={24} className="sidebar__logo-icon" />
            <span className="sidebar__logo-text">DataLabelling</span>
          </div>
          <div className="sidebar__subtitle">Plataforma da RamosAI</div>
        </div>

        <div className="sidebar__menu">
          {navLinks.map(({ to, icon, label, ...rest }) => (
            <Tooltip key={to} label={label} show={isCollapsed}>
              <NavLink
                to={to}
                className="sidebar__item"
                end={to === '/exercises/dashboard' || to === '/exercises' || to === '/datasets' || to === '/export'}
                {...rest}
              >
                <span className="sidebar__item-icon">{icon}</span>
                <span className="sidebar__item-label">{label}</span>
              </NavLink>
            </Tooltip>
          ))}
        </div>
      </nav>

      <button
        className={`sidebar-toggle ${isCollapsed ? 'sidebar-toggle--collapsed' : ''}`}
        onClick={toggleSidebar}
        aria-label={isCollapsed ? 'Expandir menu' : 'Recolher menu'}
        title={isCollapsed ? 'Expandir menu' : 'Recolher menu'}
      >
        <Icon name={isCollapsed ? 'chevron-right' : 'chevron-left'} size={12} />
      </button>
    </div>
  );
}
