import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/Authentication';
import { useNavigate } from 'react-router-dom';
import { useSelectedClass } from '../../contexts/SelectedClass';
import { getNotifications } from '../../services/NotificationsService';
import { getRecentActions, clearAllActions } from '../../services/ActionsService';
import { markAllReportsRead } from '../../services/ReportsService';
import { getClassesList, ClassesProps } from '../../services/ClassesService';
import { getProfileImageUrl } from '../../services/ProfileService';
import { Icon } from '../Icons/Icons';
import ProfileSettingsModal from '../ProfileSettingsModal/ProfileSettingsModal';
import './Header.scss';

interface Notification {
  _id: string;
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
}

const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const { selectedClassId, setSelectedClassId } = useSelectedClass();
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [teacherClasses, setTeacherClasses] = useState<ClassesProps[]>([]);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const classIds = user?.classIds ?? (user?.classId ? [user.classId] : []);
  const isTeacherWithMultipleClasses = user?.role === 'teacher' && classIds.length > 1;

  useEffect(() => {
    if (!user) return;
    const ids = user.classIds ?? (user.classId ? [user.classId] : []);
    if (user.role === 'teacher' && ids.length > 1) {
      getClassesList().then((list) => {
        const mine = list.filter((c) => c._id && ids.includes(c._id));
        setTeacherClasses(mine);
        setSelectedClassId((prev: string | null) => (prev && (mine.some((c) => c._id === prev) || ids.includes(prev)) ? prev : (mine[0]?._id ?? ids[0] ?? null)));
      }).catch(() => setTeacherClasses([]));
    } else if (user.role === 'teacher' && user.classId) {
      setSelectedClassId(user.classId);
    } else {
      setSelectedClassId(null);
    }
  }, [user?.role, user?.classId, user?.classIds, isTeacherWithMultipleClasses]);

  const isTeacherOrAdmin = user?.role === 'teacher' || user?.role === 'admin';
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
          setNotifications(actions.map((a) => ({
            _id: a._id,
            type: a.action_type,
            message: a.description,
            read: false,
            createdAt: a.created_at,
            metadata: a.metadata
          })));
          setUnreadCount(actions.length);
        }
      } catch (error) {
        console.error('Erro ao carregar notificações:', error);
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

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleOpenSettings = () => {
    setShowProfile(false);
    setShowSettingsModal(true);
  };

  const handleClearAllNotifications = async () => {
    try {
      if (isTeacherOrAdmin) {
        await markAllReportsRead();
      } else {
        await clearAllActions();
      }
      setNotifications([]);
      setUnreadCount(0);
    } catch (e) {
      console.error('Erro ao limpar notificações:', e);
    }
  };

  if (!user) return null;

  return (
    <header className="app-header">
      <div className="app-header__left">
        {isTeacherWithMultipleClasses && (
          <div className="app-header__top-row">
            <div className="app-header__class-select">
              <label htmlFor="header-class-select" className="app-header__class-label">Turma:</label>
              <select
                id="header-class-select"
                className="app-header__class-select-input"
                value={selectedClassId ?? ''}
                onChange={(e) => setSelectedClassId(e.target.value || null)}
              >
                {teacherClasses.length > 0
                  ? teacherClasses.map((c) => (
                      <option key={c._id} value={c._id ?? ''}>{c.name}</option>
                    ))
                  : classIds.map((id) => (
                      <option key={id} value={id}>Turma {id.slice(-6)}</option>
                    ))}
              </select>
            </div>
          </div>
        )}
      </div>
      <div className="app-header__right">
        {/* Notifications */}
        <div className="app-header__notifications" ref={notificationsRef}>
          <button 
            className="app-header__notification-btn"
            onClick={() => setShowNotifications(!showNotifications)}
          >
            <Icon name="notifications" size={20} />
            {unreadCount > 0 && (
              <span className="app-header__notification-badge">{unreadCount}</span>
            )}
          </button>
          {showNotifications && (
            <div className="app-header__notifications-dropdown">
              <div className="app-header__notifications-header">
                <h3>Notificações</h3>
                <button onClick={() => navigate('/notifications')}>Ver todas</button>
              </div>
              <div className="app-header__notifications-list">
                {notifications.length > 0 ? (
                  notifications.slice(0, 5).map((notif) => (
                    <div 
                      key={notif._id} 
                      className={`app-header__notification-item ${!notif.read ? 'app-header__notification-item--unread' : ''}`}
                      onClick={() => navigate('/notifications')}
                    >
                      <p className="app-header__notification-message">{notif.message}</p>
                      <span className="app-header__notification-time">
                        {new Date(notif.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="app-header__no-notifications">Nenhuma notificação</p>
                )}
              </div>
              {notifications.length > 0 && (
                <div style={{ padding: '0.5rem 1rem', borderTop: '1px solid #eee' }}>
                  <button
                    type="button"
                    onClick={handleClearAllNotifications}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#0F5077',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      padding: 0,
                      textDecoration: 'underline'
                    }}
                  >
                    Limpar todas
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Profile */}
        <div className="app-header__profile" ref={profileRef}>
          <button 
            className="app-header__profile-btn"
            onClick={() => setShowProfile(!showProfile)}
          >
            <div className="app-header__avatar">
              {user.profile_image_id ? (
                <img 
                  src={getProfileImageUrl(user.profile_image_id) || ''} 
                  alt={user.name}
                  className="app-header__avatar-img"
                />
              ) : (
                getInitials(user.name)
              )}
            </div>
          </button>
          {showProfile && (
            <div className="app-header__profile-dropdown">
              <div className="app-header__profile-info">
                <div className="app-header__profile-avatar-large">
                  {user.profile_image_id ? (
                    <img 
                      src={getProfileImageUrl(user.profile_image_id) || ''} 
                      alt={user.name}
                      className="app-header__avatar-img"
                    />
                  ) : (
                    getInitials(user.name)
                  )}
                </div>
                <div className="app-header__profile-details">
                  <p className="app-header__profile-name">{user.name}</p>
                  <p className="app-header__profile-email">{user.email}</p>
                  <p className="app-header__profile-role">Papel: {user.role}</p>
                </div>
              </div>
              <div className="app-header__profile-divider"></div>
              {(user.role === 'teacher' || user.role === 'admin' || user.role === 'student') && (
                <button 
                  className="app-header__profile-settings"
                  onClick={handleOpenSettings}
                >
                  <Icon name="cog" size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                  Configurações
                </button>
              )}
              <button 
                className="app-header__profile-logout"
                onClick={handleLogout}
              >
                <Icon name="arrowLeft" size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                Sair
              </button>
            </div>
          )}
        </div>
      </div>

      <ProfileSettingsModal 
        isOpen={showSettingsModal} 
        onClose={() => setShowSettingsModal(false)} 
      />
    </header>
  );
};

export default Header;
