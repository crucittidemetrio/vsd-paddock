import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LABELS } from '../../utils/constants';
import { useAuth } from '../../hooks/useAuth';
import { usePendingLapSubmissions } from '../../hooks/useLapSubmissions';
import { useAdminNavOrder } from '../../hooks/useAdminNavOrder';
import { useUpcomingRaces } from '../../hooks/useRaces';
import Logo from '../shared/Logo';
import totalPaintLogo from '../../assets/total-paint-logo.webp';
import './Sidebar.css';

// ═══════════════════════════════════════════════════════════
// Navigazione riorganizzata (13/10/2026, simulazione approvata da
// Demetrio): gruppi per "cosa vuoi fare" invece di una lista unica da
// 21 voci. Ogni gruppo si apre/chiude, lo stato resta salvato nel
// browser; il gruppo che contiene la pagina aperta si apre da solo.
// Nessun indirizzo cambia: link Discord e preferiti restano validi.
// `req`: undefined = tutti · 'pilot' = pilota VSD+ · 'staff' = staff/admin
// ═══════════════════════════════════════════════════════════
const NAV_GROUPS = [
  {
    key: 'team', label: 'Il team', defaultOpen: true,
    items: [
      { to: '/roster', label: LABELS.nav_roster, icon: '◢' },
      { to: '/joinus', label: 'Unisciti a noi', icon: '⊕' },
      { to: '/media-kit', label: 'Media Kit', icon: '▤' },
    ],
  },
  {
    key: 'gare', label: 'Gare', defaultOpen: true, accent: 'race',
    items: [
      { to: '/calendar', label: 'Calendario', icon: '▦' },
      { to: '/race', label: LABELS.nav_race, icon: '◤' },
      { to: '/results', label: LABELS.nav_results, icon: '☰' },
      { to: '/championships', label: 'Campionati', icon: '♛' },
      { to: '/endurance', label: LABELS.nav_endurance, icon: '◐' },
      { to: '/reclami', label: 'Reclami', icon: '⚠' },
    ],
  },
  {
    key: 'eventi', label: 'Eventi e campionati', accent: 'event',
    items: [
      { to: '/ue144', label: 'UE144', icon: '⚑', cls: 'is-event' },
      { to: '/era-season-3', label: 'ERA Season 3', icon: '◭', cls: 'is-external' },
      { to: '/clash-of-classes', label: 'Clash of Classes', icon: '⚔', cls: 'is-event is-archived', req: 'staff' },
      { to: '/aci-lmgt3-challenge', label: 'ACI LMGT3 Challenge', icon: '♟', cls: 'is-external is-archived', req: 'staff' },
    ],
  },
  {
    key: 'prestazioni', label: 'Prestazioni',
    items: [
      { to: '/laps', label: LABELS.nav_laps, icon: '◈' },
      { to: '/compare', label: 'Confronto piloti', icon: '⚖' },
      { to: '/records', label: 'Muro dei Record', icon: '✪', req: 'pilot' },
      { to: '/academy', label: 'Punti Merito', icon: '◇', req: 'pilot' },
      { to: '/pace-analysis', label: 'Analisi di Passo', icon: '⏱', req: 'pilot' },
      { to: '/training', label: LABELS.nav_training, icon: '◆', req: 'pilot' },
      { to: '/recap', label: 'Season Recap', icon: '✦', req: 'pilot' },
    ],
  },
  {
    key: 'pilota', label: 'Area pilota', req: 'pilot', accent: 'pilot',
    items: [
      { to: '/team-sessions', label: 'Sessioni team', icon: '◔' },
      { to: '/reports', label: LABELS.nav_reports, icon: '◣' },
      { to: '/setup', label: 'Setup', icon: '⚙' },
      { to: '/consenso', label: 'Il mio consenso', icon: '✎' },
    ],
  },
  {
    key: 'strumenti', label: 'Strumenti gara', req: 'pilot', accent: 'tool',
    items: [
      { to: '/pitwall', label: 'Pit Wall', icon: '◉', cls: 'is-tool' },
      { to: '/pitwall-live', label: 'Pit Wall remoto', icon: '◎', cls: 'is-tool' },
      { to: '/carburante-energia', label: 'Carburante/Energia', icon: '⛽', cls: 'is-tool' },
    ],
  },
];

const NAV_OPEN_KEY = 'vsd_nav_groups_v1';

function readOpenState() {
  try {
    return JSON.parse(localStorage.getItem(NAV_OPEN_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function writeOpenState(state) {
  try {
    localStorage.setItem(NAV_OPEN_KEY, JSON.stringify(state));
  } catch {
    /* storage non disponibile: lo stato vale solo per questa visita */
  }
}

function pathMatches(pathname, to) {
  return to === '/' ? pathname === '/' : (pathname === to || pathname.startsWith(to + '/'));
}

const RACE_TIME_FMT = new Intl.DateTimeFormat('it-IT', {
  weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome',
});

function nextRaceOf(data) {
  const list = Array.isArray(data) ? data : (data?.races || []);
  const now = Date.now();
  return list
    .filter(r => r && r.date && new Date(r.date).getTime() > now - 3 * 3600 * 1000 && r.status !== 'cancelled')
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0] || null;
}

// Ogni voce ha un campo `group` usato SOLO per raggruppare la vista in
// sola lettura (vedi groupAdminItems più sotto) — l'ordine libero via
// drag/frecce (useAdminNavOrder) resta un elenco piatto indipendente,
// non tocchiamo quel meccanismo. Admin Home non ha gruppo: resta sempre
// la prima voce, da sola, come punto d'ingresso.
const ADMIN_ITEMS = [
  { to: '/admin', label: 'Admin Home', icon: '⚒', group: null },
  { to: '/admin/best-laps', label: 'Validazione Best Laps', icon: '◷', group: 'gare' },
  { to: '/admin/races', label: 'Gestione Gare', icon: '⚑', group: 'gare' },
  { to: '/admin/team-dashboard', label: 'Team Dashboard', icon: '▥', group: 'piloti' },
  { to: '/admin/import-results', label: 'Import Risultati', icon: '▽', group: 'gare' },
  { to: '/admin/import-lap-data', label: 'Import Analisi di Passo', icon: '⏱', group: 'import' },
  { to: '/admin/import-standings', label: 'Import Standings', icon: '♛', group: 'import' },
  { to: '/admin/championships', label: 'Campionati', icon: '♛', group: 'gare' },
  { to: '/admin/garage61-sync', label: 'Sync Garage61', icon: '↻', group: 'import' },
  { to: '/admin/posters', label: 'Race Posters', icon: '▭', group: 'import' },
  { to: '/admin/endurance', label: 'Endurance Admin', icon: '◐', group: 'import' },
  { to: '/admin/clash-results', label: 'Clash of Classes — Risultati', icon: '⚔', group: 'import' },
  { to: '/admin/candidates', label: 'Candidature', icon: '◫', group: 'piloti' },
  { to: '/admin/sponsors', label: 'Sponsor', icon: '◆', group: 'finanze' },
  { to: '/admin/incidents', label: 'Registro incidenti', icon: '⚠', group: 'piloti' },
  { to: '/admin/messenger', label: 'Messaggi Discord', icon: '✉', group: 'contenuti' },
];

// Voci riservate ad admin/Team Principal — sottoinsieme più ristretto
// dell'area Admin (isStaff include anche staff generico, questo no).
const ADMIN_ONLY_ITEMS = [
  { to: '/admin/social-manager', label: 'Social Manager', icon: '◎', group: 'contenuti' },
  { to: '/admin/consents', label: 'Consensi (staff)', icon: '✎', group: 'sistema' },
  { to: '/admin/audit-log', label: 'Registro di controllo', icon: '☰', group: 'sistema' },
  { to: '/admin/treasury', label: 'Cassa / rendiconto', icon: '€', group: 'finanze' },
];

// Ordine ed etichette dei sotto-gruppi nella vista Admin non in modifica.
// Un gruppo compare solo se ha almeno una voce visibile per il ruolo
// corrente (es. Contenuti sparisce per staff non-admin, che non vede
// Social Manager né — qui — Messaggi Discord se non ha can_message).
const ADMIN_GROUP_ORDER = ['gare', 'piloti', 'contenuti', 'finanze', 'import', 'sistema'];
const ADMIN_GROUP_LABELS = {
  gare: 'Gare & Risultati',
  piloti: 'Piloti',
  contenuti: 'Contenuti & Comunicazione',
  finanze: 'Finanze',
  import: 'Import e strumenti',
  sistema: 'Sistema',
};

// Divide le voci Admin (già ordinate secondo la preferenza utente) in:
// - home: la voce Admin Home, se presente, resa da sola in cima
// - groups: bucket nell'ordine fisso ADMIN_GROUP_ORDER, ciascuno con le
//   sue voci nell'ordine relativo già stabilito da orderedAdminItems
function groupAdminItems(items) {
  const home = items.find(i => i.group == null) || null;
  const buckets = {};
  items.forEach(item => {
    if (item.group == null) return;
    if (!buckets[item.group]) buckets[item.group] = [];
    buckets[item.group].push(item);
  });
  const groups = ADMIN_GROUP_ORDER
    .filter(key => buckets[key] && buckets[key].length > 0)
    .map(key => ({ key, label: ADMIN_GROUP_LABELS[key], items: buckets[key] }));
  return { home, groups };
}

function renderNavItem(item, onMobileClose, extraClass = '', badgeCount = 0) {
  const tagText = extraClass.includes('is-archived') ? 'inattivo'
    : extraClass.includes('is-soon') ? 'soon'
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
      {tagText && (
        <span className={`nav-tag${tagText === 'live' ? ' nav-tag-live' : ''}${tagText === 'inattivo' ? ' nav-tag-archived' : ''}`}>
          {tagText}
        </span>
      )}
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
  const { isAuthenticated, isVsdPilot, isStaff, isAdmin, canMessage, driver } = useAuth();
  const { pathname } = useLocation();
  const [adminEditMode, setAdminEditMode] = useState(false);
  const [openState, setOpenState] = useState(readOpenState);

  const pendingLapsQuery = usePendingLapSubmissions(isAdmin);
  const pendingLapsCount = pendingLapsQuery.data?.length || 0;

  const upcomingQuery = useUpcomingRaces({ enabled: isAuthenticated });
  const nextRace = nextRaceOf(upcomingQuery.data);

  const effectiveAdminItems = [
    ...ADMIN_ITEMS.map(item => ({
      ...item,
      badgeCount: item.to === '/admin/best-laps' ? pendingLapsCount : 0,
    })),
    ...(isAdmin ? ADMIN_ONLY_ITEMS.map(item => ({ ...item, badgeCount: 0 })) : []),
  ];
  const { items: orderedAdminItems, move, reset, hasCustomOrder } = useAdminNavOrder(effectiveAdminItems);

  const canSee = req => !req || (req === 'pilot' ? isVsdPilot : req === 'staff' ? isStaff : true);

  // Gruppo aperto se: contiene la pagina corrente, oppure scelta salvata,
  // oppure default del gruppo.
  function isOpen(key, defaultOpen, items) {
    if (items && items.some(i => pathMatches(pathname, i.to))) return true;
    return openState[key] ?? !!defaultOpen;
  }
  function toggle(key, current) {
    setOpenState(prev => {
      const next = { ...prev, [key]: !current };
      writeOpenState(next);
      return next;
    });
  }

  function renderGroupHeader(key, label, open, accent, extra = null) {
    return (
      <div className={`nav-group-head${accent ? ' nav-group-' + accent : ''}`}>
        <button
          type="button"
          className="nav-group-toggle"
          aria-expanded={open}
          onClick={() => toggle(key, open)}
        >
          <span className="nav-group-label">{label}</span>
          <span className={`nav-group-chevron${open ? ' is-open' : ''}`} aria-hidden="true">›</span>
        </button>
        {extra}
      </div>
    );
  }

  const adminGrouped = groupAdminItems(orderedAdminItems);
  const adminOpen = isOpen('admin', false, orderedAdminItems);

  return (
    <aside className={`sidebar${isMobileOpen ? ' is-mobile-open' : ''}`}>
      <div className="sidebar-brand">
        <Logo size={48} withWordmark />
      </div>

      <nav className="sidebar-nav" aria-label="Navigazione principale">
        {/* In evidenza: sempre visibile, niente gruppo da aprire. */}
        {renderNavItem({ to: '/', label: LABELS.nav_landing, icon: '⌂', exact: true }, onMobileClose)}
        {nextRace && (
          <NavLink
            to={`/race/${encodeURIComponent(nextRace.race_id)}`}
            onClick={onMobileClose}
            className={({ isActive }) => `nav-item nav-item-next${isActive ? ' is-active' : ''}`}
            title={nextRace.race_name || nextRace.title || 'Prossima gara'}
          >
            <span className="nav-icon">➤</span>
            <span className="nav-label">
              Prossima gara
              <span className="nav-sublabel">{nextRace.race_name || nextRace.title}</span>
            </span>
            <span className="nav-when">{RACE_TIME_FMT.format(new Date(nextRace.date))}</span>
          </NavLink>
        )}
        {isAuthenticated && driver?.driver_id &&
          renderNavItem({ to: `/roster/${driver.driver_id}`, label: 'Il mio profilo', icon: '☺' }, onMobileClose)}

        {NAV_GROUPS.filter(g => canSee(g.req)).map(group => {
          const items = group.items.filter(i => canSee(i.req));
          if (!items.length) return null;
          const open = isOpen(group.key, group.defaultOpen, items);
          return (
            <div key={group.key} className="nav-group">
              {renderGroupHeader(group.key, group.label, open, group.accent)}
              {open && items.map(item => renderNavItem(item, onMobileClose, item.cls || ''))}
            </div>
          );
        })}

        {!isVsdPilot && (
          <NavLink to="/login" onClick={onMobileClose} className="nav-item nav-item-locked">
            <span className="nav-icon">🔒︎</span>
            <span className="nav-label">
              Area riservata
              <span className="nav-sublabel">Accedi per statistiche e strumenti</span>
            </span>
          </NavLink>
        )}

        {isStaff && (
          <div className="nav-group">
            {renderGroupHeader('admin', 'Admin', adminOpen || adminEditMode, 'admin', (adminOpen || adminEditMode) && (
              <button
                type="button"
                className={`nav-reorder-toggle${adminEditMode ? ' is-active' : ''}`}
                onClick={() => setAdminEditMode(v => !v)}
                title={adminEditMode ? 'Fine riordino' : 'Riordina le voci Admin'}
              >
                {adminEditMode ? 'Fatto' : 'Riordina'}
              </button>
            ))}
            {adminEditMode && hasCustomOrder && (
              <button type="button" className="nav-reorder-reset" onClick={reset}>
                Ripristina ordine predefinito
              </button>
            )}
            {adminEditMode ? (
              orderedAdminItems.map((item, idx) => renderReorderableAdminItem(item, {
                move,
                isFirst: idx === 0,
                isLast: idx === orderedAdminItems.length - 1,
                badgeCount: item.badgeCount,
              }))
            ) : adminOpen && (
              <>
                {adminGrouped.home && renderNavItem(adminGrouped.home, onMobileClose, 'is-admin', adminGrouped.home.badgeCount)}
                {adminGrouped.groups.map(g => {
                  // Il sotto-gruppo degli strumenti usati di rado parte chiuso.
                  const subKey = 'admin_' + g.key;
                  const subOpen = isOpen(subKey, g.key !== 'import', g.items);
                  return (
                    <div key={g.key}>
                      <button
                        type="button"
                        className="nav-subsection-label nav-subsection-toggle"
                        aria-expanded={subOpen}
                        onClick={() => toggle(subKey, subOpen)}
                      >
                        <span>{g.label}{!subOpen ? ` (${g.items.length})` : ''}</span>
                        <span className={`nav-group-chevron${subOpen ? ' is-open' : ''}`} aria-hidden="true">›</span>
                      </button>
                      {subOpen && g.items.map(item => renderNavItem(item, onMobileClose, 'is-admin', item.badgeCount))}
                    </div>
                  );
                })}
              </>
            )}
            {/* Badge validazioni in attesa visibile anche ad Admin chiuso. */}
            {!adminOpen && !adminEditMode && pendingLapsCount > 0 &&
              renderNavItem({ to: '/admin/best-laps', label: 'Best Laps da validare', icon: '◷' }, onMobileClose, 'is-admin', pendingLapsCount)}
          </div>
        )}

        {!isStaff && canMessage && (
          <div className="nav-group">
            <div className="nav-group-head nav-group-admin"><span className="nav-group-label nav-group-static">Comunicazione</span></div>
            {renderNavItem({ to: '/admin/messenger', label: 'Messaggi Discord', icon: '✉' }, onMobileClose, 'is-admin')}
          </div>
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
