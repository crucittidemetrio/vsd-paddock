import { useMemo, useState } from 'react';
import {
  AreaChart, Area, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { useFuelSummary } from '../../hooks/useFuelLog';
import { useNow } from '../../hooks/useNow';
import './FuelPanel.css';

const FUEL_LABELS = { fuel_remaining_l: 'Carburante', virtual_energy_pct: 'Energia' };

function formatLapTimeS(s) {
  if (s == null || !Number.isFinite(s)) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
}

/**
 * FuelPanel — consumo medio ed autonomia stimata, calcolati da
 * fuel.summary sui campioni inviati dal companion app
 * (companion/fuel_bridge.py) ad ogni giro completato. Mostra anche
 * pista/vettura auto-rilevate (latest.track_name/vehicle_name) e
 * velocità min/max/media di sessione (data.speed), se il companion le
 * manda — tutti opzionali, retrocompatibile con companion più vecchi.
 *
 * Riusato sia in Admin → Gestione stint (scopato alla vettura attiva
 * di una gara ufficiale) sia nella pagina pilota /carburante-energia
 * (scopato a una sessione personale auto-rilevata da fuel.mySession,
 * nessun id digitato).
 *
 * Polling ogni 15s: pensato per essere guardato DURANTE la sessione,
 * non solo in fase di pianificazione.
 *
 * @param {string} raceId - id gara ufficiale oppure etichetta libera di sessione
 * @param {string} carNumber
 * @param {string|null} [plannedEndTime] - fine pianificata dello stint attivo
 *   (planned_end_time di EnduranceStints), passata SOLO da AdminRaceStints
 *   per gare ufficiali con uno stint in corso. Se presente, i giri residui
 *   vengono precompilati automaticamente (fine stint / tempo medio sul
 *   giro) invece di richiedere l'inserimento a mano — il pilota può
 *   comunque sovrascriverli. Nelle prove libere resta manuale, com'era.
 */
export default function FuelPanel({ raceId, carNumber, plannedEndTime = null }) {
  // null = nessun inserimento manuale ancora, segui il calcolo
  // automatico (se disponibile). Una volta che il pilota scrive
  // qualcosa (anche vuoto), il suo input vince finché non clicca
  // "usa il calcolo automatico".
  const [manualInputText, setManualInputText] = useState(null);
  const manualTargetLaps = manualInputText?.trim() ? Number(manualInputText) : null;
  const manualValidTarget = manualTargetLaps != null && Number.isFinite(manualTargetLaps) && manualTargetLaps > 0;

  // Solo il valore inserito a mano viaggia fino al backend (comportamento
  // identico a prima per chi lo usa così). Il calcolo automatico è
  // derivato qui sotto, client-side, dagli stessi ingredienti che il
  // backend userebbe (fuel.avg_per_lap_l / energy.avg_pct_per_lap /
  // latest) — evita un giro a vuoto backend->frontend->backend solo per
  // scoprire un numero che possiamo già calcolare con i dati in mano.
  const { data, isLoading, error } = useFuelSummary(raceId, carNumber, manualValidTarget ? manualTargetLaps : null);

  const latest = data?.latest || null;
  const fuel = data?.fuel || null;
  const energy = data?.energy || null;
  const speed = data?.speed || null;

  // Preferiamo il nome vettura auto-rilevato dal companion (stessa
  // shared memory di fuel/lap) al numero digitato/risolto — più leggibile
  // e disponibile anche nelle sessioni personali dove carNumber è solo
  // un segnaposto interno ("SOLO"). Fallback al vecchio comportamento
  // se un companion non aggiornato non lo manda ancora.
  const headerLabel = latest?.vehicle_name ? latest.vehicle_name : `Vettura #${carNumber}`;

  // Giri residui calcolati da fine stint pianificata + tempo medio sul
  // giro osservato in questa sessione — solo se entrambi disponibili.
  // "now" ticka ogni 15s (stesso ritmo del polling) invece di leggere
  // Date.now() durante il render, che React considera una lettura
  // impura e non idempotente.
  const now = useNow(15000);
  const autoTargetLaps = useMemo(() => {
    if (!plannedEndTime || !data?.avg_lap_time_s) return null;
    const msRemaining = new Date(plannedEndTime).getTime() - now;
    if (!Number.isFinite(msRemaining) || msRemaining <= 0) return null;
    return Math.max(1, Math.ceil(msRemaining / (data.avg_lap_time_s * 1000)));
  }, [plannedEndTime, data?.avg_lap_time_s, now]);

  const usingAuto = manualInputText == null && autoTargetLaps != null;
  const effectiveTargetLaps = manualValidTarget ? manualTargetLaps : (usingAuto ? autoTargetLaps : null);

  const targetLapsInputValue = manualInputText != null
    ? manualInputText
    : (autoTargetLaps != null ? String(autoTargetLaps) : '');

  function handleTargetInputChange(e) {
    setManualInputText(e.target.value);
  }

  function resetToAuto() {
    setManualInputText(null);
  }

  // Rabbocco consigliato: dal backend se c'è un valore inserito a mano
  // (fuel.needed_for_target_l già pronto), altrimenti calcolato qui con
  // la stessa formula per il valore automatico.
  const fuelNeeded = manualValidTarget
    ? fuel?.needed_for_target_l
    : (usingAuto && fuel?.avg_per_lap_l != null && latest?.fuel_remaining_l != null
        ? Math.max(0, autoTargetLaps * fuel.avg_per_lap_l - latest.fuel_remaining_l)
        : null);

  const energyNeeded = manualValidTarget
    ? energy?.needed_for_target_pct
    : (usingAuto && energy?.avg_pct_per_lap != null && latest?.virtual_energy_pct != null
        ? Math.max(0, autoTargetLaps * energy.avg_pct_per_lap - latest.virtual_energy_pct)
        : null);

  const lapsRemaining = [fuel?.laps_remaining, energy?.laps_remaining]
    .filter(v => v != null)
    .reduce((min, v) => (min == null ? v : Math.min(min, v)), null);
  const lowWarning = lapsRemaining != null && lapsRemaining < 3;

  // Passo gara stimato dal tempo reale tra due campioni consecutivi del
  // companion (un campione per giro completato) — NON è il timer di
  // sessione del gioco, quindi include eventuali ritardi di rete. Utile
  // per vedere l'ANDAMENTO (tiene? cala? un pit si vede come picco), non
  // per confrontare tempi assoluti con la classifica ufficiale.
  const paceSeries = (data?.series || []).filter(p => p.lap_time_s != null);

  return (
    <section className="fp-section">
      <div className="fp-header">
        <h2 className="fp-title">
          Carburante / Energia — {headerLabel}
          {latest?.track_name && <span className="fp-track"> · {latest.track_name}</span>}
        </h2>
        {data?.live && <span className="fp-live-badge">● live</span>}
        {isLoading && <span className="fp-stale">aggiornamento…</span>}
      </div>

      {error ? (
        <div className="fp-error">
          Impossibile caricare i dati ({error.message || 'errore sconosciuto'}).
          Se il companion app sta comunque inviando campioni (li vedresti loggati
          nella finestra nera), il problema più probabile è la sessione del sito:
          prova a ricaricare la pagina o a rifare il login.
        </div>
      ) : !latest ? (
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
            value={targetLapsInputValue}
            onChange={handleTargetInputChange}
            placeholder="es. 8"
          />
          {usingAuto ? (
            <span className="fp-target-hint fp-target-auto">
              calcolato da fine stint — modificabile
            </span>
          ) : plannedEndTime && autoTargetLaps != null ? (
            <>
              <span className="fp-target-hint">inserito a mano</span>
              <button type="button" className="fp-target-reset" onClick={resetToAuto}>
                usa il calcolo automatico
              </button>
            </>
          ) : (
            <span className="fp-target-hint">
              Inserimento manuale — nessun calcolo automatico in questa sessione.
            </span>
          )}
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

          {effectiveTargetLaps != null && fuelNeeded != null && (
            <div className="fp-stat fp-stat-target">
              <div className="fp-stat-label">Rabbocco consigliato ({effectiveTargetLaps} giri)</div>
              <div className="fp-stat-value">
                {fuelNeeded > 0
                  ? `+${fuelNeeded.toFixed(1)} L`
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

              {effectiveTargetLaps != null && energyNeeded != null && (
                <div className="fp-stat fp-stat-target">
                  <div className="fp-stat-label">Energia consigliata ({effectiveTargetLaps} giri)</div>
                  <div className="fp-stat-value">
                    {energyNeeded > 0
                      ? `+${energyNeeded.toFixed(0)}%`
                      : 'Basta quella che hai'}
                  </div>
                </div>
              )}
            </>
          )}

          {speed && (
            <>
              <div className="fp-stat">
                <div className="fp-stat-label">Velocità min</div>
                <div className="fp-stat-value">{speed.session_min_kmh.toFixed(0)} km/h</div>
              </div>
              <div className="fp-stat">
                <div className="fp-stat-label">Velocità media</div>
                <div className="fp-stat-value">{speed.session_avg_kmh.toFixed(0)} km/h</div>
              </div>
              <div className="fp-stat">
                <div className="fp-stat-label">Velocità max</div>
                <div className="fp-stat-value">{speed.session_max_kmh.toFixed(0)} km/h</div>
              </div>
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

        {paceSeries.length >= 3 && (
          <div className="fp-chart">
            <div className="fp-chart-title">
              Passo Gara (stimato)
              <span className="fp-chart-caveat">
                dal tempo tra i campioni, non dal timer di sessione — i picchi sono probabili pit stop
              </span>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={paceSeries} margin={{ top: 8, right: 20, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="lap_number"
                  stroke="rgba(255,255,255,0.4)"
                  fontSize={11}
                  label={{ value: 'Giro', position: 'insideBottom', offset: -2, fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.4)"
                  fontSize={11}
                  width={50}
                  domain={['dataMin - 2', 'dataMax + 2']}
                  tickFormatter={formatLapTimeS}
                />
                <Tooltip
                  contentStyle={{
                    background: '#0a0e1a',
                    border: '1px solid rgba(0,212,255,0.3)',
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: '#00d4ff', fontFamily: 'monospace' }}
                  labelFormatter={l => `Giro ${l}`}
                  formatter={value => [formatLapTimeS(value), 'Passo stimato']}
                />
                <Line
                  type="monotone"
                  dataKey="lap_time_s"
                  stroke="var(--vsd-cyan)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              </ComposedChart>
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
