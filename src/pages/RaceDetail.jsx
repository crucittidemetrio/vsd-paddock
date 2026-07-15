import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import StintTimeline from '../components/race/StintTimeline';
import { useStints } from '../hooks/useEnduranceStints';
import { useAuth } from '../hooks/useAuth';
import { useParams, Link } from 'react-router-dom';
import { useRace, useReports } from '../hooks/useRaces';
import { useRaceResults } from '../hooks/useRaceResults';
import { useTracks, useCars } from '../hooks/useLookups';
import { useDrivers } from '../hooks/useRoster';
import { formatTrackInfo, formatCarInfo } from '../utils/format';
import RaceResultsSection from '../components/race/RaceResultsSection';
import './Page.css';
import './RaceDetail.css';
import RequireTier from '../components/auth/RequireTier';
import LoginPrompt from '../components/auth/LoginPrompt';

const STATUS_LABELS = {
  draft:       'BOZZA',
  scheduled:   'PROGRAMMATA',
  in_progress: 'IN CORSO',
  live:        'LIVE',
  completed:   'CONCLUSA',
  cancelled:   'ANNULLATA',
};

// Transizioni disponibili per ogni stato
const STATUS_TRANSITIONS = {
  draft:       [
    { to: 'scheduled',   label: 'Pubblica',   icon: '📋' },
    { to: 'cancelled',   label: 'Annulla',    icon: '✕', danger: true },
  ],
  scheduled:   [
    { to: 'in_progress', label: 'Avvia',      icon: '▶' },
    { to: 'completed',   label: 'Concludi',   icon: '✓' },
    { to: 'cancelled',   label: 'Annulla',    icon: '✕', danger: true },
  ],
  in_progress: [
    { to: 'completed',   label: 'Concludi',   icon: '✓' },
    { to: 'cancelled',   label: 'Annulla',    icon: '✕', danger: true },
  ],
  completed:   [
    { to: 'in_progress', label: 'Riapri',     icon: '↩' },
  ],
  cancelled:   [
    { to: 'scheduled',   label: 'Ripristina', icon: '↩' },
  ],
};

function StatusControl({ race, onUpdated }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const transitions = STATUS_TRANSITIONS[race.status] || [];
  if (transitions.length === 0) return null;

  async function handleTransition(newStatus) {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await api.races.update({ race_id: race.race_id, status: newStatus });
      setSuccess(`Stato → ${STATUS_LABELS[newStatus] || newStatus}`);
      onUpdated?.();
    } catch (err) {
      setError(err.message || 'Errore aggiornamento stato');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rd-status-control">
      <div className="rd-status-control-label">⚙ Cambia stato</div>
      <div className="rd-status-control-actions">
        {transitions.map(t => (
          <button
            key={t.to}
            className={`rd-status-btn${t.danger ? ' rd-status-btn--danger' : ''}`}
            disabled={loading}
            onClick={() => handleTransition(t.to)}
          >
            <span aria-hidden="true">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
      {error   && <div className="rd-status-msg rd-status-msg--error">{error}</div>}
      {success && <div className="rd-status-msg rd-status-msg--ok">{success}</div>}
    </div>
  );
}

function formatRaceDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const datePart = d.toLocaleDateString('it-IT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const timePart = d.toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${datePart} · ${timePart}`;
}

function formatDuration(minutes) {
  if (minutes === null || minutes === undefined || minutes === '') return '—';
  const m = Number(minutes);
  if (isNaN(m)) return '—';
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h === 0) return `${mm} min`;
  if (mm === 0) return `${h}h`;
  return `${h}h ${mm}min`;
}

function formatLapMs(ms) {
  if (ms === null || ms === undefined || ms === '') return null;
  const total = Number(ms);
  if (isNaN(total) || total <= 0) return null;
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function getDriverName(driverId, drivers) {
  if (!driverId) return '—';
  if (!Array.isArray(drivers)) return driverId;
  const d = drivers.find(x => x.driver_id === driverId);
  if (!d) return driverId;
  return d.display_name || d.full_name || driverId;
}

function ReportCard({ report, drivers }) {
  const driverName = getDriverName(report.driver_id, drivers);
  const lapDisplay = formatLapMs(report.best_lap_ms);
  const hasStaffRating = report.staff_rating != null && String(report.staff_rating).trim() !== '';
  const hasStaffNotes = report.staff_notes && String(report.staff_notes).trim() !== '';
  const hasStaff = hasStaffRating || hasStaffNotes;

  return (
    <div className="rd-report-card">
      <div className="rd-report-header">
        <div className="rd-report-pos-driver">
          <span className="rd-report-pos">P{report.finish_position}</span>
          <span className="rd-report-driver">{driverName}</span>
        </div>
        {lapDisplay && (
          <div className="rd-report-best-lap" title="Best lap in race">{lapDisplay}</div>
        )}
      </div>

      <div className="rd-report-meta">
        {report.grid_position != null && (
          <span>Partito {report.grid_position}°</span>
        )}
        {report.incidents != null && report.incidents > 0 && (
          <span>· {report.incidents} {report.incidents === 1 ? 'incidente' : 'incidenti'}</span>
        )}
      </div>

      {(report.incident_notes || report.damage_report || report.strategy_notes) && (
        <div className="rd-report-body">
          {report.incident_notes && (
            <div className="rd-report-block">
              <div className="rd-info-label">Incidenti</div>
              <div className="rd-report-text">{report.incident_notes}</div>
            </div>
          )}
          {report.damage_report && (
            <div className="rd-report-block">
              <div className="rd-info-label">Danni</div>
              <div className="rd-report-text">{report.damage_report}</div>
            </div>
          )}
          {report.strategy_notes && (
            <div className="rd-report-block">
              <div className="rd-info-label">Strategia</div>
              <div className="rd-report-text">{report.strategy_notes}</div>
            </div>
          )}
        </div>
      )}

      {hasStaff && (
        <div className="rd-staff-feedback">
          <div className="rd-staff-header">
            <span className="rd-staff-label">Staff Feedback</span>
            {hasStaffRating && (
              <span className="rd-staff-rating">Rating {report.staff_rating}/10</span>
            )}
          </div>
          {report.staff_notes && (
            <div className="rd-report-text">{report.staff_notes}</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function RaceDetail() {
  const { raceId } = useParams();
  const queryClient = useQueryClient();
  const { data: race, isLoading, error } = useRace(raceId);
  const { data: tracks } = useTracks();
  const { data: cars } = useCars();
  const { data: reports } = useReports({ race_id: raceId });
  const { data: driversRaw } = useDrivers({ includeRemoved: true });
  const drivers = useMemo(() => {
    const m = {};
    (driversRaw || []).forEach(d => { m[d.driver_id] = d; });
    return m;
  }, [driversRaw]);
  const { data: raceResultsData } = useRaceResults({ race_id: raceId });

  function refreshRace() {
    queryClient.invalidateQueries({ queryKey: ['race', raceId] });
    queryClient.invalidateQueries({ queryKey: ['races'] });
  }

  // --- Stint endurance (UI pubblica read-only) ---
  const { driver, isStaff } = useAuth();
  const currentDriverId = driver?.driver_id ?? null;
  const isEndurance = race?.format === 'endurance';
  const { data: stintsResp } = useStints(isEndurance ? raceId : null);
  const stints = stintsResp?.stints ?? []; // passthrough adapter: unwrap già in call()

  const hasOfficialResults = (raceResultsData?.results?.length || 0) > 0;

  if (isLoading) {
    return (
      <div className="page">
        <div className="page-header">
          <Link to="/race" className="page-eyebrow">← RACE HUB</Link>
        </div>
        <div className="rd-state">Caricamento gara…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <div className="page-header">
          <Link to="/race" className="page-eyebrow">← RACE HUB</Link>
        </div>
        <div className="rd-state rd-state-error">Errore: {error.message}</div>
      </div>
    );
  }

  if (!race) {
    return (
      <div className="page">
        <div className="page-header">
          <Link to="/race" className="page-eyebrow">← RACE HUB</Link>
        </div>
        <div className="rd-state">Gara non trovata.</div>
      </div>
    );
  }

  const trackInfo = formatTrackInfo(race.track_id, tracks);
  const carInfo = formatCarInfo(race.car_id, cars);
  const statusKey = (race.status || '').toLowerCase();
  const statusLabel = STATUS_LABELS[statusKey] || (race.status || '—').toUpperCase();

  const classification = Array.isArray(reports)
    ? reports
        .map(r => ({ ...r, _pos: Number(r.finish_position) }))
        .filter(r => !isNaN(r._pos) && r._pos > 0)
        .sort((a, b) => a._pos - b._pos)
    : [];

  return (
    <div className="page">
      <div className="page-header">
        <Link to="/race" className="page-eyebrow">← RACE HUB</Link>
        <div className="rd-title-row">
          <h1 className="page-title">{race.race_name || 'Gara'}</h1>
          <span className={`rd-status rd-status-${statusKey}`}>{statusLabel}</span>
        </div>
        {(race.championship || race.round) && (
          <p className="page-sub">
            {race.championship}
            {race.round ? ` — Round ${race.round}` : ''}
          </p>
        )}
      </div>

        {isStaff && (
          <StatusControl race={race} onUpdated={refreshRace} />
        )}

        {race.format === 'endurance' && (
          <RequireTier minTier="staff">
            <div className="rd-admin-tools">
              <Link
                to={`/admin/race/${race.race_id}/stints`}
                className="rd-admin-btn"
              >
                🛠 Gestisci stint
              </Link>
            </div>
          </RequireTier>
        )}

      <section className="rd-info-card">
        <div className="rd-info-grid">
          <div className="rd-info-item">
            <div className="rd-info-label">Tracciato</div>
            <div className="rd-info-value">
              {trackInfo.name}
              {trackInfo.sim && <span className="rd-sim-badge">{trackInfo.sim}</span>}
            </div>
          </div>

         {race.poster_url && (
        <div className="rd-hero">
          <img
            src={race.poster_url}
            alt=""
            onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }}
          />
        </div>
      )}

          <div className="rd-info-item">
            <div className="rd-info-label">Vettura</div>
            <div className="rd-info-value">
              {carInfo.name}
              {carInfo.sim && <span className="rd-sim-badge">{carInfo.sim}</span>}
              {carInfo.category && <span className="rd-cat-badge">{carInfo.category}</span>}
            </div>
          </div>

          <div className="rd-info-item">
            <div className="rd-info-label">Data</div>
            <div className="rd-info-value">{formatRaceDate(race.date)}</div>
          </div>

          <div className="rd-info-item">
            <div className="rd-info-label">Durata</div>
            <div className="rd-info-value">{formatDuration(race.duration_minutes)}</div>
          </div>

          {race.format && (
            <div className="rd-info-item">
              <div className="rd-info-label">Formato</div>
              <div className="rd-info-value">{race.format}</div>
            </div>
          )}

          {race.weather && (
            <div className="rd-info-item">
              <div className="rd-info-label">Meteo</div>
              <div className="rd-info-value">{race.weather}</div>
            </div>
          )}

          {race.broadcast_url && (
            <div className="rd-info-item">
              <div className="rd-info-label">Diretta</div>
              <div className="rd-info-value">
                <a href={race.broadcast_url} target="_blank" rel="noopener noreferrer" className="rd-link">Apri broadcast</a>
              </div>
            </div>
          )}
        </div>

        {race.notes && (
          <div className="rd-notes">
            <div className="rd-info-label">Note</div>
            <div className="rd-notes-text">{race.notes}</div>
          </div>
        )}
      </section>

      {/* Risultati Ufficiali — appare solo se ci sono righe in RaceResults */}
      <RaceResultsSection raceId={raceId} drivers={drivers} />

      {/* Piano Stint — gare endurance, visibile ai piloti loggati (read-only) */}
      {isEndurance && stints.length > 0 && (
        <RequireTier minTier="pilot_vsd">
          <StintTimeline
            stints={stints}
            drivers={drivers}
            currentDriverId={currentDriverId}
            getDriverName={getDriverName}
            formatDuration={formatDuration}
            formatLapMs={formatLapMs}
          />
        </RequireTier>
      )}

      {/* Classifica derivata dai reports — fallback per gare senza risultati ufficiali */}
      {statusKey === 'completed' && !hasOfficialResults && (
        <section className="rd-section">
          <h2 className="rd-section-title">Classifica</h2>
          {classification.length === 0 ? (
            <div className="rd-state">Nessun risultato disponibile.</div>
          ) : (
            <div className="rd-table-wrap">
              <table className="rd-classification-table">
                <thead>
                  <tr>
                    <th className="rd-th-pos">Pos</th>
                    <th>Pilota</th>
                  </tr>
                </thead>
                <tbody>
                  {classification.map((r, i) => (
                    <tr key={r.report_id || `${r.driver_id}-${i}`}>
                      <td className="rd-pos">{r._pos}</td>
                      <td>{getDriverName(r.driver_id, drivers)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {statusKey === 'completed' && (
        <section className="rd-section">
          <h2 className="rd-section-title">Race Reports</h2>
          <RequireTier
            minTier="pilot_vsd"
            fallback={<LoginPrompt feature="i Race Reports dei piloti" />}
          >
            {classification.length > 0 ? (
              <div className="rd-reports-list">
                {classification.map(r => (
                  <ReportCard key={r.report_id || r.driver_id} report={r} drivers={drivers} />
                ))}
              </div>
            ) : (
              <div style={{ color: 'rgba(255,255,255,0.4)', padding: '16px 0' }}>
                Nessun report pubblicato per questa gara.
              </div>
            )}
          </RequireTier>
        </section>
      )}
    </div>
  );
}