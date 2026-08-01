import { useState } from 'react';
import { useTrainingInsights } from '../hooks/useTrainingInsights';
import { useTracks } from '../hooks/useLookups';
import { formatTrack, formatGapPercent, formatDate, formatRaceDateTime, formatCountdown } from '../utils/format';
import styles from './Training.module.css';

const SIM = 'LMU'; // Fase 1: solo LMU (vedi apps-script/TrainingInsights.js per il perché)

function lastSessionLabel(iso) {
  if (!iso) return 'Mai';
  return formatDate(iso);
}

export default function Training() {
  const insightsQuery = useTrainingInsights(SIM);
  const tracksQuery = useTracks(SIM);
  const [expandedDriverId, setExpandedDriverId] = useState(null);

  const tracks = tracksQuery.data || [];
  const data = insightsQuery.data;
  const drivers = data?.drivers || [];
  const nextRace = data?.next_race || null;
  const readiness = data?.readiness || null;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>TRAINING · LMU</div>
        <h1 className={styles.title}>Allenamento</h1>
        <p className={styles.sub}>
          Calcolato dai giri già sincronizzati da Garage61 — nessun log da compilare.
          Solo giri di prova e time trial contano come allenamento.
        </p>
      </header>

      {insightsQuery.isLoading && <div className={styles.loading}>Caricamento…</div>}
      {insightsQuery.error && (
        <div className={styles.errorBox}>Errore: {insightsQuery.error.message}</div>
      )}

      {nextRace && readiness && (
        <section className={styles.readinessCard}>
          <div className={styles.readinessHeader}>
            <div>
              <div className={styles.readinessEyebrow}>PROSSIMA GARA · {formatCountdown(nextRace.date)}</div>
              <div className={styles.readinessTitle}>{nextRace.race_name}</div>
              <div className={styles.readinessSub}>
                {formatTrack(nextRace.track_id, tracks)} · {formatRaceDateTime(nextRace.date)}
              </div>
            </div>
          </div>
          <div className={styles.readinessList}>
            {readiness.map(r => (
              <div key={r.driver_id} className={styles.readinessRow}>
                <span className={styles.readinessName}>{r.display_name}</span>
                <span className={r.laps_on_track === 0 ? styles.readinessLapsZero : styles.readinessLaps}>
                  {r.laps_on_track === 0 ? 'Nessun giro qui' : `${r.laps_on_track} giri qui`}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {!insightsQuery.isLoading && !insightsQuery.error && drivers.length === 0 && (
        <div className={styles.empty}>Nessun dato di allenamento disponibile per {SIM}.</div>
      )}

      {drivers.length > 0 && (
        <section>
          <div className={styles.leaderboardHeader}>
            <span>Pilota</span>
            <span>Ultimi 7g</span>
            <span>Ultimi 30g</span>
            <span>Ultima sessione</span>
          </div>
          <div className={styles.list}>
            {drivers.map(d => {
              const isExpanded = expandedDriverId === d.driver_id;
              return (
                <div key={d.driver_id} className={styles.driverBlock}>
                  <button
                    type="button"
                    className={styles.driverRow}
                    onClick={() => setExpandedDriverId(isExpanded ? null : d.driver_id)}
                    aria-expanded={isExpanded}
                  >
                    <span className={styles.driverName}>
                      <span className={styles.expandIcon}>{isExpanded ? '▾' : '▸'}</span>
                      {d.display_name}
                    </span>
                    <span className={d.laps_7d === 0 ? styles.lapsZero : styles.laps7d}>{d.laps_7d}</span>
                    <span className={styles.laps30d}>{d.laps_30d}</span>
                    <span className={styles.lastSession}>{lastSessionLabel(d.last_session_date)}</span>
                  </button>

                  {isExpanded && (
                    <div className={styles.trackDetail}>
                      {d.tracks.length === 0 && (
                        <div className={styles.trackDetailEmpty}>Nessun giro di allenamento registrato.</div>
                      )}
                      {d.tracks.map(t => (
                        <div key={t.track_id} className={styles.trackRow}>
                          <span className={styles.trackName}>{formatTrack(t.track_id, tracks)}</span>
                          <span className={styles.trackLaps}>{t.laps} giri</span>
                          <span className={styles.trackBest}>{t.personal_best_display}</span>
                          <span className={styles.trackGap}>{formatGapPercent(t.personal_best_ms, t.team_best_ms)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
