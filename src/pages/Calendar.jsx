import { useState, useMemo, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useRaces } from '../hooks/useRaces';
import { useTeamSessions } from '../hooks/useTeamSessions';
import { useAuth } from '../hooks/useAuth';
import styles from './Calendar.module.css';

const SESSION_TYPE_LABELS = {
  allenamento_libero: 'Allenamento libero',
  allenamento_collettivo: 'Allenamento collettivo',
  qualifica: 'Qualifica',
  evento_esterno: 'Evento esterno',
  riunione: 'Riunione',
};

// Adatta una TeamSession allo stesso shape minimo di una gara, così le
// viste esistenti (Month/Week/List) possono trattarle come lo stesso
// tipo di evento senza duplicare la logica di rendering. `kind`
// distingue le due entità per link e stile: le gare puntano a
// /race/:id, le sessioni non hanno una pagina dettaglio (Fase 1).
function sessionToEvent(s) {
  return {
    race_id: s.session_id,
    kind: 'session',
    session_type: s.type,
    date: s.datetime_start,
    sim: s.sim || '',
    race_name: s.title,
    status: 'scheduled',
    championship_name: SESSION_TYPE_LABELS[s.type] || s.type,
  };
}

const MONTH_NAMES = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

const SIM_KEY = { LMU: 'lmu', IRC: 'irc', ACE: 'ace' };

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1);
  const firstWeekday = (firstDay.getDay() + 6) % 7; // Lun=0
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - firstWeekday);

  const todayStr = new Date().toDateString();
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push({
      date: d,
      day: d.getDate(),
      inMonth: d.getMonth() === month,
      isToday: d.toDateString() === todayStr,
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
    });
  }
  return cells;
}

function buildWeekGrid(anchorDate) {
  const anchor = startOfDay(anchorDate);
  const weekday = (anchor.getDay() + 6) % 7; // Lun=0
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() - weekday);

  const todayStr = new Date().toDateString();
  const cells = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    cells.push({
      date: d,
      day: d.getDate(),
      label: DAY_LABELS[i],
      isToday: d.toDateString() === todayStr,
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
    });
  }
  return cells;
}

function formatWeekRange(cells) {
  const start = cells[0].date;
  const end = cells[6].date;
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const sameYear = start.getFullYear() === end.getFullYear();

  if (sameMonth) {
    return `${start.getDate()}–${end.getDate()} ${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}`;
  }
  const startLabel = `${start.getDate()} ${MONTH_NAMES[start.getMonth()].slice(0, 3)}`;
  const endLabel = sameYear
    ? `${end.getDate()} ${MONTH_NAMES[end.getMonth()].slice(0, 3)}`
    : `${end.getDate()} ${MONTH_NAMES[end.getMonth()].slice(0, 3)} ${end.getFullYear()}`;
  return `${startLabel} – ${endLabel} ${end.getFullYear()}`;
}

function formatTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function raceName(r) {
  return r.race_name || r.title || 'Gara';
}

function raceChampionship(r) {
  return r.championship_name || r.championship || r.series || null;
}

export default function Calendar() {
  const [viewMode, setViewMode] = useState('mese');
  const [eventFilter, setEventFilter] = useState('tutto'); // 'gare' | 'sessioni' | 'tutto'
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const { isAuthenticated } = useAuth();
  const { data: races, isLoading } = useRaces();
  // Sessioni team (ADR-Team-Scheduler Fase 1): backend richiede auth,
  // quindi il layer resta vuoto per un visitatore non loggato invece di
  // fallire — il Calendario pubblico mostra comunque le gare.
  const { data: teamSessions } = useTeamSessions({ enabled: isAuthenticated });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthCells = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const weekCells = useMemo(() => buildWeekGrid(currentDate), [currentDate]);

  const events = useMemo(() => {
    const raceEvents = eventFilter !== 'sessioni' ? (races || []) : [];
    const sessionEvents = eventFilter !== 'gare' ? (teamSessions || []).map(sessionToEvent) : [];
    return [...raceEvents, ...sessionEvents];
  }, [races, teamSessions, eventFilter]);

  const racesByDate = useMemo(() => {
    const map = new Map();
    events.forEach(r => {
      if (!r.date) return;
      const d = new Date(r.date);
      if (isNaN(d.getTime())) return;
      const key = d.toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    return map;
  }, [events]);

  // Ordine cronologico ascendente (più vecchia in alto, più recente in fondo):
  // più leggibile in Lista, e permette di ancorare la vista alla gara più
  // vicina a oggi appena si apre la pagina (vedi ListView → scroll-to-today).
  const sortedRaces = useMemo(() => {
    return [...events].sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [events]);

  const groupedByMonth = useMemo(() => {
    const map = new Map();
    sortedRaces.forEach(r => {
      const d = new Date(r.date);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    return map;
  }, [sortedRaces]);

  if (isLoading) return <div className={styles.page}>Caricamento calendario…</div>;

  const total = (races || []).length;
  const scheduled = (races || []).filter(r => r.status === 'scheduled').length;
  const sessionCount = (teamSessions || []).length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>CALENDARIO</div>
        <h1>Programma Gare</h1>
        <p className={styles.subtitle}>
          {total} gare totali · {scheduled} in programma
          {isAuthenticated && sessionCount > 0 && ` · ${sessionCount} sessioni team`}
        </p>
      </header>

      <div className={styles.controlsBar}>
        <div className={styles.viewToggle}>
          <button
            className={`${styles.toggleBtn} ${viewMode === 'mese' ? styles.toggleActive : ''}`}
            onClick={() => setViewMode('mese')}
          >
            Mese
          </button>
          <button
            className={`${styles.toggleBtn} ${viewMode === 'settimana' ? styles.toggleActive : ''}`}
            onClick={() => setViewMode('settimana')}
          >
            Settimana
          </button>
          <button
            className={`${styles.toggleBtn} ${viewMode === 'lista' ? styles.toggleActive : ''}`}
            onClick={() => setViewMode('lista')}
          >
            Lista
          </button>
        </div>

        {isAuthenticated && (
          <div className={styles.viewToggle}>
            <button
              className={`${styles.toggleBtn} ${eventFilter === 'gare' ? styles.toggleActive : ''}`}
              onClick={() => setEventFilter('gare')}
            >
              Gare
            </button>
            <button
              className={`${styles.toggleBtn} ${eventFilter === 'sessioni' ? styles.toggleActive : ''}`}
              onClick={() => setEventFilter('sessioni')}
            >
              Sessioni team
            </button>
            <button
              className={`${styles.toggleBtn} ${eventFilter === 'tutto' ? styles.toggleActive : ''}`}
              onClick={() => setEventFilter('tutto')}
            >
              Tutto
            </button>
          </div>
        )}

        {viewMode === 'mese' && (
          <div className={styles.monthNav}>
            <button
              className={styles.navBtn}
              onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
              aria-label="Mese precedente"
            >‹</button>
            <div className={styles.currentMonth}>
              {MONTH_NAMES[month]} {year}
            </div>
            <button
              className={styles.navBtn}
              onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
              aria-label="Mese successivo"
            >›</button>
            <button
              className={styles.todayBtn}
              onClick={() => setCurrentDate(new Date())}
            >Oggi</button>
          </div>
        )}

        {viewMode === 'settimana' && (
          <div className={styles.monthNav}>
            <button
              className={styles.navBtn}
              onClick={() => setCurrentDate(d => {
                const next = new Date(d);
                next.setDate(next.getDate() - 7);
                return next;
              })}
              aria-label="Settimana precedente"
            >‹</button>
            <div className={styles.currentMonth}>
              {formatWeekRange(weekCells)}
            </div>
            <button
              className={styles.navBtn}
              onClick={() => setCurrentDate(d => {
                const next = new Date(d);
                next.setDate(next.getDate() + 7);
                return next;
              })}
              aria-label="Settimana successiva"
            >›</button>
            <button
              className={styles.todayBtn}
              onClick={() => setCurrentDate(new Date())}
            >Oggi</button>
          </div>
        )}
      </div>

      {viewMode === 'mese' && (
        <MonthView cells={monthCells} racesByDate={racesByDate} />
      )}
      {viewMode === 'settimana' && (
        <WeekView cells={weekCells} racesByDate={racesByDate} />
      )}
      {viewMode === 'lista' && (
        <ListView groupedByMonth={groupedByMonth} />
      )}
    </div>
  );
}

function MonthView({ cells, racesByDate }) {
  return (
    <div className={styles.monthGrid}>
      <div className={styles.dayLabels}>
        {DAY_LABELS.map(label => (
          <div key={label} className={styles.dayLabel}>{label}</div>
        ))}
      </div>
      <div className={styles.cellGrid}>
        {cells.map((cell, i) => {
          const racesToday = racesByDate.get(cell.date.toDateString()) || [];
          const visible = racesToday.slice(0, 3);
          const overflow = racesToday.length - visible.length;

          let cls = styles.dayCell;
          if (!cell.inMonth) cls += ' ' + styles.dayCellOutMonth;
          if (cell.isToday) cls += ' ' + styles.dayCellToday;
          if (cell.isWeekend) cls += ' ' + styles.dayCellWeekend;

          return (
            <div key={i} className={cls}>
              <div className={styles.dayNumber}>{cell.day}</div>
              <div className={styles.dayRaces}>
                {visible.map(r => {
                  const chipCls = `${styles.raceChip} ${styles[`raceChip_${SIM_KEY[r.sim] || 'default'}`]}`;
                  const chipContent = (
                    <>
                      <span className={styles.chipSim}>{r.kind === 'session' ? '◔' : r.sim}</span>
                      <span className={styles.chipName}>{raceName(r)}</span>
                    </>
                  );
                  // Le sessioni team (Fase 1) non hanno pagina dettaglio —
                  // chip informativo, non navigabile (a differenza delle gare).
                  return r.kind === 'session' ? (
                    <span key={r.race_id} className={chipCls} title={raceName(r)}>
                      {chipContent}
                    </span>
                  ) : (
                    <Link key={r.race_id} to={`/race/${r.race_id}`} className={chipCls} title={raceName(r)}>
                      {chipContent}
                    </Link>
                  );
                })}
                {overflow > 0 && <div className={styles.raceOverflow}>+{overflow}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({ cells, racesByDate }) {
  return (
    <div className={styles.weekGridWrap}>
      <div className={styles.weekGrid}>
        {cells.map((cell, i) => {
          const racesToday = (racesByDate.get(cell.date.toDateString()) || [])
            .slice()
            .sort((a, b) => new Date(a.date) - new Date(b.date));

          let cls = styles.weekCol;
          if (cell.isToday) cls += ' ' + styles.weekColToday;
          if (cell.isWeekend) cls += ' ' + styles.weekColWeekend;

          return (
            <div key={i} className={cls}>
              <div className={styles.weekColHeader}>
                <span className={styles.weekColLabel}>{cell.label}</span>
                <span className={styles.weekColDay}>{cell.day}</span>
              </div>
              <div className={styles.weekColBody}>
                {racesToday.length === 0 && (
                  <div className={styles.weekEmpty}>—</div>
                )}
                {racesToday.map(r => {
                  const cls = `${styles.weekRace} ${styles[`weekRace_${SIM_KEY[r.sim] || 'default'}`]}`;
                  const content = (
                    <>
                      <div className={styles.weekRaceTime}>{formatTime(r.date)}</div>
                      <div className={styles.weekRaceName}>{raceName(r)}</div>
                      <div className={styles.weekRaceMeta}>
                        <span className={styles.weekRaceSim}>{r.kind === 'session' ? raceChampionship(r) : r.sim}</span>
                        {r.status === 'live' && <span className={styles.statusLive}>LIVE</span>}
                        {r.status === 'cancelled' && <span className={styles.statusCancelled}>Annullata</span>}
                      </div>
                    </>
                  );
                  return r.kind === 'session' ? (
                    <div key={r.race_id} className={cls}>{content}</div>
                  ) : (
                    <Link key={r.race_id} to={`/race/${r.race_id}`} className={cls}>{content}</Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ListView({ groupedByMonth }) {
  // Ascendente: mese più vecchio in alto, più recente in fondo — coerente
  // con l'ordine cronologico di sortedRaces (vedi Calendar()).
  const entries = Array.from(groupedByMonth.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  const today = startOfDay(new Date());

  // Ancora la vista alla gara più vicina a oggi (prima non-passata,
  // essendo l'elenco ordinato in modo ascendente) appena la lista è
  // montata, cosi l'utente non deve scorrere manualmente da tutto lo
  // storico passato — che resta comunque raggiungibile scorrendo in su.
  let anchorRaceId = null;
  outer: for (const [, races] of entries) {
    for (const r of races) {
      if (startOfDay(new Date(r.date)) >= today) {
        anchorRaceId = r.race_id;
        break outer;
      }
    }
  }

  const anchorRef = useRef(null);
  const hasScrolled = useRef(false);

  useEffect(() => {
    if (hasScrolled.current) return;
    if (!anchorRaceId) return;
    if (!anchorRef.current) return;
    anchorRef.current.scrollIntoView({ block: 'start', behavior: 'auto' });
    hasScrolled.current = true;
  }, [anchorRaceId]);

  if (entries.length === 0) {
    return <div className={styles.empty}>Nessuna gara nel calendario.</div>;
  }

  return (
    <div className={styles.list}>
      {entries.map(([key, races]) => {
        const [y, m] = key.split('-').map(Number);
        return (
          <section key={key} className={styles.listMonthGroup}>
            <h2 className={styles.listMonthTitle}>{MONTH_NAMES[m]} {y}</h2>
            <div className={styles.listItems}>
              {races.map(r => {
                const d = new Date(r.date);
                const isPast = startOfDay(d) < today;
                const isAnchor = r.race_id === anchorRaceId;
                const isSession = r.kind === 'session';

                const inner = (
                  <>
                    <div className={styles.listDate}>
                      <div className={styles.listDay}>{d.getDate()}</div>
                      <div className={styles.listTime}>{formatTime(r.date)}</div>
                    </div>
                    <div className={styles.listInfo}>
                      <div className={styles.listName}>{raceName(r)}</div>
                      <div className={styles.listMeta}>
                        {r.sim && (
                          <span className={`${styles.listSim} ${styles[`listSim_${SIM_KEY[r.sim] || 'default'}`]}`}>{r.sim}</span>
                        )}
                        {raceChampionship(r) && <span>· {raceChampionship(r)}</span>}
                        {r.round && <span>· R{r.round}</span>}
                      </div>
                    </div>
                    <div className={styles.listStatus}>
                      {!isSession && r.status === 'scheduled' && <span className={styles.statusScheduled}>Programmata</span>}
                      {!isSession && r.status === 'completed' && <span className={styles.statusCompleted}>Conclusa</span>}
                      {r.status === 'live' && <span className={styles.statusLive}>LIVE</span>}
                      {r.status === 'cancelled' && <span className={styles.statusCancelled}>Annullata</span>}
                    </div>
                  </>
                );

                // Le sessioni team (Fase 1) non hanno una pagina dettaglio —
                // riga informativa, non un link, a differenza delle gare.
                return isSession ? (
                  <div
                    key={r.race_id}
                    ref={isAnchor ? anchorRef : null}
                    className={`${styles.listItem} ${isPast ? styles.listItemPast : ''}`}
                  >
                    {inner}
                  </div>
                ) : (
                  <Link
                    key={r.race_id}
                    ref={isAnchor ? anchorRef : null}
                    to={`/race/${r.race_id}`}
                    className={`${styles.listItem} ${isPast ? styles.listItemPast : ''}`}
                  >
                    {inner}
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}