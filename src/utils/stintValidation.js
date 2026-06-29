/**
 * Validazione copertura di un piano stint endurance, lato client.
 *
 * Funzione PURA: opera su un array di stint in memoria (il piano proposto dallo
 * StintPlanner, non ancora scritto), senza chiamate di rete. Speculare a
 * handleEnduranceStintsValidateCoverage (Apps Script), che invece valida gli
 * stint GIÀ persistiti nel foglio. I due strumenti servono momenti diversi:
 *   - questo: valida il piano PROPOSTO mentre l'admin lo modifica (istantaneo)
 *   - backend: valida il piano PERSISTITO (es. dopo modifiche manuali in AdminRaceStints)
 * Tenere la logica in sync tra i due se cambiano le regole.
 */

const COVERAGE_TOLERANCE_MS = 5000; // ~5s: assorbe rumore al secondo, non maschera buchi reali

/**
 * Valida che un piano stint copra l'intera durata gara senza gap né overlap.
 *
 * @param {Array} stints - array di stint. Ogni stint: { stint_order, planned_start_time, planned_end_time }.
 * @param {string} raceStartTime - ISO naive es. "2026-10-24T15:00:00".
 * @param {number} totalDurationMin - durata totale gara in minuti.
 * @returns {{ valid: boolean, issues: Array }} issue: { type, message, stint_order?, delta_min? }.
 *   Tipi: no_stints, invalid_input, invalid_times, start_mismatch, end_mismatch, gap, overlap.
 */
export function validatePlanCoverage(stints, raceStartTime, totalDurationMin) {
  const issues = [];

  // Validazione input
  const raceStartMs = new Date(raceStartTime).getTime();
  if (isNaN(raceStartMs)) {
    return { valid: false, issues: [{ type: 'invalid_input', message: 'race_start_time non valido.' }] };
  }
  if (typeof totalDurationMin !== 'number' || totalDurationMin <= 0) {
    return { valid: false, issues: [{ type: 'invalid_input', message: 'total_duration_min deve essere > 0.' }] };
  }
  if (!Array.isArray(stints) || stints.length === 0) {
    return { valid: false, issues: [{ type: 'no_stints', message: 'Nessuno stint nel piano.' }] };
  }

  const raceEndMs = raceStartMs + totalDurationMin * 60000;

  // Ordina per stint_order e parsa gli orari (null per stint con orari invalidi)
  const ordered = [...stints].sort((a, b) => Number(a.stint_order) - Number(b.stint_order));
  const parsed = ordered.map((s) => {
    const startMs = new Date(s.planned_start_time).getTime();
    const endMs = new Date(s.planned_end_time).getTime();
    if (isNaN(startMs) || isNaN(endMs)) {
      issues.push({
        type: 'invalid_times',
        message: `Orari mancanti o non validi per lo stint ${s.stint_order}.`,
        stint_order: s.stint_order,
      });
      return null;
    }
    return { startMs, endMs, stint_order: s.stint_order };
  });

  // Start mismatch — primo stint VALIDO
  const firstValid = parsed.find((p) => p !== null);
  if (firstValid && Math.abs(firstValid.startMs - raceStartMs) > COVERAGE_TOLERANCE_MS) {
    const deltaStart = (firstValid.startMs - raceStartMs) / 60000;
    issues.push({
      type: 'start_mismatch',
      message: `Il primo stint non coincide con la partenza. Delta: ${Math.round(deltaStart)} min.`,
      stint_order: firstValid.stint_order,
      delta_min: deltaStart,
    });
  }

  // End mismatch — ultimo stint VALIDO
  let lastValid = null;
  for (let i = parsed.length - 1; i >= 0; i--) {
    if (parsed[i]) { lastValid = parsed[i]; break; }
  }
  if (lastValid && Math.abs(lastValid.endMs - raceEndMs) > COVERAGE_TOLERANCE_MS) {
    const deltaEnd = (lastValid.endMs - raceEndMs) / 60000;
    issues.push({
      type: 'end_mismatch',
      message: `L'ultimo stint non coincide con la fine prevista. Delta: ${Math.round(deltaEnd)} min.`,
      stint_order: lastValid.stint_order,
      delta_min: deltaEnd,
    });
  }

  // Gap / overlap tra coppie consecutive valide
  for (let i = 0; i < parsed.length - 1; i++) {
    const current = parsed[i];
    const next = parsed[i + 1];
    if (!current || !next) continue;

    const diffMs = next.startMs - current.endMs;
    if (diffMs > COVERAGE_TOLERANCE_MS) {
      issues.push({
        type: 'gap',
        message: `Buco di ${Math.round(diffMs / 60000)} min dopo lo stint ${current.stint_order}.`,
        stint_order: current.stint_order,
        delta_min: diffMs / 60000,
      });
    } else if (diffMs < -COVERAGE_TOLERANCE_MS) {
      issues.push({
        type: 'overlap',
        message: `Sovrapposizione di ${Math.round(-diffMs / 60000)} min tra lo stint ${current.stint_order} e il successivo.`,
        stint_order: current.stint_order,
        delta_min: -diffMs / 60000,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}
// ─────────────────────────────────────────────────────────────
// Da AGGIUNGERE a src/utils/stintValidation.js (non sostituire il file).
// validatePilotLimits: controlla affaticamento piloti (ore max, riposo minimo).
// Funzione PURA, separata da validatePlanCoverage (responsabilità distinte).
// Soft: produce issue da mostrare, non blocca. Limiti opzionali: se null/0 → skip.
// ─────────────────────────────────────────────────────────────

/**
 * Valida i limiti per pilota su un piano stint.
 * Entrambi i limiti sono OPZIONALI: se non forniti (null/undefined/0), il
 * relativo controllo viene saltato.
 *
 * @param {Array} stints - stint del piano. Ogni stint: { stint_order, driver_id, planned_start_time, planned_end_time }.
 * @param {Object} limits - { maxHoursPerDriver?: number, minRestMinutes?: number }.
 * @returns {{ valid: boolean, issues: Array }} issue: { type, message, driver_id?, value?, limit? }.
 *   Tipi: max_hours_exceeded, insufficient_rest.
 */
export function validatePilotLimits(stints, limits) {
  const issues = [];
  const maxHours = limits && Number(limits.maxHoursPerDriver) > 0 ? Number(limits.maxHoursPerDriver) : null;
  const minRest = limits && Number(limits.minRestMinutes) > 0 ? Number(limits.minRestMinutes) : null;

  // Nessun limite impostato → niente da validare
  if (!maxHours && !minRest) return { valid: true, issues: [] };
  if (!Array.isArray(stints) || stints.length === 0) return { valid: true, issues: [] };

  // Raggruppa gli stint per pilota, con orari parsati in ms
  const byDriver = {};
  for (const s of stints) {
    const startMs = new Date(s.planned_start_time).getTime();
    const endMs = new Date(s.planned_end_time).getTime();
    if (isNaN(startMs) || isNaN(endMs)) continue; // orari invalidi: ignorati qui (li becca validatePlanCoverage)
    const id = s.driver_id;
    if (!byDriver[id]) byDriver[id] = [];
   byDriver[id].push({
      startMs,
      endMs,
      stint_order: s.stint_order,
      durationMin: Number(s.planned_duration_min) || (endMs - startMs) / 60000,
    });
  }

  for (const driverId in byDriver) {
    const segs = byDriver[driverId].sort((a, b) => a.startMs - b.startMs);

    // ── Ore massime per pilota ──
    if (maxHours) {
      let totalMin = 0;
      for (const seg of segs) totalMin += seg.durationMin;
      const totalHours = totalMin / 60;
      if (totalHours > maxHours + 1e-9) {
        issues.push({
          type: 'max_hours_exceeded',
          driver_id: driverId,
          value: Math.round(totalHours * 10) / 10,
          limit: maxHours,
          message: `${driverId} guida ${(Math.round(totalHours * 10) / 10)}h, oltre il limite di ${maxHours}h.`,
        });
      }
    }

    // ── Riposo minimo tra stint consecutivi dello stesso pilota ──
    if (minRest) {
      for (let i = 0; i < segs.length - 1; i++) {
        const restMin = (segs[i + 1].startMs - segs[i].endMs) / 60000;
        if (restMin < minRest - 1e-9) {
          issues.push({
            type: 'insufficient_rest',
            driver_id: driverId,
            value: Math.round(restMin),
            limit: minRest,
            message: `${driverId}: solo ${Math.round(restMin)} min di riposo tra lo stint ${segs[i].stint_order} e ${segs[i + 1].stint_order} (minimo ${minRest}).`,
          });
        }
      }
    }
  }

  return { valid: issues.length === 0, issues };
}