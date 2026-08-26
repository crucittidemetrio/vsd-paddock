import { useState, useCallback, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { openLocalTelemetryFile, closeConnection } from '../utils/duckdb';
import RequireTier from '../components/auth/RequireTier';
import LoginPrompt from '../components/auth/LoginPrompt';
import styles from './TelemetryViewer.module.css';

/**
 * TelemetryViewer — analisi telemetria LMU, 100% client-side via
 * duckdb-wasm (ADR-LMU-Integration, Obiettivo 1). Nessun file .duckdb
 * viene mai inviato al backend Apps Script: il pilota trascina il
 * file, tutto il parsing/query avviene nel browser.
 *
 * SCHEMA VERIFICATO il 2026-08-26 su un export reale (Daytona Int.
 * Speedway, GT3, gara). Struttura confermata — molto diversa dal
 * placeholder iniziale (stints/telemetry_samples, mai esistito):
 *
 *  - `metadata` (key, value): una riga per campo — DriverName, TrackName,
 *    TrackLayout, CarName, CarClass, SessionType, WeatherConditions, ecc.
 *  - `channelsList` (channelName, frequency Hz, unit): elenca i canali
 *    "continui" campionati a frequenza fissa. OGNI canale è una TABELLA
 *    A SÉ con la sola colonna `value` — il timestamp non è salvato, si
 *    ricava dall'indice di riga: ts = (row_number()-1) / frequency.
 *  - `eventsList` (eventName, unit): elenca i canali "evento" (discreti).
 *    Anche qui una tabella per canale, ma con colonna `ts` (secondi,
 *    esplicita) + `value` (alcuni, es. TyresCompound, hanno value1..N).
 *  - Non esiste alcun concetto di "stint" nel file: è una registrazione
 *    continua di una sessione. I giri si derivano dalla tabella evento
 *    `Lap` (ts, value=numero giro), che segna l'inizio di ogni giro.
 *
 * Questo file NON contiene risultati di sessione (Safety Rank/Elo) —
 * è telemetria pura. L'Obiettivo 2 dell'ADR (import risultati) resta
 * bloccato in attesa di un export di quel tipo, diverso da questo.
 */

const CHANNELS = [
  { key: 'Throttle Pos', label: 'Acceleratore', unit: '%', color: '#4ade80' },
  { key: 'Brake Pos', label: 'Freno', unit: '%', color: '#f87171' },
  { key: 'Steering Pos', label: 'Sterzo', unit: '%', color: '#00d4ff' },
  { key: 'Ground Speed', label: 'Velocità (km/h)', unit: 'km/h', color: '#f5a623' },
];

const META_LABELS = {
  TrackName: 'Circuito',
  TrackLayout: 'Layout',
  CarName: 'Vettura',
  CarClass: 'Classe',
  SessionType: 'Sessione',
  WeatherConditions: 'Meteo',
  DriverName: 'Pilota',
};

function formatClock(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function TelemetryViewer() {
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [errorMessage, setErrorMessage] = useState(null);
  const [meta, setMeta] = useState({});
  const [laps, setLaps] = useState([]);
  const [selectedLap, setSelectedLap] = useState(null);
  const [samples, setSamples] = useState({});
  const [chartLoading, setChartLoading] = useState(false);
  const connRef = useRef(null);
  const lapsRef = useRef([]);
  const freqRef = useRef({});

  const handleFile = useCallback(async (file) => {
    if (!file || !file.name.endsWith('.duckdb')) {
      setErrorMessage('Seleziona un file .duckdb valido esportato da LMU.');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setErrorMessage(null);

    try {
      if (connRef.current) await closeConnection(connRef.current);
      const { conn } = await openLocalTelemetryFile(file);
      connRef.current = conn;

      const metaResult = await conn.query('SELECT key, value FROM lmu_telemetry.main.metadata');
      const metaRows = metaResult.toArray().map((r) => r.toJSON());
      const metaObj = Object.fromEntries(metaRows.map((r) => [r.key, r.value]));
      setMeta(metaObj);

      const freqResult = await conn.query('SELECT channelName, frequency FROM lmu_telemetry.main.channelsList');
      const freqRows = freqResult.toArray().map((r) => r.toJSON());
      freqRef.current = Object.fromEntries(freqRows.map((r) => [r.channelName, Number(r.frequency)]));

      const lapResult = await conn.query('SELECT ts, value AS lap_number FROM lmu_telemetry.main."Lap" ORDER BY ts');
      const lapRows = lapResult.toArray().map((r) => r.toJSON());
      const lapsBuilt = lapRows.map((row, i) => ({
        lapNumber: Number(row.lap_number),
        startTs: Number(row.ts),
        endTs: i + 1 < lapRows.length ? Number(lapRows[i + 1].ts) : null,
      }));

      lapsRef.current = lapsBuilt;
      setLaps(lapsBuilt);
      setSelectedLap(null);
      setSamples({});
      setStatus('ready');
    } catch (err) {
      console.error('Errore apertura telemetria:', err);
      setErrorMessage(
        'Impossibile leggere il file. Verifica che sia un export .duckdb valido di LMU. '
        + `Dettaglio: ${err?.message || err}`
      );
      setStatus('error');
    }
  }, []);

  const handleSelectLap = useCallback(async (lapNumber) => {
    if (!connRef.current) return;
    const lap = lapsRef.current.find((l) => l.lapNumber === lapNumber);
    if (!lap) return;

    setSelectedLap(lapNumber);
    setChartLoading(true);

    try {
      const results = {};
      for (const ch of CHANNELS) {
        const freq = freqRef.current[ch.key];
        if (!freq) continue;
        const endClause = lap.endTs != null ? `AND ts < ${lap.endTs}` : '';
        const r = await connRef.current.query(`
          WITH indexed AS (
            SELECT (ROW_NUMBER() OVER () - 1) / ${freq}.0 AS ts, value
            FROM lmu_telemetry.main."${ch.key}"
          )
          SELECT ts - ${lap.startTs} AS t, value
          FROM indexed
          WHERE ts >= ${lap.startTs} ${endClause}
          ORDER BY ts
        `);
        results[ch.key] = r.toArray().map((row) => row.toJSON());
      }
      setSamples(results);
    } catch (err) {
      console.error('Errore query giro:', err);
      setErrorMessage('Impossibile caricare i canali per questo giro.');
    } finally {
      setChartLoading(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files?.[0]);
  }, [handleFile]);

  const handleInputChange = useCallback((e) => {
    handleFile(e.target.files?.[0]);
  }, [handleFile]);

  return (
    <RequireTier minTier="pilot_vsd" fallback={
      <div className={styles.container}>
        <LoginPrompt feature="l'analisi telemetria" />
      </div>
    }>
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.eyebrow}>TELEMETRIA</div>
          <h1 className={styles.title}>Analisi Telemetria LMU</h1>
          <p className={styles.sub}>
            Trascina qui il file <code>.duckdb</code> del tuo stint. L'elaborazione avviene
            interamente nel tuo browser: nessun dato lascia il tuo PC.
          </p>
        </header>

        <div className={styles.dropzone} onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
          {status === 'idle' && (
            <>
              <p>Trascina il file qui, oppure</p>
              <input type="file" accept=".duckdb" onChange={handleInputChange} />
            </>
          )}
          {status === 'loading' && <p>Caricamento in corso…</p>}
          {status === 'ready' && (
            <>
              <p>
                {meta.TrackName || 'Sessione'} — {meta.CarName || 'vettura sconosciuta'}
                {' '}({laps.length} {laps.length === 1 ? 'giro' : 'giri'})
              </p>
              <input type="file" accept=".duckdb" onChange={handleInputChange} />
            </>
          )}
        </div>

        {status === 'error' && <div className={styles.errorBox}>{errorMessage}</div>}

        {status === 'ready' && (
          <>
            <dl className={styles.metaGrid}>
              {Object.entries(META_LABELS).map(([key, label]) => (
                meta[key] ? (
                  <div key={key} className={styles.metaItem}>
                    <dt>{label}</dt>
                    <dd>{meta[key]}</dd>
                  </div>
                ) : null
              ))}
            </dl>

            <div className={styles.content}>
              <aside className={styles.stintList}>
                <h2>Giri disponibili</h2>
                <ul>
                  {laps.map((lap) => (
                    <li key={lap.lapNumber}>
                      <button
                        type="button"
                        className={`${styles.stintBtn} ${lap.lapNumber === selectedLap ? styles.stintBtnActive : ''}`}
                        onClick={() => handleSelectLap(lap.lapNumber)}
                      >
                        Giro {lap.lapNumber} — inizio {formatClock(lap.startTs)}
                      </button>
                    </li>
                  ))}
                  {laps.length === 0 && <li className={styles.emptyHint}>Nessun giro nel file.</li>}
                </ul>
              </aside>

              <main className={styles.chartArea}>
                {selectedLap == null ? (
                  <div className={styles.emptyHint}>Seleziona un giro per visualizzare i canali.</div>
                ) : chartLoading ? (
                  <div className={styles.emptyHint}>Caricamento canali…</div>
                ) : (
                  <TelemetryChannels samples={samples} />
                )}
              </main>
            </div>
          </>
        )}
      </div>
    </RequireTier>
  );
}

function TelemetryChannels({ samples }) {
  const hasAny = CHANNELS.some((ch) => samples[ch.key]?.length);
  if (!hasAny) {
    return <div className={styles.emptyHint}>Nessun campione trovato per questo giro.</div>;
  }

  return (
    <div>
      {CHANNELS.map((ch) => (
        <div key={ch.key} className={styles.chartBlock}>
          <h3>{ch.label}</h3>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={samples[ch.key] || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="t"
                tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }}
                tickFormatter={(v) => `${Number(v).toFixed(0)}s`}
              />
              <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }} width={36} />
              <Tooltip
                contentStyle={{ background: '#0e1729', border: '1px solid rgba(255,255,255,0.1)' }}
                labelFormatter={(v) => `${Number(v).toFixed(1)}s`}
                formatter={(v) => [`${Number(v).toFixed(1)} ${ch.unit}`, ch.label]}
              />
              <Line type="monotone" dataKey="value" stroke={ch.color} dot={false} strokeWidth={1.5} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ))}
    </div>
  );
}
