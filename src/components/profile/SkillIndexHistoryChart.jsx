import {
  ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useSkillIndexHistory } from '../../hooks/useSkillIndex';
import { formatDate } from '../../utils/format';
import './SkillIndexHistoryChart.css';

/**
 * Andamento indice skill — traccia gli snapshot settimanali (via
 * runSkillIndexSnapshot) per mostrare se l'indice sta salendo o scendendo
 * nel tempo, non solo il valore attuale (già mostrato nella StatCard).
 *
 * Si nasconde da sola sotto i 2 punti: un solo snapshot non è un
 * andamento, è solo il numero che si vede già altrove.
 */
export default function SkillIndexHistoryChart({ driverId }) {
  const { data: snapshots, isLoading } = useSkillIndexHistory(driverId);

  if (isLoading || !snapshots || snapshots.length < 2) return null;

  const chartData = snapshots.map(s => ({
    date: s.snapshot_date,
    score: Number(s.score),
  }));

  const first = chartData[0].score;
  const last = chartData[chartData.length - 1].score;
  const delta = last - first;
  const deltaLabel = delta === 0 ? null : `${delta > 0 ? '+' : ''}${delta} dal primo snapshot`;

  return (
    <section className="sihc-section">
      <div className="sihc-section-head">
        <h3 className="sihc-section-title">Andamento Indice Skill</h3>
        {deltaLabel && (
          <span className={`sihc-delta ${delta > 0 ? 'sihc-delta-up' : 'sihc-delta-down'}`}>
            {deltaLabel}
          </span>
        )}
      </div>

      <div className="sihc-card">
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chartData} margin={{ top: 12, right: 20, left: 4, bottom: 4 }}>
            <defs>
              <linearGradient id="sihcFill" x1="0" y1="0" x2="0" y2="1">
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
              domain={[0, 100]}
              width={36}
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
              formatter={(value) => [value, 'Indice skill']}
            />
            <Area
              type="monotone"
              dataKey="score"
              stroke="var(--vsd-cyan)"
              strokeWidth={2.5}
              fill="url(#sihcFill)"
              dot={{ r: 3, fill: 'var(--vsd-cyan)', strokeWidth: 0 }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
