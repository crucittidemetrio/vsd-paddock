import { useMemo } from 'react';
import {
  ComposedChart, Line, ReferenceLine,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useMyLapProgression } from '../../hooks/useBestLaps';
import { formatTrack, formatCar, formatDate } from '../../utils/format';
import SimBadge from '../shared/SimBadge';
import './RivalryChart.css';

function formatLapMs(ms) {
  if (typeof ms !== 'number' || isNaN(ms)) return '—';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const mil = Math.round(ms % 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(mil).padStart(3, '0')}`;
}

/**
 * Valore "in vigore" a una certa data: l'ultimo cumBestMs registrato in
 * quella data o prima (forward-fill). Serve per unire due serie di
 * sessioni diverse (A e B non girano mai esattamente negli stessi giorni)
 * su un unico asse temporale condiviso.
 */
function valueAt(points, date) {
  let val = null;
  for (const p of points) {
    if (p.date > date) break;
    val = p.cumBestMs;
  }
  return val;
}

/**
 * Sceglie, tra le combo (sim/pista/auto) che ENTRAMBI i piloti hanno
 * praticato a sufficienza (soglia già applicata da useMyLapProgression),
 * quella più "condivisa": il minimo tra le due sessioni-conteggio più
 * alto, per privilegiare la combo dove il confronto è più solido su
 * entrambi i lati, non solo trainata da uno dei due.
 */
function pickSharedCombo(combosA, combosB) {
  if (!combosA?.length || !combosB?.length) return null;
  const mapB = new Map(combosB.map(c => [c.key, c]));
  let best = null;
  combosA.forEach(comboA => {
    const comboB = mapB.get(comboA.key);
    if (!comboB) return;
    const score = Math.min(comboA.sessionCount, comboB.sessionCount);
    if (!best || score > best.score) {
      best = { comboA, comboB, score };
    }
  });
  return best;
}

/**
 * Rivalry Chart — le due curve di miglioramento di A e B sovrapposte
 * sulla combo pista/auto più praticata da ENTRAMBI, con lo stesso
 * linguaggio visivo della Curva di Miglioramento del profilo (scalinata
 * del miglior tempo storico), ma qui la domanda non è "sto migliorando"
 * bensì "chi sta rimontando su chi".
 *
 * Si nasconde da sola se A e B non condividono nessuna combo con almeno
 * 3 sessioni a testa (stessa soglia della curva singola).
 */
export default function RivalryChart({ aId, bId, nameA, nameB, tracks, cars }) {
  const progA = useMyLapProgression(aId);
  const progB = useMyLapProgression(bId);

  const shared = useMemo(
    () => pickSharedCombo(progA.data?.combos, progB.data?.combos),
    [progA.data, progB.data]
  );

  if (progA.isLoading || progB.isLoading || !shared) return null;

  const { comboA, comboB } = shared;

  const datesUnion = Array.from(new Set([
    ...comboA.points.map(p => p.date),
    ...comboB.points.map(p => p.date),
  ])).sort();

  const chartData = datesUnion.map(date => {
    const aMs = valueAt(comboA.points, date);
    const bMs = valueAt(comboB.points, date);
    return {
      date,
      aSec: aMs != null ? aMs / 1000 : null,
      bSec: bMs != null ? bMs / 1000 : null,
    };
  });

  const teamRecordMs = comboA.teamRecordMs ?? comboB.teamRecordMs ?? null;
  const teamRecordSec = teamRecordMs != null ? teamRecordMs / 1000 : null;

  const leaderIsA = comboA.bestMs < comboB.bestMs;
  const gapMs = Math.abs(comboA.bestMs - comboB.bestMs);
  const leaderName = leaderIsA ? nameA : nameB;

  return (
    <div className="cmp-section">
      <div className="cmp-section-title">
        Rimonta — {formatTrack(comboA.trackId, tracks)}
      </div>

      <div className="rlv-card">
        <div className="rlv-card-head">
          <div className="rlv-track-info">
            <SimBadge sim={comboA.sim} variant="solid" size="sm" />
            <span className="rlv-track-name">{formatTrack(comboA.trackId, tracks)}</span>
            <span className="rlv-car-name">{formatCar(comboA.carId, cars)}</span>
          </div>
          {gapMs > 0 && (
            <div className="rlv-callout">
              <span className="rlv-callout-value">{leaderName}</span>
              <span className="rlv-callout-label">
                avanti di {(gapMs / 1000).toFixed(3)}s
              </span>
            </div>
          )}
        </div>

        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={chartData} margin={{ top: 12, right: 20, left: 4, bottom: 4 }}>
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
                value != null ? formatLapMs(value * 1000) : '—',
                name === 'aSec' ? nameA : nameB,
              ]}
            />
            {teamRecordSec != null && (
              <ReferenceLine
                y={teamRecordSec}
                stroke="var(--vsd-orange)"
                strokeDasharray="5 4"
                strokeWidth={1.5}
                label={{
                  value: `Record squadra · ${formatLapMs(teamRecordMs)}`,
                  position: 'insideTopRight',
                  fill: 'var(--vsd-orange)',
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                }}
              />
            )}
            <Line
              type="stepAfter"
              dataKey="aSec"
              stroke="var(--vsd-cyan)"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
              connectNulls={false}
            />
            <Line
              type="stepAfter"
              dataKey="bSec"
              stroke="var(--vsd-blue)"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>

        <div className="rlv-legend">
          <span className="rlv-legend-item">
            <span className="rlv-legend-dot rlv-legend-dot-a" /> {nameA}
          </span>
          <span className="rlv-legend-item">
            <span className="rlv-legend-dot rlv-legend-dot-b" /> {nameB}
          </span>
          {teamRecordSec != null && (
            <span className="rlv-legend-item">
              <span className="rlv-legend-dot rlv-legend-dot-record" /> Record squadra
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
