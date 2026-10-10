import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTracks, useCars } from '../hooks/useBestLaps';
import { useRaceResults } from '../hooks/useRaceResults';
import { useRaces } from '../hooks/useRaces';
import { useDrivers } from '../hooks/useRoster';
import { useAuth } from '../hooks/useAuth';
import { useShowExDrivers } from '../hooks/useShowExDrivers';
import SimBadge from '../components/shared/SimBadge';
import LapTime from '../components/shared/LapTime';
import Avatar from '../components/shared/Avatar';
import { useConsentSocialFlags } from '../hooks/useConsent';
import { resolvePhotoUrl } from '../utils/driverPhotos';
import { isActiveDriver } from '../utils/driverStatus';
import { SIM_LIST } from '../utils/constants';
import { formatTrack } from '../utils/format';
import './BestLaps.css';
import './Page.css';
import './Results.css';

// #468: car_class nei risultati è l'etichetta dell'evento ("LMGT3 PLATINUM",
// "PRO/AM - LMGT3", "LMGTE AM"...), mentre le opzioni del filtro arrivano
// dal catalogo vetture (LMGT3, GTE, Hypercar...). Il confronto esatto
// scartava la maggior parte delle righe: si normalizza alla classe base.
function baseRaceClass(cls) {
  const c = String(cls || '').toUpperCase();
  if (!c) return '';
  if (c.includes('HYPERCAR')) return 'Hypercar';
  if (c.includes('LMGTE') || /\bGTE\b/.test(c)) return 'GTE';
  if (c.includes('GT3')) return 'LMGT3';
  if (c.includes('GT4')) return 'GT4';
  if (c.includes('LMP2')) return 'LMP2';
  if (c.includes('LMP3')) return 'LMP3';
  return String(cls).trim();
}

const SEASON_OPTIONS = [
  { id: 'season2026', label: 'Stagione 2026' },
  { id: 'all', label: 'All-time' },
];

export default function Results() {
  const { isAdmin } = useAuth();
  const [seasonFilter, setSeasonFilter] = useState('season2026');
  const [simFilter, setSimFilter] = useState('LMU'); // LMU sim primario — vedi richiesta team
  const [trackFilter, setTrackFilter] = useState('all');
  const [raceClassFilter, setRaceClassFilter] = useState('all');
  const [showExVsd, toggleShowExVsd] = useShowExDrivers();

  const filters = {
    sim: simFilter,
    track_id: trackFilter,
    race_class: raceClassFilter,
    season: seasonFilter,
    includeExVsd: isAdmin && showExVsd,
  };

  // includeRemoved:true — serve il roster completo (anche ex-VSD) per
  // poter mostrare nome/avatar quando l'admin rivela i loro risultati
  // col toggle sotto, stesso pattern di BestLaps.jsx.
  const { data: drivers } = useDrivers({ includeRemoved: true });
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
        set.add(baseRaceClass(rc));
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

        {isAdmin && (
          <button
            type="button"
            className={`season-btn ${showExVsd ? 'is-active' : ''}`}
            onClick={toggleShowExVsd}
            title="Di default i risultati degli ex piloti VSD sono nascosti dai confronti — solo tu puoi rivelarli"
          >
            {showExVsd ? '👁 Ex piloti visibili' : '🚫 Ex piloti nascosti'}
          </button>
        )}
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


// ─── Vista per gara ──────────────────────────────────────────
// Prima: lista piatta (una riga per pilota per gara, nome gara ripetuto,
// ordine non per posizione). Ora: un blocco per gara, sotto-blocchi per
// classe, piloti VSD ordinati per posizione (classificati → DNF → DNS),
// con posizione/griglia, barra "dove sei nel gruppo", distacco dal
// vincitore di classe e giro veloce di classe. I riferimenti (field,
// vincitore, giro veloce) usano l'INTERO schieramento, non solo i VSD.

// "LMGT3 - LMGT3" → "LMGT3", "LMP2 ELMS · LMP2" → "LMP2 ELMS"
function cleanClassLabel(cls) {
  const raw = String(cls || '').trim();
  if (!raw) return '—';
  const parts = raw.split(/\s+[-·|]\s+/).map(p => p.trim()).filter(Boolean);
  const out = [];
  parts.forEach(p => {
    const up = p.toUpperCase();
    if (out.some(o => o.toUpperCase() === up || o.toUpperCase().includes(up))) return;
    out.push(p);
  });
  return out.join(' · ');
}

function isTrue(v) { return v === true || v === 'TRUE'; }
function num(v) { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; }

function fmtGap(ms) {
  if (ms == null) return '';
  const s = ms / 1000;
  if (s < 60) return `+${s.toFixed(3)}`;
  const m = Math.floor(s / 60);
  return `+${m}:${(s - m * 60).toFixed(3).padStart(6, '0')}`;
}

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d).slice(0, 10);
  return dt.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

function rowState(r) {
  if (isTrue(r.dns)) return 'dns';
  if (isTrue(r.dnf)) return 'dnf';
  return 'ok';
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

  // Riferimenti per gara+classe calcolati sull'intero schieramento.
  const classRefs = useMemo(() => {
    const refs = {};
    (data?.results || []).forEach(r => {
      const key = `${r.race_id}__${r.car_class || ''}`;
      const ref = refs[key] || (refs[key] = { field: 0, winner: null, fastest: null });
      if (isTrue(r.dns)) return;
      ref.field += 1;
      const pos = Number(r.finish_position);
      if (pos === 1 && !isTrue(r.dnf)) ref.winner = r;
      const bl = num(r.best_lap_ms);
      if (bl && (ref.fastest == null || bl < ref.fastest)) ref.fastest = bl;
    });
    return refs;
  }, [data]);

  const groups = useMemo(() => {
    const rows = (data?.results || []).filter(r => r.is_vsd_driver);
    const filtered = rows.filter(r => {
      if (filters.sim !== 'all' && r.sim !== filters.sim) return false;
      // #468: il toggle "Stagione 2026" prima non filtrava nulla.
      if (filters.season === 'season2026' && String(r.set_date || '') < '2026-01-01') return false;
      if (filters.track_id !== 'all' && r.track_id !== filters.track_id) return false;
      if (filters.race_class !== 'all' && baseRaceClass(r.car_class) !== filters.race_class) return false;
      // Ex-VSD nascosti di default (stesso criterio di BestLaps.jsx/TeamRecords).
      if (!filters.includeExVsd && !isActiveDriver(driverMap[r.driver_id])) return false;
      return true;
    });

    const byRace = new Map();
    filtered.forEach(r => {
      if (!byRace.has(r.race_id)) byRace.set(r.race_id, []);
      byRace.get(r.race_id).push(r);
    });

    const stateOrder = { ok: 0, dnf: 1, dns: 2 };
    const out = [];
    byRace.forEach((list, raceId) => {
      const race = raceMap[raceId];
      const first = list[0];
      const byClass = new Map();
      list.forEach(r => {
        const k = r.car_class || '';
        if (!byClass.has(k)) byClass.set(k, []);
        byClass.get(k).push(r);
      });
      const classes = Array.from(byClass.entries()).map(([cls, rs]) => ({
        cls,
        label: cleanClassLabel(cls),
        ref: classRefs[`${raceId}__${cls}`] || { field: 0 },
        rows: rs.sort((a, b) => {
          const sa = stateOrder[rowState(a)], sb = stateOrder[rowState(b)];
          if (sa !== sb) return sa - sb;
          return (Number(a.finish_position) || 999) - (Number(b.finish_position) || 999);
        }),
      })).sort((a, b) => a.label.localeCompare(b.label));
      out.push({
        raceId,
        name: race?.race_name || formatTrack(first.track_id, tracks) || raceId,
        date: race?.date || first.set_date,
        sim: first.sim,
        track: formatTrack(first.track_id, tracks),
        championshipId: race?.championship_id || null,
        classes,
        vsdCount: list.length,
      });
    });
    return out.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }, [data, filters, driverMap, raceMap, classRefs, tracks]);

  if (isLoading) return <ResultsSkeleton />;
  if (isError) return <Prompt text={`Errore: ${error?.message || 'sconosciuto'}`} />;
  if (groups.length === 0) {
    return (
      <Prompt
        icon="🏁"
        title="Nessuna partecipazione VSD"
        text="Nessun risultato di gara trovato con questi filtri. I risultati appaiono dopo aver importato il JSON di una gara."
      />
    );
  }

  return (
    <div className="rr-list">
      {groups.map(g => (
        <section key={g.raceId} className="rr-race">
          <header className="rr-race-head">
            <div className="rr-race-title">
              <Link to={`/race/${g.raceId}`} className="rr-race-name">{g.name}</Link>
              <div className="rr-race-meta">
                <SimBadge sim={g.sim} />
                {g.track && g.track !== g.name && <span>{g.track}</span>}
                <span>{fmtDate(g.date)}</span>
                <span>{g.vsdCount} {g.vsdCount === 1 ? 'pilota VSD' : 'piloti VSD'}</span>
              </div>
            </div>
            <Link to={`/race/${g.raceId}`} className="rr-race-link">Dettagli gara →</Link>
          </header>

          {g.classes.map(c => (
            <div key={c.cls} className="rr-class">
              <div className="rr-class-head">
                <span className="rr-class-label">{c.label}</span>
                {c.ref.field > 0 && <span className="rr-class-field">{c.ref.field} al via</span>}
              </div>
              <div className="rr-rows">
                {c.rows.map(rec => (
                  <ResultRow
                    key={`${rec.race_id}-${rec.driver_id || rec.driver_name_external}`}
                    rec={rec}
                    ref_={c.ref}
                    drv={driverMap[rec.driver_id]}
                    socialFlags={socialFlags}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function ResultRow({ rec, ref_, drv, socialFlags }) {
  const state = rowState(rec);
  const pos = Number(rec.finish_position) || null;
  const field = ref_.field || 0;
  const pct = state === 'ok' && pos && field > 1 ? Math.max(0.04, 1 - (pos - 1) / (field - 1)) : 0;
  const medal = state === 'ok' && pos ? ({ 1: '🥇', 2: '🥈', 3: '🥉' }[pos] || null) : null;
  const bestLap = num(rec.best_lap_ms);
  const isFastest = bestLap && ref_.fastest && bestLap === ref_.fastest;

  let gap = '';
  if (state === 'ok' && pos && pos > 1 && ref_.winner) {
    const wLaps = Number(ref_.winner.total_laps) || 0;
    const myLaps = Number(rec.total_laps) || 0;
    if (wLaps && myLaps && myLaps < wLaps) {
      const d = wLaps - myLaps;
      gap = `+${d} ${d === 1 ? 'giro' : 'giri'}`;
    } else {
      const wt = num(ref_.winner.total_time_ms), mt = num(rec.total_time_ms);
      if (wt && mt && mt >= wt) gap = fmtGap(mt - wt);
    }
  } else if (state === 'ok' && pos === 1) {
    gap = 'Vincitore';
  }

  const points = rec.point_total !== '' && rec.point_total != null ? Number(rec.point_total) : null;

  return (
    <div className={`rr-row rr-row--${state}${pos && pos <= 3 && state === 'ok' ? ' rr-row--podium' : ''}`}>
      <div className="rr-pos">
        {state === 'ok' ? (
          <>
            <span className="rr-pos-num">{medal || (pos ? `P${pos}` : '—')}</span>
            {field > 0 && <span className="rr-pos-field">/{field}</span>}
          </>
        ) : (
          <span className={`rr-state rr-state--${state}`}>{state.toUpperCase()}</span>
        )}
      </div>

      <div className="rr-driver">
        {drv ? (
          <Link to={`/roster/${drv.driver_id}`} className="driver-link">
            <Avatar name={drv.display_name} driverId={drv.driver_id} size={28} photoUrl={resolvePhotoUrl(drv.driver_id, socialFlags)} />
            <span className="driver-link-name">{drv.display_name}</span>
          </Link>
        ) : (rec.driver_name_external || rec.driver_id)}
      </div>

      <div className="rr-bar" title={pct ? `Ha battuto ${field - pos} piloti su ${field - 1}` : ''}>
        {pct > 0 && <span className="rr-bar-fill" style={{ width: `${Math.round(pct * 100)}%` }} />}
      </div>

      <div className="rr-gap">{gap}</div>

      <div className="rr-lap">
        {bestLap ? <LapTime ms={bestLap} size="sm" emphasis={isFastest ? 'best' : 'normal'} /> : <span className="rr-dim">—</span>}
        {isFastest && <span className="rr-fl" title="Giro più veloce della classe">GV</span>}
      </div>

      <div className="rr-laps">{rec.total_laps ? `${rec.total_laps} giri` : ''}</div>

      <div className={`rr-pts${points ? '' : ' rr-dim'}`}>{points != null ? `${points} pt` : ''}</div>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="rr-list" aria-busy="true">
      {[0, 1, 2].map(i => (
        <section key={i} className="rr-race rr-skel">
          <div className="rr-skel-line rr-skel-title" />
          {[0, 1, 2].map(j => <div key={j} className="rr-skel-line" />)}
        </section>
      ))}
    </div>
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