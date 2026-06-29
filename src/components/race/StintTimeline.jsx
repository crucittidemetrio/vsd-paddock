import './StintTimeline.css';

const STINT_STATUS = {
  planned:   { label: 'PIANIFICATO', cls: 'st-status-planned' },
  active:    { label: 'IN CORSO',    cls: 'st-status-active' },
  completed: { label: 'CONCLUSO',    cls: 'st-status-completed' },
  aborted:   { label: 'ANNULLATO',   cls: 'st-status-aborted' },
};

const TIRE_LABELS = {
  soft:         { label: 'Soft', cls: 'st-tire-soft' },
  medium:       { label: 'Medium', cls: 'st-tire-medium' },
  hard:         { label: 'Hard', cls: 'st-tire-hard' },
  wet:          { label: 'Wet', cls: 'st-tire-wet' },
  intermediate: { label: 'Inter', cls: 'st-tire-inter' },
};

function formatClock(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    // Potrebbe essere già una stringa hh:mm
    return String(iso);
  }
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Stato EFFETTIVO dello stint, ibrido:
 * - 'aborted' è uno status FORTE: impostato a mano (es. ritiro/incidente), va sempre rispettato.
 * - altrimenti lo stato si CALCOLA dal tempo corrente vs orari pianificati, così la timeline
 *   "vive" durante la gara senza che nessuno aggiorni i campi a mano.
 * Fallback: orari non parsabili → usa il campo status grezzo (o 'planned').
 */
function computeStatus(stint, nowMs) {
  if (stint.status === 'aborted') return 'aborted';
  const startMs = new Date(stint.planned_start_time).getTime();
  const endMs = new Date(stint.planned_end_time).getTime();
  if (isNaN(startMs) || isNaN(endMs)) return stint.status || 'planned';
  if (nowMs >= endMs) return 'completed';
  if (nowMs >= startMs) return 'active';
  return 'planned';
}

/**
 * Minuti rimanenti alla fine di uno stint IN CORSO (per il countdown).
 * Ritorna null se lo stint non è in corso o orari non validi.
 */
function minutesToEnd(stint, nowMs) {
  const startMs = new Date(stint.planned_start_time).getTime();
  const endMs = new Date(stint.planned_end_time).getTime();
  if (isNaN(startMs) || isNaN(endMs)) return null;
  if (nowMs < startMs || nowMs >= endMs) return null;
  return Math.round((endMs - nowMs) / 60000);
}

/**
 * Timeline stint read-only per gare endurance.
 * Visibile ai piloti loggati; nessun controllo edit/delete (solo admin page).
 *
 * Lo STATUS è calcolato dal tempo reale (ibrido con 'aborted' forte): la timeline
 * mostra concluso/in corso/pianificato in base all'ora corrente, e un countdown
 * sullo stint attivo. Si aggiorna a ogni render (apertura/refresh pagina).
 *
 * @param {Array}    stints           - lista stint (già unwrapped, shape { stint_id, driver_id, stint_order, ... })
 * @param {Array}    drivers          - roster per join id→nome
 * @param {string}   currentDriverId  - driver_id del pilota loggato (per highlight)
 * @param {Function} getDriverName    - (driverId, drivers) => string, riusato da RaceDetail
 * @param {Function} formatDuration   - (minutes) => string, riusato da RaceDetail
 * @param {Function} formatLapMs      - (ms) => string|null, riusato da RaceDetail
 */
export default function StintTimeline({
  stints,
  drivers,
  currentDriverId,
  getDriverName,
  formatDuration,
  formatLapMs,
}) {
  const list = Array.isArray(stints) ? stints : [];
  if (list.length === 0) return null;

  const nowMs = Date.now();

  // stint_order ascendente — rispetta override manuale admin (Phase 5), NO sort per orario
  const ordered = [...list].sort((a, b) => {
    const ao = Number(a.stint_order); const bo = Number(b.stint_order);
    if (isNaN(ao) && isNaN(bo)) return 0;
    if (isNaN(ao)) return 1;
    if (isNaN(bo)) return -1;
    return ao - bo;
  });

  return (
    <section className="st-section">
      <div className="st-header">
        <h2 className="st-title">Piano Stint</h2>
        <span className="st-count">{ordered.length} stint</span>
      </div>

      <div className="st-table-wrap">
        <table className="st-table">
          <thead>
            <tr>
              <th className="st-col-order">#</th>
              <th className="st-col-driver">Pilota</th>
              <th className="st-col-time">Inizio</th>
              <th className="st-col-time">Fine</th>
              <th className="st-col-dur">Durata</th>
              <th className="st-col-tire">Gomme</th>
              <th className="st-col-lap">Best Lap</th>
              <th className="st-col-status">Status</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((s, i) => {
              const isMine = currentDriverId && s.driver_id === currentDriverId;
              const effStatus = computeStatus(s, nowMs);
              const status = STINT_STATUS[effStatus] || { label: (effStatus || '—').toUpperCase(), cls: 'st-status-unknown' };
              const tire = TIRE_LABELS[s.tire_compound] || (s.tire_compound ? { label: s.tire_compound, cls: 'st-tire-unknown' } : null);
              const lap = formatLapMs ? formatLapMs(s.best_lap_ms) : null;
              const isActive = effStatus === 'active';
              const remain = isActive ? minutesToEnd(s, nowMs) : null;
              const rowCls = ['st-row', isMine ? 'st-row-mine' : '', isActive ? 'st-row-active' : ''].filter(Boolean).join(' ');

              return (
                <tr key={s.stint_id || `${s.driver_id}-${s.stint_order}-${i}`} className={rowCls}>
                  <td className="st-pos">{s.stint_order ?? i + 1}</td>
                  <td className="st-driver">
                    {getDriverName(s.driver_id, drivers)}
                    {isMine && <span className="st-mine-tag">TU</span>}
                  </td>
                  <td>{formatClock(s.planned_start_time)}</td>
                  <td>{formatClock(s.planned_end_time)}</td>
                  <td>{formatDuration ? formatDuration(s.planned_duration_min) : (s.planned_duration_min ?? '—')}</td>
                  <td>
                    {tire
                      ? <span className={`st-tire ${tire.cls}`}>{tire.label}</span>
                      : <span className="st-dash">—</span>}
                    {(s.pit_stop_at_end === true || s.pit_stop_at_end === 'TRUE') && (
                      <span className="st-pit" title="Pit stop a fine stint">PIT</span>
                    )}
                  </td>
                  <td className="st-lap">{lap || <span className="st-dash">—</span>}</td>
                  <td>
                    <span className={`st-badge ${status.cls}`}>{status.label}</span>
                    {remain !== null && <span className="st-countdown">−{remain}min</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
