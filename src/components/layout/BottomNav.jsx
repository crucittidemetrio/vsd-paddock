import { NavLink } from 'react-router-dom';
import './BottomNav.css';

// Barra scorciatoie fissa in basso, solo su telefono (vedi CSS): le tre
// pagine più aperte + il pulsante che apre il menu completo. Richiesta
// 13/10/2026 insieme alla riorganizzazione della sidebar.
const SHORTCUTS = [
  { to: '/', label: 'Home', icon: '⌂', exact: true },
  { to: '/calendar', label: 'Calendario', icon: '▦' },
  { to: '/laps', label: 'Best Laps', icon: '◈' },
];

export default function BottomNav({ onMenuClick, isMenuOpen = false }) {
  return (
    <nav className="bottom-nav" aria-label="Scorciatoie">
      {SHORTCUTS.map(s => (
        <NavLink
          key={s.to}
          to={s.to}
          end={s.exact}
          className={({ isActive }) => `bottom-nav-item${isActive && !isMenuOpen ? ' is-active' : ''}`}
        >
          <span className="bottom-nav-icon" aria-hidden="true">{s.icon}</span>
          <span className="bottom-nav-label">{s.label}</span>
        </NavLink>
      ))}
      <button
        type="button"
        className={`bottom-nav-item${isMenuOpen ? ' is-active' : ''}`}
        onClick={onMenuClick}
        aria-expanded={isMenuOpen}
      >
        <span className="bottom-nav-icon" aria-hidden="true">☰</span>
        <span className="bottom-nav-label">Menu</span>
      </button>
    </nav>
  );
}
