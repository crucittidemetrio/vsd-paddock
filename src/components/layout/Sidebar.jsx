import { NavLink } from 'react-router-dom';
import { LABELS } from '../../utils/constants';
import { useAuth } from '../../hooks/useAuth';
import Logo from '../shared/Logo';
import totalPaintLogo from '../../assets/total-paint-logo.png';
import './Sidebar.css';

const ITEMS = [
  { to: '/', label: LABELS.nav_landing, icon: '◉', exact: true },
  { to: '/roster', label: LABELS.nav_roster, icon: '◢' },
  { to: '/race', label: LABELS.nav_race, icon: '◤' },
  { to: '/calendar', label: 'Calendario', icon: '📅' },
  { to: '/championships', label: 'Campionati', icon: '🏆' },
  { to: '/reports', label: LABELS.nav_reports, icon: '◣' },
  { to: '/laps', label: LABELS.nav_laps, icon: '◈' },
];

const FUTURE_ITEMS = [
  { to: '/training', label: LABELS.nav_training, icon: '◆' },
  { to: '/academy', label: LABELS.nav_academy, icon: '◇' },
  { to: '/endurance', label: LABELS.nav_endurance, icon: '◐' },
];

const ADMIN_ITEMS = [
  { to: '/admin/team-dashboard', label: 'Team Dashboard', icon: '📊' },
 { to: '/admin/import-results', label: 'Import Risultati', icon: '📥' },
  { to: '/admin/import-standings', label: 'Import Standings', icon: '🏆' },
  { to: '/admin/garage61-sync', label: 'Sync Garage61', icon: '⚡' },
  { to: '/admin/posters', label: 'Race Posters', icon: '🖼️' },
];

export default function Sidebar({ isMobileOpen = false, onMobileClose = () => {} }) {
  const { isStaff, isAdmin } = useAuth();

  return (
    <aside className={`sidebar${isMobileOpen ? ' is-mobile-open' : ''}`}>
      <div className="sidebar-brand">
        <Logo size={48} withWordmark />
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">Operations</div>
        {ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            onClick={onMobileClose}
            className={({ isActive }) => `nav-item${isActive ? ' is-active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}

        <div className="nav-section-label">In arrivo</div>
        {FUTURE_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onMobileClose}
            className={({ isActive }) => `nav-item is-soon${isActive ? ' is-active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
            <span className="nav-tag">soon</span>
          </NavLink>
        ))}

        {isStaff && (
          <>
            <div className="nav-section-label">Admin</div>
            {ADMIN_ITEMS.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onMobileClose}
                className={({ isActive }) => `nav-item${isActive ? ' is-active' : ''}`}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </NavLink>
            ))}
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        {isStaff && <div className="staff-badge">STAFF MODE</div>}
        
        {/* CORREZIONE: Aggiunto il tag di apertura <a */}
        <a
          href="https://www.totalpaint.it"
          target="_blank"
          rel="noopener noreferrer"
          className="sidebar-sponsor"
          title="Total Paint — Sponsor ufficiale VSD"
        >
          <div className="sidebar-sponsor-label">Sponsor</div>
          <div className="sidebar-sponsor-logo">
            <img src={totalPaintLogo} alt="Total Paint" />
          </div>
        </a>
        <div className="version">v0.1 · Phase 1</div>
      </div>
    </aside>
  );
}