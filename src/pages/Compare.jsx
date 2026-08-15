import { useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useDrivers } from '../hooks/useRoster';
import { useBestLaps } from '../hooks/useBestLaps';
import { useMyRecentRaceResults } from '../hooks/useRaceResults';
import { useTracks, useCars } from '../hooks/useLookups';
import { useChampionshipsByDriver } from '../hooks/useChampionshipsByDriver';
import { useConsentedDriverPhoto } from '../hooks/useConsent';
import Avatar from '../components/shared/Avatar';
import RivalryChart from '../components/compare/RivalryChart';
import { formatTrack, formatCar } from '../utils/format';
import './Compare.css';
import './Page.css';

// ─── helpers ───────────────────────────────────────────────
function fmtMs(ms) {
  if (!ms) return '—';
  const t = Number(ms);
  if (isNaN(t) || t <= 0) return '—';
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const cs = Math.floor((t % 1000) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function fmtDelta(ms) {
  if (ms == null || ms === 0) return '—';
  const s = (ms / 1000).toFixed(3);
  return `+${s}`;
}

function computeStats(results) {
  const races = results.filter(r => !r.dns);
  const wins     = races.filter(r => !r.dnf && r.finish_position === 1).length;
  const podiums  = races.filter(r => !r.dnf && r.finish_position <= 3).length;
  const dnfs     = races.filter(r =>  r.dnf).length;
  const classified = races.filter(r => !r.dnf && r.finish_position);
  const avgPos = classified.length
    ? (classified.reduce((s, r) => s + r.finish_position, 0) / classified.length).toFixed(1)
    : null;
  const bestPos = classified.length
    ? Math.min(...classified.map(r => r.finish_position))
    : null;
  return { gare: races.length, wins, podiums, dnfs, avgPos, bestPos };
}

function computeH2H(resultsA, resultsB) {
  const byRaceA = {};
  resultsA.filter(r => !r.dns).forEach(r => {
    const key = `${r.race_id}__${r.car_class}`;
    const cur = byRaceA[key];
    if (!cur || (r.finish_position && r.finish_position < cur.finish_position)) {
      byRaceA[key] = r;
    }
  });
  let aWins = 0, bWins = 0, ties = 0;
  resultsB.filter(r => !r.dns).forEach(rB => {
    const key = `${rB.race_id}__${rB.car_class}`;
    const rA = byRaceA[key];
    if (!rA) return;
    const pA = rA.finish_position, pB = rB.finish_position;
    if (pA && pB) {
      if (pA < pB) aWins++;
      else if (pB < pA) bWins++;
      else ties++;
    }
  });
  return { aWins, bWins, ties, total: aWins + bWins + ties };
}

function computeSharedChampionships(partsA, partsB) {
  const byChampB = new Map();
  (partsB || []).forEach(p => {
    if (!byChampB.has(p.championship_id)) byChampB.set(p.championship_id, []);
    byChampB.get(p.championship_id).push(p);
  });

  const shared = [];
  (partsA || []).forEach(pA => {
    const candidates = byChampB.get(pA.championship_id);
    if (!candidates || candidates.length === 0) return;
    // Preferisci match sulla stessa classe, altrimenti prendi il primo disponibile
    const pB = candidates.find(c => c.class_name === pA.class_name) || candidates[0];
    shared.push({
      championship_id: pA.championship_id,
      championship_name: pA.championship_name,
      season: pA.season,
      status: pA.status,
      classA: pA.class_name,
      classB: pB.class_name,
      posA: pA.position,
      posB: pB.position,
      ptsA: pA.total_points,
      ptsB: pB.total_points,
    });
  });

  return shared;
}

function computeLapComparison(lapsA, lapsB) {
  const best = (laps) => {
    const m = {};
    laps.forEach(l => {
      const key = `${l.sim}__${l.track_id}__${l.car_id}`;
      const t = Number(l.lap_time_ms);
      if (!m[key] || Number(m[key].lap_time_ms) > t) m[key] = l;
    });
    return m;
  };
  const bA = best(lapsA);
  const bB = best(lapsB);
  const allKeys = new Set([...Object.keys(bA), ...Object.keys(bB)]);
  return Array.from(allKeys)
    .map(key => {
      const lA = bA[key] || null;
      const lB = bB[key] || null;
      const msA = lA ? Number(lA.lap_time_ms) : null;
      const msB = lB ? Number(lB.lap_time_ms) : null;
      const [sim, track_id, car_id] = key.split('__');
      let winner = null, deltaMs = null;
      if (msA && msB) {
        if (msA < msB) { winner = 'a'; deltaMs = msB - msA; }
        else if (msB < msA) { winner = 'b'; deltaMs = msA - msB; }
        else { winner = 'tie'; deltaMs = 0; }
      }
      return { sim, track_id, car_id, msA, msB, winner, deltaMs };
    })
    .filter(r => r.msA || r.msB) // almeno uno ha il tempo
    .sort((a, b) => {
      if (a.sim !== b.sim) return a.sim.localeCompare(b.sim);
      return a.track_id.localeCompare(b.track_id);
    });
}

// ─── sub-components ────────────────────────────────────────

function DriverSelector({ value, onChange, options, placeholder, driver }) {
  const photoUrl = useConsentedDriverPhoto(driver?.driver_id);
  return (
    <div className="cmp-selector">
      {driver ? (
        <div className="cmp-selector-preview">
          <Avatar name={driver.display_name} driverId={driver.driver_id} size={60} photoUrl={photoUrl} />
          <div className="cmp-selector-info">
            <div className="cmp-selector-name">{driver.display_name}</div>
            {driver.is_ex_vsd && <span className="cmp-ex-tag">EX VSD</span>}
          </div>
        </div>
      ) : (
        <div className="cmp-selector-placeholder">
          <div className="cmp-selector-avatar-empty" />
          <span>{placeholder}</span>
        </div>
      )}
      <select
        className="cmp-select"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        <optgroup label="Piloti VSD">
          {(options || []).filter(d => !d.is_ex_vsd).map(d => (
            <option key={d.driver_id} value={d.driver_id}>{d.display_name}</option>
          ))}
        </optgroup>
        <optgroup label="Ex Piloti">
          {(options || []).filter(d => d.is_ex_vsd).map(d => (
            <option key={d.driver_id} value={d.driver_id}>{d.display_name} (Ex VSD)</option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}

function StatRow({ label, valA, valB, lowerIsBetter }) {
  const nA = Number(valA), nB = Number(valB);
  const comparable = !isNaN(nA) && !isNaN(nB) && valA !== '—' && valB !== '—';
  let winA = false, winB = false;
  if (comparable) {
    winA = lowerIsBetter ? nA < nB : nA > nB;
    winB = lowerIsBetter ? nB < nA : nB > nA;
  }
  return (
    <div className="cmp-stat-row">
      <div className={`cmp-stat-val cmp-stat-val--a ${winA ? 'is-win' : ''}`}>{valA}</div>
      <div className="cmp-stat-label">{label}</div>
      <div className={`cmp-stat-val cmp-stat-val--b ${winB ? 'is-win' : ''}`}>{valB}</div>
    </div>
  );
}

// ─── main page ─────────────────────────────────────────────

export default function Compare() {
  const [searchParams, setSearchParams] = useSearchParams();
  const aId = searchParams.get('a') || '';
  const bId = searchParams.get('b') || '';

  const { data: allDrivers } = useDrivers({ includeRemoved: true });
  const { data: tracks = [] } = useTracks();
  const { data: cars = [] } = useCars();

  const { data: rdA } = useMyRecentRaceResults(aId, 200);
  const { data: rdB } = useMyRecentRaceResults(bId, 200);
  const resultsA = rdA?.results || [];
  const resultsB = rdB?.results || [];

  const { data: lapsA = [] } = useBestLaps(aId ? { driver_id: aId } : {});
  const { data: lapsB = [] } = useBestLaps(bId ? { driver_id: bId } : {});

  const { data: champDataA } = useChampionshipsByDriver(aId);
  const { data: champDataB } = useChampionshipsByDriver(bId);

  const driverMap = useMemo(() => {
    const m = {};
    (allDrivers || []).forEach(d => { m[d.driver_id] = d; });
    return m;
  }, [allDrivers]);

  const dA = aId ? driverMap[aId] : null;
  const dB = bId ? driverMap[bId] : null;

  const photoUrlA = useConsentedDriverPhoto(aId);
  const photoUrlB = useConsentedDriverPhoto(bId);

  const optA = useMemo(() => (allDrivers || []).filter(d => d.driver_id !== bId), [allDrivers, bId]);
  const optB = useMemo(() => (allDrivers || []).filter(d => d.driver_id !== aId), [allDrivers, aId]);

  const setDriver = (which, id) => {
    const p = new URLSearchParams(searchParams);
    if (id) p.set(which, id); else p.delete(which);
    setSearchParams(p, { replace: true });
  };

  const both = aId && bId && aId !== bId;

  const statsA = useMemo(() => (aId && resultsA.length) ? computeStats(resultsA) : null, [resultsA, aId]);
  const statsB = useMemo(() => (bId && resultsB.length) ? computeStats(resultsB) : null, [resultsB, bId]);
  const h2h    = useMemo(() => both ? computeH2H(resultsA, resultsB) : null, [resultsA, resultsB, both]);
  const lapCmp = useMemo(() => both ? computeLapComparison(lapsA, lapsB) : [], [lapsA, lapsB, both]);
  const sharedChamps = useMemo(
    () => both ? computeSharedChampionships(champDataA?.participations, champDataB?.participations) : [],
    [champDataA, champDataB, both]
  );

  const nameA = dA?.display_name?.split(' ')[0] || 'A';
  const nameB = dB?.display_name?.split(' ')[0] || 'B';

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-eyebrow">STATISTICHE</div>
        <h1 className="page-title">Confronto Piloti</h1>
        <p className="page-sub">Seleziona due piloti per confrontarne le statistiche</p>
      </div>

      {/* ── Selettori ── */}
      <div className="cmp-selectors">
        <DriverSelector
          value={aId}
          onChange={id => setDriver('a', id)}
          options={optA}
          placeholder="Pilota A"
          driver={dA}
        />
        <div className="cmp-vs">VS</div>
        <DriverSelector
          value={bId}
          onChange={id => setDriver('b', id)}
          options={optB}
          placeholder="Pilota B"
          driver={dB}
        />
      </div>

      {!both && (
        <div className="page-stub">
          <div className="page-stub-icon">⚡</div>
          <div className="page-stub-title">Seleziona due piloti</div>
          <div className="page-stub-text">Usa i menu qui sopra per scegliere i piloti da confrontare.</div>
        </div>
      )}

      {both && (
        <div className="cmp-body">

          {/* ── Intestazione con avatar ── */}
          <div className="cmp-drivers-header">
            <div className="cmp-dh-side">
              <Avatar name={dA?.display_name} driverId={aId} size={56} photoUrl={photoUrlA} />
              <div>
                <div className="cmp-dh-name">{dA?.display_name || aId}</div>
                {dA?.is_ex_vsd && <span className="cmp-ex-tag">EX VSD</span>}
              </div>
            </div>
            <div className="cmp-dh-vs">VS</div>
            <div className="cmp-dh-side cmp-dh-side--b">
              <div className="cmp-dh-side-right">
                <div className="cmp-dh-name">{dB?.display_name || bId}</div>
                {dB?.is_ex_vsd && <span className="cmp-ex-tag">EX VSD</span>}
              </div>
              <Avatar name={dB?.display_name} driverId={bId} size={56} photoUrl={photoUrlB} />
            </div>
          </div>

          {/* ── Riepilogo gare ── */}
          {(statsA || statsB) && (
            <div className="cmp-section">
              <div className="cmp-section-title">Riepilogo Gare</div>
              <div className="cmp-stats">
                <StatRow label="Gare disputate" valA={statsA?.gare ?? '—'} valB={statsB?.gare ?? '—'} />
                <StatRow label="Vittorie" valA={statsA?.wins ?? '—'} valB={statsB?.wins ?? '—'} />
                <StatRow label="Podi" valA={statsA?.podiums ?? '—'} valB={statsB?.podiums ?? '—'} />
                <StatRow label="DNF" valA={statsA?.dnfs ?? '—'} valB={statsB?.dnfs ?? '—'} lowerIsBetter />
                <StatRow
                  label="Posizione media"
                  valA={statsA?.avgPos ?? '—'}
                  valB={statsB?.avgPos ?? '—'}
                  lowerIsBetter
                />
                <StatRow
                  label="Miglior risultato"
                  valA={statsA?.bestPos ? `P${statsA.bestPos}` : '—'}
                  valB={statsB?.bestPos ? `P${statsB.bestPos}` : '—'}
                  lowerIsBetter
                />
              </div>
            </div>
          )}

          {/* ── Campionati in comune ── */}
          {sharedChamps.length > 0 && (
            <div className="cmp-section">
              <div className="cmp-section-title">Campionati in Comune · {sharedChamps.length}</div>
              <div className="cmp-laps-wrap">
                <table className="cmp-laps">
                  <thead>
                    <tr>
                      <th>Campionato</th>
                      <th>Classe</th>
                      <th className="cmp-lap-col cmp-lap-col--a">{nameA}</th>
                      <th className="cmp-lap-col cmp-lap-col--b">{nameB}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sharedChamps.map(c => {
                      const aBetter = c.posA != null && c.posB != null && c.posA < c.posB;
                      const bBetter = c.posA != null && c.posB != null && c.posB < c.posA;
                      const sameClass = c.classA === c.classB;
                      return (
                        <tr key={c.championship_id}>
                          <td>
                            <Link to={`/championships/${c.championship_id}`} className="cmp-lap-track">
                              {c.championship_name}
                            </Link>
                            <div className="cmp-lap-sim">Stagione {c.season}</div>
                          </td>
                          <td className="cmp-lap-car">
                            {sameClass ? c.classA : `${c.classA} / ${c.classB}`}
                          </td>
                          <td className={`cmp-lap-time ${aBetter ? 'is-faster' : ''}`}>
                            {c.posA != null ? `P${c.posA}` : '—'}
                            <div className="cmp-lap-sim">{c.ptsA} pt</div>
                          </td>
                          <td className={`cmp-lap-time cmp-lap-time--b ${bBetter ? 'is-faster' : ''}`}>
                            {c.posB != null ? `P${c.posB}` : '—'}
                            <div className="cmp-lap-sim">{c.ptsB} pt</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {sharedChamps.length === 0 && (champDataA || champDataB) && (
            <div className="cmp-section">
              <div className="cmp-section-title">Campionati in Comune</div>
              <p className="cmp-empty">Nessun campionato disputato da entrambi i piloti.</p>
            </div>
          )}

          {/* ── Testa a testa ── */}
          {h2h && h2h.total > 0 && (
            <div className="cmp-section">
              <div className="cmp-section-title">Testa a Testa · {h2h.total} gare in comune</div>
              <div className="cmp-h2h">
                <div className={`cmp-h2h-side ${h2h.aWins > h2h.bWins ? 'is-win' : ''}`}>
                  <div className="cmp-h2h-count">{h2h.aWins}</div>
                  <div className="cmp-h2h-sublabel">vittorie {nameA}</div>
                </div>
                <div className="cmp-h2h-bar-wrap">
                  {h2h.ties > 0 && <div className="cmp-h2h-ties">{h2h.ties} pari</div>}
                  <div className="cmp-h2h-bar">
                    <div className="cmp-h2h-bar-a" style={{ flex: Math.max(h2h.aWins, 0.01) }} />
                    <div className="cmp-h2h-bar-b" style={{ flex: Math.max(h2h.bWins, 0.01) }} />
                  </div>
                </div>
                <div className={`cmp-h2h-side cmp-h2h-side--b ${h2h.bWins > h2h.aWins ? 'is-win' : ''}`}>
                  <div className="cmp-h2h-count">{h2h.bWins}</div>
                  <div className="cmp-h2h-sublabel">vittorie {nameB}</div>
                </div>
              </div>
            </div>
          )}

          {h2h && h2h.total === 0 && (
            <div className="cmp-section">
              <div className="cmp-section-title">Testa a Testa</div>
              <p className="cmp-empty">Nessuna gara in comune nella stessa classe.</p>
            </div>
          )}

          {/* ── Rimonta (curva di miglioramento a due) ── */}
          <RivalryChart
            aId={aId}
            bId={bId}
            nameA={nameA}
            nameB={nameB}
            tracks={tracks}
            cars={cars}
          />

          {/* ── Best Laps ── */}
          {lapCmp.length > 0 && (
            <div className="cmp-section">
              <div className="cmp-section-title">Best Lap per Circuito</div>
              <div className="cmp-laps-wrap">
                <table className="cmp-laps">
                  <thead>
                    <tr>
                      <th>Tracciato</th>
                      <th>Vettura</th>
                      <th className="cmp-lap-col cmp-lap-col--a">{nameA}</th>
                      <th className="cmp-lap-col cmp-lap-col--b">{nameB}</th>
                      <th className="cmp-lap-col">Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lapCmp.map(({ sim, track_id, car_id, msA, msB, winner, deltaMs }) => (
                      <tr key={`${sim}__${track_id}__${car_id}`}>
                        <td>
                          <div className="cmp-lap-track">{formatTrack(track_id, tracks)}</div>
                          <div className="cmp-lap-sim">{sim}</div>
                        </td>
                        <td className="cmp-lap-car">{formatCar(car_id, cars) || car_id}</td>
                        <td className={`cmp-lap-time ${winner === 'a' ? 'is-faster' : ''}`}>
                          {fmtMs(msA)}
                        </td>
                        <td className={`cmp-lap-time cmp-lap-time--b ${winner === 'b' ? 'is-faster' : ''}`}>
                          {fmtMs(msB)}
                        </td>
                        <td className="cmp-lap-delta">
                          {deltaMs != null && deltaMs > 0 ? fmtDelta(deltaMs) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {lapCmp.length === 0 && (
            <div className="cmp-section">
              <div className="cmp-section-title">Best Lap</div>
              <p className="cmp-empty">Nessun giro registrato per uno o entrambi i piloti.</p>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
