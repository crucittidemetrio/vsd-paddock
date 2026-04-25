import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useBestLaps, useTracks, useCars, useLeaderboard } from '../hooks/useBestLaps';
import { useDrivers } from '../hooks/useRoster';
import SimBadge from '../components/shared/SimBadge';
import LapTime from '../components/shared/LapTime';
import Avatar from '../components/shared/Avatar';
import { SIM_LIST } from '../utils/constants';
import { formatTrack, formatCar, formatDate, formatLapDelta } from '../utils/format';
import './BestLaps.css';
import './Page.css';

const VIEW_MODES = [
  { id: 'all', label: 'Tutti i tempi' },
  { id: 'leaderboard', label: 'Leaderboard' },
];

export default function BestLaps() {
  const [viewMode, setViewMode] = useState('all');
  const [simFilter, setSimFilter] = useState('all');
  const [trackFilter, setTrackFilter] = useState('all');
  const [carFilter, setCarFilter] = useState('all');
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-eyebrow">BEST LAPS</div>
        <h1 className="page-title">Database Tempi</h1>
        <p className="page-sub">
          Tempi sul giro registrati dal team. Filtra per simulatore, tracciato, auto.
        </p>
      </div>

      {/* SWITCH VISTA */}
      <div className="view-switch">
        {VIEW_MODES.map(m => (
          <button
            key={m.id}
            className={`view-switch-btn${viewMode === m.id ? ' is-active' : ''}`}
            onClick={() => setViewMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* FILTRI */}
      <Filters
        simFilter={simFilter} setSimFilter={setSimFilter}
        trackFilter={trackFilter} setTrackFilter={setTrackFilter}
        carFilter={carFilter} setCarFilter={setCarFilter}
        verifiedOnly={verifiedOnly} setVerifiedOnly={setVerifiedOnly}
        showVerified={viewMode === 'all'}
        leaderboardMode={viewMode === 'leaderboard'}
      />

      {/* CONTENUTO */}
      {viewMode === 'all' ? (
        <AllLapsView
          simFilter={simFilter}
          trackFilter={trackFilter}
          carFilter={carFilter}
          verifiedOnly={verifiedOnly}
        />
      ) : (
        <LeaderboardView
          sim={simFilter}
          trackId={trackFilter}
          carId={carFilter}
        />
      )}
    </div>
  );
}

// ========================================================
// FILTERS
// ========================================================
function Filters({
  simFilter, setSimFilter,
  trackFilter, setTrackFilter,
  carFilter, setCarFilter,
  verifiedOnly, setVerifiedOnly,
  showVerified, leaderboardMode,
}) {
  const { data: tracks } = useTracks(simFilter !== 'all' ? simFilter : undefined);
  const { data: cars } = useCars(simFilter !== 'all' ? simFilter : undefined);

  const trackOptions = useMemo(() => {
    const m = new Map();
    (tracks || []).forEach(t => m.set(t.track_id, t));
    return Array.from(m.values());
  }, [tracks]);

  const carOptions = useMemo(() => {
    const m = new Map();
    (cars || []).forEach(c => m.set(c.car_id, c));
    return Array.from(m.values());
  }, [cars]);

  function reset() {
    setSimFilter('all');
    setTrackFilter('all');
    setCarFilter('all');
    setVerifiedOnly(false);
  }

  const hasFilters =
    simFilter !== 'all' || trackFilter !== 'all' || carFilter !== 'all' || verifiedOnly;

  return (
    <div className="laps-filters">
      <div className="filter-group">
        <div className="filter-label">
          Sim {leaderboardMode && <span className="req">*</span>}
        </div>
        <div className="filter-pills">
          <button
            className={`filter-pill${simFilter === 'all' ? ' is-active' : ''}`}
            onClick={() => { setSimFilter('all'); setTrackFilter('all'); setCarFilter('all'); }}
          >Tutte</button>
          {SIM_LIST.map(s => (
            <button
              key={s.id}
              className={`filter-pill${simFilter === s.id ? ' is-active' : ''}`}
              onClick={() => { setSimFilter(s.id); setTrackFilter('all'); setCarFilter('all'); }}
            >
              {s.short}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <div className="filter-label">
          Tracciato {leaderboardMode && <span className="req">*</span>}
        </div>
        <select
          className="filter-select"
          value={trackFilter}
          onChange={e => setTrackFilter(e.target.value)}
        >
          <option value="all">Tutti i tracciati</option>
          {trackOptions.map(t => (
            <option key={`${t.sim}-${t.track_id}`} value={t.track_id}>
              {formatTrack(t.track_id)}
            </option>
          ))}
        </select>
      </div>

      <div className="filter-group">
        <div className="filter-label">Auto</div>
        <select
          className="filter-select"
          value={carFilter}
          onChange={e => setCarFilter(e.target.value)}
        >
          <option value="all">Tutte le auto</option>
          {carOptions.map(c => (
            <option key={`${c.sim}-${c.car_id}`} value={c.car_id}>
              {formatCar(c.car_id)} · {c.category}
            </option>
          ))}
        </select>
      </div>

      {showVerified && (
        <div className="filter-group">
          <div className="filter-label">Verifica</div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={e => setVerifiedOnly(e.target.checked)}
            />
            <span>Solo verificati</span>
          </label>
        </div>
      )}

      {hasFilters && (
        <button className="reset-btn" onClick={reset}>✕ Reset</button>
      )}
    </div>
  );
}

// ========================================================
// VIEW: TUTTI I TEMPI
// ========================================================
function AllLapsView({ simFilter, trackFilter, carFilter, verifiedOnly }) {
  const { data: laps, isLoading } = useBestLaps();
  const { data: drivers } = useDrivers();

  const driverMap = useMemo(() => {
    const m = {};
    (drivers || []).forEach(d => { m[d.driver_id] = d; });
    return m;
  }, [drivers]);

  const filtered = useMemo(() => {
    if (!laps) return [];
    return laps.filter(l => {
      if (simFilter !== 'all' && l.sim !== simFilter) return false;
      if (trackFilter !== 'all' && l.track_id !== trackFilter) return false;
      if (carFilter !== 'all' && l.car_id !== carFilter) return false;
      if (verifiedOnly && !l.verified_by) return false;
      return true;
    });
  }, [laps, simFilter, trackFilter, carFilter, verifiedOnly]);

  const referenceMs = filtered[0]?.lap_time_ms;

  if (isLoading) {
    return (
      <div className="data-table-wrap">
        <div className="skeleton-block" style={{ minHeight: 320 }} />
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="page-stub">
        <div className="page-stub-icon">∅</div>
        <div className="page-stub-title">Nessun tempo trovato</div>
        <div className="page-stub-text">Allenta i filtri per vedere più risultati.</div>
      </div>
    );
  }

  return (
    <div className="data-table-wrap">
      <table className="data-table laps-table">
        <thead>
          <tr>
            <th className="col-pos">#</th>
            <th>Sim</th>
            <th>Pilota</th>
            <th>Tracciato</th>
            <th>Auto</th>
            <th className="num">Tempo</th>
            <th className="num">Gap</th>
            <th>Cond.</th>
            <th>Verifica</th>
            <th>Data</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((lap, idx) => {
            const driver = driverMap[lap.driver_id];
            const podium = idx < 3;
            return (
              <tr key={lap.lap_id} className={podium ? `is-podium pos-${idx + 1}` : ''}>
                <td className="col-pos"><span className="pos-badge">{idx + 1}</span></td>
                <td><SimBadge sim={lap.sim} size="sm" /></td>
                <td>
                  {driver ? (
                    <Link to={`/roster/${driver.driver_id}`} className="driver-link">
                      <Avatar name={driver.display_name} driverId={driver.driver_id} size={28} />
                      <span className="driver-link-name">{driver.display_name}</span>
                    </Link>
                  ) : lap.driver_id}
                </td>
                <td className="cell-track">{formatTrack(lap.track_id)}</td>
                <td className="cell-car">{formatCar(lap.car_id)}</td>
                <td className="num">
                  <LapTime ms={lap.lap_time_ms} emphasis={idx === 0 ? 'best' : 'normal'} size="md" />
                </td>
                <td className="num cell-gap">
                  {idx === 0 ? '—' : formatLapDelta(lap.lap_time_ms, referenceMs)}
                </td>
                <td>
                  <span className={`cond-tag cond-${lap.conditions}`}>{lap.conditions}</span>
                </td>
                <td>
                  {lap.verified_by ? <span className="verify-yes">✓</span> : <span className="verify-no">—</span>}
                </td>
                <td className="cell-date">{formatDate(lap.set_date)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ========================================================
// VIEW: LEADERBOARD
// ========================================================
function LeaderboardView({ sim, trackId, carId }) {
  const needsSim = sim === 'all';
  const needsTrack = trackId === 'all';
  const needsSelection = needsSim || needsTrack;

  const { data: leaderboard, isLoading } = useLeaderboard(
    needsSim ? null : sim,
    needsTrack ? null : trackId,
    carId === 'all' ? null : carId,
  );
  const { data: drivers } = useDrivers();

  const driverMap = useMemo(() => {
    const m = {};
    (drivers || []).forEach(d => { m[d.driver_id] = d; });
    return m;
  }, [drivers]);

  if (needsSelection) {
    return (
      <div className="leaderboard-prompt">
        <div className="leaderboard-prompt-icon">◈</div>
        <div className="leaderboard-prompt-title">Seleziona un combo per il leaderboard</div>
        <div className="leaderboard-prompt-text">
          Scegli almeno {needsSim && 'un simulatore'}{needsSim && needsTrack && ' e '}
          {needsTrack && 'un tracciato'}.
          <br />
          Suggerito: aggiungi anche un'auto per confronti significativi (es. solo GT3).
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="data-table-wrap">
        <div className="skeleton-block" style={{ minHeight: 240 }} />
      </div>
    );
  }

  if (!leaderboard || leaderboard.length === 0) {
    return (
      <div className="page-stub">
        <div className="page-stub-icon">∅</div>
        <div className="page-stub-title">Nessun tempo per questo combo</div>
        <div className="page-stub-text">Prova un'altra combinazione.</div>
      </div>
    );
  }

  const referenceMs = leaderboard[0].lap_time_ms;

  return (
    <>
      <div className="leaderboard-header">
        <div className="lh-context">
          <SimBadge sim={sim} variant="solid" />
          <span className="lh-track">{formatTrack(trackId)}</span>
          {carId !== 'all' && (
            <>
              <span className="lh-divider">·</span>
              <span className="lh-car">{formatCar(carId)}</span>
            </>
          )}
        </div>
        <div className="lh-meta">{leaderboard.length} piloti</div>
      </div>

      <div className="data-table-wrap">
        <table className="data-table laps-table">
          <thead>
            <tr>
              <th className="col-pos">#</th>
              <th>Pilota</th>
              {carId === 'all' && <th>Auto</th>}
              <th className="num">Best Lap</th>
              <th className="num">Gap</th>
              <th>Cond.</th>
              <th>Verifica</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((lap, idx) => {
              const driver = driverMap[lap.driver_id];
              const podium = idx < 3;
              return (
                <tr key={lap.lap_id} className={podium ? `is-podium pos-${idx + 1}` : ''}>
                  <td className="col-pos"><span className="pos-badge">{idx + 1}</span></td>
                  <td>
                    {driver ? (
                      <Link to={`/roster/${driver.driver_id}`} className="driver-link">
                        <Avatar name={driver.display_name} driverId={driver.driver_id} size={32} />
                        <span className="driver-link-name">{driver.display_name}</span>
                      </Link>
                    ) : lap.driver_id}
                  </td>
                  {carId === 'all' && <td className="cell-car">{formatCar(lap.car_id)}</td>}
                  <td className="num">
                    <LapTime ms={lap.lap_time_ms} emphasis={idx === 0 ? 'best' : 'normal'} size="md" />
                  </td>
                  <td className="num cell-gap">
                    {idx === 0 ? '—' : formatLapDelta(lap.lap_time_ms, referenceMs)}
                  </td>
                  <td>
                    <span className={`cond-tag cond-${lap.conditions}`}>{lap.conditions}</span>
                  </td>
                  <td>
                    {lap.verified_by ? <span className="verify-yes">✓</span> : <span className="verify-no">—</span>}
                  </td>
                  <td className="cell-date">{formatDate(lap.set_date)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}