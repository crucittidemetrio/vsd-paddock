import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { useBestLaps, useTracks, useCars } from '../hooks/useBestLaps';
import { useDrivers } from '../hooks/useRoster';
import { useAuth } from '../hooks/useAuth';
import { useShowExDrivers } from '../hooks/useShowExDrivers';
import { activeDriverIdSet } from '../utils/driverStatus';
import SimBadge from '../components/shared/SimBadge';
import LapTime from '../components/shared/LapTime';
import Avatar from '../components/shared/Avatar';
import { useConsentSocialFlags } from '../hooks/useConsent';
import { resolvePhotoUrl } from '../utils/driverPhotos';
import { formatTrack, formatCar, formatDate, formatGapPercent } from '../utils/format';
import './LapsDrilldown.css';
import './Page.css';

// Palette colori per le linee del grafico (8 distinti)
const CHART_COLORS = [
  '#00d4ff', // cyan
  '#3b8bff', // blue
  '#f5a623', // orange
  '#ef3340', // red
  '#22c55e', // green
  '#a855f7', // purple
  '#ec4899', // pink
  '#eab308', // yellow
];

export default function LapsDrilldown() {
  const { sim, track, category } = useParams();
  const { driver: currentUser, isAdmin } = useAuth();
  const [showExVsd, toggleShowExVsd] = useShowExDrivers();

  const { data: allLaps, isLoading: lapsLoading } = useBestLaps();
  // includeRemoved:true — serve per il badge "EX" quando l'admin rivela
  // i tempi degli ex piloti, altrimenti driverMap non li conterrebbe.
  const { data: drivers } = useDrivers({ includeRemoved: true });
  const { data: tracks } = useTracks();
  const { data: cars } = useCars();
  const { data: socialFlagsData } = useConsentSocialFlags();
  const socialFlags = socialFlagsData?.flags || {};

  const activeIds = useMemo(() => activeDriverIdSet(drivers), [drivers]);
  const includeExVsd = isAdmin && showExVsd;

  // Normalize params per case-insensitive match
  const simParam = (sim || '').toUpperCase();
  const trackParam = (track || '').toLowerCase();
  const categoryParam = (category || '').toLowerCase();

  const driverMap = useMemo(() => {
    const m = {};
    (drivers || []).forEach(d => { m[d.driver_id] = d; });
    return m;
  }, [drivers]);

  // Filtra i giri per la combo, joina con race_class
  const lapsForCombo = useMemo(() => {
    if (!allLaps || !cars) return [];

    const carRaceClass = {};
    cars.forEach(c => {
      carRaceClass[c.car_id] = (c.race_class && String(c.race_class).trim()) || null;
    });

    return allLaps
      .map(l => ({ ...l, race_class: carRaceClass[l.car_id] || null }))
      .filter(l => {
        if (!l.race_class) return false;
        if (String(l.sim || '').toUpperCase() !== simParam) return false;
        if (String(l.track_id || '').toLowerCase() !== trackParam) return false;
        if (l.race_class.toLowerCase() !== categoryParam) return false;
        // Ex piloti VSD esclusi di default — stesso criterio di
        // useTeamLeaderboard, toggle admin-only per rivelarli.
        if (!includeExVsd && !activeIds.has(l.driver_id)) return false;
        return true;
      });
  }, [allLaps, cars, simParam, trackParam, categoryParam, includeExVsd, activeIds]);

  // Best per pilota
  const driverBests = useMemo(() => {
    const byDriver = {};
    lapsForCombo.forEach(l => {
      const current = byDriver[l.driver_id];
      if (!current || Number(current.lap_time_ms) > Number(l.lap_time_ms)) {
        byDriver[l.driver_id] = l;
      }
    });
    return Object.values(byDriver).sort(
      (a, b) => Number(a.lap_time_ms) - Number(b.lap_time_ms)
    );
  }, [lapsForCombo]);

  // Dati per il chart (raggruppati per giorno)
  const { chartData, driverNamesInChart } = useMemo(() => {
    if (lapsForCombo.length === 0) return { chartData: [], driverNamesInChart: [] };

    // { 'YYYY-MM-DD': { 'Mattia A.': bestMs, ... } }
    const byDateDriver = {};
    lapsForCombo.forEach(l => {
      const rawDate = l.set_date || l.race_date || l.lap_date || l.created_at || l.date;
      if (!rawDate) return;
      const dateKey = String(rawDate).slice(0, 10); // YYYY-MM-DD
      const driver = driverMap[l.driver_id];
      const name = driver?.display_name || l.driver_id;

      if (!byDateDriver[dateKey]) byDateDriver[dateKey] = {};
      const current = byDateDriver[dateKey][name];
      if (!current || current > Number(l.lap_time_ms)) {
        byDateDriver[dateKey][name] = Number(l.lap_time_ms);
      }
    });

    const dateKeys = Object.keys(byDateDriver).sort();
    const data = dateKeys.map(date => {
      const row = { date };
      Object.entries(byDateDriver[date]).forEach(([name, ms]) => {
        row[name] = ms / 1000; // ms → secondi
      });
      return row;
    });

    const allNames = new Set();
    data.forEach(row => {
      Object.keys(row).forEach(k => { if (k !== 'date') allNames.add(k); });
    });

    return { chartData: data, driverNamesInChart: Array.from(allNames) };
  }, [lapsForCombo, driverMap]);

  // Colore per pilota (stabile)
  const colorByDriver = useMemo(() => {
    const m = {};
    driverNamesInChart.forEach((name, i) => {
      m[name] = CHART_COLORS[i % CHART_COLORS.length];
    });
    return m;
  }, [driverNamesInChart]);

  const teamRecord = driverBests[0] || null;

  if (lapsLoading) {
    return (
      <div className="page">
        <div className="leaderboard-prompt">
          <div className="leaderboard-prompt-text">Caricamento…</div>
        </div>
      </div>
    );
  }

  if (lapsForCombo.length === 0) {
    return (
      <div className="page">
        <Link to="/laps" className="drilldown-back">← Database Tempi</Link>
        <div className="leaderboard-prompt">
          <div className="leaderboard-prompt-icon">🏁</div>
          <div className="leaderboard-prompt-title">Nessun giro</div>
          <div className="leaderboard-prompt-text">
            Non ci sono giri registrati per <strong>{simParam}</strong> · <strong>{trackParam}</strong> · <strong>{categoryParam}</strong>.
          </div>
        </div>
      </div>
    );
  }

  const trackName = formatTrack(teamRecord?.track_id, tracks);
  const categoryDisplay = teamRecord?.race_class || categoryParam.toUpperCase();

  return (
    <div className="page">
      <Link to="/laps" className="drilldown-back">← Database Tempi</Link>

      <div className="drilldown-header">
        <div className="drilldown-meta">
          <SimBadge sim={simParam} />
          <span className="lap-badge-record">{categoryDisplay}</span>
        </div>
        <h1 className="page-title">{trackName}</h1>
        <div className="drilldown-summary">
          {driverBests.length} {driverBests.length === 1 ? 'pilota' : 'piloti'} · {lapsForCombo.length} {lapsForCombo.length === 1 ? 'giro' : 'giri'} totali
        </div>
        {isAdmin && (
          <button
            type="button"
            className="reset-btn"
            onClick={toggleShowExVsd}
            title="Di default i tempi degli ex piloti VSD sono nascosti dai confronti — solo tu puoi rivelarli"
          >
            {showExVsd ? '👁 Ex piloti visibili' : '🚫 Ex piloti nascosti'}
          </button>
        )}
      </div>

      {chartData.length >= 2 && (
        <div className="drilldown-chart-container">
          <div className="drilldown-section-title">Progressione tempi</div>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ top: 12, right: 24, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="date"
                stroke="rgba(255,255,255,0.4)"
                fontSize={11}
                tickFormatter={d => formatDate(d)}
              />
              <YAxis
                stroke="rgba(255,255,255,0.4)"
                fontSize={11}
                domain={['auto', 'auto']}
                tickFormatter={s => formatSeconds(s)}
                width={70}
              />
              <Tooltip
                contentStyle={{
                  background: '#0a0e1a',
                  border: '1px solid rgba(0,212,255,0.3)',
                  borderRadius: 6,
                  fontSize: 12,
                }}
                labelStyle={{ color: '#00d4ff', fontFamily: 'monospace' }}
                labelFormatter={d => formatDate(d)}
                formatter={(value, name) => [formatSeconds(value), name]}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              {driverNamesInChart.map(name => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={colorByDriver[name]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="drilldown-section-title">Best per pilota</div>
      <table className="laps-table drilldown-table">
        <thead>
          <tr>
            <th className="col-pos">#</th>
            <th>Pilota</th>
            <th>Auto</th>
            <th>Tempo</th>
            <th>Gap dal record</th>
            <th>Data</th>
          </tr>
        </thead>
        <tbody>
          {driverBests.map((rec, idx) => {
            const driver = driverMap[rec.driver_id];
            const isMe = currentUser?.driver_id === rec.driver_id;
            const isRecord = idx === 0;
            const rowClasses = [];
            if (isRecord) rowClasses.push('is-podium', 'pos-1');
            if (isMe) rowClasses.push('row-is-me');

            return (
              <tr key={rec.driver_id} className={rowClasses.join(' ')}>
                <td className="col-pos"><span className="pos-badge">{idx + 1}</span></td>
                <td>
                  {driver ? (
                    <Link to={`/roster/${driver.driver_id}`} className="driver-link">
                      <Avatar name={driver.display_name} driverId={driver.driver_id} size={28} photoUrl={resolvePhotoUrl(driver.driver_id, socialFlags)} />
                      <span className="driver-link-name">{driver.display_name}</span>
                      {isMe && <span className="me-badge">TU</span>}
                      {driver.is_ex_vsd && <span className="lap-badge-unclassified">EX</span>}
                    </Link>
                  ) : rec.driver_id}
                </td>
                <td>{formatCar(rec.car_id, cars)}</td>
                <td><LapTime ms={rec.lap_time_ms} /></td>
                <td>
                  {isRecord ? (
                    <span className="lap-badge-record">★ RECORD</span>
                  ) : teamRecord ? (
                    <span className="cell-gap">
                      {formatGapPercent(rec.lap_time_ms, teamRecord.lap_time_ms)}
                    </span>
                  ) : (
                    <span className="cell-gap">—</span>
                  )}
                </td>
                <td className="cell-date">
                  {formatDate(rec.set_date || rec.race_date || rec.lap_date || rec.created_at || rec.date)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Helper: secondi → "m:ss.SSS"
function formatSeconds(s) {
  if (s == null || !Number.isFinite(s)) return '';
  const totalMs = s * 1000;
  const m = Math.floor(totalMs / 60000);
  const sec = (totalMs % 60000) / 1000;
  return `${m}:${sec.toFixed(3).padStart(6, '0')}`;
}