import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import { usePitwallRealtime } from '../hooks/usePitwallRealtime';
import styles from './PitWallLive.module.css';

// Stesse convenzioni di PitWall.jsx (sessione/bandiera/sentinel -1 ecc,
// vedi commenti lì) — duplicate qui invece di importate: pagina nuova e
// indipendente, per non rischiare regressioni sulla pagina /pitwall già
// in uso reale toccandone i sorgenti condivisi.
const SESSION_LABELS = {
  0: 'Test',
  1: 'Prove Libere', 2: 'Prove Libere', 3: 'Prove Libere', 4: 'Prove Libere',
  5: 'Qualifica', 6: 'Qualifica', 7: 'Qualifica', 8: 'Qualifica',
  9: 'Warm Up',
  10: 'Gara', 11: 'Gara', 12: 'Gara', 13: 'Gara',
};
const FINISH_LABELS = { 1: 'FIN', 2: 'RIT', 3: 'SQ' };

function sessionLabel(code) {
  return SESSION_LABELS[code] ?? `Sessione ${code}`;
}

function fmtLapTime(seconds) {
  if (seconds == null || seconds <= 0) return '—';
  const totalMs = Math.round(seconds * 1000);
  const m = Math.floor(totalMs / 60000);
  const s = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function fmtGap(v) {
  if (v.place === 1) return 'LEADER';
  if (v.lapsBehindLeader > 0) return `+${v.lapsBehindLeader} gir${v.lapsBehindLeader === 1 ? 'o' : 'i'}`;
  if (v.timeBehindLeader > 0) return `+${v.timeBehindLeader.toFixed(1)}s`;
  return '—';
}

export default function PitWallLive() {
  usePageMeta({
    title: 'Pit Wall Live — Virtual Sim Driver',
    description: 'Classifica live da remoto, via Supabase Realtime — per chi non è al PC del bridge.',
  });

  const { status, payload } = usePitwallRealtime();
  const vehicles = useMemo(() => payload?.vehicles ?? [], [payload]);

  const classes = useMemo(
    () => Array.from(new Set(vehicles.map((v) => v.vClass).filter(Boolean))),
    [vehicles]
  );
  const [classFilter, setClassFilter] = useState('');

  const rows = useMemo(() => {
    const base = classFilter ? vehicles.filter((v) => v.vClass === classFilter) : vehicles;
    return [...base].sort((a, b) => (a.place || 999) - (b.place || 999));
  }, [vehicles, classFilter]);

  return (
    <div className={styles.pageWrap}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.eyebrow}>PIT WALL · LIVE REMOTO</div>
          <h1 className={styles.title}>Pit Wall Live</h1>
          <p className={styles.sub}>
            Classifica in tempo reale via cloud — per seguire la gara senza essere al PC che
            guida. Aggiornamento più lento della vista locale (
            <Link to="/pitwall" className={styles.inlineLink}>/pitwall</Link>
            ), pensata per chi gestisce il bridge da bordo pista.
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
            <div className={styles.cardList}>
              {rows.map((v) => (
                <VehicleCard key={v.id} v={v} />
              ))}
              {rows.length === 0 && <div className={styles.hint}>Nessuna vettura in classifica.</div>}
            </div>
          </>
        )}

        {!payload && status === 'connected' && (
          <div className={styles.hint}>Connesso — in attesa del primo frame dal bridge...</div>
        )}
      </div>
    </div>
  );
}

function VehicleCard({ v }) {
  return (
    <div className={[styles.card, v.inPits && styles.cardInPits, v.underYellow && styles.cardYellow].filter(Boolean).join(' ')}>
      <div className={styles.cardPlace}>{v.place}</div>
      <div className={styles.cardMain}>
        <div className={styles.cardDriverRow}>
          <span className={styles.cardDriver}>{v.driver || '—'}</span>
          {FINISH_LABELS[v.finishStatus] && <span className={styles.finishTag}>{FINISH_LABELS[v.finishStatus]}</span>}
          {v.inPits && <span className={styles.pitBadge}>BOX</span>}
        </div>
        <div className={styles.cardVehicle} title={v.vehicle || undefined}>{v.vehicle || '—'} {v.vClass ? `· ${v.vClass}` : ''}</div>
      </div>
      <div className={styles.cardTimes}>
        <div className={styles.cardGap}>{fmtGap(v)}</div>
        <div className={styles.cardBest}>{fmtLapTime(v.bestLapTime)}</div>
      </div>
    </div>
  );
}

function StatusBanner({ status }) {
  if (status === 'connected') return null;
  const labels = {
    resolving: 'Verifica sessione...',
    connecting: 'Connessione al canale live...',
    disconnected: 'Canale non raggiungibile — verrà ritentata la connessione',
    'no-team': 'Nessun team collegato a questo account: impossibile aprire il canale live',
  };
  const label = labels[status] || 'In attesa...';
  const bad = status === 'disconnected' || status === 'no-team';
  return (
    <div className={styles.statusBanner} data-status={bad ? 'disconnected' : 'connecting'}>
      <span className={styles.statusDot} data-status={bad ? 'disconnected' : 'connecting'} />
      <span>
        {label}
        {status === 'disconnected' && ' — il bridge deve essere avviato e inviare al cloud (v. #340).'}
      </span>
    </div>
  );
}

function SessionInfo({ payload }) {
  const yellow = payload.yellowFlagState !== 0;
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
      </div>
    </section>
  );
}
