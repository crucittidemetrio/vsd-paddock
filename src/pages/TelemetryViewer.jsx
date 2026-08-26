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
 * ATTENZIONE — SCHEMA NON VERIFICATO (bloccante dichiarato nell'ADR,
 * §4 punto 1): i nomi di tabella/colonna qui sotto (`stints`,
 * `telemetry_samples`, `throttle`/`brake`/`steering`/`speed_kmh`) sono
 * placeholder ragionevoli basati sulla struttura nota rFactor2/LMU, MAI
 * validati contro un vero export .duckdb. Prima di considerare questa
 * pagina pronta per l'uso reale va aperto un file autentico e corretta
 * la query qui sotto in base allo schema effettivo — l'apertura del
 * file e l'infrastruttura duckdb-wasm (utils/duckdb.js) restano valide
 * a prescindere.
 */
export default function TelemetryViewer() {
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [errorMessage, setErrorMessage] = useState(null);
  const [stints, setStints] = useState([]);
  const [selectedStint, setSelectedStint] = useState(null);
  const [samples, setSamples] = useState([]);
  const connRef = useRef(null);

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

      const stintResult = await conn.query(`
        SELECT DISTINCT stint_id, lap_start, lap_end, track_name
        FROM lmu_telemetry.stints
        ORDER BY stint_id
      `);
      const stintRows = stintResult.toArray().map((r) => r.toJSON());
      setStints(stintRows);
      setSelectedStint(null);
      setSamples([]);
      setStatus('ready');
    } catch (err) {
      console.error('Errore apertura telemetria:', err);
      setErrorMessage(
        'Impossibile leggere il file. Verifica che sia un export .duckdb valido di LMU — '
        + 'lo schema tabelle atteso da questa pagina non è ancora stato verificato su un file reale '
        + '(vedi ADR-LMU-Integration §4.1), quindi un fallimento qui potrebbe indicare nomi di '
        + 'tabella/colonna diversi da quelli attesi, non necessariamente un file corrotto.'
      );
      setStatus('error');
    }
  }, []);

  const handleSelectStint = useCallback(async (stintId) => {
    if (!connRef.current) return;
    setSelectedStint(stintId);

    try {
      const result = await connRef.current.query(`
        SELECT sample_time, throttle, brake, steering, speed_kmh
        FROM lmu_telemetry.telemetry_samples
        WHERE stint_id = ${Number(stintId)}
        ORDER BY sample_time
      `);
      setSamples(result.toArray().map((r) => r.toJSON()));
    } catch (err) {
      console.error('Errore query stint:', err);
      setErrorMessage('Impossibile caricare i campioni per questo stint.');
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

        <div className={styles.warningBox}>
          ⚠️ Schema tabelle non ancora verificato su un file .duckdb reale — vedi nota nel codice
          sorgente. Se l'apertura del file fallisce, potrebbe essere lo schema atteso a essere
          sbagliato, non il file.
        </div>

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
              <p>File caricato — {stints.length} stint trovati.</p>
              <input type="file" accept=".duckdb" onChange={handleInputChange} />
            </>
          )}
        </div>

        {status === 'error' && <div className={styles.errorBox}>{errorMessage}</div>}

        {status === 'ready' && (
          <div className={styles.content}>
            <aside className={styles.stintList}>
              <h2>Stint disponibili</h2>
              <ul>
                {stints.map((s) => (
                  <li key={s.stint_id}>
                    <button
                      type="button"
                      className={`${styles.stintBtn} ${s.stint_id === selectedStint ? styles.stintBtnActive : ''}`}
                      onClick={() => handleSelectStint(s.stint_id)}
                    >
                      Stint {s.stint_id} — {s.track_name} (giri {s.lap_start}-{s.lap_end})
                    </button>
                  </li>
                ))}
                {stints.length === 0 && <li className={styles.emptyHint}>Nessuno stint nel file.</li>}
              </ul>
            </aside>

            <main className={styles.chartArea}>
              {selectedStint == null ? (
                <div className={styles.emptyHint}>Seleziona uno stint per visualizzare i canali.</div>
              ) : (
                <TelemetryChannels samples={samples} />
              )}
            </main>
          </div>
        )}
      </div>
    </RequireTier>
  );
}

const CHANNELS = [
  { key: 'throttle', label: 'Acceleratore', color: '#4ade80' },
  { key: 'brake', label: 'Freno', color: '#f87171' },
  { key: 'steering', label: 'Sterzo', color: '#00d4ff' },
  { key: 'speed_kmh', label: 'Velocità (km/h)', color: '#f5a623' },
];

function TelemetryChannels({ samples }) {
  if (!samples.length) {
    return <div className={styles.emptyHint}>Nessun campione trovato per questo stint.</div>;
  }

  return (
    <div>
      {CHANNELS.map((ch) => (
        <div key={ch.key} className={styles.chartBlock}>
          <h3>{ch.label}</h3>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={samples}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="sample_time" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }} width={36} />
              <Tooltip contentStyle={{ background: '#0e1729', border: '1px solid rgba(255,255,255,0.1)' }} />
              <Line type="monotone" dataKey={ch.key} stroke={ch.color} dot={false} strokeWidth={1.5} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ))}
    </div>
  );
}
