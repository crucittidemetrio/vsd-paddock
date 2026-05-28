import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDriver } from '../hooks/useRoster';
import { useBestLaps } from '../hooks/useBestLaps';
import { useReports } from '../hooks/useRaces';
import { useMyRecentRaceResults } from '../hooks/useRaceResults';
import { useTracks, useCars } from '../hooks/useLookups';
import Avatar from '../components/shared/Avatar';
import SimBadge from '../components/shared/SimBadge';
import StatusDot from '../components/shared/StatusDot';
import LapTime from '../components/shared/LapTime';
import MyDominantClassesWidget from '../components/dashboard/MyDominantClassesWidget';
import { ROLES } from '../utils/constants';
import { formatTrack, formatCar, formatDate } from '../utils/format';
import './DriverProfile.css';
import './Page.css';

export default function DriverProfile() {
  const { driverId } = useParams();
  const { data: driver, isLoading, error } = useDriver(driverId);
  const { data: laps } = useBestLaps({ driver_id: driverId });
  const { data: reports } = useReports({ driver_id: driverId });
  const { data: tracks = [] } = useTracks();
  const { data: cars = [] } = useCars();
  const { data: raceResultsData } = useMyRecentRaceResults(driverId, 200);
  const raceResults = raceResultsData?.results || [];

  // Dedup per (sim, track_id, car_id): i raceLaps generano entries multiple
  // (qualifying + race) sulla stessa combo. Deve stare PRIMA degli early return
  // per rispettare le React hooks rules.
  const uniqueLaps = useMemo(() => {
    const map = {};
    (laps || []).forEach(l => {
      const key = `${l.sim}__${l.track_id}__${l.car_id}`;
      const t = Number(l.lap_time_ms);
      const current = map[key];
      if (!current || Number(current.lap_time_ms) > t) {
        map[key] = l;
      }
    });
    return Object.values(map).sort(
      (a, b) => Number(a.lap_time_ms) - Number(b.lap_time_ms)
    );
  }, [laps]);

  if (isLoading) {
    return (
      <div className="page">
        <div className="profile-hero skeleton-block" />
      </div>
    );
  }

  if (error || !driver) {
    return (
      <div className="page">
        <div className="page-stub">
          <div className="page-stub-icon">⚠</div>
          <div className="page-stub-title">Pilota non trovato</div>
          <div className="page-stub-text">
            <Link to="/roster">← Torna al roster</Link>
          </div>
        </div>
      </div>
    );
  }

  const sims = (driver.preferred_sims || '').split(',').filter(Boolean);
  const specs = (driver.specialties || '').split(',').filter(Boolean);
  const isStaff = driver.role === ROLES.STAFF || driver.role === ROLES.ADMIN;
  const roleLabel =
    driver.role === ROLES.ADMIN ? 'Team Principal' :
    driver.role === ROLES.STAFF ? 'Staff' : 'Pilota';

  const totalLaps = uniqueLaps.length;
  const verifiedLaps = uniqueLaps.filter(l => !!l.verified_by).length;
  // Gare/podi/vittorie: max tra RaceResults (autoritative) e RaceReports (legacy)
  const racesFromResults = new Set(raceResults.map(r => r.race_id)).size;
  const racesFromReports = new Set((reports || []).map(r => r.race_id)).size;
  const racesCount = Math.max(racesFromResults, racesFromReports);

  const podiumsFromResults = raceResults.filter(r =>
    !r.dns && !r.dnf && typeof r.finish_position === 'number' && r.finish_position <= 3
  ).length;
  const podiumsFromReports = (reports || []).filter(r =>
    typeof r.finish_position === 'number' && r.finish_position <= 3
  ).length;
  const podiums = Math.max(podiumsFromResults, podiumsFromReports);

  const winsFromResults = raceResults.filter(r =>
    !r.dns && !r.dnf && r.finish_position === 1
  ).length;
  const winsFromReports = (reports || []).filter(r => r.finish_position === 1).length;
  const wins = Math.max(winsFromResults, winsFromReports);

  // Wave 9.8 deliverable 2: posizione media + punti totali
  // Posizione media calcolata SOLO da RaceResults (no fallback a reports legacy):
  // i RaceResults sono il dato autoritativo, e usare le due fonti darebbe
  // medie incoerenti se i counts non combaciano.
  const validRaces = raceResults.filter(r =>
    !r.dns && !r.dnf && typeof r.finish_position === 'number'
  );
  const avgPosition = validRaces.length > 0
    ? (validRaces.reduce((sum, r) => sum + r.finish_position, 0) / validRaces.length).toFixed(1)
    : '—';

  // Punti totali: somma di point_total (già netto di penalty_points dal sheet).
  // Include DNS/DNF perché possono avere penalty_points (point_total negativo).
  const totalPoints = raceResults.reduce(
    (sum, r) => sum + (typeof r.point_total === 'number' ? r.point_total : 0),
    0
  );

  return (
    <div className="page">
      <div className="profile-back">
        <Link to="/roster" className="back-link">← Roster</Link>
      </div>

      {/* HERO */}
      <div className="profile-hero">
        <div className="hero-bg-glow" />
        <div className="hero-content">
          <Avatar
            name={driver.display_name}
            driverId={driver.driver_id}
            size={120}
            ring
          />
          <div className="hero-info">
            <div className="hero-meta-line">
              <span className="hero-id">{driver.driver_id}</span>
              <span className="hero-divider" />
              <StatusDot status={driver.status} withLabel />
              {isStaff && (
                <>
                  <span className="hero-divider" />
                  <span className="hero-role-tag">{roleLabel.toUpperCase()}</span>
                </>
              )}
            </div>
            <h1 className="hero-name">{driver.display_name}</h1>
            {driver.real_name && driver.real_name !== driver.display_name && (
              <div className="hero-realname">{driver.real_name}</div>
            )}
            {driver.bio && <p className="hero-bio">{driver.bio}</p>}

            <div className="hero-tags">
              <div className="tags-group">
                <div className="tags-label">SIM</div>
                <div className="tags-row">
                  {sims.map(s => <SimBadge key={s} sim={s.trim()} />)}
                </div>
              </div>
              {specs.length > 0 && (
                <div className="tags-group">
                  <div className="tags-label">Specialità</div>
                  <div className="tags-row">
                    {specs.map(s => (
                      <span key={s} className="hero-spec">{s.trim()}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* STATS */}
      <div className="stats-grid">
        <StatCard label="Best Laps" value={totalLaps} sub={`${verifiedLaps} verificati`} />
        <StatCard label="Gare disputate" value={racesCount} sub="totali" />
        <StatCard label="Podi" value={podiums} sub={`${wins} vittorie`} accent="orange" />
        <StatCard
          label="Posizione media"
          value={avgPosition}
          sub={`${validRaces.length} gare valide`}
        />
        <StatCard
          label="Punti totali"
          value={totalPoints}
          sub="stagione corrente"
          accent="orange"
        />
        <StatCard label="Membro dal" value={driver.join_date?.split('-')[0] || '—'} sub="anno entrata" />
      </div>

      {/* CLASSI DOMINANTI */}
      <MyDominantClassesWidget driverId={driverId} />

      {/* BEST LAPS PERSONALI */}
      <section className="profile-section">
        <div className="section-head">
          <h3 className="section-title">Best Laps Personali</h3>
          <span className="section-meta">{uniqueLaps.length} tempi registrati</span>
        </div>

        {uniqueLaps.length > 0 ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Sim</th>
                  <th>Tracciato</th>
                  <th>Auto</th>
                  <th className="num">Tempo</th>
                  <th>Cond.</th>
                  <th>Verifica</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {uniqueLaps.slice(0, 10).map((lap, idx) => (
                  <tr key={lap.lap_id}>
                    <td><SimBadge sim={lap.sim} size="sm" /></td>
                    <td className="cell-track">{formatTrack(lap.track_id, tracks)}</td>
                    <td className="cell-car">{formatCar(lap.car_id, cars)}</td>
                    <td className="num">
                      <LapTime
                        ms={lap.lap_time_ms}
                        emphasis={idx === 0 ? 'best' : 'normal'}
                        size="md"
                      />
                    </td>
                    <td>
                      <span className={`cond-tag cond-${lap.conditions}`}>
                        {lap.conditions}
                      </span>
                    </td>
                    <td>
                      {lap.verified_by ? (
                        <span className="verify-yes">✓ verificato</span>
                      ) : (
                        <span className="verify-no">in attesa</span>
                      )}
                    </td>
                    <td className="cell-date">{formatDate(lap.set_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">Nessun tempo registrato.</div>
        )}
      </section>

      {/* RACE HISTORY */}
      <section className="profile-section">
        <div className="section-head">
          <h3 className="section-title">Storico Gare</h3>
          <span className="section-meta">{reports?.length || 0} report</span>
        </div>

        {reports && reports.length > 0 ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Gara</th>
                  <th className="num">Griglia</th>
                  <th className="num">Arrivo</th>
                  <th className="num">Best Lap</th>
                  <th className="num">Inc.</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {reports.slice(0, 5).map(r => {
                  const delta = r.grid_position - r.finish_position;
                  return (
                    <tr key={r.report_id}>
                      <td className="cell-race">{r.race_id}</td>
                      <td className="num">{r.grid_position}</td>
                      <td className="num">
                        <span className={`finish-pos${r.finish_position <= 3 ? ' is-podium' : ''}`}>
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">Nessuna gara disputata.</div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value, sub, accent = 'cyan' }) {
  return (
    <div className={`stat-card stat-accent-${accent}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}
