import { useMemo } from 'react';
import { useSeasonRecap } from '../hooks/useSeasonRecap';
import { useTracks } from '../hooks/useLookups';
import { SIMS } from '../utils/constants';
import styles from './SeasonRecap.module.css';

function trackLabel(trackId, tracksById) {
  if (!trackId) return null;
  const t = tracksById[trackId];
  if (!t) return trackId;
  const parts = [t.circuit_name, t.config_name].filter(Boolean);
  if (parts.length > 0) return parts.join(' ');
  return t.track_name || trackId;
}

function simLabel(sim) {
  return (SIMS[sim] && SIMS[sim].name) || sim;
}

export default function SeasonRecap() {
  const recapQuery = useSeasonRecap();
  const tracksQuery = useTracks();
  const recap = recapQuery.data;

  const tracksById = useMemo(() => {
    const m = {};
    (tracksQuery.data || []).forEach(t => { m[t.track_id] = t; });
    return m;
  }, [tracksQuery.data]);

  const hasData = recap && recap.races > 0;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>SEASON RECAP · 2026</div>
        <h1 className={styles.title}>Il tuo anno VSD</h1>
        <p className={styles.sub}>
          Riepilogo personale della stagione, calcolato dai tuoi risultati gara.
        </p>
      </header>

      {recapQuery.isLoading && <div className={styles.loading}>Caricamento…</div>}
      {recapQuery.error && (
        <div className={styles.errorBox}>Errore: {recapQuery.error.message}</div>
      )}

      {!recapQuery.isLoading && !recapQuery.error && !hasData && (
        <div className={styles.empty}>
          Nessuna gara registrata per te in questa stagione — ancora niente da riepilogare.
        </div>
      )}

      {hasData && (
        <>
          <div className={styles.heroGrid}>
            <div className={styles.heroCard}>
              <div className={styles.heroValue}>{recap.races}</div>
              <div className={styles.heroLabel}>Gare disputate</div>
            </div>
            <div className={styles.heroCard}>
              <div className={styles.heroValue}>{recap.podiums}</div>
              <div className={styles.heroLabel}>Podi</div>
            </div>
            <div className={styles.heroCard}>
              <div className={styles.heroValue}>{recap.dnfs}</div>
              <div className={styles.heroLabel}>DNF</div>
            </div>
          </div>

          <div className={styles.statsGrid}>
            {recap.bestFinish && (
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Miglior risultato</div>
                <div className={styles.statMain}>P{recap.bestFinish.position}</div>
                <div className={styles.statSub}>
                  {trackLabel(recap.bestFinish.track_id, tracksById) || 'Pista sconosciuta'}
                  {recap.bestFinish.sim ? ` · ${simLabel(recap.bestFinish.sim)}` : ''}
                </div>
              </div>
            )}

            {recap.bestLap && (
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Miglior giro</div>
                <div className={styles.statMain}>{recap.bestLap.display || '—'}</div>
                <div className={styles.statSub}>
                  {trackLabel(recap.bestLap.track_id, tracksById) || 'Pista sconosciuta'}
                  {recap.bestLap.sim ? ` · ${simLabel(recap.bestLap.sim)}` : ''}
                </div>
              </div>
            )}

            {recap.mostRacedTrack && (
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Pista preferita</div>
                <div className={styles.statMain}>
                  {trackLabel(recap.mostRacedTrack.track_id, tracksById) || recap.mostRacedTrack.track_id}
                </div>
                <div className={styles.statSub}>{recap.mostRacedTrack.count} gare</div>
              </div>
            )}
          </div>

          {recap.bySim.length > 0 && (
            <div className={styles.simBreakdown}>
              <div className={styles.statLabel}>Gare per simulatore</div>
              {recap.bySim.map(s => (
                <div key={s.sim} className={styles.simRow}>
                  <span>{simLabel(s.sim)}</span>
                  <span className={styles.simRowCount}>{s.races}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
