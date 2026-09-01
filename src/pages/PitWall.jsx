import { useMemo, useState } from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import { usePitwallBridge } from '../hooks/usePitwallBridge';
import styles from './PitWall.module.css';

// 0=test,1-4=practice,5-8=qual,9=warmup,10-13=race — stessa convenzione
// già documentata in vsd-pitwall-bridge/Program.cs.
const SESSION_LABELS = {
  0: 'Test',
  1: 'Prove Libere', 2: 'Prove Libere', 3: 'Prove Libere', 4: 'Prove Libere',
  5: 'Qualifica', 6: 'Qualifica', 7: 'Qualifica', 8: 'Qualifica',
  9: 'Warm Up',
  10: 'Gara', 11: 'Gara', 12: 'Gara', 13: 'Gara',
};

const FINISH_LABELS = { 1: 'FINITO', 2: 'RITIRATO', 3: 'SQUALIFICATO' };

function sessionLabel(code) {
  return SESSION_LABELS[code] ?? `Sessione ${code}`;
}

function fmtLapTime(seconds) {
  // -1 (o 0/assente) e' il sentinel "nessun tempo ancora" osservato nei
  // dati reali (vedi vsd-pitwall-bridge/README.md) — non un tempo valido.
  if (seconds == null || seconds <= 0) return '—';
  const totalMs = Math.round(seconds * 1000);
  const m = Math.floor(totalMs / 60000);
  const s = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function fmtGap(v) {
  if (v.place === 1) return '—';
  if (v.lapsBehindLeader > 0) return `+${v.lapsBehindLeader} gir${v.lapsBehindLeader === 1 ? 'o' : 'i'}`;
  if (v.timeBehindLeader > 0) return `+${v.timeBehindLeader.toFixed(3)}s`;
  return '—';
}

function fmtInterval(v) {
  if (v.place === 1) return '—';
  if (v.timeBehindNext > 0) return `+${v.timeBehindNext.toFixed(3)}s`;
  return '—';
}

export default function PitWall() {
  usePageMeta({
    title: 'Pit Wall — Virtual Sim Driver',
    description: 'Classifica live, gap e stato pit in tempo reale da Le Mans Ultimate.',
  });

  const { status, payload } = usePitwallBridge();
  const vehicles = useMemo(() => payload?.vehicles ?? [], [payload]);

  const classes = useMemo(
    () => Array.from(new Set(vehicles.map((v) => v.vClass).filter(Boolean))),
    [vehicles]
  );
  const [classFilter, setClassFilter] = useState('');

  const rows = useMemo(() => {
    if (!classFilter) return vehicles;
    return vehicles.filter((v) => v.vClass === classFilter);
  }, [vehicles, classFilter]);

  return (
    <div className={styles.pageWrap}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.eyebrow}>PIT WALL</div>
          <h1 className={styles.title}>Pit Wall</h1>
          <p className={styles.sub}>
            Classifica, gap e stato pit in tempo reale — richiede il VSD Pitwall Bridge
            attivo su questo stesso PC (funziona solo in locale, non è un servizio cloud).
          </p>
        </header>

        <StatusBanner status={status} />

        {payload && (
          <>
            <SessionInfo payload={payload} />
            {classes.length > 1 && (
              <section className={styles.selectorRow}>
                <label className={styles.selectorLabel}>Classe</label>
                <select
                  className={styles.select}
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                >
                  <option value="">Tutte</option>
                  {classes.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </section>
            )}
            <ClassificaTable rows={rows} />
          </>
        )}

        {!payload && status === 'connected' && (
          <div className={styles.hint}>Connesso al bridge, in attesa dei primi dati da LMU...</div>
        )}
      </div>
    </div>
  );
}

function StatusBanner({ status }) {
  if (status === 'connected') return null; // niente banner quando tutto ok
  const label = status === 'connecting' ? 'Connessione al bridge...' : 'Bridge non raggiungibile';
  return (
    <div className={styles.statusBanner} data-status={status}>
      <span className={styles.statusDot} data-status={status} />
      <span>
        {label} — avvia <code>dotnet run -c Release</code> nella cartella{' '}
        <code>vsd-pitwall-bridge/</code> su questo PC, con LMU già in sessione.
      </span>
    </div>
  );
}

function SessionInfo({ payload }) {
  const yellow = payload.yellowFlagState !== 0;
  // mRaining e' una frazione 0..1 per convenzione rF2 — non ancora
  // confermata con pioggia reale in sessione di test (vedi bridge README).
  const rainingPct = payload.raining > 0 ? Math.round(payload.raining * 100) : 0;

  return (
    <section className={styles.panel}>
      <div className={styles.sessionGrid}>
        <div className={styles.sessionItem}>
          <span className={styles.sessionLabel}>Pista</span>
          <span className={styles.sessionValue}>{payload.track || '—'}</span>
        </div>
        <div className={styles.sessionItem}>
          <span className={styles.sessionLabel}>Sessione</span>
          <span className={styles.sessionValue}>{sessionLabel(payload.session)}</span>
        </div>
        <div className={styles.sessionItem}>
          <span className={styles.sessionLabel}>Bandiera</span>
          <span className={`${styles.sessionValue} ${yellow ? styles.flagYellow : styles.flagGreen}`}>
            {yellow ? 'GIALLA' : 'VERDE'}
          </span>
        </div>
        <div className={styles.sessionItem}>
          <span className={styles.sessionLabel}>Asfalto</span>
          <span className={styles.sessionValue}>{payload.trackTemp?.toFixed(1)}°C</span>
        </div>
        <div className={styles.sessionItem}>
          <span className={styles.sessionLabel}>Aria</span>
          <span className={styles.sessionValue}>{payload.ambientTemp?.toFixed(1)}°C</span>
        </div>
        {rainingPct > 0 && (
          <div className={styles.sessionItem}>
            <span className={styles.sessionLabel}>Pioggia</span>
            <span className={styles.sessionValue}>{rainingPct}%</span>
          </div>
        )}
      </div>
    </section>
  );
}

function ClassificaTable({ rows }) {
  return (
    <section className={styles.panel}>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Pos</th>
              <th>Pilota</th>
              <th>Vettura</th>
              <th>Classe</th>
              <th>Giri</th>
              <th>Gap Leader</th>
              <th>Intervallo</th>
              <th>Ultimo</th>
              <th>Miglior</th>
              <th>Pit</th>
              <th>Pen.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id} className={v.inPits ? styles.rowInPits : undefined}>
                <td>
                  {v.place}
                  {FINISH_LABELS[v.finishStatus] && (
                    <span className={styles.finishTag}> {FINISH_LABELS[v.finishStatus]}</span>
                  )}
                </td>
                <td>{v.driver || '—'}</td>
                <td>{v.vehicle || '—'}</td>
                <td>{v.vClass || '—'}</td>
                <td>{v.laps}</td>
                <td>{fmtGap(v)}</td>
                <td>{fmtInterval(v)}</td>
                <td>{fmtLapTime(v.lastLapTime)}</td>
                <td>{fmtLapTime(v.bestLapTime)}</td>
                <td>{v.inPits ? <span className={styles.pitBadge}>BOX</span> : ''}</td>
                <td>{v.numPenalties > 0 ? v.numPenalties : ''}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className={styles.hint}>Nessuna vettura in classifica.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
