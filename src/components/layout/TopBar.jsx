import { useAuth } from '../../hooks/useAuth';
import { LABELS } from '../../utils/constants';
import './TopBar.css';

export default function TopBar({ onHamburgerClick = () => {} }) {
  const { driver, logout } = useAuth();

  const initials = (driver?.display_name || '?')
    .split(' ')
    .map(s => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          className="hamburger-btn"
          onClick={onHamburgerClick}
          aria-label="Apri menu"
        >
          <span /><span /><span />
        </button>
        <div className="status-strip">
          <span className="status-dot" />
          <span className="status-text">SYSTEM ONLINE</span>
        </div>
      </div>

      <div className="topbar-right">
        <div className="user-card">
          <div className="user-avatar">{initials}</div>
          <div className="user-meta">
            <div className="user-name">{driver?.display_name || '—'}</div>
            <div className="user-role">{driver?.role?.toUpperCase() || ''}</div>
          </div>
        </div>
        <button className="logout-btn" onClick={logout}>
          {LABELS.nav_logout}
        </button>
      </div>
    </header>
  );
}