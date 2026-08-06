import { NavLink } from 'react-router-dom';
import { LABELS } from '../../utils/constants';
import { useAuth } from '../../hooks/useAuth';
import Logo from '../shared/Logo';
import totalPaintLogo from '../../assets/total-paint-logo.webp';
import './Sidebar.css';

// Voci pubbliche — visibili a tutti i tier (anonymous incluso)
const PUBLIC_ITEMS = [
  { to: '/', label: LABELS.nav_landing, icon: '◉', exact: true },
  { to: '/roster', label: LABELS.nav_roster, icon: '◢' },
  { to: '/race', label: LABELS.nav_race, icon: '◤' },
  { to: '/calendar', label: 'Calendario', icon: '📅' },
  { to: '/championships', label: 'Campionati', icon: '🏆' },
  { to: '/laps', label: LABELS.nav_laps, icon: '◈' },
  { to: '/results', label: LABELS.nav_results, icon: '🏁' },
  { to: '/compare', label: 'Confronto', icon: '⚖' },
  { to: '/endurance', label: LABELS.nav_endurance, icon: '◐' },
];

// Eventi VSD — formati proprietari interni (non le gare/campionati standard),
// visibili a tutti gli utenti, evidenziati con un accento dedicato.
const EVENTS_ITEMS = [
  { to: '/ue144', label: 'UE144', icon: '🏁' },
  { to: '/clash-of-classes', label: 'Clash of Classes', icon: '⚔' },
];

// Voci pilota attive — visibili solo a pilot_vsd, staff, admin
const PILOT_ITEMS = [
  { to: '/reports', label: LABELS.nav_reports, icon: '◣' },
  { to: '/academy', label: 'Pilot Rating', icon: '◇' },
  { to: '/recap', label: 'Season Recap', icon: '✦' },
  { to: '/records', label: 'Muro dei Record', icon: '🏆' },
  { to: '/training', label: LABELS.nav_training, icon: '◆' },
];

// Strumenti da usare DURANTE una sessione (gara o prova), non pagine di
// consultazione — sezione separata coi propri accenti visivi, così è
// chiaro a colpo d'occhio che non è "un'altra pagina di statistiche".
const TOOLS_ITEMS = [
  { to: '/carburante-energia', label: 'Carburante/Energia', icon: '⛽' },
];

// Voci future "soon" — solo pilota loggato
const FUTURE_ITEMS = [];

const ADMIN_ITEMS = [
  { to: '/admin/best-laps', label: 'Best Laps', icon: '⏱️' },
  { to: '/admin/races', label: 'Gestione Gare', icon: '🏁' },
  { to: '/admin/team-dashboard', label: 'Team Dashboard', icon: '📊' },
  { to: '/admin/import-results', label: 'Import Risultati', icon: '📥' },
  { to: '/admin/import-standings', label: 'Import Standings', icon: '🏆' },
  { to: '/admin/garage61-sync', label: 'Sync Garage61', icon: '⚡' },
  { to: '/admin/posters', label: 'Race Posters', icon: '🖼️' },
  { to: '/admin/endurance', label: 'Endurance Admin', icon: '◐' },
  { to: '/admin/clash-results', label: 'Clash of Classes', icon: '⚔' },
];

// Voci riservate ad admin/Team Principal — sottoinsieme più ristretto
// dell'area Admin (isStaff include anche staff generico, questo no).
const ADMIN_ONLY_ITEMS = [
  { to: '/admin/social-manager', label: 'Social Manager', icon: '📣' },
];

function renderNavItem(item, onMobileClose, extraClass = '') {
  const tagText = extraClass.includes('is-soon') ? 'soon'
    : extraClass.includes('is-tool') ? 'live'
    : null;
  return (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.exact}
      onClick={onMobileClose}
      className={({ isActive }) => `nav-item${extraClass ? ' ' + extraClass : ''}${isActive ? ' is-active' : ''}`}
    >
      <span className="nav-icon">{item.icon}</span>
      <span className="nav-label">{item.label}</span>
      {tagText && <span className={`nav-tag${tagText === 'live' ? ' nav-tag-live' : ''}`}>{tagText}</span>}
    </NavLink>
  );
}

export default function Sidebar({ isMobileOpen = false, onMobileClose = () => {} }) {
  const { isVsdPilot, isStaff, isAdmin } = useAuth();

  return (
    <aside className={`sidebar${isMobileOpen ? ' is-mobile-open' : ''}`}>
      <div className="sidebar-brand">
        <Logo size={48} withWordmark />
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">Operations</div>
        {PUBLIC_ITEMS.map(item => renderNavItem(item, onMobileClose))}

        <div className="nav-section-label nav-section-label-event">Eventi VSD</div>
        {EVENTS_ITEMS.map(item => renderNavItem(item, onMobileClose, 'is-event'))}

        {isVsdPilot && PILOT_ITEMS.map(item => renderNavItem(item, onMobileClose))}

        {isVsdPilot && (
          <>
            <div className="nav-section-label nav-section-label-tool">Strumenti Gara</div>
            {TOOLS_ITEMS.map(item => renderNavItem(item, onMobileClose, 'is-tool'))}
          </>
        )}

        {isVsdPilot && (
          <>
            <div className="nav-section-label">In arrivo</div>
            {FUTURE_ITEMS.map(item => renderNavItem(item, onMobileClose, 'is-soon'))}
          </>
        )}

        {isStaff && (
          <>
            <div className="nav-section-label">Admin</div>
            {ADMIN_ITEMS.map(item => renderNavItem(item, onMobileClose))}
            {isAdmin && ADMIN_ONLY_ITEMS.map(item => renderNavItem(item, onMobileClose))}
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        {isStaff && <div className="staff-badge">STAFF MODE</div>}

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
        <NavLink to="/privacy" className="sidebar-privacy-link" onClick={onMobileClose}>
          Privacy &amp; Dati
        </NavLink>
        <NavLink to="/terms" className="sidebar-privacy-link" onClick={onMobileClose}>
          Termini di Servizio
        </NavLink>

        <div className="version">v0.1 · Phase 1</div>
      </div>
    </aside>
  );
}
