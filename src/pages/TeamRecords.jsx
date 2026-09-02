import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTeamRecords } from '../hooks/useTeamRecords';
import { useTracks, useCars } from '../hooks/useLookups';
import { useAuth } from '../hooks/useAuth';
import { useShowExDrivers } from '../hooks/useShowExDrivers';
import { formatCarInfo } from '../utils/format';
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
  const { isAdmin } = useAuth();
  const [activeSim, setActiveSim] = useState(SIM_LIST[0]?.id || 'LMU');
  const [showExVsd, toggleShowExVsd] = useShowExDrivers();
  const recordsQuery = useTeamRecords(activeSim, isAdmin && showExVsd);
  const tracksQuery = useTracks();
  const carsQuery = useCars();

  const tracksById = useMemo(() => {
    const m = {};
    (tracksQuery.data || []).forEach(t => { m[t.track_id] = t; });
    return m;
  }, [tracksQuery.data]);

  // Un record per (track_id, race_class): raggruppati per pista, con
  // una riga per ogni categoria — non più un solo tempo "assoluto"
  // per pista. I giri senza categoria assegnata in Cars finiscono nel
  // bucket "Non classificato" invece di sparire.
  const groupedByTrack = useMemo(() => {
    const list = recordsQuery.data?.records || [];
    const byTrack = new Map();
    list.forEach(r => {
      if (!byTrack.has(r.track_id)) byTrack.set(r.track_id, []);
      byTrack.get(r.track_id).push(r);
    });
    return Array.from(byTrack.entries())
      .sort((a, b) => trackLabel(a[0], tracksById).localeCompare(trackLabel(b[0], tracksById)))
      .map(([trackId, recs]) => [
        trackId,
        recs.slice().sort((a, b) =>
          String(a.race_class || 'zzz').localeCompare(String(b.race_class || 'zzz'))
        ),
      ]);
  }, [recordsQuery.data, tracksById]);

  const records = recordsQuery.data?.records || [];

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>MURO DEI RECORD</div>
        <h1 className={styles.title}>Record di pista</h1>
        <p className={styles.sub}>
          Il giro più veloce mai registrato dal team su ogni pista, diviso per categoria —
          un Hypercar e una GT3 non si confrontano. Per la classifica completa di tutti i
          piloti vai su <Link to="/laps">Best Laps</Link>.
        </p>
        {isAdmin && (
          <button
            type="button"
            className={`${styles.tab} ${showExVsd ? styles.tabActive : ''}`}
            style={{ marginTop: 12 }}
            onClick={toggleShowExVsd}
            title="Di default i record degli ex piloti VSD sono nascosti — solo tu puoi rivelarli"
          >
            {showExVsd ? '👁 Ex piloti visibili' : '🚫 Ex piloti nascosti'}
          </button>
        )}
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

      {groupedByTrack.length > 0 && (
        <div className={styles.list}>
          {groupedByTrack.map(([trackId, recs]) => (
            <div key={`${activeSim}-${trackId}`} className={styles.trackGroup}>
              <div className={styles.trackGroupHeader}>{trackLabel(trackId, tracksById)}</div>
              {recs.map(r => {
                const carInfo = formatCarInfo(r.car_id, carsQuery.data);
                return (
                  <div key={`${r.sim}-${r.track_id}-${r.race_class || 'nc'}`} className={styles.card}>
                    <span className={styles.cardIcon}>🏆</span>
                    <div>
                      <div className={styles.cardHolder}>
                        <span className={styles.classBadge}>{r.race_class || 'Non classificato'}</span>
                        {r.display_name}
                        {r.is_ex_vsd && <span className={styles.verifiedBadge}>EX</span>}
                        {r.verified && <span className={styles.verifiedBadge}>Garage61</span>}
                      </div>
                      {r.car_id && <div className={styles.cardCar}>{carInfo.name}</div>}
                    </div>
                    <div className={styles.cardTime}>{r.lap_time_display}</div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
