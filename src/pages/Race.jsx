import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useRaces } from '../hooks/useRaces';
import { useDrivers } from '../hooks/useRoster';
import { useTracks } from '../hooks/useLookups';
import { useMyRecentRaceResults } from '../hooks/useRaceResults';
import SimBadge from '../components/shared/SimBadge';
import CategoryPill from '../components/shared/CategoryPill';
import Avatar from '../components/shared/Avatar';
import {
  formatTrack,
  formatCountdown,
  formatRaceDateTime,
  formatDuration,
} from '../utils/format';
import './Race.css';
import './Page.css';

const TABS = [
  { id: 'scheduled', label: 'Programmate' },
  { id: 'completed', label: 'Storico' },
];

export default function Race() {
  const [tab, setTab] = useState('scheduled');
  const { driver } = useAuth();
  const { data: races, isLoading } = useRaces();
  console.log('[Race Hub] races:', races);
  const { data: drivers } = useDrivers();
  const { data: tracks = [] } = useTracks();
  const { data: myRaceResultsData } = useMyRecentRaceResults(driver?.driver_id, 50);

  const driverMap = useMemo(() => {
    const m = {};
    (drivers || []).forEach(d => { m[d.driver_id] = d; });
    return m;
  }, [drivers]);

  // Mappa race_id → mio risultato (per badge "Tu: P2 LMGT3")
  const myResultsByRace = useMemo(() => {
    const m = {};
    (myRaceResultsData?.results || []).forEach(r => {
      m[r.race_id] = r;
    });
    return m;
  }, [myRaceResultsData]);

 const filtered = useMemo(() => {
    if (!races) return [];
    if (tab === 'scheduled') {
      // Il tab "Programmate" include anche le gare in corso (in_progress),
      // mostrate in cima: durante un evento live la gara deve restare raggiungibile dal hub.
      const live = races.filter(r => r.status === 'in_progress')
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      const scheduled = races.filter(r => r.status === 'scheduled')
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      return [...live, ...scheduled];
    }
    return races.filter(r => r.status === tab)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [races, tab]);
  const counts = useMemo(() => ({
    scheduled: races?.filter(r => r.status === 'scheduled' || r.status === 'in_progress').length || 0,
    completed: races?.filter(r => r.status === 'completed').length || 0,
  }), [races]);

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-eyebrow">RACE HUB</div>
        <h1 className="page-title">Centro Gare</h1>
        <p className="page-sub">
          {counts.scheduled} gare programmate · {counts.completed} nello storico
        </p>
      </div>

      <div className="race-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`race-tab${tab === t.id ? ' is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span>{t.label}</span>
            <span className="race-tab-count">{counts[t.id]}</span>
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="races-grid">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="race-card skeleton-card" />
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="page-stub">
          <div className="page-stub-icon">∅</div>
          <div className="page-stub-title">
            {tab === 'scheduled' ? 'Nessuna gara programmata' : 'Nessuna gara nello storico'}
          </div>
          <div className="page-stub-text">
            {tab === 'scheduled' ? 'Le prossime gare appariranno qui.' : 'Le gare passate verranno archiviate qui.'}
          </div>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="races-grid">
          {filtered.map(race => (
            <RaceCard
              key={race.race_id}
              race={race}
              driverMap={driverMap}
              tracks={tracks}
              isPast={tab === 'completed'}
              myResult={myResultsByRace[race.race_id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RaceCard({ race, driverMap, tracks, isPast, myResult }) {
  const categories = (race.car_categories || '').split(',').filter(Boolean);
  const entries = race.entries || [];
  const visibleEntries = entries.slice(0, 5);
  const remaining = entries.length - visibleEntries.length;

  return (
    <Link to={`/race/${race.race_id}`} className="race-card">
      {race.poster_url && (
        <div className="race-card-poster">
          <img
            src={race.poster_url}
            alt=""
            onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }}
          />
        </div>
      )}
      <div className="race-card-head">
        <div className="race-card-meta">
          <SimBadge sim={race.sim} variant="solid" size="sm" />
          <span className="race-series">{race.series}</span>
          {race.round > 0 && <span className="race-round">R{race.round}</span>}
        </div>
        {!isPast && race.status === 'in_progress' && (
          <div className="race-live-badge">
            <span className="live-dot" />
            LIVE
          </div>
        )}
        {!isPast && race.status !== 'in_progress' && (
          <div className="race-countdown">
            <span className="cd-value">{formatCountdown(race.date)}</span>
            <span className="cd-label">al via</span>
          </div>
        )}
        {isPast && (
          <div className="race-card-tags">
            <span className="race-status-tag">Conclusa</span>
            {myResult && <MyResultBadge result={myResult} />}
          </div>
        )}
      </div>

      <div className="race-card-title">{race.title}</div>

      <div className="race-info-grid">
        <InfoCell label="Tracciato" value={formatTrack(race.track_id, tracks)} />
        <InfoCell label="Data" value={formatRaceDateTime(race.date)} />
        <InfoCell label="Durata" value={formatDuration(race.duration_minutes)} />
        <InfoCell label="Meteo" value={race.weather || '—'} />
      </div>

      {categories.length > 0 && (
        <div className="race-categories">
          {categories.map(c => <CategoryPill key={c} category={c.trim()} />)}
        </div>
      )}

      {entries.length > 0 && (
        <div className="race-entries">
          <div className="race-entries-label">
            Iscritti · {entries.length}
          </div>
          <div className="race-entries-row">
            {visibleEntries.map(id => {
              const d = driverMap[id];
              return (
                <div key={id} className="entry-avatar" title={d?.display_name || id}>
                  <Avatar name={d?.display_name || id} driverId={id} size={32} />
                </div>
              );
            })}
            {remaining > 0 && (
              <div className="entry-more">+{remaining}</div>
            )}
          </div>
        </div>
      )}

      {race.notes && (
        <div className="race-notes">
          <span className="notes-icon">›</span> {race.notes}
        </div>
      )}
    </Link>
  );
}

function MyResultBadge({ result }) {
  const isDns = result.dns;
  const isDnf = result.dnf;
  const pos = result.finish_position;
  const isPodium = !isDns && !isDnf && pos && pos <= 3;
  const isWin = !isDns && !isDnf && pos === 1;

  let cls = 'race-mine-badge';
  if (isWin) cls += ' is-win';
  else if (isPodium) cls += ' is-podium';
  if (isDns || isDnf) cls += ' is-dnx';

  const label = isDns ? 'DNS' : isDnf ? 'DNF' : `P${pos}`;

  return (
    <span className={cls} title="Il tuo risultato in questa gara">
      <span className="race-mine-label">Tu</span>
      <span className="race-mine-pos">{label}</span>
      {result.car_class && <span className="race-mine-class">{result.car_class}</span>}
    </span>
  );
}

function InfoCell({ label, value }) {
  return (
    <div className="info-cell">
      <div className="info-label">{label}</div>
      <div className="info-value">{value}</div>
    </div>
  );
}