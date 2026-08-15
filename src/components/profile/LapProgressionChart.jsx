import { useState, useMemo } from 'react';
import {
  ComposedChart, Area, Line, ReferenceLine,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useMyLapProgression } from '../../hooks/useBestLaps';
import { formatTrack, formatCar, formatDate } from '../../utils/format';
import SimBadge from '../shared/SimBadge';
import './LapProgressionChart.css';

function formatLapMs(ms) {
  if (typeof ms !== 'number' || isNaN(ms)) return '—';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const mil = Math.round(ms % 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(mil).padStart(3, '0')}`;
}

function formatDelta(deltaMs) {
  if (typeof deltaMs !== 'number' || isNaN(deltaMs) || deltaMs === 0) return null;
  const sign = deltaMs > 0 ? '+' : '−';
  return `${sign}${Math.abs(deltaMs / 1000).toFixed(3)}s`;
}

/**
 * Curva di miglioramento — grafico "sessione dopo sessione" pensato per
 * rispondere a una domanda semplice: sto davvero migliorando qui?
 *
 * Mostra, per la combo (sim/pista/auto) più praticata dal pilota:
 * - i punti reali di ogni sessione (linea sottile, rumore incluso)
 * - la scalinata del miglior tempo storico (area piena, la vera "curva")
 * - il record di squadra come traguardo (linea tratteggiata), se la
 *   vettura ha una classe assegnata.
 *
 * Si nasconde da sola se il pilota non ha ancora almeno 3 sessioni su
 * nessuna combo: sotto quella soglia un grafico sarebbe solo rumore.
 */
export default function LapProgressionChart({ driverId, tracks, cars }) {
  const { data, isLoading } = useMyLapProgression(driverId);
  const [selectedKey, setSelectedKey] = useState(null);

  const combos = useMemo(() => data?.combos || [], [data]);
  const selected = useMemo(
    () => combos.find(c => c.key === selectedKey) || combos[0] || null,
    [combos, selectedKey]
  );

  if (isLoading || combos.length === 0) return null;

  const chartData = selected.points.map((p, i) => ({
    date: p.date,
    session: i + 1,
    dayBestSec: p.dayBestMs / 1000,
    cumBestSec: p.cumBestMs / 1000,
  }));

  const teamRecordSec = selected.teamRecordMs != null ? selected.teamRecordMs / 1000 : null;
  const gainMs = selected.firstMs != null && selected.bestMs != null
    ? selected.firstMs - selected.bestMs
    : null;
  const gainLabel = formatDelta(gainMs != null ? -gainMs : null); // gainMs positivo = migliorato → mostralo come "−"
  const isRecordHolder = teamRecordSec != null && Math.abs(selected.bestMs / 1000 - teamRecordSec) < 0.0005;
  const gapToRecordMs = teamRecordSec != null ? selected.bestMs - selected.teamRecordMs : null;

  return (
    <section className="lpc-section">
      <div className="lpc-section-head">
        <h3 className="lpc-section-title">Curva di Miglioramento</h3>
        <span className="lpc-section-meta">
          {selected.lapCount} giri · {selected.sessionCount} sessioni
        </span>
      </div>

      {combos.length > 1 && (
        <div className="lpc-combo-picker">
          {combos.slice(0, 6).map(c => (
            <button
              key={c.key}
              className={`lpc-combo-chip${c.key === selected.key ? ' is-active' : ''}`}
              onClick={() => setSelectedKey(c.key)}
            >
              <SimBadge sim={c.sim} size="sm" />
              <span>{formatTrack(c.trackId, tracks)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="lpc-card">
        <div className="lpc-card-head">
          <div className="lpc-track-info">
            <SimBadge sim={selected.sim} variant="solid" size="sm" />
            <span className="lpc-track-name">{formatTrack(selected.trackId, tracks)}</span>
            <span className="lpc-car-name">{formatCar(selected.carId, cars)}</span>
          </div>
          <div className="lpc-callouts">
            {gainLabel && (
              <div className="lpc-callout lpc-callout-gain">
                <span className="lpc-callout-value">{gainLabel}</span>
                <span className="lpc-callout-label">dalla prima sessione</span>
              </div>
            )}
            {isRecordHolder ? (
              <div className="lpc-callout lpc-callout-record">
                <span className="lpc-callout-value">🏆 Record</span>
                <span className="lpc-callout-label">sei tu il più veloce</span>
              </div>
            ) : gapToRecordMs != null && (
              <div className="lpc-callout">
                <span className="lpc-callout-value">{formatDelta(gapToRecordMs)}</span>
                <span className="lpc-callout-label">dal record squadra</span>
              </div>
            )}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartData} margin={{ top: 12, right: 20, left: 4, bottom: 4 }}>
            <defs>
              <linearGradient id="lpcBestFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--vsd-cyan)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--vsd-cyan)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="date"
              stroke="rgba(255,255,255,0.4)"
              fontSize={11}
              tickFormatter={d => formatDate(d)}
              minTickGap={24}
            />
            <YAxis
              stroke="rgba(255,255,255,0.4)"
              fontSize={11}
              domain={['dataMin - 0.3', 'dataMax + 0.3']}
              tickFormatter={s => formatLapMs(s * 1000)}
              width={72}
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
              formatter={(value, name) => [
                formatLapMs(value * 1000),
                name === 'cumBestSec' ? 'Miglior tempo storico' : 'Tempo della sessione',
              ]}
            />
            {teamRecordSec != null && (
              <ReferenceLine
                y={teamRecordSec}
                stroke="var(--vsd-orange)"
                strokeDasharray="5 4"
                strokeWidth={1.5}
                label={{
                  value: `Record squadra · ${formatLapMs(selected.teamRecordMs)}`,
                  position: 'insideTopRight',
                  fill: 'var(--vsd-orange)',
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                }}
              />
            )}
            <Area
              type="stepAfter"
              dataKey="cumBestSec"
              stroke="var(--vsd-cyan)"
              strokeWidth={2.5}
              fill="url(#lpcBestFill)"
              dot={false}
              activeDot={{ r: 4, fill: 'var(--vsd-cyan)' }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="dayBestSec"
              stroke="rgba(232,237,245,0.35)"
              strokeWidth={1.25}
              dot={{ r: 3, fill: 'rgba(232,237,245,0.5)', strokeWidth: 0 }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="lpc-legend">
          <span className="lpc-legend-item">
            <span className="lpc-legend-dot lpc-legend-dot-best" /> Miglior tempo storico
          </span>
          <span className="lpc-legend-item">
            <span className="lpc-legend-dot lpc-legend-dot-session" /> Ogni sessione
          </span>
          {teamRecordSec != null && (
            <span className="lpc-legend-item">
              <span className="lpc-legend-dot lpc-legend-dot-record" /> Record squadra
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
