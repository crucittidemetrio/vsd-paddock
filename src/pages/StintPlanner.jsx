import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStintPlanner } from '../hooks/useStintPlanner';
import { useStints } from '../hooks/useEnduranceStints';
import { useRace } from '../hooks/useRaces';
import { useDrivers } from '../hooks/useRoster';
import Avatar from '../components/shared/Avatar';
import styles from './StintPlanner.module.css';

/**
 * StintPlanner — pianificazione assistita degli stint per una gara endurance.
 *
 * Flusso: imposta parametri → Genera → rivedi/modifica la tabella → (validazione
 * live) → Conferma (scrive sul foglio). Consuma l'hook useStintPlanner.
 *
 * Validazione: client-side, istantanea, ricalcolata a ogni modifica del piano.
 * Pagina dedicata (Opzione A), gating staff via route admin.
 */
export default function StintPlanner() {
  const { raceId } = useParams();
  const navigate = useNavigate();

  const { data: raceData } = useRace(raceId);
  const { data: drivers = [] } = useDrivers();
  const { data: stintsResponse } = useStints(raceId);

  const existingStints = useMemo(() => stintsResponse?.stints || [], [stintsResponse]);

  const driverById = useMemo(() => {
    const m = {};
    (drivers || []).forEach(d => { m[d.driver_id] = d; });
    return m;
  }, [drivers]);

  // useRace può tornare { race } o l'oggetto diretto: tolleriamo entrambe le forme
  const race = useMemo(() => raceData?.race || raceData || null, [raceData]);

  const {
    plan, validation, isGenerating, isConfirming, error,
    generate, updateStintInPlan, validate, confirm, reset,
  } = useStintPlanner();

  // Piloti selezionabili: attivi + trial
  const selectableDrivers = useMemo(
    () => (drivers || []).filter(d => d.status === 'active' || d.status === 'trial'),
    [drivers]
  );

  // Parametri del form di generazione
  const [carNumber, setCarNumber] = useState('');
  const [startTime, setStartTime] = useState(race?.date?.slice(0, 16) || '');
  const [totalDuration, setTotalDuration] = useState(race?.duration_minutes || 1440);
  const [targetStint, setTargetStint] = useState(90);
  const [selectedDrivers, setSelectedDrivers] = useState([]); // array di driver_id, in ordine di rotazione
  const [maxHoursPerDriver, setMaxHoursPerDriver] = useState('');
  const [minRestMinutes, setMinRestMinutes] = useState('');

  const [confirmError, setConfirmError] = useState(null);
  const [confirmSuccess, setConfirmSuccess] = useState(null);

  function toggleDriver(driverId) {
    setSelectedDrivers(prev =>
      prev.includes(driverId) ? prev.filter(d => d !== driverId) : [...prev, driverId]
    );
  }

  function handleGenerate() {
    setConfirmError(null);
    setConfirmSuccess(null);
    generate({
      race_id: raceId,
      car_number: carNumber.trim(),
      race_start_time: startTime,
      total_duration_min: Number(totalDuration),
      target_stint_min: Number(targetStint),
      driver_ids: selectedDrivers,
    });
  }

  // Stint già esistenti per QUESTA vettura — scopa l'avviso di sostituzione:
  // confermare il piano dell'auto #8 non deve minacciare di sovrascrivere
  // quelli dell'auto #7 sulla stessa gara.
  const existingStintsForCar = useMemo(
    () => existingStints.filter(s => String(s.car_number || '').trim() === carNumber.trim()),
    [existingStints, carNumber]
  );

 // Validazione live: ricalcola a ogni render quando c'è un piano
  const liveValidation = useMemo(() => {
    if (!plan || plan.length === 0) return null;
    return validate(
      { race_start_time: startTime, total_duration_min: Number(totalDuration) },
      {
        maxHoursPerDriver: maxHoursPerDriver === '' ? null : Number(maxHoursPerDriver),
        minRestMinutes: minRestMinutes === '' ? null : Number(minRestMinutes),
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, startTime, totalDuration, maxHoursPerDriver, minRestMinutes]);

  async function handleConfirm() {
    setConfirmError(null);
    setConfirmSuccess(null);
    const result = liveValidation || validation;
    if (result && !result.valid) {
      const proceed = window.confirm(
        'Il piano ha problemi di copertura (vedi pannello validazione). Confermare comunque?'
      );
      if (!proceed) return;
    }
    const replaceMsg = existingStintsForCar.length > 0
      ? `La vettura #${carNumber} ha già ${existingStintsForCar.length} stint su questa gara. Confermando, verranno SOSTITUITI dai ${plan.length} nuovi. Procedere?`
      : `Confermare e scrivere i ${plan.length} stint del piano per la vettura #${carNumber}?`;
    const replace = window.confirm(replaceMsg);
    if (!replace) return;
    try {
      const res = await confirm(raceId, true, carNumber.trim());
      setConfirmSuccess(`Piano confermato: ${res?.written ?? plan.length} stint scritti.`);
    } catch (err) {
      setConfirmError(err?.message || 'Errore durante la conferma.');
    }
  }

  const canGenerate = carNumber.trim() && startTime && Number(totalDuration) > 0 && Number(targetStint) > 0 && selectedDrivers.length > 0;
  const hasPlan = plan && plan.length > 0;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>ADMIN — STINT PLANNER</div>
          <h1 className={styles.title}>{race ? race.race_name : raceId}</h1>
          {race && (
            <div className={styles.subtitle}>
              {race.sim} · {race.date?.slice(0, 10)} · formato {race.format || '—'}
            </div>
          )}
        </div>
        <button className={styles.backBtn} onClick={() => navigate(`/admin/race/${raceId}/stints`)}>
          ← Gestione stint
        </button>
      </div>

      {error && <div className={styles.alertError}>⚠ {error}</div>}

      {/* ════ PARAMETRI ════ */}
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Parametri</h2>
        <div className={styles.paramGrid}>
          <label className={styles.field}>
            <span>Numero gara vettura</span>
            <input type="text" value={carNumber} onChange={e => setCarNumber(e.target.value)}
              placeholder="es. 7" />
          </label>
          <label className={styles.field}>
            <span>Inizio gara</span>
            <input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Durata totale (min)</span>
            <input type="number" min="1" value={totalDuration} onChange={e => setTotalDuration(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Durata stint target (min)</span>
            <input type="number" min="1" value={targetStint} onChange={e => setTargetStint(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Max ore/pilota (opz.)</span>
            <input type="number" min="0" step="0.5" value={maxHoursPerDriver}
              onChange={e => setMaxHoursPerDriver(e.target.value)} placeholder="es. 8" />
          </label>
          <label className={styles.field}>
            <span>Riposo min tra stint (opz.)</span>
            <input type="number" min="0" value={minRestMinutes}
              onChange={e => setMinRestMinutes(e.target.value)} placeholder="es. 30" />
          </label>
        </div>

        <div className={styles.driversBlock}>
          <div className={styles.driversLabel}>
            Piloti in rotazione <span className={styles.hint}>(l'ordine di selezione è l'ordine di rotazione)</span>
          </div>
          <div className={styles.driversPicker}>
            {selectableDrivers.map(d => {
              const idx = selectedDrivers.indexOf(d.driver_id);
              const picked = idx >= 0;
              return (
                <button
                  key={d.driver_id}
                  className={`${styles.driverChip} ${picked ? styles.driverChipOn : ''}`}
                  onClick={() => toggleDriver(d.driver_id)}
                  type="button"
                >
                  {picked && <span className={styles.chipNum}>{idx + 1}</span>}
                  {d.display_name}
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.actionsRow}>
          <button className={styles.generateBtn} onClick={handleGenerate} disabled={!canGenerate || isGenerating}>
            {isGenerating ? 'Generazione…' : (hasPlan ? 'Rigenera piano' : 'Genera piano')}
          </button>
          {hasPlan && (
            <button className={styles.resetBtn} onClick={reset} type="button">Azzera</button>
          )}
        </div>
      </section>

      {/* ════ PIANO + VALIDAZIONE ════ */}
      {hasPlan && (
        <section className={styles.panel}>
          <div className={styles.planHeader}>
            <h2 className={styles.panelTitle}>Piano ({plan.length} stint)</h2>
            <ValidationBadge result={liveValidation} />
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>#</th><th>Pilota</th><th>Inizio</th><th>Fine</th><th>Durata</th>
                </tr>
              </thead>
              <tbody>
                {plan.map(s => (
                  <tr key={s._localId} className={isMineHighlight(s, liveValidation)}>
                    <td className={styles.colOrder}>{s.stint_order}</td>
                    <td>
                      <div className={styles.driverCell}>
                        {driverById[s.driver_id] && (
                          <Avatar
                            name={driverById[s.driver_id].display_name}
                            driverId={s.driver_id}
                            size={22}
                          />
                        )}
                        <select
                          value={s.driver_id}
                          onChange={e => updateStintInPlan(s._localId, { driver_id: e.target.value })}
                        >
                          {selectableDrivers.map(d => (
                            <option key={d.driver_id} value={d.driver_id}>{d.display_name}</option>
                          ))}
                          {/* fallback: pilota non più selezionabile ma assegnato */}
                          {s.driver_id && !selectableDrivers.some(d => d.driver_id === s.driver_id) && (
                            <option value={s.driver_id}>
                              {driverById[s.driver_id]?.display_name || s.driver_id} (non attivo)
                            </option>
                          )}
                        </select>
                      </div>
                    </td>
                    <td>
                      <input
                        type="datetime-local"
                        value={s.planned_start_time?.slice(0, 16) || ''}
                        onChange={e => updateStintInPlan(s._localId, { planned_start_time: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="datetime-local"
                        value={s.planned_end_time?.slice(0, 16) || ''}
                        onChange={e => updateStintInPlan(s._localId, { planned_end_time: e.target.value })}
                      />
                    </td>
                    <td className={styles.colDur}>{s.planned_duration_min} min</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {confirmError && <div className={styles.alertError}>⚠ {confirmError}</div>}
          {confirmSuccess && <div className={styles.alertOk}>✓ {confirmSuccess}</div>}

          <div className={styles.actionsRow}>
            <button className={styles.confirmBtn} onClick={handleConfirm} disabled={isConfirming}>
              {isConfirming ? 'Salvataggio…' : 'Conferma e scrivi piano'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

// Evidenzia la riga se è coinvolta in un issue di validazione
function isMineHighlight(stint, validation) {
  if (!validation || validation.valid) return '';
  const involved = (validation.issues || []).some(i => i.stint_order === stint.stint_order);
  return involved ? 'st-row-issue' : '';
}

// Badge di stato validazione, con lista issue
function ValidationBadge({ result }) {
  if (!result) return null;
  if (result.valid) {
    return <span style={{ color: '#81c784', fontWeight: 700, fontSize: '0.85rem' }}>✓ Copertura valida</span>;
  }
  return (
    <details style={{ color: '#ff6b66' }}>
      <summary style={{ fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
        ⚠ {result.issues.length} {result.issues.length === 1 ? 'problema' : 'problemi'}
      </summary>
      <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.2rem', fontSize: '0.8rem', color: '#c5d0e6' }}>
        {result.issues.map((i, k) => <li key={k}>{i.message}</li>)}
      </ul>
    </details>
  );
}
