import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useDrivers } from '../hooks/useRoster';
import { useBestLaps } from '../hooks/useBestLaps';
import { useRecentTeamRaceResults } from '../hooks/useRaceResults';
import Avatar from '../components/shared/Avatar';
import styles from './AdminTeamDashboard.module.css';

const DAYS_HEATMAP = 30;
const DAYS_INACTIVE_ALERT = 14;
const DAYS_WINDOW = 30;

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function daysBetween(from, to) {
  return Math.floor((to - from) / (1000 * 60 * 60 * 24));
}

export default function AdminTeamDashboard() {
  const { data: drivers, isLoading: driversLoading } = useDrivers();
  const { data: laps, isLoading: lapsLoading } = useBestLaps({});
  const { data: raceResultsData, isLoading: rrLoading } = useRecentTeamRaceResults(500);
  const raceResults = raceResultsData?.results || [];

  const activeDrivers = useMemo(
    () => (drivers || []).filter(d => String(d.status || '').toLowerCase() === 'active'),
    [drivers]
  );

  const now = useMemo(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  }, []);

  const windowStart = useMemo(() => daysAgo(DAYS_WINDOW), []);
  const inactiveCutoff = useMemo(() => daysAgo(DAYS_INACTIVE_ALERT), []);

  // KPI #1: lap totali team negli ultimi DAYS_WINDOW giorni
  const lapsInWindow = useMemo(() => {
    return (laps || []).filter(l => {
      const d = toDate(l.set_date);
      return d && d >= windowStart && d <= now;
    });
  }, [laps, windowStart, now]);

  // KPI #2: gare disputate (distinct race_id sessione race) nella finestra
  const racesInWindow = useMemo(() => {
    const raceIds = new Set();
    raceResults.forEach(r => {
      if (String(r.session_type || 'race').toLowerCase() !== 'race') return;
      const d = toDate(r.set_date);
      if (!d || d < windowStart || d > now) return;
      raceIds.add(r.race_id);
    });
    return raceIds.size;
  }, [raceResults, windowStart, now]);

  // KPI #3: podi VSD nella finestra
  const podiumsInWindow = useMemo(() => {
    return raceResults.filter(r => {
      if (!r.is_vsd_driver) return false;
      if (r.dns || r.dnf) return false;
      if (r.finish_position == null || r.finish_position > 3) return false;
      if (String(r.session_type || 'race').toLowerCase() !== 'race') return false;
      const d = toDate(r.set_date);
      return d && d >= windowStart && d <= now;
    }).length;
  }, [raceResults, windowStart, now]);

  // Map driver_id → ultima data lap
  const lastLapByDriver = useMemo(() => {
    const m = {};
    (laps || []).forEach(l => {
      const driverId = l.driver_id;
      const d = toDate(l.set_date);
      if (!driverId || !d) return;
      if (!m[driverId] || m[driverId] < d) {
        m[driverId] = d;
      }
    });
    return m;
  }, [laps]);

  // KPI #4: piloti che hanno girato almeno una volta nei DAYS_INACTIVE_ALERT giorni
  const activelyDrivingCount = useMemo(() => {
    return activeDrivers.filter(d => {
      const last = lastLapByDriver[d.driver_id];
      return last && last >= inactiveCutoff;
    }).length;
  }, [activeDrivers, lastLapByDriver, inactiveCutoff]);

  // Heat map: per ogni pilota attivo, array di DAYS_HEATMAP conteggi (giorno -29 → oggi)
  const heatmapData = useMemo(() => {
    const rows = activeDrivers.map(driver => {
      const days = Array(DAYS_HEATMAP).fill(0);
      (laps || []).forEach(l => {
        if (l.driver_id !== driver.driver_id) return;
        const d = toDate(l.set_date);
        if (!d) return;
        const diff = daysBetween(d, now);
        if (diff < 0 || diff >= DAYS_HEATMAP) return;
        days[DAYS_HEATMAP - 1 - diff]++;
      });
      const total = days.reduce((s, n) => s + n, 0);
      return { driver, days, total };
    });
    return rows.sort((a, b) => b.total - a.total);
  }, [activeDrivers, laps, now]);

  // Max conteggio singolo giorno per scalare il colore
  const maxDayValue = useMemo(() => {
    let max = 0;
    heatmapData.forEach(row => {
      row.days.forEach(v => { if (v > max) max = v; });
    });
    return max || 1;
  }, [heatmapData]);

  // Alert: piloti inattivi (>DAYS_INACTIVE_ALERT giorni senza lap, o mai)
  const inactiveAlerts = useMemo(() => {
    return activeDrivers
      .map(d => {
        const last = lastLapByDriver[d.driver_id];
        const daysInactive = last ? daysBetween(last, now) : null;
        return { driver: d, lastLap: last, daysInactive };
      })
      .filter(a => a.daysInactive === null || a.daysInactive > DAYS_INACTIVE_ALERT)
      .sort((a, b) => {
        if (a.daysInactive === null && b.daysInactive === null) return 0;
        if (a.daysInactive === null) return -1;
        if (b.daysInactive === null) return 1;
        return b.daysInactive - a.daysInactive;
      });
  }, [activeDrivers, lastLapByDriver, now]);

  if (driversLoading || lapsLoading || rrLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Caricamento dashboard…</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Team Dashboard</h1>
        <p className={styles.subtitle}>
          Pulse del team negli ultimi {DAYS_WINDOW} giorni · {activeDrivers.length} piloti attivi nel roster
        </p>
      </header>

      <section className={styles.kpiRow}>
        <div className={styles.kpi}>
          <div className={styles.kpiValue}>{lapsInWindow.length}</div>
          <div className={styles.kpiLabel}>Lap totali ({DAYS_WINDOW}gg)</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiValue}>{racesInWindow}</div>
          <div className={styles.kpiLabel}>Gare disputate</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiValue}>{podiumsInWindow}</div>
          <div className={styles.kpiLabel}>Podi conquistati</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiValue}>
            {activelyDrivingCount} <span className={styles.kpiValueSmall}>/ {activeDrivers.length}</span>
          </div>
          <div className={styles.kpiLabel}>Attivi ({DAYS_INACTIVE_ALERT}gg)</div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          Attività piloti — ultimi {DAYS_HEATMAP} giorni
        </h2>
        {heatmapData.length === 0 ? (
          <div className={styles.empty}>Nessun pilota attivo trovato.</div>
        ) : (
          <div className={styles.heatmap}>
            {heatmapData.map(row => (
              <Link
                key={row.driver.driver_id}
                to={`/roster/${row.driver.driver_id}`}
                className={styles.heatmapRow}
              >
                <div className={styles.heatmapDriver}>
                  <Avatar
                    name={row.driver.display_name}
                    driverId={row.driver.driver_id}
                    size={24}
                  />
                  <span className={styles.heatmapName}>{row.driver.display_name}</span>
                </div>
                <div className={styles.heatmapCells}>
                  {row.days.map((count, idx) => {
                    const opacity = count > 0 ? 0.3 + (count / maxDayValue) * 0.7 : 0;
                    return (
                      <div
                        key={idx}
                        className={styles.heatmapCell}
                        style={{
                          opacity: count > 0 ? 1 : 0.15,
                          backgroundColor: count > 0
                            ? `rgba(0, 212, 255, ${opacity})`
                            : 'rgba(255, 255, 255, 0.04)',
                        }}
                        title={`${count} lap`}
                      />
                    );
                  })}
                </div>
                <div className={styles.heatmapTotal}>{row.total}</div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {inactiveAlerts.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionIcon}>🔴</span>
            Piloti inattivi
            <span className={styles.sectionSubtitle}>nessun lap negli ultimi {DAYS_INACTIVE_ALERT} giorni</span>
            <span className={styles.alertCount}>{inactiveAlerts.length}</span>
          </h2>
          <ul className={styles.alertList}>
            {inactiveAlerts.map(a => (
              <li key={a.driver.driver_id} className={styles.alertItem}>
                <Link to={`/roster/${a.driver.driver_id}`} className={styles.alertLink}>
                  <Avatar
                    name={a.driver.display_name}
                    driverId={a.driver.driver_id}
                    size={28}
                  />
                  <span className={styles.alertName}>{a.driver.display_name}</span>
                </Link>
                <span className={styles.alertDays}>
                  {a.daysInactive === null ? 'Mai girato' : `${a.daysInactive} giorni`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
