import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  useTeamLeaderboard,
  useMyBestLaps,
  useTracks,
  useCars,
} from '../hooks/useBestLaps';
import { useDrivers } from '../hooks/useRoster';
import { useAuth } from '../hooks/useAuth';
import SimBadge from '../components/shared/SimBadge';
import LapTime from '../components/shared/LapTime';
import Avatar from '../components/shared/Avatar';
import { SIM_LIST } from '../utils/constants';
import { formatTrack, formatCar, formatGapPercent } from '../utils/format';
import './BestLaps.css';
import './Page.css';

const VIEW_MODES = [
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'mine', label: 'I miei tempi' },
];

export default function BestLaps() {
  const { driver } = useAuth();
  const [viewMode, setViewMode] = useState('leaderboard');
  const [simFilter, setSimFilter] = useState('all');
  const [trackFilter, setTrackFilter] = useState('all');
  const [raceClassFilter, setRaceClassFilter] = useState('all');

  const filters = {
    sim: simFilter,
    track_id: trackFilter,
    race_class: raceClassFilter,
  };

  const { data: drivers } = useDrivers();
  const { data: tracks } = useTracks();
  const { data: cars } = useCars();

  const driverMap = useMemo(() => {
    const m = {};
    (drivers || []).forEach(d => { m[d.driver_id] = d; });
    return m;
  }, [drivers]);

  // Opzioni race_class dinamiche dal sheet Cars
  const raceClassOptions = useMemo(() => {
    if (!cars) return [];
    const set = new Set();
    cars.forEach(c => {
      const rc = c.race_class && String(c.race_class).trim();
      if (!rc) return;
      if (simFilter === 'all' || c.sim === simFilter) {
        set.add(rc);
      }
    });
    return Array.from(set).sort();
  }, [cars, simFilter]);

  // Opzioni track filtrate per sim
 const trackOptions = useMemo(() => {
    if (!tracks) return [];
    const filtered = tracks.filter(t => simFilter === 'all' || t.sim === simFilter);
    // Dedup per track_id (il sheet Tracks può contenere duplicati: la UI ne mostra una sola)
    const seen = new Set();
    const unique = [];
    filtered.forEach(t => {
      if (!seen.has(t.track_id)) {
        seen.add(t.track_id);
        unique.push(t);
      }
    });
    return unique.sort((a, b) =>
      String(a.track_name || '').localeCompare(String(b.track_name || ''))
    );
  }, [tracks, simFilter]);

  function handleSimChange(newSim) {
    setSimFilter(newSim);
    setTrackFilter('all');
    setRaceClassFilter('all');
  }

  function resetFilters() {
    setSimFilter('all');
    setTrackFilter('all');
    setRaceClassFilter('all');
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-eyebrow">BEST LAPS · STAGIONE 2026</div>
        <h1 className="page-title">Database Tempi</h1>
      </div>

      <div className="view-switch" style={{ marginBottom: 'var(--sp-4)' }}>
        {VIEW_MODES.map(v => (
          <button
            key={v.id}
            className={`view-switch-btn ${viewMode === v.id ? 'is-active' : ''}`}
            onClick={() => setViewMode(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="laps-filters" style={{ marginBottom: 'var(--sp-5)' }}>
        <div className="filter-group">
          <label className="filter-label">Sim</label>
          <select
            className="filter-select"
            value={simFilter}
            onChange={e => handleSimChange(e.target.value)}
          >
            <option value="all">Tutti</option>
            {SIM_LIST.map(s => (
              <option key={s.id} value={s.id}>{s.short || s.name || s.id}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">Classe</label>
          <select
            className="filter-select"
            value={raceClassFilter}
            onChange={e => setRaceClassFilter(e.target.value)}
          >
            <option value="all">Tutte</option>
            {raceClassOptions.map(rc => (
              <option key={rc} value={rc}>{rc}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">Tracciato</label>
          <select
            className="filter-select"
            value={trackFilter}
            onChange={e => setTrackFilter(e.target.value)}
          >
            <option value="all">Tutti</option>
            {trackOptions.map(t => (
              <option key={t.track_id} value={t.track_id}>
                {t.track_name}
              </option>
            ))}
          </select>
        </div>

        <button className="reset-btn" onClick={resetFilters}>
          Reset filtri
        </button>
      </div>

      {viewMode === 'leaderboard' ? (
        <LeaderboardView
          filters={filters}
          driverMap={driverMap}
          tracks={tracks}
          cars={cars}
        />
      ) : (
        <MineView
          driver={driver}
          filters={filters}
          tracks={tracks}
          cars={cars}
        />
      )}
    </div>
  );
}


function LeaderboardView({ filters, driverMap, tracks, cars }) {
  const { data, isLoading, isError } = useTeamLeaderboard(filters);

  if (isLoading) {
    return (
      <div className="leaderboard-prompt">
        <div className="leaderboard-prompt-text">Caricamento…</div>
      </div>
    );
  }
  if (isError) {
    return (
      <div className="leaderboard-prompt">
        <div className="leaderboard-prompt-text">Errore nel caricamento</div>
      </div>
    );
  }
  if (!data || data.length === 0) {
    return (
      <div className="leaderboard-prompt">
        <div className="leaderboard-prompt-icon">⚡</div>
        <div className="leaderboard-prompt-title">Nessun record</div>
        <div className="leaderboard-prompt-text">
          Nessun giro trovato per i filtri selezionati. Prova ad allargare i criteri o rimuoverli.
        </div>
      </div>
    );
  }

  return (
    <table className="laps-table">
      <thead>
        <tr>
          <th className="col-pos">#</th>
          <th>Sim</th>
          <th>Tracciato</th>
          <th>Classe</th>
          <th>Auto</th>
          <th>Pilota</th>
          <th>Tempo</th>
        </tr>
      </thead>
      <tbody>
        {data.map(rec => {
          const driver = driverMap[rec.driver_id];
          return (
            <tr
              key={`${rec.sim}-${rec.track_id}-${rec.race_class}`}
              className="is-podium pos-1"
            >
              <td className="col-pos"><span className="pos-badge">1</span></td>
              <td><SimBadge sim={rec.sim} /></td>
              <td>{formatTrack(rec.track_id, tracks)}</td>
              <td><span className="lap-badge-record">{rec.race_class}</span></td>
              <td>{formatCar(rec.car_id, cars)}</td>
              <td>
                {driver ? (
                  <Link to={`/roster/${driver.driver_id}`} className="driver-link">
                    <Avatar
                      name={driver.display_name}
                      driverId={driver.driver_id}
                      size={28}
                    />
                    <span className="driver-link-name">{driver.display_name}</span>
                  </Link>
                ) : rec.driver_id}
              </td>
              <td><LapTime ms={rec.lap_time_ms} /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}


function MineView({ driver, filters, tracks, cars }) {
  const { data, isLoading, isError } = useMyBestLaps(driver?.driver_id, filters);

  if (!driver) {
    return (
      <div className="leaderboard-prompt">
        <div className="leaderboard-prompt-title">Accesso richiesto</div>
        <div className="leaderboard-prompt-text">
          Effettua il login per vedere i tuoi tempi.
        </div>
      </div>
    );
  }
  if (isLoading) {
    return (
      <div className="leaderboard-prompt">
        <div className="leaderboard-prompt-text">Caricamento…</div>
      </div>
    );
  }
  if (isError) {
    return (
      <div className="leaderboard-prompt">
        <div className="leaderboard-prompt-text">Errore nel caricamento</div>
      </div>
    );
  }
  if (!data || data.length === 0) {
    return (
      <div className="leaderboard-prompt">
        <div className="leaderboard-prompt-icon">🏁</div>
        <div className="leaderboard-prompt-title">Nessun giro registrato</div>
        <div className="leaderboard-prompt-text">
          Non risultano tuoi giri per i filtri selezionati.
        </div>
      </div>
    );
  }

  const classified = data.filter(r => r.race_class);
  const unclassified = data.filter(r => !r.race_class);

  return (
    <>
      {classified.length > 0 && (
        <table className="laps-table">
          <thead>
            <tr>
              <th>Sim</th>
              <th>Tracciato</th>
              <th>Classe</th>
              <th>Auto</th>
              <th>Mio tempo</th>
              <th>Gap dal record team</th>
            </tr>
          </thead>
          <tbody>
            {classified.map(rec => (
              <tr key={`${rec.sim}-${rec.track_id}-${rec.race_class}`}>
                <td><SimBadge sim={rec.sim} /></td>
                <td>{formatTrack(rec.track_id, tracks)}</td>
                <td>{rec.race_class}</td>
                <td>{formatCar(rec.car_id, cars)}</td>
                <td><LapTime ms={rec.lap_time_ms} /></td>
                <td>
                  {rec.is_record_holder ? (
                    <span className="lap-badge-record">★ RECORD</span>
                  ) : rec.gap_ms != null && rec.team_record_ms != null ? (
                    <span className="cell-gap">
                      {formatGapPercent(rec.lap_time_ms, rec.team_record_ms)}
                    </span>
                  ) : (
                    <span className="cell-gap">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {unclassified.length > 0 && (
        <div className="section-unclassified">
          <div className="section-unclassified-title">
            Da classificare ({unclassified.length})
          </div>
          <table className="laps-table">
            <thead>
              <tr>
                <th>Sim</th>
                <th>Tracciato</th>
                <th>Auto</th>
                <th>Mio tempo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {unclassified.map(rec => (
                <tr key={`${rec.sim}-${rec.track_id}-${rec.car_id}-unclassified`}>
                  <td><SimBadge sim={rec.sim} /></td>
                  <td>{formatTrack(rec.track_id, tracks)}</td>
                  <td>{formatCar(rec.car_id, cars)}</td>
                  <td><LapTime ms={rec.lap_time_ms} /></td>
                  <td>
                    <span className="lap-badge-unclassified">
                      Race class non assegnata
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}