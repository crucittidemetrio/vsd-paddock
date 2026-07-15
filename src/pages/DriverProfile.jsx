import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDriver } from '../hooks/useRoster';
import { useBestLaps } from '../hooks/useBestLaps';
import { useRaces, useReports } from '../hooks/useRaces';
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
  const [showAllLaps, setShowAllLaps] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  const { data: driver, isLoading, error } = useDriver(driverId);
  const { data: laps } = useBestLaps({ driver_id: driverId });
  const { data: reports } = useReports({ driver_id: driverId });
  const { data: tracks = [] } = useTracks();
  const { data: cars = [] } = useCars();
  const { data: raceResultsData } = useMyRecentRaceResults(driverId, 200);
  const raceResults = raceResultsData?.results || [];
  const { data: allRaces } = useRaces();
  const racesById = useMemo(() => {
    const m = {};
    (allRaces || []).forEach(r => { m[r.race_id] = r; });
    return m;
  }, [allRaces]);

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

  // Wave 9.8.X: Storico Gare unificato da raceResults (autoritativo) + reports (legacy)
  // - raceResults: tutte le righe non-DNS (gare effettivamente disputate, incluse DNF)
  // - reports: legacy, hanno info extra (grid_position, incidents, strategy_notes)
  // - Dedup per race_id: reports ha precedenza se esiste (più info), ma set_date e dnf
  //   dal raceResult (autoritativo)
  // - Sort per set_date desc
  const historyRaces = useMemo(() => {
    const fromResults = raceResults
      .filter(r => !r.dns)
      .map(r => ({
        race_id: r.race_id,
        set_date: r.set_date,
        finish_position: r.finish_position,
        best_lap_ms: r.best_lap_ms,
        dnf: r.dnf,
        grid_position: null,
        incidents: null,
        strategy_notes: null,
        source: 'result',
      }));

    const fromReports = (reports || []).map(r => ({
      race_id: r.race_id,
      set_date: r.set_date || null,
      finish_position: r.finish_position,
      best_lap_ms: r.best_lap_ms,
      dnf: false,
      grid_position: r.grid_position,
      incidents: r.incidents,
      strategy_notes: r.strategy_notes,
      source: 'report',
    }));

    const map = new Map();
    fromResults.forEach(r => map.set(r.race_id, r));
    fromReports.forEach(r => {
      const existing = map.get(r.race_id);
      if (existing) {
        // Mantieni set_date e dnf dal raceResult (autoritativo), il resto dal report
        r.set_date = existing.set_date || r.set_date;
        r.dnf = existing.dnf;
      }
      map.set(r.race_id, r);
    });

    return Array.from(map.values()).sort(
      (a, b) => String(b.set_date || '').localeCompare(String(a.set_date || ''))
    );
  }, [raceResults, reports]);

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
  const isExVsd = !!(driver.is_ex_vsd || driver.removed_at);
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
              <span className="hero-id">
                {driver.race_number != null && driver.race_number !== ''
                  ? `#${driver.race_number}`
                  : driver.driver_id}
              </span>
              <span className="hero-divider" />
              {isExVsd ? (
                <div className="hero-ex-block">
                  <span className="hero-ex-badge">EX VSD</span>
                  {driver.removed_at && (
                    <span className="hero-ex-date">
                      {new Date(driver.removed_at).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </span>
                  )}
                </div>
              ) : (
                <StatusDot status={driver.status} withLabel />
              )}
              {isStaff && !isExVsd && (
                <>
                  <span className="hero-divider" />
                  <span className="hero-role-tag">{roleLabel.toUpperCase()}</span>
                </>
              )}
              {driver.nationality && (
                <>
                  <span className="hero-divider" />
                  <span className="hero-nationality">{driver.nationality}</span>
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

            <div className="hero-actions">
              <Link to={`/compare?a=${driver.driver_id}`} className="hero-compare-btn">
                ⚖ Sfida
              </Link>
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

      {/* FORMA RECENTE */}
      {historyRaces.length > 0 && (
        <div className="form-recente-wrap">
          <div className="form-recente-label">Forma recente</div>
          <div className="form-recente-strip">
            {historyRaces.slice(0, 5).map((r, i) => {
              const raceName = racesById[r.race_id]?.race_name || r.race_id;
              const pos = r.finish_position;
              const cls = r.dnf
                ? 'form-dnf'
                : pos === 1 ? 'form-p1'
                : pos <= 3  ? 'form-podium'
                : pos <= 10 ? 'form-normal'
                : 'form-dim';
              const label = r.dnf ? 'DNF' : pos ? `P${pos}` : '?';
              return (
                <Link
                  key={r.race_id + i}
                  to={`/race/${r.race_id}`}
                  className={`form-badge ${cls}`}
                  title={raceName}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* CLASSI DOMINANTI */}
      <MyDominantClassesWidget driverId={driverId} />

      {/* BEST LAPS PERSONALI */}
      <section className="profile-section">
        <div className="section-head">
          <h3 className="section-title">Best Laps Personali</h3>
          <span className="section-meta">{uniqueLaps.length} tempi registrati</span>
        </div>

        {uniqueLaps.length > 0 ? (
          <>
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
                  {(showAllLaps ? uniqueLaps : uniqueLaps.slice(0, 10)).map((lap, idx) => (
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
            {uniqueLaps.length > 10 && (
              <button className="show-all-btn" onClick={() => setShowAllLaps(v => !v)}>
                {showAllLaps ? '▲ Mostra meno' : `▼ Mostra tutti (${uniqueLaps.length})`}
              </button>
            )}
          </>
        ) : (
          <div className="empty-state">Nessun tempo registrato.</div>
        )}
      </section>

      {/* RACE HISTORY */}
      <section className="profile-section">
        <div className="section-head">
          <h3 className="section-title">Storico Gare</h3>
          <span className="section-meta">{historyRaces.length} gare</span>
        </div>

        {historyRaces.length > 0 ? (
          <>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Gara</th>
                    <th>Sim</th>
                    <th className="num">Griglia</th>
                    <th className="num">Arrivo</th>
                    <th className="num">Best Lap</th>
                    <th className="num">Inc.</th>
                  </tr>
                </thead>
                <tbody>
                  {(showAllHistory ? historyRaces : historyRaces.slice(0, 10)).map(r => {
                    const race = racesById[r.race_id];
                    const delta = r.grid_position != null && r.finish_position != null
                      ? r.grid_position - r.finish_position
                      : null;
                    return (
                      <tr key={r.race_id}>
                        <td className="cell-date">{formatDate(r.set_date) || '—'}</td>
                        <td className="cell-race">
                          <Link to={`/race/${r.race_id}`} className="cell-race-link">
                            {race?.race_name || r.race_id}
                          </Link>
                        </td>
                        <td>
                          {race?.sim ? <SimBadge sim={race.sim} size="sm" /> : '—'}
                        </td>
                        <td className="num">
                          {r.grid_position != null ? r.grid_position : '—'}
                        </td>
                        <td className="num">
                          {r.dnf ? (
                            <span className="finish-pos finish-dnf">DNF</span>
                          ) : r.finish_position != null ? (
                            <>
                              <span className={`finish-pos${r.finish_position <= 3 ? ' is-podium' : ''}`}>
                                P{r.finish_position}
                              </span>
                              {delta != null && delta !== 0 && (
                                <span className={`pos-delta${delta > 0 ? ' is-gain' : ' is-loss'}`}>
                                  {delta > 0 ? `+${delta}` : delta}
                                </span>
                              )}
                            </>
                          ) : '—'}
                        </td>
                        <td className="num">
                          <LapTime ms={r.best_lap_ms} size="sm" />
                        </td>
                        <td className="num">
                          {r.incidents != null ? (
                            <span className={r.incidents > 0 ? 'inc-bad' : 'inc-clean'}>
                              {r.incidents}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {historyRaces.length > 10 && (
              <button className="show-all-btn" onClick={() => setShowAllHistory(v => !v)}>
                {showAllHistory ? '▲ Mostra meno' : `▼ Mostra tutte (${historyRaces.length})`}
              </button>
            )}
          </>
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
