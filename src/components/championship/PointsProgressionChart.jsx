import { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import { useChampionshipProgression } from '../../hooks/useChampionshipStandings';
import { computeRoundPositions, seriesKey } from '../../utils/standingsPositions';
import './PointsProgressionChart.css';

// Stessa palette di LapsDrilldown: 8 colori distinti, riconoscibili anche
// ravvicinati su una linea sottile.
const CHART_COLORS = [
  '#00d4ff', '#3b8bff', '#f5a623', '#ef3340',
  '#22c55e', '#a855f7', '#ec4899', '#eab308',
];

const MAX_DRIVERS = 8;

/**
 * Andamento Punti — la classica curva di campionato: punti cumulativi
 * gara dopo gara, una linea per pilota. Limitata ai primi 8 in classifica
 * (oltre diventa illeggibile) con quello loggato sempre incluso ed
 * evidenziato, anche se fuori dalla top 8.
 *
 * Si nasconde da sola sotto le 2 gare (una sola gara non è "andamento",
 * è solo un punto).
 */
export default function PointsProgressionChart({ championshipId, className, currentDriverId }) {
  const { data, isLoading } = useChampionshipProgression(championshipId, className, {
    enabled: Boolean(championshipId),
  });

  const [mode, setMode] = useState('points'); // 'points' | 'positions'

  // Modalità "Posizioni": una riga per round disputato, valore = posizione
  // in classifica dopo quel round (asse Y invertito, 1 in alto).
  const positionData = useMemo(() => {
    if (!data?.rounds?.length) return { rows: [], fieldSize: 0 };
    const { completed, positions } = computeRoundPositions(data.series || [], data.rounds);
    const rows = completed.map((roundIdx, j) => {
      const r = data.rounds[roundIdx];
      const row = { label: r.label, date: r.date };
      (data.series || []).forEach(s => {
        const name = s.display_name || s.driver_id || '—';
        row[name] = positions[seriesKey(s)]?.[j] ?? null;
      });
      return row;
    });
    return { rows, fieldSize: (data.series || []).length };
  }, [data]);

  // Solo round già disputati (almeno un punto assegnato): prima i round
  // futuri comparivano come linee piatte fino a fine stagione.
  const chartData = useMemo(() => {
    if (!data?.rounds?.length) return [];
    const { completed } = computeRoundPositions(data.series || [], data.rounds);
    return completed.map((i) => {
      const r = data.rounds[i];
      const row = { label: r.label, date: r.date };
      (data.series || []).forEach(s => {
        const name = s.display_name || s.driver_id || '—';
        row[name] = s.points[i];
      });
      return row;
    });
  }, [data]);

  const shownSeries = useMemo(() => {
    if (!data?.series?.length) return [];
    const sorted = [...data.series].sort((a, b) => b.total - a.total);
    const top = sorted.slice(0, MAX_DRIVERS);
    if (currentDriverId && !top.some(s => s.driver_id === currentDriverId)) {
      const mine = sorted.find(s => s.driver_id === currentDriverId);
      if (mine) top.push(mine);
    }
    return top;
  }, [data, currentDriverId]);

  if (isLoading || !data?.rounds || chartData.length < 2 || shownSeries.length === 0) return null;

  return (
    <section className="ppc-section">
      <div className="ppc-section-head">
        <h3 className="ppc-section-title">{mode === 'points' ? 'Andamento Punti' : 'Andamento Posizioni'}</h3>
        <span className="ppc-section-meta">{data.class_name}</span>
        <div className="ppc-toggle" role="tablist">
          <button type="button" className={mode === 'points' ? 'is-active' : ''} onClick={() => setMode('points')}>Punti</button>
          <button
            type="button"
            className={mode === 'positions' ? 'is-active' : ''}
            onClick={() => setMode('positions')}
            disabled={positionData.rows.length < 2}
          >
            Posizioni
          </button>
        </div>
      </div>

      <div className="ppc-card">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={mode === 'points' ? chartData : positionData.rows} margin={{ top: 12, right: 24, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="label"
              stroke="rgba(255,255,255,0.4)"
              fontSize={11}
            />
            {mode === 'points' ? (
              <YAxis
                stroke="rgba(255,255,255,0.4)"
                fontSize={11}
                width={40}
              />
            ) : (
              <YAxis
                reversed
                allowDecimals={false}
                domain={[1, Math.max(positionData.fieldSize, 1)]}
                stroke="rgba(255,255,255,0.4)"
                fontSize={11}
                width={40}
                tickFormatter={(v) => `P${v}`}
              />
            )}
            <Tooltip
              contentStyle={{
                background: '#0a0e1a',
                border: '1px solid rgba(0,212,255,0.3)',
                borderRadius: 6,
                fontSize: 12,
              }}
              labelStyle={{ color: '#00d4ff', fontFamily: 'monospace' }}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            {shownSeries.map((s, i) => {
              const name = s.display_name || s.driver_id || '—';
              const isMine = currentDriverId && s.driver_id === currentDriverId;
              return (
                <Line
                  key={name}
                  type={mode === 'points' ? 'monotone' : 'linear'}
                  dataKey={name}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={isMine ? 3.5 : 2}
                  dot={{ r: isMine ? 4 : 3 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
