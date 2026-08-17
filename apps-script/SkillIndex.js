// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Indice skill unificato
// ═══════════════════════════════════════════════════════════
// Un solo numero (0-100) che riassume quanto un pilota sta rendendo
// ACROSS TUTTI i sim/campionati, utile per bilanciare equipaggi
// endurance o avere un riferimento oggettivo oltre alle classifiche
// per singolo campionato.
//
// ATTENZIONE — qualunque punteggio singolo su "quanto sei forte" è
// delicato in una squadra: la formula è quindi VOLUTAMENTE trasparente
// (ogni componente è esposta separatamente nella risposta, non solo il
// totale) così chi lo guarda può vedere esattamente da cosa deriva,
// invece di ricevere un numero-oracolo.
//
// Formula (pesi documentati, facilmente rivedibili qui sotto):
//   score = 55% * posizione media normalizzata
//         + 25% * tasso podi
//         + 20% * (1 - penalità incidenti)
//
// - Posizione media normalizzata: per ogni gara, 1.0 = vittoria,
//   0.0 = ultimo posto, scalata sulla dimensione reale del gruppo
//   (car_class) in cui il pilota ha corso quella gara.
// - Tasso podi: quota di gare finite sul podio (P1-P3).
// - Penalità incidenti: media incidenti/gara, tetto a 3 (oltre non
//   penalizza ulteriormente), 0 se il campo incidenti non è mai stato
//   compilato per quel pilota (assenza di dato non è una colpa).
//
// Considerate SOLO le ultime N gare (di default 15) per dare peso alla
// forma recente senza pesare esplicitamente ogni singola gara (nessun
// decadimento esponenziale: tenuto semplice e verificabile a mano).
// Sotto una soglia minima di gare, il driver è escluso ("dati
// insufficienti") invece di mostrare un numero rumoroso.
//
// Calcolato on-demand (cache 900s tramite getCachedSheetData_), non
// precalcolato su una tab: RaceResults è già letto con questo pattern
// altrove nel progetto, e questo evita un trigger di aggiornamento in
// più da mantenere.
//
// Registrata in Codice.js dispatcher come:
//   'skillIndex.list': handleSkillIndexList
// ═══════════════════════════════════════════════════════════

const SKILL_INDEX_MIN_RACES = 3;
const SKILL_INDEX_RECENT_N = 15;
const SKILL_INDEX_INCIDENT_CAP = 3;
const SKILL_INDEX_WEIGHTS = { finishPct: 0.55, podiumRate: 0.25, incidentFactor: 0.20 };

/**
 * Raggruppa i risultati per (race_id, session_type, car_class) per
 * calcolare la dimensione reale del gruppo in cui ogni pilota ha
 * corso — una P3 su 4 vale diverso da una P3 su 20.
 */
function computeFieldSizes_(results) {
  const sizes = {};
  results.forEach(r => {
    if (r.session_type !== 'race') return;
    const key = r.race_id + '__' + r.car_class;
    sizes[key] = (sizes[key] || 0) + 1;
  });
  return sizes;
}

function computeDriverSkill_(driverId, results, fieldSizes) {
  const races = results
    .filter(r => r.driver_id === driverId && r.session_type === 'race' && String(r.dns).toUpperCase() !== 'TRUE')
    .sort((a, b) => String(b.set_date || b.imported_at || '').localeCompare(String(a.set_date || a.imported_at || '')))
    .slice(0, SKILL_INDEX_RECENT_N);

  if (races.length < SKILL_INDEX_MIN_RACES) return null;

  let finishPctSum = 0;
  let finishPctCount = 0;
  let podiums = 0;
  let incidentsSum = 0;
  let incidentsKnown = 0;

  races.forEach(r => {
    const pos = Number(r.finish_position);
    const fieldSize = fieldSizes[r.race_id + '__' + r.car_class] || 0;
    if (!isNaN(pos) && pos > 0 && fieldSize >= 3) {
      const pct = 1 - (pos - 1) / (fieldSize - 1);
      finishPctSum += Math.max(0, Math.min(1, pct));
      finishPctCount++;
      if (pos <= 3) podiums++;
    }
    if (r.incidents !== '' && r.incidents != null && !isNaN(Number(r.incidents))) {
      incidentsSum += Number(r.incidents);
      incidentsKnown++;
    }
  });

  if (finishPctCount === 0) return null;

  const avgFinishPct = finishPctSum / finishPctCount;
  const podiumRate = podiums / finishPctCount;
  const avgIncidents = incidentsKnown > 0 ? incidentsSum / incidentsKnown : 0;
  const incidentPenalty = Math.max(0, Math.min(1, avgIncidents / SKILL_INDEX_INCIDENT_CAP));

  const score =
    SKILL_INDEX_WEIGHTS.finishPct * avgFinishPct +
    SKILL_INDEX_WEIGHTS.podiumRate * podiumRate +
    SKILL_INDEX_WEIGHTS.incidentFactor * (1 - incidentPenalty);

  return {
    driver_id: driverId,
    score: Math.round(score * 100),
    races_counted: finishPctCount,
    avg_finish_pct: Math.round(avgFinishPct * 100),
    podium_rate: Math.round(podiumRate * 100),
    avg_incidents: incidentsKnown > 0 ? Math.round(avgIncidents * 10) / 10 : null,
  };
}

/**
 * skillIndex.list — Indice skill per tutti i piloti attivi con dati
 * sufficienti. Auth: qualsiasi pilota loggato (non solo staff — serve
 * anche sul profilo pubblico del singolo pilota).
 * @param {Object} payload - { sim? } filtro opzionale per sim
 */
function handleSkillIndexList(payload, ctx) {
  if (!ctx || !ctx.driver_id) return fail('Auth richiesto');

  payload = payload || {};
  let results = getCachedSheetData_(SHEETS.RACE_RESULTS, 900);
  if (payload.sim) {
    const sim = String(payload.sim);
    results = results.filter(r => r.sim === sim);
  }

  const fieldSizes = computeFieldSizes_(results);

  const drivers = getCachedSheetData_(SHEETS.DRIVERS, 600)
    .filter(d => d.status === 'active' && !d.removed_at);

  const driverList = drivers
    .map(d => {
      const skill = computeDriverSkill_(d.driver_id, results, fieldSizes);
      if (!skill) return null;
      return { ...skill, display_name: d.display_name || d.driver_id };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  return ok({
    drivers: driverList,
    count: driverList.length,
    formula_note: 'score = 55% posizione media normalizzata + 25% tasso podi + 20% (1 - penalità incidenti), su ultime ' + SKILL_INDEX_RECENT_N + ' gare, minimo ' + SKILL_INDEX_MIN_RACES + ' gare valide',
  });
}

// ═══════════════════════════════════════════════════════════
// STORICO — snapshot periodici per un grafico di andamento
// ═══════════════════════════════════════════════════════════
// handleSkillIndexList calcola sempre lo SNAPSHOT ATTUALE al volo (mai
// storico). Per un grafico "come è cambiato il mio indice nel tempo"
// serve invece una serie di punti nel tempo — questa tab li registra a
// intervalli regolari (trigger settimanale), senza toccare/duplicare il
// calcolo live.

const SKILL_INDEX_HISTORY_HEADERS = [
  'snapshot_id', 'driver_id', 'score', 'races_counted',
  'avg_finish_pct', 'podium_rate', 'avg_incidents', 'snapshot_date',
];

function setupSkillIndexHistoryTab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEETS.SKILL_INDEX_HISTORY);
  if (sheet) {
    Logger.log('✓ Tab "' + SHEETS.SKILL_INDEX_HISTORY + '" già esistente, nessuna modifica.');
    return;
  }
  sheet = ss.insertSheet(SHEETS.SKILL_INDEX_HISTORY);
  sheet.getRange(1, 1, 1, SKILL_INDEX_HISTORY_HEADERS.length).setValues([SKILL_INDEX_HISTORY_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, SKILL_INDEX_HISTORY_HEADERS.length).setFontWeight('bold');
  Logger.log('✅ Tab "' + SHEETS.SKILL_INDEX_HISTORY + '" creata con ' + SKILL_INDEX_HISTORY_HEADERS.length + ' colonne.');
}

/**
 * Calcola l'indice skill attuale per tutti i piloti attivi con dati
 * sufficienti e ne appende uno snapshot in SkillIndexHistory. Idempotente
 * per giorno: se esiste già uno snapshot per (driver_id, oggi) non ne
 * crea un secondo — così rilanciarla a mano non sporca lo storico.
 */
function snapshotSkillIndex_() {
  try {
    const sheet = getSheet(SHEETS.SKILL_INDEX_HISTORY);
    if (!sheet) {
      Logger.log('⚠️  Tab SkillIndexHistory non trovata — esegui setupSkillIndexHistoryTab() una volta.');
      return;
    }

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const existing = sheetToObjects(SHEETS.SKILL_INDEX_HISTORY);
    const alreadySnapshotted = new Set(
      existing.filter(r => String(r.snapshot_date).slice(0, 10) === today).map(r => r.driver_id)
    );

    const results = getCachedSheetData_(SHEETS.RACE_RESULTS, 900);
    const fieldSizes = computeFieldSizes_(results);
    const drivers = getCachedSheetData_(SHEETS.DRIVERS, 600)
      .filter(d => d.status === 'active' && !d.removed_at);

    const now = new Date().toISOString();
    const rows = [];
    drivers.forEach(d => {
      if (alreadySnapshotted.has(d.driver_id)) return;
      const skill = computeDriverSkill_(d.driver_id, results, fieldSizes);
      if (!skill) return;
      rows.push([
        'ski_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        d.driver_id, skill.score, skill.races_counted,
        skill.avg_finish_pct, skill.podium_rate, skill.avg_incidents,
        now,
      ]);
    });

    if (rows.length === 0) {
      Logger.log('⏭️  Nessuno snapshot da creare (già presenti per oggi o nessun pilota con dati sufficienti).');
      return;
    }

    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, SKILL_INDEX_HISTORY_HEADERS.length).setValues(rows);
    Logger.log('✅ ' + rows.length + ' snapshot indice skill registrati.');
  } catch (e) {
    Logger.log('⚠️  snapshotSkillIndex_ error (non-blocking): ' + e.message);
  }
}

/**
 * Wrapper pubblico (senza underscore) — il menu Trigger di Apps Script
 * nasconde le funzioni con underscore finale. Da collegare a un trigger
 * time-driven settimanale (es. ogni lunedì mattina).
 */
function runSkillIndexSnapshot() {
  snapshotSkillIndex_();
}

/**
 * skillIndex.history — serie storica per un singolo pilota, per un
 * grafico di andamento sul profilo.
 * Auth: qualsiasi pilota loggato.
 * @param {Object} payload - { driver_id }
 */
function handleSkillIndexHistory(payload, ctx) {
  if (!ctx || !ctx.driver_id) return fail('Auth richiesto');

  payload = payload || {};
  const driverId = String(payload.driver_id || '').trim();
  if (!driverId) return fail('driver_id obbligatorio');

  const snapshots = sheetToObjects(SHEETS.SKILL_INDEX_HISTORY)
    .filter(r => r.driver_id === driverId)
    .sort((a, b) => String(a.snapshot_date).localeCompare(String(b.snapshot_date)));

  return ok({ snapshots, count: snapshots.length });
}
