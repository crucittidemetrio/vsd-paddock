import { useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { useFuelSummary } from '../../hooks/useFuelLog';
import './FuelPanel.css';

const FUEL_LABELS = { fuel_remaining_l: 'Carburante', virtual_energy_pct: 'Energia' };

/**
 * FuelPanel — consumo medio ed autonomia stimata, calcolati da
 * fuel.summary sui campioni inviati dal companion app
 * (companion/fuel_bridge.py) ad ogni giro completato.
 *
 * Riusato sia in Admin → Gestione stint (scopato alla vettura attiva
 * di una gara ufficiale) sia nella pagina pilota /carburante-energia
 * (scopato a un id sessione libero, gara o test).
 *
 * Polling ogni 15s: pensato per essere guardato DURANTE la sessione,
 * non solo in fase di pianificazione.
 *
 * @param {string} raceId - id gara ufficiale oppure etichetta libera di sessione
 * @param {string} carNumber
 */
export default function FuelPanel({ raceId, carNumber }) {
  // Giri residui inseriti a mano dal pilota — nessun automatismo legato
  // a planned_end_time dello stint: vale sia in gara sia nelle prove
  // libere, dove uno stint ufficiale non esiste nemmeno.
  const [targetLapsInput, setTargetLapsInput] = useState('');
  const targetLaps = targetLapsInput.trim() ? Number(targetLapsInput) : null;
  const validTarget = targetLaps != null && Number.isFinite(targetLaps) && targetLaps > 0;

  const { data, isLoading } = useFuelSummary(raceId, carNumber, validTarget ? targetLaps : null);

  const sampleCount = data?.sample_count || 0;
  const latest = data?.latest || null;
  const fuel = data?.fuel || null;
  const energy = data?.energy || null;

  const lapsRemaining = [fuel?.laps_remaining, energy?.laps_remaining]
    .filter(v => v != null)
    .reduce((min, v) => (min == null ? v : Math.min(min, v)), null);
  const lowWarning = lapsRemaining != null && lapsRemaining < 3;

  return (
    <section className="fp-section">
      <div className="fp-header">
        <h2 className="fp-title">Carburante / Energia — Vettura #{carNumber}</h2>
        {isLoading && <span className="fp-stale">aggiornamento…</span>}
      </div>

      {sampleCount === 0 ? (
        <div className="fp-empty">
          Nessun campione ricevuto ancora. Il companion app manda un campione
          ad ogni giro completato in pista — vedi companion/README.md.
        </div>
      ) : (
        <>
        <div className="fp-target">
          <label htmlFor="fp-target-laps">Quanti giri pensi ti restino?</label>
          <input
            id="fp-target-laps"
            type="number"
            min="1"
            inputMode="numeric"
            value={targetLapsInput}
            onChange={e => setTargetLapsInput(e.target.value)}
            placeholder="es. 8"
          />
          <span className="fp-target-hint">
            Inserimento manuale — nessun calcolo automatico da fine gara/stint.
          </span>
        </div>

        <div className={`fp-grid ${lowWarning ? 'fp-grid-warning' : ''}`}>
          <div className="fp-stat">
            <div className="fp-stat-label">Giro</div>
            <div className="fp-stat-value">{latest.lap_number}</div>
          </div>

          <div className="fp-stat">
            <div className="fp-stat-label">Carburante residuo</div>
            <div className="fp-stat-value">
              {latest.fuel_remaining_l != null ? `${latest.fuel_remaining_l.toFixed(1)} L` : '—'}
            </div>
            {fuel?.avg_per_lap_l != null && (
              <div className="fp-stat-sub">{fuel.avg_per_lap_l.toFixed(2)} L/giro medio</div>
            )}
          </div>

          <div className="fp-stat">
            <div className="fp-stat-label">Autonomia carburante</div>
            <div className="fp-stat-value">
              {fuel?.laps_remaining != null ? `${fuel.laps_remaining.toFixed(1)} giri` : '—'}
            </div>
          </div>

          {validTarget && fuel?.needed_for_target_l != null && (
            <div className="fp-stat fp-stat-target">
              <div className="fp-stat-label">Rabbocco consigliato ({targetLaps} giri)</div>
              <div className="fp-stat-value">
                {fuel.needed_for_target_l > 0
                  ? `+${fuel.needed_for_target_l.toFixed(1)} L`
                  : 'Basta quello che hai'}
              </div>
            </div>
          )}

          {energy && (
            <>
              <div className="fp-stat">
                <div className="fp-stat-label">Energia virtuale residua</div>
                <div className="fp-stat-value">
                  {latest.virtual_energy_pct != null ? `${latest.virtual_energy_pct.toFixed(0)}%` : '—'}
                </div>
                {energy.avg_pct_per_lap != null && (
                  <div className="fp-stat-sub">{energy.avg_pct_per_lap.toFixed(1)}%/giro medio</div>
                )}
              </div>

              <div className="fp-stat">
                <div className="fp-stat-label">Autonomia energia</div>
                <div className="fp-stat-value">
                  {energy.laps_remaining != null ? `${energy.laps_remaining.toFixed(1)} giri` : '—'}
                </div>
              </div>

              {validTarget && energy.needed_for_target_pct != null && (
                <div className="fp-stat fp-stat-target">
                  <div className="fp-stat-label">Energia consigliata ({targetLaps} giri)</div>
                  <div className="fp-stat-value">
                    {energy.needed_for_target_pct > 0
                      ? `+${energy.needed_for_target_pct.toFixed(0)}%`
                      : 'Basta quella che hai'}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {data?.series?.length >= 2 && (
          <div className="fp-chart">
            <div className="fp-chart-title">Andamento consumo per giro</div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data.series} margin={{ top: 8, right: 20, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id="fpFuelGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00d4ff" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#00d4ff" stopOpacity={0} />
                  </linearGradient>
                  {energy && (
                    <linearGradient id="fpEnergyGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f5a623" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#f5a623" stopOpacity={0} />
                    </linearGradient>
                  )}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="lap_number"
                  stroke="rgba(255,255,255,0.4)"
                  fontSize={11}
                  label={{ value: 'Giro', position: 'insideBottom', offset: -2, fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                />
                <YAxis
                  yAxisId="fuel"
                  stroke="#00d4ff"
                  fontSize={11}
                  width={46}
                  tickFormatter={v => `${v}L`}
                />
                {energy && (
                  <YAxis
                    yAxisId="energy"
                    orientation="right"
                    stroke="#f5a623"
                    fontSize={11}
                    width={42}
                    domain={[0, 100]}
                    tickFormatter={v => `${v}%`}
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
                  labelFormatter={l => `Giro ${l}`}
                  formatter={(value, name) => [
                    name === 'fuel_remaining_l' ? `${Number(value).toFixed(1)} L` : `${Number(value).toFixed(0)}%`,
                    FUEL_LABELS[name] || name,
                  ]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
                  formatter={name => FUEL_LABELS[name] || name}
                />
                <Area
                  yAxisId="fuel"
                  type="monotone"
                  dataKey="fuel_remaining_l"
                  stroke="#00d4ff"
                  strokeWidth={2}
                  fill="url(#fpFuelGradient)"
                  dot={{ r: 2 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
                {energy && (
                  <Area
                    yAxisId="energy"
                    type="monotone"
                    dataKey="virtual_energy_pct"
                    stroke="#f5a623"
                    strokeWidth={2}
                    fill="url(#fpEnergyGradient)"
                    dot={{ r: 2 }}
                    activeDot={{ r: 5 }}
                    connectNulls
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
        </>
      )}

      {lowWarning && (
        <div className="fp-warning">
          ⚠ Autonomia stimata sotto i 3 giri — valuta un rientro a breve.
        </div>
      )}
    </section>
  );
}
