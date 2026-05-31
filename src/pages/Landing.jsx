import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useRaces, useUpcomingRaces, useReports } from '../hooks/useRaces';
import { useBestLaps } from '../hooks/useBestLaps';
import { useDrivers } from '../hooks/useRoster';
import { useTracks } from '../hooks/useLookups';
import { useMyRecentRaceResults, useRecentTeamRaceResults } from '../hooks/useRaceResults';
import SimBadge from '../components/shared/SimBadge';
import CountdownLive from '../components/shared/CountdownLive';
import LapTime from '../components/shared/LapTime';
import Avatar from '../components/shared/Avatar';
import MyDominantClassesWidget from '../components/dashboard/MyDominantClassesWidget';
import {
  formatTrack, formatRaceDateTime, formatDuration, formatDate,
} from '../utils/format';
import { ROLES, DRIVER_STATUS, SESSION_TYPE_LABELS } from '../utils/constants';
import './Landing.css';
import './Page.css';

export default function Landing() {
  const { driver, isStaff } = useAuth();
  const { data: upcoming } = useUpcomingRaces();
  const { data: myLaps } = useBestLaps({ driver_id: driver?.driver_id });
  const { data: allRaces } = useRaces();
  const racesById = useMemo(() => {
    const m = {};
    (allRaces || []).forEach(r => { m[r.race_id] = r; });
    return m;
  }, [allRaces]);
  const { data: myReports } = useReports({ driver_id: driver?.driver_id });
  const { data: drivers } = useDrivers();
  const { data: allLaps } = useBestLaps();
  const { data: allReports } = useReports();
  const { data: tracks = [] } = useTracks();

  // NEW: race results
  // limit alto per counter accurato (il feed "Ultimo risultato" usa solo [0])
  const { data: myRaceResultsData } = useMyRecentRaceResults(driver?.driver_id, 200);
  const myRaceResults = myRaceResultsData?.results || [];
  const lastResult = myRaceResults[0];

  const { data: allRaceResultsData } = useRecentTeamRaceResults(20);
  const allRaceResults = allRaceResultsData?.results || [];

  const driverMap = useMemo(() => {
    const m = {};
    (drivers || []).forEach(d => { m[d.driver_id] = d; });
    return m;
  }, [drivers]);

  const nextRace = upcoming?.[0];
  const isUserInNextRace = nextRace?.entries?.includes(driver?.driver_id);

// My stats — dedup per (sim, track_id, car_id): un raceLap genera entries multiple
  // (qualifying + race) sulla stessa combo, vanno contate come una sola best lap.
  const myUniqueLaps = useMemo(() => {
    const map = {};
    (myLaps || []).forEach(l => {
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
  }, [myLaps]);
  const totalLaps = myUniqueLaps.length;
  const verifiedLaps = myUniqueLaps.filter(l => !!l.verified_by).length;
  // Conta gare disputate da RaceResults se disponibile, altrimenti fallback su reports
  const racesFromResults = new Set(myRaceResults.map(r => r.race_id)).size;
  const racesFromReports = new Set((myReports || []).map(r => r.race_id)).size;
  const racesCount = Math.max(racesFromResults, racesFromReports);
  // Podi da RaceResults se disponibile, altrimenti fallback su reports
  const podiumsFromResults = myRaceResults.filter(r =>
    !r.dns && !r.dnf && typeof r.finish_position === 'number' && r.finish_position <= 3
  ).length;
  const podiumsFromReports = (myReports || []).filter(r =>
    typeof r.finish_position === 'number' && r.finish_position <= 3
  ).length;
  const podiums = Math.max(podiumsFromResults, podiumsFromReports);

  // Activity feed: laps + reports + raceResults, dedup report/result sulla stessa gara+pilota
  const feed = useMemo(() => {
    const items = [];
    (allLaps || []).forEach(l => {
      items.push({
        type: 'lap',
        ts: new Date(l.created_at).getTime(),
        data: l,
      });
    });

    // Dedup: se esiste un RaceResult per la stessa coppia race_id+driver_id, skippiamo il report
    const resultsKeySet = new Set(
      (allRaceResults || []).map(rr => `${rr.race_id}__${rr.driver_id}`)
    );
    (allReports || []).forEach(r => {
      const key = `${r.race_id}__${r.driver_id}`;
      if (resultsKeySet.has(key)) return; // hidden in favor of RaceResult event
      items.push({
        type: 'report',
        ts: new Date(r.created_at).getTime(),
        data: r,
      });
    });

    (allRaceResults || []).forEach(rr => {
      items.push({
        type: 'raceResult',
        ts: new Date(rr.set_date).getTime(),
        data: rr,
      });
    });

    return items.sort((a, b) => b.ts - a.ts).slice(0, 8);
  }, [allLaps, allReports, allRaceResults]);

  // Staff metrics
  const pendingLaps = useMemo(
    () => (allLaps || []).filter(l => !l.verified_by),
    [allLaps]
  );
  const trialDrivers = useMemo(
    () => (drivers || []).filter(d => d.status === DRIVER_STATUS.TRIAL),
    [drivers]
  );

  const firstName = driver?.display_name?.split(' ')[0] || 'pilota';

  return (
    <div className="page mc-page">
      {/* HERO */}
      <section className="mc-hero">
        <div className="mc-hero-glow" />
        <div className="mc-hero-content">
          <div className="mc-hero-eyebrow">MISSION CONTROL</div>
          <h1 className="mc-hero-title">
            Bentornato, <span className="mc-hero-name">{firstName}</span>
          </h1>
          <p className="mc-hero-sub">
            {isStaff
              ? `Sei loggato come ${driver?.role === ROLES.ADMIN ? 'Team Principal' : 'Staff'}. Hai accesso completo al sistema.`
              : 'Tutto quello che ti serve per la prossima gara.'
            }
          </p>

          <div className="mc-quick-stats">
            <QuickStat label="Best Laps" value={totalLaps} sub={`${verifiedLaps} verificati`} />
            <QuickStat label="Gare disputate" value={racesCount} accent="blue" />
            <QuickStat label="Podi" value={podiums} accent="orange" />
          </div>
        </div>
      </section>

      {/* PROSSIMA GARA */}
      {nextRace && (
        <section className="mc-next-race">
          <div className="mc-section-head">
            <div className="mc-section-eyebrow">PROSSIMA GARA</div>
            {isUserInNextRace && (
              <span className="mc-im-in">✓ Sei iscritto</span>
            )}
          </div>

          <Link to={`/race/${nextRace.race_id}`} className="mc-next-card">
            <div className="mc-next-meta">
              <SimBadge sim={nextRace.sim} variant="solid" />
              <span className="mc-next-series">{nextRace.series}</span>
              {nextRace.round > 0 && <span className="race-round">R{nextRace.round}</span>}
            </div>

            <div className="mc-next-title">{nextRace.title}</div>

            <div className="mc-next-countdown">
              <CountdownLive targetIso={nextRace.date} size="lg" />
            </div>

            <div className="mc-next-info">
              <MiniInfo label="Tracciato" value={formatTrack(nextRace.track_id, tracks)} />
              <MiniInfo label="Inizio" value={formatRaceDateTime(nextRace.date)} />
              <MiniInfo label="Durata" value={formatDuration(nextRace.duration_minutes)} />
              <MiniInfo label="Meteo" value={nextRace.weather || '—'} />
            </div>

            {(nextRace.entries?.length || 0) > 0 && (
              <div className="mc-next-entries">
                <span className="mc-entries-label">{nextRace.entries.length} iscritti</span>
                <div className="entries-stack">
                  {nextRace.entries.slice(0, 6).map(id => {
                    const d = driverMap[id];
                    return (
                      <div key={id} className="entry-avatar" title={d?.display_name || id}>
                        <Avatar name={d?.display_name || id} driverId={id} size={32} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Link>
        </section>
      )}

      {/* ULTIMO RISULTATO (NEW) */}
      {lastResult && (
        <section className="mc-last-result">
          <div className="mc-section-head">
            <div className="mc-section-eyebrow">ULTIMO RISULTATO</div>
            <Link to={`/race/${lastResult.race_id}`} className="mc-section-link">Vedi gara →</Link>
          </div>
          <LastResultCard result={lastResult} tracks={tracks} />
        </section>
      )}

      {/* LE TUE CLASSI DOMINANTI */}
      <MyDominantClassesWidget />

      {/* LE MIE BEST LAPS */}
      {myUniqueLaps.length > 0 && (
        <section className="mc-my-laps">
          <div className="mc-section-head">
            <div className="mc-section-eyebrow">LE TUE BEST LAPS</div>
            <Link to="/laps" className="mc-section-link">Vedi tutte →</Link>
          </div>

          <div className="mc-laps-row">
            {myUniqueLaps.slice(0, 3).map((lap, idx) => (
              <div key={lap.lap_id} className={`mc-lap-card${idx === 0 ? ' is-best' : ''}`}>
                <div className="mc-lap-head">
                  <SimBadge sim={lap.sim} size="sm" />
                  {lap.session_type && SESSION_TYPE_LABELS[lap.session_type] && (
                    <span className="mc-lap-session">{SESSION_TYPE_LABELS[lap.session_type]}</span>
                  )}
                  {lap.verified_by && <span className="verify-yes-mini">✓</span>}
                </div>
                <div className="mc-lap-track">{formatTrack(lap.track_id, tracks)}</div>
                <div className="mc-lap-time">
                  <LapTime
                    ms={lap.lap_time_ms}
                    emphasis={idx === 0 ? 'best' : 'normal'}
                    size="lg"
                  />
                </div>
                <div className={`mc-lap-cond cond-${lap.conditions}`}>
                  {lap.conditions}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* DUE COLONNE: ACTIVITY FEED + STAFF BOX */}
      <div className="mc-bottom-grid">
        {/* ACTIVITY FEED */}
        <section className="mc-activity">
          <div className="mc-section-head">
            <div className="mc-section-eyebrow">ATTIVITÀ TEAM</div>
            <span className="mc-section-link">ultime {feed.length}</span>
          </div>

          {feed.length === 0 && (
            <div className="empty-state">Nessuna attività recente.</div>
          )}

          {feed.length > 0 && (
            <div className="feed-list">
              {feed.map((item, idx) => (
                <FeedItem
                  key={`${item.type}-${idx}`}
                  item={item}
                  driverMap={driverMap}
                  tracks={tracks}
                />
              ))}
            </div>
          )}
        </section>

        {/* STAFF BOX */}
        {isStaff && (
          <section className="mc-staff-box">
            <div className="mc-section-head">
              <div className="mc-section-eyebrow staff-eyebrow">STAFF DESK</div>
            </div>

            <Link
              to="/laps"
              className={`staff-action${pendingLaps.length > 0 ? ' has-action' : ''}`}
            >
              <div className="staff-action-icon">⏳</div>
              <div className="staff-action-body">
                <div className="staff-action-title">
                  {pendingLaps.length} {pendingLaps.length === 1 ? 'tempo da verificare' : 'tempi da verificare'}
                </div>
                <div className="staff-action-sub">
                  {pendingLaps.length > 0
                    ? 'Controlla replay e conferma validità.'
                    : 'Tutto verificato. Nessuna azione richiesta.'}
                </div>
              </div>
              {pendingLaps.length > 0 && <div className="staff-action-arrow">→</div>}
            </Link>

            <Link
              to="/roster"
              className={`staff-action${trialDrivers.length > 0 ? ' has-action' : ''}`}
            >
              <div className="staff-action-icon">◆</div>
              <div className="staff-action-body">
                <div className="staff-action-title">
                  {trialDrivers.length} {trialDrivers.length === 1 ? 'pilota in prova' : 'piloti in prova'}
                </div>
                <div className="staff-action-sub">
                  {trialDrivers.length > 0
                    ? trialDrivers.map(d => d.display_name.split(' ')[0]).join(' · ')
                    : 'Nessun pilota in periodo di trial.'}
                </div>
              </div>
              {trialDrivers.length > 0 && <div className="staff-action-arrow">→</div>}
            </Link>

            <div className="staff-mini-stats">
              <MiniInfo
                label="Roster attivo"
                value={`${(drivers || []).filter(d => d.status === 'active').length} piloti`}
              />
              <MiniInfo
                label="Best laps totali"
                value={`${(allLaps || []).length}`}
              />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// -------- Sub-components --------

function QuickStat({ label, value, sub, accent = 'cyan' }) {
  return (
    <div className={`mc-qs mc-qs-${accent}`}>
      <div className="mc-qs-value">{value}</div>
      <div className="mc-qs-label">{label}</div>
      {sub && <div className="mc-qs-sub">{sub}</div>}
    </div>
  );
}

function MiniInfo({ label, value }) {
  return (
    <div className="mini-info">
      <div className="mini-info-label">{label}</div>
      <div className="mini-info-value">{value}</div>
    </div>
  );
}

function LastResultCard({ result, tracks }) {
  const isDns = result.dns;
  const isDnf = result.dnf;
  const pos = result.finish_position;
  const isWin = !isDns && !isDnf && pos === 1;
  const isPodium = !isDns && !isDnf && pos && pos <= 3;

  let cardClass = 'mc-lr-card';
  if (isWin) cardClass += ' is-win';
  else if (isPodium) cardClass += ' is-podium';
  if (isDns || isDnf) cardClass += ' is-dnx';

  const posLabel = isDns ? 'DNS' : isDnf ? 'DNF' : `P${pos}`;

  return (
    <div className={cardClass}>
      <div className="mc-lr-position">
        <div className={`mc-lr-pos-num${(isDns || isDnf) ? ' is-dnx' : ''}`}>{posLabel}</div>
        <div className="mc-lr-pos-class">{result.car_class}</div>
      </div>
      <div className="mc-lr-info">
        <div className="mc-lr-track-row">
          <span className="mc-lr-track">{formatTrack(result.track_id, tracks)}</span>
          {result.sim && <SimBadge sim={result.sim} size="sm" />}
        </div>
        <div className="mc-lr-date">{formatDate(result.set_date)}</div>
        {!isDns && (
          <div className="mc-lr-stats">
            <MiniInfo label="Best Lap" value={result.best_lap_display || '—'} />
            <MiniInfo label="Tempo Totale" value={result.total_time_display || '—'} />
            <MiniInfo label="Giri" value={result.total_laps ?? '—'} />
          </div>
        )}
      </div>
    </div>
  );
}

function FeedItem({ item, driverMap, tracks }) {
  if (item.type === 'lap') {
    const lap = item.data;
    const d = driverMap[lap.driver_id];
    return (
      <div className="feed-item">
        <div className="feed-icon feed-icon-lap">◈</div>
        <div className="feed-body">
          <div className="feed-line">
            {d && (
              <Link to={`/roster/${d.driver_id}`} className="feed-driver">
                <Avatar name={d.display_name} driverId={d.driver_id} size={20} />
                <span>{d.display_name}</span>
              </Link>
            )}
            <span className="feed-action">ha registrato</span>
            <LapTime ms={lap.lap_time_ms} size="sm" emphasis="best" />
          </div>
          <div className="feed-meta">
            <SimBadge sim={lap.sim} size="sm" />
            <span>{formatTrack(lap.track_id, tracks)}</span>
            {lap.session_type && SESSION_TYPE_LABELS[lap.session_type] && (
              <>
                <span className="feed-dot">·</span>
                <span>{SESSION_TYPE_LABELS[lap.session_type]}</span>
              </>
            )}
            <span className="feed-dot">·</span>
            <span className="feed-date">{formatDate(lap.set_date)}</span>
          </div>
        </div>
      </div>
    );
  }

  if (item.type === 'report') {
    const r = item.data;
    const d = driverMap[r.driver_id];
    const isPodium = r.finish_position <= 3;
    return (
      <div className="feed-item">
        <div className={`feed-icon feed-icon-report${isPodium ? ' is-podium' : ''}`}>▣</div>
        <div className="feed-body">
          <div className="feed-line">
            {d && (
              <Link to={`/roster/${d.driver_id}`} className="feed-driver">
                <Avatar name={d.display_name} driverId={d.driver_id} size={20} />
                <span>{d.display_name}</span>
              </Link>
            )}
            <span className="feed-action">
              {r.finish_position === 1 ? 'ha vinto' :
               isPodium ? 'è salito sul podio' :
               'ha chiuso'}
            </span>
            <span className={`feed-pos${isPodium ? ' is-podium' : ''}`}>P{r.finish_position}</span>
          </div>
          <div className="feed-meta">
            <span className="feed-race">{racesById[r.race_id]?.race_name || r.race_id}</span>
            <span className="feed-dot">·</span>
            <span className="feed-date">{formatDate(r.created_at)}</span>
          </div>
        </div>
      </div>
    );
  }

  if (item.type === 'raceResult') {
    const rr = item.data;
    const d = driverMap[rr.driver_id];
    const pos = rr.finish_position;
    const isWin = !rr.dns && !rr.dnf && pos === 1;
    const isPodium = !rr.dns && !rr.dnf && pos && pos <= 3;

    let actionText;
    if (rr.dns) actionText = 'non è partito';
    else if (rr.dnf) actionText = 'si è ritirato';
    else if (isWin) actionText = 'ha vinto';
    else if (isPodium) actionText = 'è salito sul podio';
    else actionText = 'ha chiuso';

    return (
      <div className="feed-item">
        <div className={`feed-icon feed-icon-result${isPodium ? ' is-podium' : ''}`}>⬢</div>
        <div className="feed-body">
          <div className="feed-line">
            {d ? (
              <Link to={`/roster/${d.driver_id}`} className="feed-driver">
                <Avatar name={d.display_name} driverId={d.driver_id} size={20} />
                <span>{d.display_name}</span>
              </Link>
            ) : (
              <span className="feed-driver-external">{rr.driver_name_external}</span>
            )}
            <span className="feed-action">{actionText}</span>
            {!rr.dns && !rr.dnf && (
              <span className={`feed-pos${isPodium ? ' is-podium' : ''}`}>P{pos}</span>
            )}
            {rr.car_class && <span className="feed-class">{rr.car_class}</span>}
          </div>
          <div className="feed-meta">
            {rr.sim && <SimBadge sim={rr.sim} size="sm" />}
            <span>{formatTrack(rr.track_id, tracks)}</span>
            <span className="feed-dot">·</span>
            <span className="feed-date">{formatDate(rr.set_date)}</span>
          </div>
        </div>
      </div>
    );
  }

  return null;
}