import { useMemo, useState } from 'react';
import { useTeamRecords } from '../hooks/useTeamRecords';
import { useTracks } from '../hooks/useLookups';
import { SIM_LIST } from '../utils/constants';
import styles from './TeamRecords.module.css';

function trackLabel(trackId, tracksById) {
  const t = tracksById[trackId];
  if (!t) return trackId;
  const parts = [t.circuit_name, t.config_name].filter(Boolean);
  if (parts.length > 0) return parts.join(' ');
  return t.track_name || trackId;
}

export default function TeamRecords() {
  const [activeSim, setActiveSim] = useState(SIM_LIST[0]?.id || 'LMU');
  const recordsQuery = useTeamRecords(activeSim);
  const tracksQuery = useTracks();

  const tracksById = useMemo(() => {
    const m = {};
    (tracksQuery.data || []).forEach(t => { m[t.track_id] = t; });
    return m;
  }, [tracksQuery.data]);

  const records = useMemo(() => {
    const list = recordsQuery.data?.records || [];
    return [...list].sort((a, b) =>
      trackLabel(a.track_id, tracksById).localeCompare(trackLabel(b.track_id, tracksById))
    );
  }, [recordsQuery.data, tracksById]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>MURO DEI RECORD</div>
        <h1 className={styles.title}>Record di pista</h1>
        <p className={styles.sub}>
          Il giro più veloce mai registrato dal team, pista per pista.
        </p>
      </header>

      <div className={styles.tabs}>
        {SIM_LIST.map(s => (
          <button
            key={s.id}
            type="button"
            className={`${styles.tab} ${activeSim === s.id ? styles.tabActive : ''}`}
            onClick={() => setActiveSim(s.id)}
          >
            {s.short || s.name || s.id}
          </button>
        ))}
      </div>

      {recordsQuery.isLoading && <div className={styles.loading}>Caricamento…</div>}
      {recordsQuery.error && (
        <div className={styles.errorBox}>Errore: {recordsQuery.error.message}</div>
      )}

      {!recordsQuery.isLoading && !recordsQuery.error && records.length === 0 && (
        <div className={styles.empty}>Nessun record ancora registrato per questo simulatore.</div>
      )}

      {records.length > 0 && (
        <div className={styles.list}>
          {records.map(r => (
            <div key={`${r.sim}-${r.track_id}`} className={styles.card}>
              <span className={styles.cardIcon}>🏆</span>
              <div>
                <div className={styles.cardTrack}>{trackLabel(r.track_id, tracksById)}</div>
                <div className={styles.cardHolder}>
                  {r.display_name}
                  {r.verified && <span className={styles.verifiedBadge}>Garage61</span>}
                </div>
              </div>
              <div className={styles.cardTime}>{r.lap_time_display}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
