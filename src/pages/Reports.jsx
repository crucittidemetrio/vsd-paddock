import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useReports, useRaces } from '../hooks/useRaces';
import { useDrivers } from '../hooks/useRoster';
import { useAuth } from '../hooks/useAuth';
import Avatar from '../components/shared/Avatar';
import SimBadge from '../components/shared/SimBadge';
import LapTime from '../components/shared/LapTime';
import { useConsentSocialFlags, useConsentedDriverPhoto } from '../hooks/useConsent';
import { resolvePhotoUrl } from '../utils/driverPhotos';
import { formatTrack, formatDate } from '../utils/format';
import './Reports.css';
import './Page.css';

const VIEWS = [
  { id: 'by-race', label: 'Per gara' },
  { id: 'flat', label: 'Cronologico' },
];

export default function Reports() {
  const [view, setView] = useState('by-race');
  const [driverFilter, setDriverFilter] = useState('all');
  const { isStaff } = useAuth();

  const { data: reports, isLoading } = useReports();
  const { data: races } = useRaces();
  const { data: drivers } = useDrivers();

  const driverMap = useMemo(() => {
    const m = {};
    (drivers || []).forEach(d => { m[d.driver_id] = d; });
    return m;
  }, [drivers]);

  const raceMap = useMemo(() => {
    const m = {};
    (races || []).forEach(r => { m[r.race_id] = r; });
    return m;
  }, [races]);

  const filtered = useMemo(() => {
    if (!reports) return [];
    return reports.filter(r => {
      if (driverFilter !== 'all' && r.driver_id !== driverFilter) return false;
      return true;
    });
  }, [reports, driverFilter]);

  // Raggruppa per gara
  const grouped = useMemo(() => {
    const groups = {};
    filtered.forEach(r => {
      if (!groups[r.race_id]) groups[r.race_id] = [];
      groups[r.race_id].push(r);
    });
    // Ordina report dentro ogni gara per finish_position
    Object.values(groups).forEach(arr => {
      arr.sort((a, b) => a.finish_position - b.finish_position);
    });
    // Trasforma in array, ordina gare per data race desc
    return Object.entries(groups)
      .map(([race_id, rows]) => ({
        race: raceMap[race_id],
        race_id,
        rows,
      }))
      .sort((a, b) => {
        const da = a.race?.date ? new Date(a.race.date) : 0;
        const db = b.race?.date ? new Date(b.race.date) : 0;
        return db - da;
      });
  }, [filtered, raceMap]);

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-eyebrow">RACE REPORT</div>
        <h1 className="page-title">Report Post-Gara</h1>
        <p className="page-sub">
          {reports?.length || 0} report totali ·{' '}
          {grouped.length} {grouped.length === 1 ? 'gara' : 'gare'}
        </p>
      </div>

      {/* CONTROLS */}
      <div className="reports-controls">
        <div className="view-switch">
          {VIEWS.map(v => (
            <button
              key={v.id}
              className={`view-switch-btn${view === v.id ? ' is-active' : ''}`}
              onClick={() => setView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="filter-group">
          <div className="filter-label">Filtra pilota</div>
          <select
            className="filter-select"
            value={driverFilter}
            onChange={e => setDriverFilter(e.target.value)}
          >
            <option value="all">Tutti i piloti</option>
            {drivers?.map(d => (
              <option key={d.driver_id} value={d.driver_id}>
                {d.display_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* CONTENT */}
      {isLoading && (
        <div className="skeleton-block" style={{ minHeight: 240 }} />
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="page-stub">
          <div className="page-stub-icon">∅</div>
          <div className="page-stub-title">Nessun report</div>
          <div className="page-stub-text">
            {driverFilter !== 'all' ? 'Cambia filtro pilota.' : 'I report appariranno qui dopo le gare.'}
          </div>
        </div>
      )}

      {!isLoading && view === 'by-race' && grouped.map(group => (
        <RaceGroup
          key={group.race_id}
          race={group.race}
          rows={group.rows}
          driverMap={driverMap}
          isStaff={isStaff}
        />
      ))}

      {!isLoading && view === 'flat' && (
        <div className="reports-flat">
          {filtered
            .slice()
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .map(r => (
              <ReportCard
                key={r.report_id}
                report={r}
                race={raceMap[r.race_id]}
                driver={driverMap[r.driver_id]}
                isStaff={isStaff}
              />
            ))
          }
        </div>
      )}
    </div>
  );
}

// =====================================================
// RACE GROUP — tutti i report di una gara, raggruppati
// =====================================================
function RaceGroup({ race, rows, driverMap, isStaff }) {
  const { data: socialFlagsData } = useConsentSocialFlags();
  const socialFlags = socialFlagsData?.flags || {};
  if (!race) return null;
  const podiums = rows.filter(r => r.finish_position <= 3).length;

  return (
    <section className="race-group">
      <div className="race-group-head">
        <div className="rg-context">
          <SimBadge sim={race.sim} variant="solid" size="sm" />
          <div className="rg-titles">
            <div className="rg-title">{race.title}</div>
            <div className="rg-meta">
              {formatTrack(race.track_id)} · {formatDate(race.date)} · {rows.length} {rows.length === 1 ? 'report' : 'report'}
              {podiums > 0 && ` · ${podiums} sul podio`}
            </div>
          </div>
        </div>
      </div>

      <div className="data-table-wrap">
        <table className="data-table reports-table">
          <thead>
            <tr>
              <th>Pilota</th>
              <th className="num">Griglia</th>
              <th className="num">Arrivo</th>
              <th className="num">Best Lap</th>
              <th className="num">Inc.</th>
              <th>Strategia</th>
              {isStaff && <th className="num">Rating</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const d = driverMap[r.driver_id];
              const delta = r.grid_position - r.finish_position;
              const isPodium = r.finish_position <= 3;
              return (
                <tr key={r.report_id}>
                  <td>
                    {d ? (
                      <Link to={`/roster/${d.driver_id}`} className="driver-link">
                        <Avatar name={d.display_name} driverId={d.driver_id} size={28} photoUrl={resolvePhotoUrl(d.driver_id, socialFlags)} />
                        <span className="driver-link-name">{d.display_name}</span>
                      </Link>
                    ) : r.driver_id}
                  </td>
                  <td className="num">{r.grid_position}</td>
                  <td className="num">
                    <span className={`finish-pos${isPodium ? ' is-podium' : ''}`}>
                      P{r.finish_position}
                    </span>
                    {delta !== 0 && (
                      <span className={`pos-delta${delta > 0 ? ' is-gain' : ' is-loss'}`}>
                        {delta > 0 ? `+${delta}` : delta}
                      </span>
                    )}
                  </td>
                  <td className="num">
                    <LapTime ms={r.best_lap_ms} size="sm" />
                  </td>
                  <td className="num">
                    <span className={r.incidents > 0 ? 'inc-bad' : 'inc-clean'}>
                      {r.incidents}
                    </span>
                  </td>
                  <td className="cell-notes">{r.strategy_notes || '—'}</td>
                  {isStaff && (
                    <td className="num">
                      <RatingStars value={r.staff_rating} />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// =====================================================
// FLAT REPORT CARD — singolo report (vista cronologica)
// =====================================================
function ReportCard({ report, race, driver, isStaff }) {
  const photoUrl = useConsentedDriverPhoto(driver?.driver_id);
  if (!race || !driver) return null;
  const delta = report.grid_position - report.finish_position;
  const isPodium = report.finish_position <= 3;

  return (
    <div className="report-card">
      <div className="rc-head">
        <Link to={`/roster/${driver.driver_id}`} className="driver-link">
          <Avatar name={driver.display_name} driverId={driver.driver_id} size={40} ring={isPodium} photoUrl={photoUrl} />
          <div className="rc-driver-block">
            <div className="rc-driver-name">{driver.display_name}</div>
            <div className="rc-race-context">
              <SimBadge sim={race.sim} size="sm" />
              <span className="rc-race-title">{race.title}</span>
            </div>
          </div>
        </Link>
        <div className="rc-finish">
          <div className="rc-finish-row">
            <span className={`finish-pos rc-pos${isPodium ? ' is-podium' : ''}`}>
              P{report.finish_position}
            </span>
            {delta !== 0 && (
              <span className={`pos-delta${delta > 0 ? ' is-gain' : ' is-loss'}`}>
                {delta > 0 ? `+${delta}` : delta}
              </span>
            )}
          </div>
          <div className="rc-grid">da P{report.grid_position}</div>
        </div>
      </div>

      <div className="rc-stats">
        <RcStat label="Best Lap" value={<LapTime ms={report.best_lap_ms} size="sm" />} />
        <RcStat label="Incidenti" value={
          <span className={report.incidents > 0 ? 'inc-bad' : 'inc-clean'}>
            {report.incidents}
          </span>
        } />
        {isStaff && <RcStat label="Rating Staff" value={<RatingStars value={report.staff_rating} />} />}
        <RcStat label="Data" value={<span className="cell-date">{formatDate(report.created_at)}</span>} />
      </div>

      {(report.strategy_notes || report.incident_notes) && (
        <div className="rc-notes">
          {report.strategy_notes && (
            <div className="rc-note-block">
              <div className="rc-note-label">Strategia</div>
              <div className="rc-note-text">{report.strategy_notes}</div>
            </div>
          )}
          {report.incident_notes && (
            <div className="rc-note-block">
              <div className="rc-note-label">Incidenti</div>
              <div className="rc-note-text">{report.incident_notes}</div>
            </div>
          )}
        </div>
      )}

      {isStaff && report.staff_notes && (
        <div className="rc-staff-notes">
          <span className="staff-tag">STAFF</span> {report.staff_notes}
        </div>
      )}
    </div>
  );
}

function RcStat({ label, value }) {
  return (
    <div className="rc-stat">
      <div className="rc-stat-label">{label}</div>
      <div className="rc-stat-value">{value}</div>
    </div>
  );
}

function RatingStars({ value = 0 }) {
  const max = 5;
  return (
    <span className="rating-stars" title={`${value}/${max}`}>
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className={`star${i < value ? ' is-on' : ''}`}>★</span>
      ))}
    </span>
  );
}