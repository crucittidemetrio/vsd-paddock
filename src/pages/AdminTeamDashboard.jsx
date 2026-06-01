import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDrivers } from '../hooks/useRoster';
import { useBestLaps } from '../hooks/useBestLaps';
import { useRecentTeamRaceResults } from '../hooks/useRaceResults';
import { useTracks, useCars } from '../hooks/useLookups';
import Avatar from '../components/shared/Avatar';
import SimBadge from '../components/shared/SimBadge';
import LapTime from '../components/shared/LapTime';
import { formatTrack, formatCar } from '../utils/format';
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

function formatGap(deltaMs) {
  if (deltaMs === 0) return '—';
  const sign = deltaMs > 0 ? '+' : '';
  const sec = (deltaMs / 1000).toFixed(3);
  return `${sign}${sec}s`;
}

export default function AdminTeamDashboard() {
  const [selectedDriverId, setSelectedDriverId] = useState('');

  const { data: drivers, isLoading: driversLoading } = useDrivers();
  const { data: laps, isLoading: lapsLoading } = useBestLaps({});
  const { data: raceResultsData, isLoading: rrLoading } = useRecentTeamRaceResults(500);
  const { data: tracks = [] } = useTracks();
  const { data: cars = [] } = useCars();
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

  // ═════════════ SEZIONE A — Pulse team ═════════════

  const lapsInWindow = useMemo(() => {
    return (laps || []).filter(l => {
      const d = toDate(l.set_date);
      return d && d >= windowStart && d <= now;
    });
  }, [laps, windowStart, now]);

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

  const activelyDrivingCount = useMemo(() => {
    return activeDrivers.filter(d => {
      const last = lastLapByDriver[d.driver_id];
      return last && last >= inactiveCutoff;
    }).length;
  }, [activeDrivers, lastLapByDriver, inactiveCutoff]);

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

  const maxDayValue = useMemo(() => {
    let max = 0;
    heatmapData.forEach(row => {
      row.days.forEach(v => { if (v > max) max = v; });
    });
    return max || 1;
  }, [heatmapData]);

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

  // ═════════════ SEZIONE B — Driver trend ═════════════

  // Team best per ogni combo (sim, track, car): chi è il record holder
  const teamBestByCombo = useMemo(() => {
    const m = {};
    (laps || []).forEach(l => {
      if (!l.lap_time_ms) return;
      const key = `${l.sim}|${l.track_id}|${l.car_id}`;
      const ms = Number(l.lap_time_ms);
      if (!m[key] || ms < m[key].lap_time_ms) {
        m[key] = {
          driver_id: l.driver_id,
          lap_time_ms: ms,
          lap_time_display: l.lap_time_display,
          race_class: l.race_class,
        };
      }
    });
    return m;
  }, [laps]);

  // Best del pilota selezionato per ogni combo
  const driverBestByCombo = useMemo(() => {
    if (!selectedDriverId) return {};
    const m = {};
    (laps || []).forEach(l => {
      if (l.driver_id !== selectedDriverId) return;
      if (!l.lap_time_ms) return;
      const key = `${l.sim}|${l.track_id}|${l.car_id}`;
      const ms = Number(l.lap_time_ms);
      if (!m[key] || ms < m[key].lap_time_ms) {
        m[key] = l;
      }
    });
    return m;
  }, [laps, selectedDriverId]);

  // Righe trend: ogni combo girato dal pilota con delta vs team best
  // Ordinate per gap decrescente (peggiori in alto = coaching opportunities)
  const driverTrendRows = useMemo(() => {
    return Object.keys(driverBestByCombo).map(key => {
      const myLap = driverBestByCombo[key];
      const teamBest = teamBestByCombo[key];
      const myMs = Number(myLap.lap_time_ms);
      const teamMs = teamBest ? Number(teamBest.lap_time_ms) : myMs;
      const deltaMs = myMs - teamMs;
      const deltaPct = teamMs > 0 ? (deltaMs / teamMs) * 100 : 0;
      const isRecord = teamBest && teamBest.driver_id === selectedDriverId && deltaMs === 0;
      return { ...myLap, teamBest, deltaMs, deltaPct, isRecord };
    }).sort((a, b) => b.deltaMs - a.deltaMs);
  }, [driverBestByCombo, teamBestByCombo, selectedDriverId]);

  const selectedDriver = useMemo(
    () => activeDrivers.find(d => d.driver_id === selectedDriverId),
    [activeDrivers, selectedDriverId]
  );

  const driverMap = useMemo(() => {
    const m = {};
    (drivers || []).forEach(d => { m[d.driver_id] = d; });
    return m;
  }, [drivers]);

  // Stats summary del pilota selezionato
  const driverStats = useMemo(() => {
    if (!selectedDriverId) return null;
    const totalCombos = driverTrendRows.length;
    const records = driverTrendRows.filter(r => r.isRecord).length;
    const totalLaps = (laps || []).filter(l => l.driver_id === selectedDriverId).length;
    return { totalCombos, records, totalLaps };
  }, [selectedDriverId, driverTrendRows, laps]);

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

      {/* ════ KPI cards ════ */}
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

      {/* ════ Heatmap attività ════ */}
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
                  <Avatar name={row.driver.display_name} driverId={row.driver.driver_id} size={24} />
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

      {/* ════ Alert piloti inattivi ════ */}
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
                  <Avatar name={a.driver.display_name} driverId={a.driver.driver_id} size={28} />
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

      {/* ════ SEZIONE B — Driver trend ════ */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <span className={styles.sectionIcon}>🎯</span>
          Analisi pilota
          <span className={styles.sectionSubtitle}>best lap del pilota selezionato vs team record</span>
        </h2>

        <div className={styles.driverSelector}>
          <label className={styles.selectLabel}>Seleziona pilota</label>
          <select
            className={styles.select}
            value={selectedDriverId}
            onChange={e => setSelectedDriverId(e.target.value)}
          >
            <option value="">— Scegli un pilota —</option>
            {activeDrivers.map(d => (
              <option key={d.driver_id} value={d.driver_id}>
                {d.display_name}
              </option>
            ))}
          </select>
        </div>

        {selectedDriver && (
          <>
            <div className={styles.driverHeader}>
              <Avatar
                name={selectedDriver.display_name}
                driverId={selectedDriver.driver_id}
                size={48}
              />
              <div className={styles.driverHeaderInfo}>
                <Link to={`/roster/${selectedDriver.driver_id}`} className={styles.driverHeaderName}>
                  {selectedDriver.display_name}
                </Link>
                <div className={styles.driverHeaderMeta}>
                  {driverStats && (
                    <>
                      <span>{driverStats.totalCombos} combinazioni track/car</span>
                      <span className={styles.metaDot}>·</span>
                      <span>{driverStats.totalLaps} lap totali</span>
                      <span className={styles.metaDot}>·</span>
                      <span className={styles.recordsCount}>
                        {driverStats.records} record team
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {driverTrendRows.length === 0 ? (
              <div className={styles.empty}>
                Nessun lap registrato per questo pilota.
              </div>
            ) : (
              <table className={styles.trendTable}>
                <thead>
                  <tr>
                    <th>Sim</th>
                    <th>Tracciato</th>
                    <th>Auto</th>
                    <th className={styles.numCol}>Mio best</th>
                    <th className={styles.numCol}>Team best</th>
                    <th className={styles.numCol}>Gap</th>
                    <th>Holder</th>
                  </tr>
                </thead>
                <tbody>
                  {driverTrendRows.map(row => {
                    const key = `${row.sim}|${row.track_id}|${row.car_id}`;
                    const teamHolder = row.teamBest && driverMap[row.teamBest.driver_id];
                    const gapClass = row.isRecord
                      ? styles.gapRecord
                      : row.deltaPct > 5
                        ? styles.gapBad
                        : row.deltaPct > 1
                          ? styles.gapMid
                          : styles.gapGood;
                    return (
                      <tr key={key}>
                        <td><SimBadge sim={row.sim} /></td>
                        <td>{formatTrack(row.track_id, tracks)}</td>
                        <td>{formatCar(row.car_id, cars)}</td>
                        <td className={styles.numCol}>
                          <LapTime ms={row.lap_time_ms} />
                        </td>
                        <td className={styles.numCol}>
                          {row.teamBest ? <LapTime ms={row.teamBest.lap_time_ms} /> : '—'}
                        </td>
                        <td className={`${styles.numCol} ${gapClass}`}>
                          {row.isRecord ? (
                            <span className={styles.recordBadge}>★ RECORD</span>
                          ) : (
                            <>
                              {formatGap(row.deltaMs)}
                              <span className={styles.gapPct}>
                                {row.deltaPct > 0 ? '+' : ''}{row.deltaPct.toFixed(2)}%
                              </span>
                            </>
                          )}
                        </td>
                        <td>
                          {row.isRecord ? (
                            <span className={styles.holderSelf}>—</span>
                          ) : teamHolder ? (
                            <Link
                              to={`/roster/${teamHolder.driver_id}`}
                              className={styles.holderLink}
                            >
                              {teamHolder.display_name}
                            </Link>
                          ) : (
                            <span className={styles.holderSelf}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}

        {!selectedDriver && (
          <div className={styles.empty}>
            Seleziona un pilota dal dropdown per visualizzare l'analisi.
          </div>
        )}
      </section>
    </div>
  );
}
