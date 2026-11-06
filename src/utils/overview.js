/**
 * Logica pura della pagina Panoramica (/overview).
 *
 * Nessuna chiamata di rete e nessuna dipendenza da React: tutto opera su
 * array già caricati dagli hook esistenti, così si testa con vitest e la
 * pagina resta un involucro di rendering.
 *
 * Regole equipaggio (decise da Demetrio, 6/11/2026):
 *   - gara fino a 120 minuti: si corre da soli o con un compagno (1-2 piloti)
 *   - gara oltre 120 minuti: da 2 a 6 piloti
 * Nessuna soglia dipende dal numero di piloti in squadra: funziona uguale
 * con 14 tesserati o con 4.
 */

export const SPRINT_MAX_MIN = 120;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {number|string|null} durationMin - durata gara in minuti
 * @returns {{ min: number, max: number, kind: 'sprint'|'endurance' }}
 */
export function crewRule(durationMin) {
  const d = Number(durationMin);
  // Durata mancante o non valida: trattata come sprint (regola più permissiva).
  if (!Number.isFinite(d) || d <= SPRINT_MAX_MIN) {
    return { min: 1, max: 2, kind: 'sprint' };
  }
  return { min: 2, max: 6, kind: 'endurance' };
}

/**
 * Stato della copertura equipaggio.
 *   ok   = i confermati bastano
 *   risk = non bastano, ma con i "forse" si arriva al minimo
 *   ko   = anche con i "forse" non si arriva al minimo
 *
 * @param {{ confirmed: number, tentative: number, durationMin: number|string|null }} p
 */
export function crewStatus({ confirmed, tentative, durationMin }) {
  const rule = crewRule(durationMin);
  const c = Math.max(0, Number(confirmed) || 0);
  const t = Math.max(0, Number(tentative) || 0);
  let level;
  if (c >= rule.min) level = 'ok';
  else if (c + t >= rule.min) level = 'risk';
  else level = 'ko';
  return {
    level,
    confirmed: c,
    tentative: t,
    min: rule.min,
    max: rule.max,
    kind: rule.kind,
    // Ci sono più confermati di quanti ne stiano in una vettura: non è un
    // errore (possono essere più vetture), ma va segnalato.
    overMax: c > rule.max,
    missing: Math.max(0, rule.min - c),
  };
}

/**
 * Conta gli RSVP per stato. Un pilota con più righe conta una volta sola
 * (vale l'ultima in ordine di array).
 *
 * @param {Array<{driver_id: string, status: string}>} rsvps
 * @param {Set<string>|null} onlyIds - se presente, ignora chi non è in questo set
 */
export function countRsvps(rsvps, onlyIds = null) {
  const byDriver = new Map();
  (rsvps || []).forEach(r => {
    if (!r || !r.driver_id) return;
    if (onlyIds && !onlyIds.has(r.driver_id)) return;
    byDriver.set(r.driver_id, String(r.status || '').toLowerCase());
  });
  let confirmed = 0;
  let tentative = 0;
  let declined = 0;
  byDriver.forEach(s => {
    if (s === 'confirmed') confirmed += 1;
    else if (s === 'tentative') tentative += 1;
    else if (s === 'declined') declined += 1;
  });
  return { confirmed, tentative, declined, responded: byDriver.size };
}

/**
 * Minuti di gara coperti dagli stint pianificati (somma delle durate,
 * esclusi gli abortiti). È una stima di copertura, non una verifica di gap
 * e overlap: per quella esiste validatePlanCoverage in stintValidation.js.
 */
export function plannedStintMinutes(stints) {
  return (stints || [])
    .filter(s => s && s.status !== 'aborted')
    .reduce((sum, s) => sum + (Number(s.planned_duration_min) || 0), 0);
}

/**
 * Checklist di prontezza per una gara. Ogni voce ha { key, label, done,
 * detail }. Le voci non applicabili (es. stint per una sprint) non
 * compaiono, così la percentuale riflette solo ciò che serve davvero.
 *
 * @param {Object} p
 * @param {{ duration_minutes?: number }} p.race
 * @param {Array} p.activeDrivers - tesserati attivi
 * @param {Array} p.rsvps
 * @param {Array} p.crews - assegnazioni pilota→vettura
 * @param {Array} p.stints
 */
export function buildReadiness({ race, activeDrivers, rsvps, crews, stints }) {
  const duration = race?.duration_minutes;
  const rule = crewRule(duration);
  const activeIds = new Set((activeDrivers || []).map(d => d.driver_id));
  const counts = countRsvps(rsvps, activeIds);
  const crew = crewStatus({
    confirmed: counts.confirmed,
    tentative: counts.tentative,
    durationMin: duration,
  });

  const items = [];

  items.push({
    key: 'crew',
    label: 'Equipaggio confermato',
    done: crew.level === 'ok',
    detail: `${crew.confirmed} confermati, servono almeno ${crew.min}`,
  });

  const missing = Math.max(0, activeIds.size - counts.responded);
  items.push({
    key: 'rsvp',
    label: 'Tutti hanno risposto',
    done: activeIds.size > 0 && missing === 0,
    detail: missing === 0 ? 'Nessuno in sospeso' : `${missing} senza risposta`,
  });

  const assigned = new Set((crews || []).map(c => c.driver_id).filter(Boolean)).size;
  items.push({
    key: 'assign',
    label: 'Piloti assegnati alla vettura',
    done: assigned >= rule.min,
    detail: `${assigned} assegnati, servono almeno ${rule.min}`,
  });

  if (rule.kind === 'endurance') {
    const need = Number(duration) || 0;
    const planned = plannedStintMinutes(stints);
    // Tolleranza del 2%: un piano da 359' su una 6h non va segnato incompleto.
    const done = need > 0 && planned >= need * 0.98;
    items.push({
      key: 'stints',
      label: 'Stint pianificati',
      done,
      detail: `${planned}' pianificati su ${need}'`,
    });
  }

  const doneCount = items.filter(i => i.done).length;
  return {
    items,
    doneCount,
    total: items.length,
    percent: items.length ? Math.round((doneCount / items.length) * 100) : 0,
    crew,
    missingRsvpIds: [...activeIds].filter(id => !(rsvps || []).some(r => r.driver_id === id)),
  };
}

/**
 * Autonomia della cassa: saldo diviso per la spesa mensile media degli
 * ultimi `months` mesi. Se non ci sono uscite nel periodo l'autonomia non
 * è calcolabile e restituisce null (la pagina mostra solo il saldo).
 *
 * @param {Array<{type: string, amount: number|string, date: string}>} entries
 * @param {number} nowMs
 * @param {number} months
 */
export function treasuryRunway(entries, nowMs = Date.now(), months = 6) {
  const list = entries || [];
  let income = 0;
  let spent = 0;
  list.forEach(e => {
    const a = Number(e.amount) || 0;
    if (e.type === 'entrata') income += a;
    else if (e.type === 'uscita') spent += a;
  });
  const balance = income - spent;

  const from = nowMs - months * 30 * DAY_MS;
  const recentSpent = list
    .filter(e => e.type === 'uscita' && e.date && new Date(e.date).getTime() >= from)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const monthlySpend = recentSpent / months;

  return {
    balance,
    monthlySpend,
    runwayMonths: monthlySpend > 0 ? balance / monthlySpend : null,
  };
}

/**
 * Piloti attivi per finestra mobile: quanti tesserati attivi hanno almeno
 * un risultato di gara negli ultimi `windowDays` giorni, confrontati con
 * i `windowDays` precedenti.
 *
 * @param {Array<{driver_id: string, set_date: string}>} results
 * @param {Set<string>} activeIds
 * @param {number} nowMs
 * @param {number} windowDays
 */
export function activePilotTrend(results, activeIds, nowMs = Date.now(), windowDays = 30) {
  const curFrom = nowMs - windowDays * DAY_MS;
  const prevFrom = nowMs - 2 * windowDays * DAY_MS;
  const cur = new Set();
  const prev = new Set();
  (results || []).forEach(r => {
    if (!r || !r.driver_id || !activeIds.has(r.driver_id) || !r.set_date) return;
    const t = new Date(r.set_date).getTime();
    if (Number.isNaN(t)) return;
    if (t >= curFrom && t <= nowMs) cur.add(r.driver_id);
    else if (t >= prevFrom && t < curFrom) prev.add(r.driver_id);
  });
  return { current: cur.size, previous: prev.size, delta: cur.size - prev.size };
}
