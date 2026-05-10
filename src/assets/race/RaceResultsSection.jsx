import { useState, useMemo } from 'react';
import { useRaceResults } from '../../hooks/useRaceResults';
import { STORAGE } from '../../utils/constants';
import './RaceResultsSection.css';

const SESSION_LABELS = {
  qualifying: 'Qualifica',
  race: 'Gara',
};

/**
 * Legge il driver_id dell'utente loggato direttamente da localStorage.
 * Stesso pattern usato in client.js — evita dipendenza su useAuth.
 */
function readCurrentDriverId() {
  try {
    const raw = localStorage.getItem(STORAGE.DRIVER);
    if (!raw) return null;
    const driver = JSON.parse(raw);
    return driver?.driver_id || null;
  } catch {
    return null;
  }
}

function getDriverName(result, drivers) {
  if (result.is_vsd_driver && result.driver_id && Array.isArray(drivers)) {
    const d = drivers.find(x => x.driver_id === result.driver_id);
    if (d) return d.display_name || d.full_name || result.driver_name_external;
  }
  return result.driver_name_external || '—';
}

function StatusBadge({ result }) {
  if (result.dns) return <span className="rrs-status rrs-status--dns">DNS</span>;
  if (result.dnf) return <span className="rrs-status rrs-status--dnf">DNF</span>;
  return null;
}

function ResultsTable({ results, sessionType, currentDriverId, drivers }) {
  const isRace = sessionType === 'race';

  return (
    <div className="rrs-table-wrap">
      <table className="rrs-table">
        <thead>
          <tr>
            <th className="rrs-col-pos">Pos</th>
            <th className="rrs-col-num">#</th>
            <th>Pilota</th>
            <th className="rrs-col-car">Vettura</th>
            <th className="rrs-col-num-cell">Giri</th>
            <th className="rrs-col-time">Best Lap</th>
            {isRace && <th className="rrs-col-time">Tempo Totale</th>}
            {isRace && <th className="rrs-col-status">Status</th>}
          </tr>
        </thead>
        <tbody>
          {results.map(r => {
            const isCurrentUser = currentDriverId && r.driver_id === currentDriverId;
            const isVsd = r.is_vsd_driver;
            return (
              <tr
                key={r.result_id}
                className={[
                  isCurrentUser ? 'rrs-row--me' : '',
                  isVsd && !isCurrentUser ? 'rrs-row--vsd' : '',
                  r.dns ? 'rrs-row--dns' : '',
                ].filter(Boolean).join(' ')}
              >
                <td className="rrs-col-pos">{r.dns ? '—' : r.finish_position}</td>
                <td className="rrs-col-num">{r.car_num ?? '—'}</td>
                <td className="rrs-col-driver">
                  <span>{getDriverName(r, drivers)}</span>
                  {isVsd && <span className="rrs-vsd-tag">VSD</span>}
                </td>
                <td className="rrs-col-car">{r.car_external_name || '—'}</td>
                <td className="rrs-col-num-cell">{r.total_laps ?? '—'}</td>
                <td className="rrs-col-time">{r.best_lap_display || '—'}</td>
                {isRace && <td className="rrs-col-time">{r.total_time_display || '—'}</td>}
                {isRace && <td className="rrs-col-status"><StatusBadge result={r} /></td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function RaceResultsSection({ raceId, drivers }) {
  const { data, isLoading, error } = useRaceResults({ race_id: raceId });
  const [activeSession, setActiveSession] = useState(null);

  const currentDriverId = readCurrentDriverId();

  const { availableSessions, byClass } = useMemo(() => {
    const results = data?.results || [];
    const sessions = [...new Set(results.map(r => r.session_type))];

    const grouped = {};
    sessions.forEach(s => {
      grouped[s] = {};
      results
        .filter(r => r.session_type === s)
        .forEach(r => {
          if (!grouped[s][r.car_class]) grouped[s][r.car_class] = [];
          grouped[s][r.car_class].push(r);
        });
      Object.keys(grouped[s]).forEach(cls => {
        grouped[s][cls].sort((a, b) => (a.finish_position || 999) - (b.finish_position || 999));
      });
    });

    return { availableSessions: sessions, byClass: grouped };
  }, [data]);

  // Auto-select tab: prefer 'race' if available, else first available
  const currentSession = activeSession
    || (availableSessions.includes('race') ? 'race' : availableSessions[0]);

  if (isLoading) {
    return (
      <section className="rrs-section">
        <div className="rrs-loading">Caricamento risultati…</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rrs-section">
        <div className="rrs-error">Errore caricamento risultati: {error.message}</div>
      </section>
    );
  }

  if (!data?.results?.length) return null;

  const classesInSession = byClass[currentSession] || {};
  const classNames = Object.keys(classesInSession).sort();

  return (
    <section className="rrs-section">
      <div className="rrs-header">
        <h2>Risultati Ufficiali</h2>
        {availableSessions.length > 1 && (
          <div className="rrs-tabs" role="tablist">
            {availableSessions.map(s => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={currentSession === s}
                className={`rrs-tab ${currentSession === s ? 'rrs-tab--active' : ''}`}
                onClick={() => setActiveSession(s)}
              >
                {SESSION_LABELS[s] || s}
              </button>
            ))}
          </div>
        )}
      </div>

      {classNames.map(cls => (
        <div key={cls} className="rrs-class-group">
          <h3 className="rrs-class-title">{cls}</h3>
          <ResultsTable
            results={classesInSession[cls]}
            sessionType={currentSession}
            currentDriverId={currentDriverId}
            drivers={drivers}
          />
        </div>
      ))}
    </section>
  );
}