import { NavLink } from 'react-router-dom';
import { LABELS } from '../../utils/constants';
import { useAuth } from '../../hooks/useAuth';
import Logo from '../shared/Logo';
import './Sidebar.css';

const ITEMS = [
  { to: '/', label: LABELS.nav_landing, icon: '◉', exact: true },
  { to: '/roster', label: LABELS.nav_roster, icon: '◢' },
  { to: '/race', label: LABELS.nav_race, icon: '◤' },
  { to: '/reports', label: LABELS.nav_reports, icon: '▣' },
  { to: '/laps', label: LABELS.nav_laps, icon: '◈' },
];

const FUTURE_ITEMS = [
  { to: '/training', label: LABELS.nav_training, icon: '◆' },
  { to: '/academy', label: LABELS.nav_academy, icon: '◇' },
  { to: '/endurance', label: LABELS.nav_endurance, icon: '◐' },
];

export default function Sidebar() {
  const { isStaff } = useAuth();

  return (
    <aside className="sidebar">
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
            className={({ isActive }) => `nav-item is-soon${isActive ? ' is-active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
            <span className="nav-tag">soon</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        {isStaff && <div className="staff-badge">STAFF MODE</div>}
        <div className="version">v0.1 · Phase 1</div>
      </div>
    </aside>
  );
}