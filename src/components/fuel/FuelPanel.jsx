import { useFuelSummary } from '../../hooks/useFuelLog';
import './FuelPanel.css';

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
  const { data, isLoading } = useFuelSummary(raceId, carNumber);

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
            </>
          )}
        </div>
      )}

      {lowWarning && (
        <div className="fp-warning">
          ⚠ Autonomia stimata sotto i 3 giri — valuta un rientro a breve.
        </div>
      )}
    </section>
  );
}
