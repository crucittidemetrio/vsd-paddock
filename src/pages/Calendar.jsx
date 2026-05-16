import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useRaces } from '../hooks/useRaces';
import styles from './Calendar.module.css';

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
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const { data: races, isLoading } = useRaces();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthCells = useMemo(() => buildMonthGrid(year, month), [year, month]);

  const racesByDate = useMemo(() => {
    const map = new Map();
    (races || []).forEach(r => {
      if (!r.date) return;
      const d = new Date(r.date);
      if (isNaN(d.getTime())) return;
      const key = d.toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    return map;
  }, [races]);

  const sortedRaces = useMemo(() => {
    return [...(races || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [races]);

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

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>CALENDARIO</div>
        <h1>Programma Gare</h1>
        <p className={styles.subtitle}>
          {total} gare totali · {scheduled} in programma
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
            className={`${styles.toggleBtn} ${viewMode === 'lista' ? styles.toggleActive : ''}`}
            onClick={() => setViewMode('lista')}
          >
            Lista
          </button>
        </div>

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
      </div>

      {viewMode === 'mese' ? (
        <MonthView cells={monthCells} racesByDate={racesByDate} />
      ) : (
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
                {visible.map(r => (
                  <Link
                    key={r.race_id}
                    to={`/race/${r.race_id}`}
                    className={`${styles.raceChip} ${styles[`raceChip_${SIM_KEY[r.sim] || 'default'}`]}`}
                    title={raceName(r)}
                  >
                    <span className={styles.chipSim}>{r.sim}</span>
                    <span className={styles.chipName}>{raceName(r)}</span>
                  </Link>
                ))}
                {overflow > 0 && <div className={styles.raceOverflow}>+{overflow}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ListView({ groupedByMonth }) {
  const entries = Array.from(groupedByMonth.entries()).sort((a, b) => b[0].localeCompare(a[0]));

  if (entries.length === 0) {
    return <div className={styles.empty}>Nessuna gara nel calendario.</div>;
  }

  const today = startOfDay(new Date());

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

                return (
                  <Link
                    key={r.race_id}
                    to={`/race/${r.race_id}`}
                    className={`${styles.listItem} ${isPast ? styles.listItemPast : ''}`}
                  >
                    <div className={styles.listDate}>
                      <div className={styles.listDay}>{d.getDate()}</div>
                      <div className={styles.listTime}>{formatTime(r.date)}</div>
                    </div>
                    <div className={styles.listInfo}>
                      <div className={styles.listName}>{raceName(r)}</div>
                      <div className={styles.listMeta}>
                        <span className={`${styles.listSim} ${styles[`listSim_${SIM_KEY[r.sim] || 'default'}`]}`}>{r.sim}</span>
                        {raceChampionship(r) && <span>· {raceChampionship(r)}</span>}
                        {r.round && <span>· R{r.round}</span>}
                      </div>
                    </div>
                    <div className={styles.listStatus}>
                      {r.status === 'scheduled' && <span className={styles.statusScheduled}>Programmata</span>}
                      {r.status === 'completed' && <span className={styles.statusCompleted}>Conclusa</span>}
                      {r.status === 'live' && <span className={styles.statusLive}>LIVE</span>}
                      {r.status === 'cancelled' && <span className={styles.statusCancelled}>Annullata</span>}
                    </div>
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