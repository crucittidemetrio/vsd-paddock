import { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { usePageMeta } from '../hooks/usePageMeta';
import { useLapDataSessions, useLapDataSession } from '../hooks/useLapData';
import styles from './PaceAnalysis.module.css';

const DRIVER_COLORS = ['#00d4ff', '#f5a623', '#4ade80', '#f54f4f', '#a78bfa', '#f472b6'];

function driverLabel(lap) {
  return lap.driver_id || lap.driver_name_external || 'Sconosciuto';
}

function fmtLapTime(ms) {
  if (ms == null) return '—';
  const total = Math.round(ms);
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function buildDriverSeries(laps, drivers, onlyClean) {
  const filtered = onlyClean ? laps.filter((l) => l.clean) : laps;
  const byLap = {};
  filtered.forEach((l) => {
    // lap_time_ms <= 0 è il sentinel "nessun tempo ancora" (tipicamente il
    // giro 1, prima che SimHub abbia un LastLapTime valido — vedi
    // simhub-plugin) — stessa convenzione già usata in PitWall.jsx
    // (fmtLapTime: "seconds <= 0" → nessun tempo). Non è un giro a 0
    // secondi reale: va escluso dal grafico, non plottato come punto a y=0
    // (altrimenti sballa anche il dominio dell'asse Y).
    if (l.lap_time_ms == null || l.lap_time_ms <= 0) return;
    const key = l.lap_number;
    if (!byLap[key]) byLap[key] = { lap_number: key };
    byLap[key][driverLabel(l)] = l.lap_time_ms / 1000; // secondi, più leggibile in tooltip
  });
  return Object.values(byLap).sort((a, b) => a.lap_number - b.lap_number);
}

function buildDriverStats(laps, driver) {
  const driverLaps = laps.filter((l) => driverLabel(l) === driver);
  // Stessa esclusione del sentinel "nessun tempo" di buildDriverSeries sopra.
  const cleanLaps = driverLaps.filter((l) => l.clean && l.lap_time_ms != null && l.lap_time_ms > 0);
  const times = cleanLaps.map((l) => l.lap_time_ms);
  const best = times.length ? Math.min(...times) : null;
  const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
  const degradation = times.length >= 2 ? times[times.length - 1] - times[0] : null;
  return { driver, lapCount: driverLaps.length, cleanCount: times.length, best, avg, degradation };
}

export default function PaceAnalysis() {
  usePageMeta({
    title: 'Analisi di Passo — Virtual Sim Driver',
    description: 'Analisi di passo, gomme e carburante da dati per-giro importati da SimHub.',
  });

  const sessionsQuery = useLapDataSessions();
  const [selectedSession, setSelectedSession] = useState('');
  const [onlyClean, setOnlyClean] = useState(true);
  const [trendDriver, setTrendDriver] = useState('');

  const sessionQuery = useLapDataSession(selectedSession);
  const laps = useMemo(() => sessionQuery.data?.laps || [], [sessionQuery.data]);

  const drivers = useMemo(() => {
    const set = new Set(laps.map(driverLabel));
    return Array.from(set);
  }, [laps]);

  const paceSeries = useMemo(() => buildDriverSeries(laps, drivers, onlyClean), [laps, drivers, onlyClean]);
  const driverStats = useMemo(() => drivers.map((d) => buildDriverStats(laps, d)), [laps, drivers]);

  const effectiveTrendDriver = trendDriver || drivers[0] || '';
  const trendSeries = useMemo(() => {
    return laps
      .filter((l) => driverLabel(l) === effectiveTrendDriver)
      .sort((a, b) => a.lap_number - b.lap_number)
      .map((l) => ({
        lap_number: l.lap_number,
        fuel_l: l.fuel_l,
        track_temp_c: l.track_temp_c,
        air_temp_c: l.air_temp_c,
      }));
  }, [laps, effectiveTrendDriver]);

  return (
    <div className={styles.pageWrap}>
     <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>ANALISI</div>
        <h1 className={styles.title}>Analisi di Passo</h1>
        <p className={styles.sub}>
          Dati per-giro importati da SimHub (tempo sul giro, temperature, carburante) — una
          sessione alla volta, upload manuale a fine sessione dallo staff.
        </p>
      </header>

      <section className={styles.selectorRow}>
        <label className={styles.selectorLabel}>Sessione</label>
        {sessionsQuery.isLoading && <span className={styles.hint}>Caricamento…</span>}
        {sessionsQuery.isError && (
          <span className={styles.hint}>
            Errore nel caricare le sessioni ({sessionsQuery.error?.message || 'sconosciuto'}).
          </span>
        )}
        {sessionsQuery.data && (
          <select
            className={styles.select}
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value)}
          >
            <option value="">— Seleziona una sessione —</option>
            {sessionsQuery.data.sessions.map((s) => (
              <option key={s.session_id} value={s.session_id}>
                {s.session_id} — {s.sim} · {s.laps} giri · {s.driver_count} piloti
              </option>
            ))}
          </select>
        )}
        {sessionsQuery.data?.sessions.length === 0 && (
          <span className={styles.hint}>Nessuna sessione importata ancora.</span>
        )}
      </section>

      {selectedSession && sessionQuery.isLoading && (
        <div className={styles.hint}>Caricamento giri…</div>
      )}

      {selectedSession && laps.length > 0 && (
        <>
          <section className={styles.panel}>
            <div className={styles.panelTitle}>
              Passo sul giro
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={onlyClean}
                  onChange={(e) => setOnlyClean(e.target.checked)}
                />
                Solo giri puliti (esclude pit-lane/yellow)
              </label>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={paceSeries} margin={{ top: 8, right: 20, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="lap_number"
                  stroke="rgba(255,255,255,0.4)"
                  fontSize={11}
                  label={{ value: 'Giro', position: 'insideBottom', offset: -2, fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.4)"
                  fontSize={11}
                  width={56}
                  domain={['dataMin - 1', 'dataMax + 1']}
                  tickFormatter={(v) => fmtLapTime(v * 1000)}
                />
                <Tooltip
                  contentStyle={{ background: '#0a0e1a', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 6, fontSize: 12 }}
                  labelStyle={{ color: '#00d4ff', fontFamily: 'monospace' }}
                  labelFormatter={(l) => `Giro ${l}`}
                  formatter={(value, name) => [fmtLapTime(value * 1000), name]}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                {drivers.map((d, i) => (
                  <Line
                    key={d}
                    type="monotone"
                    dataKey={d}
                    stroke={DRIVER_COLORS[i % DRIVER_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    activeDot={{ r: 5 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelTitle}>Confronto piloti</div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Pilota</th>
                    <th>Giri</th>
                    <th>Giri puliti</th>
                    <th>Miglior giro</th>
                    <th>Passo medio</th>
                    <th>Degrado</th>
                  </tr>
                </thead>
                <tbody>
                  {driverStats.map((s) => (
                    <tr key={s.driver}>
                      <td>{s.driver}</td>
                      <td>{s.lapCount}</td>
                      <td>{s.cleanCount}</td>
                      <td>{fmtLapTime(s.best)}</td>
                      <td>{fmtLapTime(s.avg)}</td>
                      <td>{s.degradation != null ? `${s.degradation >= 0 ? '+' : ''}${(s.degradation / 1000).toFixed(2)}s` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelTitle}>
              Carburante e temperature
              {drivers.length > 1 && (
                <select
                  className={styles.selectInline}
                  value={effectiveTrendDriver}
                  onChange={(e) => setTrendDriver(e.target.value)}
                >
                  {drivers.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              )}
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendSeries} margin={{ top: 8, right: 20, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="lap_number" stroke="rgba(255,255,255,0.4)" fontSize={11} />
                <YAxis yAxisId="fuel" stroke="#00d4ff" fontSize={11} width={46} tickFormatter={(v) => `${v}L`} />
                <YAxis yAxisId="temp" orientation="right" stroke="#f5a623" fontSize={11} width={42} tickFormatter={(v) => `${v}°`} />
                <Tooltip
                  contentStyle={{ background: '#0a0e1a', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 6, fontSize: 12 }}
                  labelStyle={{ color: '#00d4ff', fontFamily: 'monospace' }}
                  labelFormatter={(l) => `Giro ${l}`}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                <Line yAxisId="fuel" type="monotone" dataKey="fuel_l" name="Carburante (L)" stroke="#00d4ff" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                <Line yAxisId="temp" type="monotone" dataKey="track_temp_c" name="Asfalto (°C)" stroke="#f5a623" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                <Line yAxisId="temp" type="monotone" dataKey="air_temp_c" name="Aria (°C)" stroke="#4ade80" strokeWidth={2} dot={{ r: 2 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </section>
        </>
      )}

      {selectedSession && !sessionQuery.isLoading && laps.length === 0 && (
        <div className={styles.hint}>Nessun giro trovato per questa sessione.</div>
      )}
     </div>
    </div>
  );
}
