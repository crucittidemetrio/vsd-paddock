import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTracks, useCars } from '../hooks/useBestLaps';
import { useRaceResults } from '../hooks/useRaceResults';
import { useRaces } from '../hooks/useRaces';
import { useDrivers } from '../hooks/useRoster';
import SimBadge from '../components/shared/SimBadge';
import LapTime from '../components/shared/LapTime';
import Avatar from '../components/shared/Avatar';
import { useConsentSocialFlags } from '../hooks/useConsent';
import { resolvePhotoUrl } from '../utils/driverPhotos';
import { SIM_LIST } from '../utils/constants';
import { formatTrack } from '../utils/format';
import './BestLaps.css';
import './Page.css';

const SEASON_OPTIONS = [
  { id: 'season2026', label: 'Stagione 2026' },
  { id: 'all', label: 'All-time' },
];

export default function Results() {
  const [seasonFilter, setSeasonFilter] = useState('season2026');
  const [simFilter, setSimFilter] = useState('all');
  const [trackFilter, setTrackFilter] = useState('all');
  const [raceClassFilter, setRaceClassFilter] = useState('all');

  const filters = {
    sim: simFilter,
    track_id: trackFilter,
    race_class: raceClassFilter,
    season: seasonFilter,
  };

  const { data: drivers } = useDrivers();
  const { data: tracks } = useTracks();
  const { data: cars } = useCars();

  const driverMap = useMemo(() => {
    const m = {};
    (drivers || []).forEach(d => { m[d.driver_id] = d; });
    return m;
  }, [drivers]);

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

  const trackOptions = useMemo(() => {
    if (!tracks) return [];
    const filtered = tracks.filter(t => simFilter === 'all' || t.sim === simFilter);
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
        <div className="page-eyebrow">RACE RESULTS</div>
        <h1 className="page-title">Risultati Gare</h1>
      </div>

      <div className="laps-top-bar">
        <div className="season-toggle">
          {SEASON_OPTIONS.map(s => (
            <button
              key={s.id}
              className={`season-btn ${seasonFilter === s.id ? 'is-active' : ''}`}
              onClick={() => setSeasonFilter(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="laps-filters">
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
              <option key={t.track_id} value={t.track_id}>{t.track_name}</option>
            ))}
          </select>
        </div>

        <button className="reset-btn" onClick={resetFilters}>Reset filtri</button>
      </div>

      <RaceResultsView
        filters={filters}
        driverMap={driverMap}
        tracks={tracks}
      />
    </div>
  );
}


function RaceResultsView({ filters, driverMap, tracks }) {
  const { data, isLoading, isError, error } = useRaceResults({
    session_type: 'race',
    sort: 'date_desc',
  });
  const { data: races } = useRaces();
  const { data: socialFlagsData } = useConsentSocialFlags();
  const socialFlags = socialFlagsData?.flags || {};

  const raceMap = useMemo(() => {
    const m = {};
    const list = Array.isArray(races) ? races : (races?.races || []);
    list.forEach(r => { m[r.race_id] = r; });
    return m;
  }, [races]);

  const records = useMemo(() => {
    const rows = (data?.results || []).filter(r => r.is_vsd_driver);
    const filtered = rows.filter(r => {
      if (filters.sim !== 'all' && r.sim !== filters.sim) return false;
      if (filters.track_id !== 'all' && r.track_id !== filters.track_id) return false;
      if (filters.race_class !== 'all' && r.car_class !== filters.race_class) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      const da = String(a.set_date || '');
      const db = String(b.set_date || '');
      if (da !== db) return db.localeCompare(da);
      return String(b.race_id || '').localeCompare(String(a.race_id || ''));
    });
  }, [data, filters]);

  if (isLoading) return <Prompt text="Caricamento…" />;
  if (isError) return <Prompt text={`Errore: ${error?.message || 'sconosciuto'}`} />;
  if (records.length === 0) {
    return (
      <Prompt
        icon="🏁"
        title="Nessuna partecipazione VSD"
        text="Nessun risultato di gara trovato. I risultati appaiono dopo aver importato il JSON di una gara."
      />
    );
  }

  return (
    <table className="laps-table">
      <thead>
        <tr>
          <th>Gara</th><th>Sim</th><th>Tracciato</th><th>Classe</th><th>Pilota</th>
          <th>Pos</th><th>Laps</th><th>Best lap</th><th>Tot time</th><th>Punti</th><th>Status</th>
        </tr>
      </thead>
      <tbody>
        {records.map(rec => {
          const drv = driverMap[rec.driver_id];
          const race = raceMap[rec.race_id];
          const raceName = race?.race_name || rec.race_id || '—';
          const isDnf = rec.dnf === 'TRUE' || rec.dnf === true;
          const isDns = rec.dns === 'TRUE' || rec.dns === true;
          const position = rec.finish_position;
          const points = (rec.point_total !== '' && rec.point_total != null) ? rec.point_total : '—';

          return (
            <tr key={`${rec.race_id}-${rec.driver_id}-${rec.session_type}`}>
              <td>
                <Link to={`/races/${rec.race_id}`} className="driver-link">
                  <span className="driver-link-name">{raceName}</span>
                </Link>
              </td>
              <td><SimBadge sim={rec.sim} /></td>
              <td>{formatTrack(rec.track_id, tracks)}</td>
              <td>{rec.car_class ? <span className="lap-badge-record">{rec.car_class}</span> : '—'}</td>
              <td>
                {drv ? (
                  <Link to={`/roster/${drv.driver_id}`} className="driver-link">
                    <Avatar name={drv.display_name} driverId={drv.driver_id} size={28} photoUrl={resolvePhotoUrl(drv.driver_id, socialFlags)} />
                    <span className="driver-link-name">{drv.display_name}</span>
                  </Link>
                ) : (rec.driver_name_external || rec.driver_id)}
              </td>
              <td>{isDns ? '—' : (position != null && position !== '' ? position : '—')}</td>
              <td>{rec.total_laps !== '' && rec.total_laps != null ? rec.total_laps : '—'}</td>
              <td>{rec.best_lap_ms ? <LapTime ms={rec.best_lap_ms} /> : '—'}</td>
              <td><span className="cell-gap">{rec.total_time_display || '—'}</span></td>
              <td><span className="cell-gap">{points}</span></td>
              <td>
                {isDns ? <span className="lap-badge-unclassified">DNS</span>
                  : isDnf ? <span className="lap-badge-unclassified">DNF</span>
                  : <span className="lap-badge-record">✓</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}


function Prompt({ icon, title, text }) {
  return (
    <div className="leaderboard-prompt">
      {icon && <div className="leaderboard-prompt-icon">{icon}</div>}
      {title && <div className="leaderboard-prompt-title">{title}</div>}
      {text && <div className="leaderboard-prompt-text">{text}</div>}
    </div>
  );
}