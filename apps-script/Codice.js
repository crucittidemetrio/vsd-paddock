// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Backend Apps Script
// ═══════════════════════════════════════════════════════════
// Endpoint unificato per VSD_HUB_DB.
// Pattern: { ok: bool, data?, error? }
// Action format: "domain.method" (es. "auth.login", "roster.list")
// ═══════════════════════════════════════════════════════════

// ─── CONFIG ───
const SHEETS = {
  DRIVERS: 'Drivers',
  TRACKS: 'Tracks',
  CARS: 'Cars',
  BEST_LAPS: 'BestLaps',
  RACES: 'Races',
  RACE_REPORTS: 'RaceReports',
  AUDIT_LOG: 'AuditLog',
 RACE_RESULTS: 'RaceResults',
  CHAMPIONSHIPS: 'Championships',
  ENDURANCE_AUDITIONS: 'EnduranceAuditions',
  ENDURANCE_PARTICIPANTS: 'EnduranceParticipants',
  ENDURANCE_AUDITION_STINTS: 'EnduranceAuditionStints',
  ENDURANCE_STINTS: 'EnduranceStints',
  SOCIAL_POSTS: 'SocialPosts',
  SOCIAL_METRICS: 'SocialMetrics',
  SOCIAL_MEDIA: 'SocialMedia',
  CLASH_PARTICIPANTS: 'ClashParticipants',
  CLASH_RESULTS: 'ClashResults',
  CLASH_INCIDENT_REPORTS: 'ClashIncidentReports',
};

// Token TTL: 7 giorni
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ─── DRIVER FIELD VISIBILITY ───
// Whitelist esplicita: i campi non listati NON vengono mai esposti via API.
// Aggiungere qui i nuovi campi quando si modifica lo schema Drivers.

const DRIVER_PUBLIC_FIELDS = [
  'driver_id', 'display_name', 'role', 'status', 'join_date',
  'nationality', 'preferred_sims', 'specialties', 'avatar_url', 'bio',
  'iracing_id', 'lmu_id', 'ace_id', 'discord_id', 'race_number'
];

const DRIVER_PRIVATE_EXTRA_FIELDS = [
  'real_name', 'email', 'created_at', 'updated_at'
];

// access_code: MAI esposto, in nessun livello.

// ═══════════════════════════════════════════════════════════
// ENTRY POINTS
// ═══════════════════════════════════════════════════════════

function doGet(e) {
  // Health check via GET. Usato per verificare che lo script sia online.
  return jsonResponse({ ok: true, data: { service: 'VSD Paddock API', time: new Date().toISOString() } });
}

function doPost(e) {
  try {
    // Supporto duale:
    //  - body JSON in text/plain (browser fetch, evita preflight CORS)
    //  - form params (curl, Postman, Apps Script playground)
    let action, token, payload;

    if (e.postData && e.postData.contents) {
      const parsed = JSON.parse(e.postData.contents);
      action = parsed.action || '';
      token = parsed.token || null;
      payload = parsed.payload || {};
    } else {
      const params = e.parameter || {};
      action = params.action || '';
      token = params.token || null;
      payload = params.payload ? JSON.parse(params.payload) : {};
    }

    if (!action) return jsonResponse({ ok: false, error: 'Action mancante' });

    const handler = ACTIONS[action];
    if (!handler) return jsonResponse({ ok: false, error: 'Action sconosciuta: ' + action });

   // Wave 10.3 — anonymous è un tier valido per endpoint pubblici.
    // Gli handler che devono restare privati controllano ctx.driver_id o ctx.tier.
    let ctx = token ? verifyToken(token) : null;
    if (!ctx) {
      ctx = {
        driver_id: null,
        role: '',
        tier: 'anonymous',
        sims: [],
        isStaff: false,
        isAdmin: false,
      };
    }

    const result = handler(payload, ctx);
    return jsonResponse(result); 

  } catch (err) {
    return jsonResponse({ ok: false, error: err.message || 'Errore interno' });
  }
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Sheet non trovato: ' + name);
  return sheet;
}

function sheetToObjects(sheetName) {
  const sheet = getSheet(sheetName);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  }).filter(obj => {
    // Filtra righe vuote: la prima colonna deve avere un valore
    const firstKey = Object.keys(obj)[0];
    return obj[firstKey] && String(obj[firstKey]).trim() !== '';
  });
}

function ok(data) { return { ok: true, data }; }
function fail(error) { return { ok: false, error }; }

// ═══════════════════════════════════════════════════════════
// ACTIONS REGISTRY (sarà popolato nelle prossime tappe)
// ═══════════════════════════════════════════════════════════

const ACTIONS = {
  // Auth
  'auth.login': handleAuthLogin,
  'auth.verify': handleAuthVerify,
  'auth.discordStart': handleDiscordAuthStart_,   // ← NUOVA RIGA (Wave 10)
  'auth.discordCallback': handleDiscordCallback,

  // Roster
  'roster.list': handleRosterList,
  'roster.get': handleRosterGet,

  // Presence — chi sta usando il sito ORA (CacheService, non Sheets)
  'presence.heartbeat': handlePresenceHeartbeat,
  'presence.online': handlePresenceOnline,

  // Lookups
  'lookups.tracks': handleLookupsTracks,
  'lookups.cars': handleLookupsCars,

  // Best Laps
  'laps.list': handleLapsList,
  'laps.leaderboard': handleLapsLeaderboard,
  'laps.raceLaps': handleLapsRaceLaps,
  'laps.syncFromGarage61': handleLapsSyncFromGarage61,
  'laps.add': handleLapsAdd,
  'laps.update': handleLapsUpdate,
  'laps.remove': handleLapsRemove,

  // Races
  'races.list': handleRacesList,
  'races.upcoming': handleRacesUpcoming,
  'races.get': handleRacesGet,
  'races.add': handleRacesAdd,
  'races.update': handleRacesUpdate,
  'races.remove': handleRacesRemove,
  'raceResults.list': handleRaceResultsList,
   'raceResults.import': handleRaceResultsImport,   // ← NEW (Wave 9.8)
   'races.updatePoster': handleRacesUpdatePoster,
  'races.updateGallery': handleRacesUpdateGallery,

  // Championships (Wave 9.8)
  'championships.list': handleChampionshipsList,   // ← NEW (Wave 9.8)

  // Academy / Pilot Rating (VPR) — Fase 1
  'academy.ranking': handleAcademyRanking,

  // Season Recap — Fase 1
  'recap.mine': handleSeasonRecap,

  // Muro dei Record — Fase 1
  'records.team': handleTeamRecords,

  // Training Insights — Fase 1 (solo lettura, calcolato da BestLaps)
  'training.insights': handleTrainingInsights,

  // Clash of Classes — GTE vs GT3 (dominio custom, vedi ClashOfClasses.js)
  'clash.participants.list': handleClashParticipantsList,
  'clash.participants.register': handleClashParticipantsRegister,
  'clash.results.submitRound': handleClashResultsSubmitRound,
  'clash.standings': handleClashStandings,
  'clash.incidents.report': handleClashIncidentsReport,
  'clash.incidents.list': handleClashIncidentsList,

  // Social Manager — admin only
  'social.posts.list': handleSocialPostsList,
  'social.posts.create': handleSocialPostsCreate,
  'social.posts.update': handleSocialPostsUpdate,
  'social.posts.remove': handleSocialPostsRemove,
  'social.metrics.list': handleSocialMetricsList,
  'social.metrics.add': handleSocialMetricsAdd,
  'social.generateText': handleSocialGenerateText,
  'social.discord.stats': handleSocialDiscordStats,
  'social.media.list': handleSocialMediaList,
  'social.media.add': handleSocialMediaAdd,
  'social.media.remove': handleSocialMediaRemove,
  'standings.byChampionship': handleStandingsByChampionship,
  'standings.byDriver':       handleStandingsByDriver,
  'championships.importStandings':   handleChampionshipsImportStandings,
  'championships.saveAdjustments':   handleChampionshipsSaveAdjustments,
  // ...

// Reports
  'reports.list': handleReportsList,
  'reports.recent': handleReportsRecent,

  // Landing aggregato (1 fetch invece di ~9)
  'landing.data': handleLandingData,

  // Showcase (pubblico, no auth)
  'showcase.summary': handleShowcaseSummary,

  // Endurance Auditions (Phase 1A)
  'endurance.auditions.list': handleEnduranceAuditionsList,
  'endurance.auditions.get': handleEnduranceAuditionsGet,
  'endurance.auditions.create': handleEnduranceAuditionsCreate,
  'endurance.auditions.update': handleEnduranceAuditionsUpdate,
  'endurance.participants.list': handleEnduranceParticipantsList,
  'endurance.participants.add': handleEnduranceParticipantsAdd,
  'endurance.participants.update': handleEnduranceParticipantsUpdate,
  'endurance.participants.remove': handleEnduranceParticipantsRemove,
  'endurance.stints.list': handleEnduranceStintsList,
  'endurance.stints.generate': handleEnduranceStintsGenerate,
  'endurance.stints.validateCoverage': handleEnduranceStintsValidateCoverage,
  'endurance.stints.confirmPlan': handleEnduranceStintsConfirmPlan,
  'endurance.stints.add': handleEnduranceStintsAdd,
  'endurance.stints.update': handleEnduranceStintsUpdate,
  'endurance.stints.remove': handleEnduranceStintsRemove,
};

// ═══════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════

function getAuthSecret() {
  const secret = PropertiesService.getScriptProperties().getProperty('AUTH_SECRET');
  if (!secret) throw new Error('AUTH_SECRET non configurato. Vai in Impostazioni progetto > Proprietà script.');
  return secret;
}

/**
 * Genera un token firmato HMAC-SHA256.
 * Formato: base64(driver_id|expiresAt|signature)
 *
 * Wave 10.X: Funzione conservata solo per compatibilità storica con
 * `handleAuthLogin` (ora deprecato). I nuovi token sono generati da
 * `generateTokenWithClassification_` nel formato 5-parti (Wave 10+).
 */
function generateToken(driverId) {
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const payload = `${driverId}|${expiresAt}`;
  const signature = signHmac(payload, getAuthSecret());
  const token = Utilities.base64EncodeWebSafe(`${payload}|${signature}`);
  return token;
}

/**
 * Verifica un token HMAC e restituisce il context auth se valido, null se invalido.
 *
 * Wave 10.X: supporta SOLO il formato new 5 parti (Discord OAuth):
 *   driver_id|tier|sims_csv|expiresAt|signature
 *
 * Il branch legacy 3-parti (admin via access_code) è stato rimosso con la
 * deprecazione di `auth.login`. I token legacy esistenti diventano invalidi:
 * i piloti affetti devono ri-loggare via Discord.
 */
function verifyToken(token) {
  if (!token) return null;
  try {
    const decoded = Utilities.newBlob(Utilities.base64DecodeWebSafe(token)).getDataAsString();
    const parts = decoded.split('|');

    // Solo new format (Wave 10+): driver_id|tier|sims_csv|expiresAt|signature
    if (parts.length !== 5) return null;

    const [driverIdRaw, tier, simsCsv, expiresAtStr, signature] = parts;
    const payload = `${driverIdRaw}|${tier}|${simsCsv}|${expiresAtStr}`;
    const expectedSig = signHmac(payload, getAuthSecret());
    if (signature !== expectedSig) return null;
    if (Date.now() > parseInt(expiresAtStr, 10)) return null;

    const sims = simsCsv ? simsCsv.split(',') : [];
    const driverId = (driverIdRaw && driverIdRaw !== 'null') ? driverIdRaw : null;

    // Driver lookup: null per tier='guest' (non corrisponde a un pilota nel sheet)
    let driver = null;
    if (driverId) {
      const drivers = getCachedSheetData_(SHEETS.DRIVERS, 600);
      driver = drivers.find(d => d.driver_id === driverId) || null;
    }

    return {
      driver_id: driverId,
      role: driver ? driver.role : '',
      tier: tier,
      sims: sims,
      isStaff: tier === 'staff' || tier === 'admin',
      isAdmin: tier === 'admin',
      driver: driver,
    };
  } catch (e) {
    return null;
  }
}
function signHmac(text, secret) {
  const bytes = Utilities.computeHmacSha256Signature(text, secret);
  return bytes.map(b => {
    const v = (b < 0 ? b + 256 : b);
    return v.toString(16).padStart(2, '0');
  }).join('');
}

// ─── ACTIONS ───

/**
 * Wave 10.X: endpoint deprecato.
 * Login ora avviene esclusivamente via Discord OAuth (auth.discordStart →
 * auth.discordCallback). I codici plaintext (access_code) non sono più
 * credenziali valide: questo handler li rigetta sempre.
 */
function handleAuthLogin(payload) {
  return fail('endpoint_deprecated');
}

function handleAuthVerify(payload, ctx) {
  // Il token è già stato verificato in doPost (prima dell'invocazione di handler).
  // ctx = null se invalid, altrimenti contiene il driver.
  if (!ctx) return fail('Token invalido o scaduto');
  return ok({ valid: true, driver: sanitizeDriver(ctx.driver, 'private') });
}

/**
 * Restituisce un oggetto driver con solo i campi consentiti dal livello.
 * @param {Object} driver - Record raw dal foglio Drivers
 * @param {'public'|'private'} level - 'private' include real_name/email/timestamps
 * @returns {Object} Driver sanitizzato (whitelist)
 */
function sanitizeDriver(driver, level = 'public') {
  const fields = level === 'private'
    ? DRIVER_PUBLIC_FIELDS.concat(DRIVER_PRIVATE_EXTRA_FIELDS)
    : DRIVER_PUBLIC_FIELDS;

  const out = {};
  fields.forEach(f => {
    if (f in driver) out[f] = driver[f];
  });
  return out;
}

// ═══════════════════════════════════════════════════════════
// TEST FUNCTIONS (utili per debug nell'editor)
// ═══════════════════════════════════════════════════════════

function testHealth() {
  Logger.log('Service online');
  Logger.log('Sheets disponibili:');
  Object.values(SHEETS).forEach(name => {
    try {
      const s = getSheet(name);
      Logger.log(`  ✓ ${name} (${s.getLastRow()} righe)`);
    } catch (e) {
      Logger.log(`  ✗ ${name} mancante`);
    }
  });
}
function debugBestLapsHeaders() {
  const sheet = getSheet(SHEETS.BEST_LAPS);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  Logger.log('Headers letti dal sheet:');
  headers.forEach((h, i) => {
    Logger.log(`  Col ${i+1}: "${h}" (length=${String(h).length})`);
  });
}
function testReadDrivers() {
  const drivers = getCachedSheetData_(SHEETS.DRIVERS, 600);
  Logger.log(`Trovati ${drivers.length} piloti:`);
  drivers.forEach(d => Logger.log(`  ${d.driver_id}: ${d.display_name} (${d.role})`));
}
function testAuthLogin() {
  // Sostituisci col TUO access_code reale
  const code = 'CRUCITTI-9182';

  const result = handleAuthLogin({ code });
  Logger.log('Login result:');
  Logger.log(JSON.stringify(result, null, 2));

  if (result.ok) {
    Logger.log('Token: ' + result.data.token);

    // Verifica subito il token
    const verifyCtx = verifyToken(result.data.token);
    Logger.log('Verify result:');
    Logger.log(JSON.stringify(verifyCtx, null, 2));
  }
}

function testAuthLoginWrongCode() {
  const result = handleAuthLogin({ code: 'CODICE-FAKE' });
  Logger.log('Wrong code result:');
  Logger.log(JSON.stringify(result));
}
// ═══════════════════════════════════════════════════════════
// SEED FUNCTIONS — popolano dati di test
// ═══════════════════════════════════════════════════════════

/**
 * Popola BestLaps con 8 record dummy per testare laps.list e laps.leaderboard.
 *
 * Casi coperti:
 *  - 3 piloti diversi su lmu-spa-gp → leaderboard ordina per tempo
 *  - VSD005 fa 2 tentativi su lmu-spa-gp → leaderboard prende il migliore
 *  - lap su track IRC → testa filtro per sim
 *  - lap su Monza → testa filtro per track_id
 *  - 1 lap non verificato → testa filtro verified_only
 *
 * ⚠️ Cancella e ripopola: ogni esecuzione resetta i dati.
 */
function seedBestLaps() {
  const sheet = getSheet(SHEETS.BEST_LAPS);

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  // Cancella i dati e le validazioni preesistenti dalle righe dati
  if (sheet.getLastRow() > 1) {
    const dataRange = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn());
    dataRange.clearContent();
    dataRange.clearDataValidations();
  }

  const toDisplay = (ms) => {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const mil = ms % 1000;
    return `${m}:${String(s).padStart(2, '0')}.${String(mil).padStart(3, '0')}`;
  };

  const records = [
    {
      lap_id: 'LAP001', driver_id: 'VSD005', sim: 'LMU',
      track_id: 'lmu-spa-gp', car_id: 'lmu-ferrari-296-gt3',
      lap_time_ms: 137500,
      set_date: '2026-04-15', conditions: 'dry', session_type: 'practice',
      setup_shared: 'TRUE', setup_link: '', replay_url: '',
      verified_by: 'VSD005', verified_at: '2026-04-15T10:00:00',
      notes: 'Setup base, ottimo grip',
    },
    {
      lap_id: 'LAP002', driver_id: 'VSD005', sim: 'LMU',
      track_id: 'lmu-spa-gp', car_id: 'lmu-ferrari-296-gt3',
      lap_time_ms: 136200,
      set_date: '2026-04-20', conditions: 'dry', session_type: 'qualifying',
      setup_shared: 'TRUE', setup_link: '', replay_url: '',
      verified_by: 'VSD005', verified_at: '2026-04-20T18:30:00',
      notes: 'PB dopo 30 giri',
    },
    {
      lap_id: 'LAP003', driver_id: 'VSD007', sim: 'LMU',
      track_id: 'lmu-spa-gp', car_id: 'lmu-ferrari-296-gt3',
      lap_time_ms: 138100,
      set_date: '2026-04-18', conditions: 'dry', session_type: 'practice',
      setup_shared: 'FALSE', setup_link: '', replay_url: '',
      verified_by: 'VSD007', verified_at: '2026-04-18T20:00:00',
      notes: '',
    },
    {
      lap_id: 'LAP004', driver_id: 'VSD013', sim: 'LMU',
      track_id: 'lmu-spa-gp', car_id: 'lmu-bmw-m4-gt3',
      lap_time_ms: 137800,
      set_date: '2026-04-19', conditions: 'dry', session_type: 'qualifying',
      setup_shared: 'TRUE', setup_link: '', replay_url: '',
      verified_by: 'VSD005', verified_at: '2026-04-19T15:00:00',
      notes: 'Test M4 stabile',
    },
    {
      lap_id: 'LAP005', driver_id: 'VSD005', sim: 'LMU',
      track_id: 'lmu-monza-gp', car_id: 'lmu-ferrari-296-gt3',
      lap_time_ms: 109800,
      set_date: '2026-04-22', conditions: 'dry', session_type: 'qualifying',
      setup_shared: 'TRUE', setup_link: '', replay_url: '',
      verified_by: 'VSD005', verified_at: '2026-04-22T19:00:00',
      notes: 'Pole sim',
    },
    {
      lap_id: 'LAP006', driver_id: 'VSD019', sim: 'LMU',
      track_id: 'lmu-monza-gp', car_id: 'lmu-porsche-963',
      lap_time_ms: 108200,
      set_date: '2026-04-23', conditions: 'dry', session_type: 'qualifying',
      setup_shared: 'FALSE', setup_link: '', replay_url: '',
      verified_by: 'VSD005', verified_at: '2026-04-23T21:00:00',
      notes: 'LMH advantage',
    },
    {
      lap_id: 'LAP007', driver_id: 'VSD007', sim: 'IRC',
      track_id: 'irc-spa-gp', car_id: '',
      lap_time_ms: 139500,
      set_date: '2026-04-21', conditions: 'dry', session_type: 'practice',
      setup_shared: 'FALSE', setup_link: '', replay_url: '',
      verified_by: 'VSD007', verified_at: '2026-04-21T22:00:00',
      notes: 'Test pista IRC',
    },
    {
      lap_id: 'LAP008', driver_id: 'VSD002', sim: 'LMU',
      track_id: 'lmu-spa-gp', car_id: 'lmu-bmw-m4-gt3',
      lap_time_ms: 135900,
      set_date: '2026-04-24', conditions: 'dry', session_type: 'practice',
      setup_shared: 'FALSE', setup_link: '', replay_url: '',
      verified_by: '', verified_at: '',
      notes: 'In attesa di verifica',
    },
  ];

  const now = new Date().toISOString();
  const rows = records.map(r => {
    const obj = { ...r, lap_time_display: toDisplay(r.lap_time_ms), created_at: now };
    return headers.map(h => obj[h] !== undefined ? obj[h] : '');
  });

  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);

  // Riapplica la validazione di sim (colonna C, riga 2 in giù)
  const simValidationRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['IRC', 'LMU', 'ACE'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange('C2:C').setDataValidation(simValidationRule);

  Logger.log(`✓ Seed completato: ${records.length} record inseriti in BestLaps`);
}

/**
 * Popola RaceReports con 5 record dummy su RACE001 (l'unica gara completed).
 * 
 * Casi coperti:
 *  - 4 piloti diversi → testa filtro per driver_id (privacy B)
 *  - VSD005 (admin) ha il proprio report → testa "self vede i propri"
 *  - 1 report con podio (P3) → testa il calcolo Mission Control
 *  - 1 report con incidenti → testa rendering campi opzionali
 *  - 1 report senza staff_rating → testa campi vuoti
 * 
 * ⚠️ Cancella e ripopola: ogni esecuzione resetta i dati.
 */
function seedRaceReports() {
  const sheet = getSheet(SHEETS.RACE_REPORTS);

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  if (sheet.getLastRow() > 1) {
    const dataRange = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn());
    dataRange.clearContent();
    dataRange.clearDataValidations();
  }

  const records = [
    {
      report_id: 'RPT001', race_id: 'RACE001', driver_id: 'VSD005',
      grid_position: 4, finish_position: 3,
      best_lap_ms: 137200,
      incidents: 1, incident_notes: 'Contatto leggero al T1 al primo giro',
      damage_report: 'Frontale lieve, riparato al pit',
      strategy_notes: 'Strategia 2 stop con gomma media-dura. Ottimo passo dopo il pit',
      staff_rating: 8, staff_notes: 'Bel recupero da P4 a P3. Costante sul passo gara. Bravo a non spingere oltre dopo il contatto.',
      created_at: '2026-03-15T23:30:00',
    },
    {
      report_id: 'RPT002', race_id: 'RACE001', driver_id: 'VSD007',
      grid_position: 2, finish_position: 5,
      best_lap_ms: 137800,
      incidents: 2, incident_notes: 'Off al T8 (lap 12) e contatto in pit lane (lap 38)',
      damage_report: 'Aerodinamica compromessa dopo lap 12, perdita ~0.8s al giro',
      strategy_notes: 'Tentativo overcut fallito',
      staff_rating: 5, staff_notes: 'Errori evitabili. Ne riparliamo al debrief.',
      created_at: '2026-03-15T23:45:00',
    },
    {
      report_id: 'RPT003', race_id: 'RACE001', driver_id: 'VSD013',
      grid_position: 7, finish_position: 6,
      best_lap_ms: 138400,
      incidents: 0, incident_notes: '',
      damage_report: 'Nessun danno',
      strategy_notes: 'Stint lunghi, gomme conservate bene',
      staff_rating: 7, staff_notes: 'Gara solida, nessun errore. Manca un pelo di passo in qualifica.',
      created_at: '2026-03-15T23:55:00',
    },
    {
      report_id: 'RPT004', race_id: 'RACE001', driver_id: 'VSD019',
      grid_position: 12, finish_position: 8,
      best_lap_ms: 139100,
      incidents: 1, incident_notes: 'Track limit warning al T15',
      damage_report: '',
      strategy_notes: 'Recovery decente da P12, consumo gomme ottimo',
      staff_rating: '', staff_notes: '',
      created_at: '2026-03-16T00:10:00',
    },
    {
      report_id: 'RPT005', race_id: 'RACE001', driver_id: 'VSD002',
      grid_position: 9, finish_position: 11,
      best_lap_ms: 138900,
      incidents: 3, incident_notes: 'Contatto multiplo al T1 (lap 1), spin in T8, off-track in T12',
      damage_report: 'Auto fortemente danneggiata dopo T1, ritiro evitato per orgoglio',
      strategy_notes: 'Strategia compromessa dal danno iniziale',
      staff_rating: 4, staff_notes: 'Aggressivo in partenza ma poco lucido. Lavorare sulla gestione delle prime curve in gruppo.',
      created_at: '2026-03-16T00:20:00',
    },
  ];

  const rows = records.map(r => {
    return headers.map(h => r[h] !== undefined ? r[h] : '');
  });

  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);

  Logger.log(`✓ Seed completato: ${records.length} report inseriti in RaceReports`);
  Logger.log('Casi di test coperti:');
  Logger.log('  - VSD005 admin: P3 con podio, contatto leggero (RPT001)');
  Logger.log('  - VSD007 driver: rating basso, errori multipli (RPT002)');
  Logger.log('  - VSD013 driver: gara pulita rating 7 (RPT003)');
  Logger.log('  - VSD019 driver: senza staff_rating/notes (RPT004)');
  Logger.log('  - VSD002 driver: rating molto basso (RPT005)');
}
function testActionsRegistryHealth() {
  const issues = [];
  Object.keys(ACTIONS).forEach(actionName => {
    const handler = ACTIONS[actionName];
    if (typeof handler !== 'function') {
      issues.push(`❌ ${actionName} → handler non è una funzione`);
    } else if (handler.name === '') {
      issues.push(`⚠️ ${actionName} → handler anonimo (sospetto)`);
    } else {
      Logger.log(`✓ ${actionName} → ${handler.name}`);
    }
  });
  Logger.log('---');
  if (issues.length === 0) {
    Logger.log(`✅ Registry sano. ${Object.keys(ACTIONS).length} action verificate.`);
  } else {
    Logger.log(`⚠️ ${issues.length} problemi trovati:`);
    issues.forEach(i => Logger.log(i));
  }
}

