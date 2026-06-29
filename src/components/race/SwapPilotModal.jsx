import { useState, useMemo } from 'react';
import { useAddStint, useUpdateStint } from '../../hooks/useEnduranceStints';
import styles from './SwapPilotModal.module.css';

/**
 * SwapPilotModal — sostituzione pilota su uno stint in corso (swap live, Livello 1).
 *
 * Filosofia "mantieni la griglia": il sostituto eredita la FINE pianificata dello
 * stint sostituito; gli stint successivi mantengono i loro orari (solo la numerazione
 * slitta, via re-numbering backend).
 *
 * Orchestrazione SICURA add→update:
 *  1. add(sostituto) in posizione order+1 (backend shifta i successivi)
 *  2. update(uscente) → completed con orari effettivi
 * Se il passo 2 fallisce, il sostituto è già creato (stato "troppo", recuperabile),
 * mai un buco di copertura. Messaggio d'errore esplicito sul recupero.
 *
 * @param {Object}   stint           - lo stint da swappare (uscente)
 * @param {string}   raceId
 * @param {Array}    drivers         - roster (per select sostituto)
 * @param {Function} getDriverName   - (id, drivers) => string
 * @param {Function} onClose
 * @param {Function} onSwapped       - (msg) => void, callback successo
 */
export default function SwapPilotModal({
  stint, raceId, drivers, getDriverName, onClose, onSwapped,
}) {
  const addStint = useAddStint();
  const updateStint = useUpdateStint();

  // Default ora cambio = adesso, in formato datetime-local (YYYY-MM-DDTHH:mm)
  const nowLocal = useMemo(() => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }, []);

  const [substituteId, setSubstituteId] = useState('');
  const [changeTime, setChangeTime] = useState(nowLocal);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const outgoingId = stint.driver_id;
  const outgoingName = getDriverName(outgoingId, drivers);

  // Piloti selezionabili: attivi/trial, escluso l'uscente
  const selectableDrivers = useMemo(() => {
    return (drivers || []).filter(
      (d) => (d.status === 'active' || d.status === 'trial') && d.driver_id !== outgoingId
    );
  }, [drivers, outgoingId]);

  // Calcoli temporali
  const calc = useMemo(() => {
    const plannedStartMs = new Date(stint.planned_start_time).getTime();
    const plannedEndMs = new Date(stint.planned_end_time).getTime();
    const changeMs = new Date(changeTime).getTime();

    if (isNaN(plannedStartMs) || isNaN(plannedEndMs)) {
      return { error: 'Lo stint da sostituire non ha orari pianificati validi.' };
    }
    if (isNaN(changeMs)) {
      return { error: 'Ora del cambio non valida.' };
    }
    if (changeMs <= plannedStartMs) {
      return { error: 'L\'ora del cambio deve essere dopo l\'inizio dello stint. Per cambiare il pilota di uno stint non ancora iniziato usa la modifica normale.' };
    }
    if (changeMs >= plannedEndMs) {
      return { error: 'L\'ora del cambio deve essere prima della fine dello stint.' };
    }

    const outgoingMin = Math.round((changeMs - plannedStartMs) / 60000);
    const substituteMin = Math.round((plannedEndMs - changeMs) / 60000);
    return { plannedStartMs, plannedEndMs, changeMs, outgoingMin, substituteMin };
  }, [stint.planned_start_time, stint.planned_end_time, changeTime]);

  function fmtClock(ms) {
    if (isNaN(ms)) return '—';
    return new Date(ms).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }

  // datetime-local "YYYY-MM-DDTHH:mm" → ISO naive "YYYY-MM-DDTHH:mm:00" (coerente col resto del paddock)
  function toNaiveIso(dtLocal) {
    if (!dtLocal) return '';
    return dtLocal.length === 16 ? `${dtLocal}:00` : dtLocal;
  }

  const canConfirm = substituteId && !calc.error && !busy;

  async function handleConfirm() {
    if (!canConfirm) return;
    setError(null);
    setBusy(true);

    const changeIso = toNaiveIso(changeTime);
    const outgoingOrder = Number(stint.stint_order);

    // STEP 1 — add sostituto in posizione order+1 (backend shifta i successivi)
    try {
      await addStint.mutateAsync({
        race_id: raceId,
        driver_id: substituteId,
        stint_order: outgoingOrder + 1,
        planned_start_time: changeIso,
        planned_end_time: stint.planned_end_time,
        planned_duration_min: calc.substituteMin,
        status: 'active',
      });
    } catch (e) {
      setBusy(false);
      setError('Swap non riuscito: impossibile creare lo stint del sostituto. Nessuna modifica salvata, riprova.');
      return;
    }

    // STEP 2 — chiudi l'uscente come completed con orari effettivi
    try {
      await updateStint.mutateAsync({
        stint_id: stint.stint_id,
        race_id: raceId,
        status: 'completed',
        actual_start_time: stint.planned_start_time, // assunzione Livello 1: inizio reale = pianificato
        actual_end_time: changeIso,
        actual_duration_min: calc.outgoingMin,
      });
    } catch (e) {
      setBusy(false);
      // Stato recuperabile: sostituto creato, uscente non chiuso. Messaggio esplicito.
      setError(
        `Sostituto creato correttamente, ma la chiusura di ${outgoingName} non è riuscita. ` +
        `Chiudilo manualmente: stato "Concluso", fine ${fmtClock(calc.changeMs)}.`
      );
      return;
    }

    setBusy(false);
    onSwapped(`Swap completato: ${outgoingName} → ${getDriverName(substituteId, drivers)}.`);
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Sostituisci pilota — Stint {stint.stint_order}</h2>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        {error && <div className={styles.alertError}>⚠ {error}</div>}

        <div className={styles.body}>
          <label className={styles.field}>
            <span>Pilota uscente</span>
            <input type="text" value={outgoingName} disabled />
          </label>

          <label className={styles.field}>
            <span>Pilota sostituto *</span>
            <select value={substituteId} onChange={(e) => setSubstituteId(e.target.value)}>
              <option value="">— Seleziona —</option>
              {selectableDrivers.map((d) => (
                <option key={d.driver_id} value={d.driver_id}>
                  {d.display_name} ({d.driver_id})
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>Ora del cambio *</span>
            <input
              type="datetime-local"
              value={changeTime}
              onChange={(e) => setChangeTime(e.target.value)}
            />
          </label>

          {/* Riepilogo dinamico */}
          {calc.error ? (
            <div className={styles.summaryWarn}>{calc.error}</div>
          ) : (
            <div className={styles.summary}>
              <div className={styles.summaryRow}>
                <strong>{outgoingName}</strong> → chiuso: {fmtClock(calc.plannedStartMs)} – {fmtClock(calc.changeMs)}
                {' '}<span className={styles.muted}>({calc.outgoingMin} min effettivi, CONCLUSO)</span>
              </div>
              <div className={styles.summaryRow}>
                <strong>{substituteId ? getDriverName(substituteId, drivers) : 'Sostituto'}</strong> → entra: {fmtClock(calc.changeMs)} – {fmtClock(calc.plannedEndMs)}
                {' '}<span className={styles.muted}>({calc.substituteMin} min, IN CORSO)</span>
              </div>
              <div className={styles.summaryNote}>Gli stint successivi mantengono i loro orari.</div>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={busy}>Annulla</button>
          <button className={styles.confirmBtn} onClick={handleConfirm} disabled={!canConfirm}>
            {busy ? 'Swap in corso…' : 'Conferma swap'}
          </button>
        </div>
      </div>
    </div>
  );
}
