import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LABELS } from '../../utils/constants';
import { useAuth } from '../../hooks/useAuth';
import { usePendingLapSubmissions } from '../../hooks/useLapSubmissions';
import { useAdminNavOrder } from '../../hooks/useAdminNavOrder';
import Logo from '../shared/Logo';
import totalPaintLogo from '../../assets/total-paint-logo.webp';
import './Sidebar.css';

// Voci pubbliche — visibili a tutti i tier (anonymous incluso)
const PUBLIC_ITEMS = [
  { to: '/', label: LABELS.nav_landing, icon: '◉', exact: true },
  { to: '/roster', label: LABELS.nav_roster, icon: '◢' },
  { to: '/race', label: LABELS.nav_race, icon: '◤' },
  { to: '/calendar', label: 'Calendario', icon: '▦' },
  { to: '/championships', label: 'Campionati', icon: '♛' },
  { to: '/laps', label: LABELS.nav_laps, icon: '◈' },
  { to: '/results', label: LABELS.nav_results, icon: '⚑' },
  { to: '/compare', label: 'Confronto', icon: '⚖' },
  { to: '/endurance', label: LABELS.nav_endurance, icon: '◐' },
];

// Eventi VSD — formati proprietari interni (non le gare/campionati standard),
// visibili a tutti gli utenti, evidenziati con un accento dedicato.
const EVENTS_ITEMS = [
  { to: '/ue144', label: 'UE144', icon: '⚑' },
  { to: '/clash-of-classes', label: 'Clash of Classes', icon: '⚔' },
];

// Pagine rivolte all'esterno (candidati, sponsor) — visibili a tutti,
// prima erano raggiungibili solo via link diretto condiviso a mano.
const TEAM_ITEMS = [
  { to: '/joinus', label: 'Unisciti a noi', icon: '⊕' },
  { to: '/media-kit', label: 'Media Kit', icon: '▤' },
];

// Voci pilota attive — visibili solo a pilot_vsd, staff, admin
const PILOT_ITEMS = [
  { to: '/reports', label: LABELS.nav_reports, icon: '◣' },
  { to: '/academy', label: 'Pilot Rating', icon: '◇' },
  { to: '/recap', label: 'Season Recap', icon: '✦' },
  { to: '/records', label: 'Muro dei Record', icon: '♛' },
  { to: '/training', label: LABELS.nav_training, icon: '◆' },
  { to: '/consenso', label: 'Consenso dati', icon: '✎' },
];

// Strumenti da usare DURANTE una sessione (gara o prova), non pagine di
// consultazione — sezione separata coi propri accenti visivi, così è
// chiaro a colpo d'occhio che non è "un'altra pagina di statistiche".
const TOOLS_ITEMS = [
  { to: '/carburante-energia', label: 'Carburante/Energia', icon: '◔' },
];

// Voci future "soon" — solo pilota loggato
const FUTURE_ITEMS = [];

const ADMIN_ITEMS = [
  { to: '/admin/best-laps', label: 'Best Laps', icon: '◷' },
  { to: '/admin/races', label: 'Gestione Gare', icon: '⚑' },
  { to: '/admin/team-dashboard', label: 'Team Dashboard', icon: '▥' },
  { to: '/admin/import-results', label: 'Import Risultati', icon: '▽' },
  { to: '/admin/import-standings', label: 'Import Standings', icon: '♛' },
  { to: '/admin/garage61-sync', label: 'Sync Garage61', icon: '↻' },
  { to: '/admin/posters', label: 'Race Posters', icon: '▭' },
  { to: '/admin/endurance', label: 'Endurance Admin', icon: '◐' },
  { to: '/admin/clash-results', label: 'Clash of Classes', icon: '⚔' },
  { to: '/admin/candidates', label: 'Candidature', icon: '◫' },
];

// Voci riservate ad admin/Team Principal — sottoinsieme più ristretto
// dell'area Admin (isStaff include anche staff generico, questo no).
const ADMIN_ONLY_ITEMS = [
  { to: '/admin/social-manager', label: 'Social Manager', icon: '◎' },
  { to: '/admin/consents', label: 'Consenso dati', icon: '✎' },
  { to: '/admin/audit-log', label: 'Registro di controllo', icon: '☰' },
];

function renderNavItem(item, onMobileClose, extraClass = '', badgeCount = 0) {
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
      {badgeCount > 0 && <span className="nav-count">{badgeCount}</span>}
      {tagText && <span className={`nav-tag${tagText === 'live' ? ' nav-tag-live' : ''}`}>{tagText}</span>}
    </NavLink>
  );
}

// Riga Admin in modalità riordino: stessa voce di renderNavItem ma con
// frecce su/giù a fianco invece che dentro il link (un <button> non può
// stare dentro un <a>). Il click sulle frecce non deve navigare.
function renderReorderableAdminItem(item, { move, isFirst, isLast, badgeCount = 0 }) {
  return (
    <div key={item.to} className="nav-item-row">
      <span className="nav-item is-admin nav-item-static">
        <span className="nav-icon">{item.icon}</span>
        <span className="nav-label">{item.label}</span>
        {badgeCount > 0 && <span className="nav-count">{badgeCount}</span>}
      </span>
      <span className="nav-reorder-btns">
        <button
          type="button"
          className="nav-reorder-btn"
          disabled={isFirst}
          onClick={() => move(item.to, 'up')}
          aria-label={`Sposta "${item.label}" su`}
        >
          ▲
        </button>
        <button
          type="button"
          className="nav-reorder-btn"
          disabled={isLast}
          onClick={() => move(item.to, 'down')}
          aria-label={`Sposta "${item.label}" giù`}
        >
          ▼
        </button>
      </span>
    </div>
  );
}

export default function Sidebar({ isMobileOpen = false, onMobileClose = () => {} }) {
  const { isVsdPilot, isStaff, isAdmin } = useAuth();
  const [adminEditMode, setAdminEditMode] = useState(false);

  // Solo admin: la coda di validazione best lap è riservata a loro (vedi
  // AdminBestLaps.jsx). Polling ogni 30s già previsto dall'hook — stessa
  // queryKey usata lì, quindi nessuna chiamata doppia se la pagina è
  // aperta insieme alla sidebar.
  const pendingLapsQuery = usePendingLapSubmissions(isAdmin);
  const pendingLapsCount = pendingLapsQuery.data?.length || 0;

  // Ordine Admin personalizzabile ("almeno per la sezione Admin" — richiesta
  // esplicita): combina le voci visibili in base al ruolo corrente in
  // un'unica lista ordinabile, salvata in localStorage (preferenza di
  // questo browser, non dato di squadra).
  const effectiveAdminItems = [
    ...ADMIN_ITEMS.map(item => ({
      ...item,
      badgeCount: item.to === '/admin/best-laps' ? pendingLapsCount : 0,
    })),
    ...(isAdmin ? ADMIN_ONLY_ITEMS.map(item => ({ ...item, badgeCount: 0 })) : []),
  ];
  const { items: orderedAdminItems, move, reset, hasCustomOrder } = useAdminNavOrder(effectiveAdminItems);

  return (
    <aside className={`sidebar${isMobileOpen ? ' is-mobile-open' : ''}`}>
      <div className="sidebar-brand">
        <Logo size={48} withWordmark />
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">Operations</div>
        {PUBLIC_ITEMS.map(item => renderNavItem(item, onMobileClose))}

        {isVsdPilot && PILOT_ITEMS.map(item => renderNavItem(item, onMobileClose))}

        {/* Eventi VSD dopo le voci pilota (non dopo Operations), così il
            blocco "azzurro" (Operations + voci pilota) resta contiguo
            invece di essere interrotto dal blocco arancione in mezzo. */}
        <div className="nav-section-label nav-section-label-event">Eventi VSD</div>
        {EVENTS_ITEMS.map(item => renderNavItem(item, onMobileClose, 'is-event'))}

        <div className="nav-section-label">Team</div>
        {TEAM_ITEMS.map(item => renderNavItem(item, onMobileClose))}

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
            <div className="nav-section-label nav-section-label-admin">
              <span>Admin</span>
              <button
                type="button"
                className={`nav-reorder-toggle${adminEditMode ? ' is-active' : ''}`}
                onClick={() => setAdminEditMode(v => !v)}
                title={adminEditMode ? 'Fine riordino' : 'Riordina le voci Admin'}
              >
                {adminEditMode ? 'Fatto' : 'Riordina'}
              </button>
            </div>
            {adminEditMode && hasCustomOrder && (
              <button type="button" className="nav-reorder-reset" onClick={reset}>
                Ripristina ordine predefinito
              </button>
            )}
            {orderedAdminItems.map((item, idx) => adminEditMode
              ? renderReorderableAdminItem(item, {
                move,
                isFirst: idx === 0,
                isLast: idx === orderedAdminItems.length - 1,
                badgeCount: item.badgeCount,
              })
              : renderNavItem(item, onMobileClose, 'is-admin', item.badgeCount)
            )}
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
