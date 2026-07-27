// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Garage61 Integration
// ═══════════════════════════════════════════════════════════
// Auth: Script Properties GARAGE61_TOKEN + GARAGE61_TEAM_SLUG
//
// Operazioni:
//   - garage61TestSync()              → dry-run del sync (editor)
//   - garage61RunSync()               → sync reale in BestLaps (editor)
//   - garage61InspectSessionTypes()   → distribuzione sessionType (debug)
//   - garage61BackfillSessionType()   → aggiorna session_type su lap esistenti
//   - garage61BackfillCarIds()        → genera car_id per righe orfane
//   - garage61BackfillRaceClass()     → copia category in race_class
//   - garage61PopulateIRacingIds()    → popola iracing_id in Drivers
//   - garage61PopulateCarIds()        → auto-mapping garage61_id su Cars
//   - garage61ExploreTracks()         → shape grezza di /tracks e /platforms (debug)
//   - garage61TestMissingTracks()     → dry-run: TUTTO il catalogo iRacing mancante (~450)
//   - garage61AddMissingTracks()      → scrive in Tracks il catalogo completo mancante
//   - garage61TestMissingTracksFromHistory()  → dry-run: solo tracciati REALMENTE guidati dal team
//   - garage61AddMissingTracksFromHistory()   → scrive in Tracks solo quelli guidati dal team (consigliato)
//
// API exposed:
//   - handleLapsSyncFromGarage61(payload, ctx) → action 'laps.syncFromGarage61'
//     Admin-only. Chiamato dal frontend admin button.
//
// Auto-draft delle cars unmapped (v10):
//   Durante il sync reale, le auto Garage61 che non hanno mapping nel
//   catalogo VSD vengono scritte automaticamente come DRAFT nel tab Cars
//   con car_id, sim, car_name e garage61_id pre-popolati.
//
// Session type detection (v11):
//   Il sync ora usa il campo lap.sessionType di Garage61 per inferire
//   il session_type del lap (practice/qualifying/race/time_trial),
//   invece dell'hardcoded "practice" precedente.
//
// Session type backfill (v12):
//   garage61BackfillSessionType() ri-fetch i lap già nel sheet (via
//   garage61_lap_id) da Garage61 e aggiorna la cella session_type con
//   il valore corretto. One-shot, idempotente.
// ═══════════════════════════════════════════════════════════

const GARAGE61_BASE_URL = 'https://garage61.net/api/v1';

// ═══════════════════════════════════════════════════════════
// HELPERS BASE
// ═══════════════════════════════════════════════════════════

function garage61Get_(path) {
  const token = PropertiesService.getScriptProperties().getProperty('GARAGE61_TOKEN');
  if (!token) throw new Error('GARAGE61_TOKEN non configurato in Script Properties');

  const url = GARAGE61_BASE_URL + path;
  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' },
    muteHttpExceptions: true,
  });

  const status = response.getResponseCode();
  const body = response.getContentText();
  if (status !== 200) {
    Logger.log(`✗ Garage61 API HTTP ${status} on ${path}`);
    Logger.log(body);
    throw new Error(`Garage61 API error: HTTP ${status}`);
  }
  return JSON.parse(body);
}

function garage61FetchAll_(basePath) {
  let all = [];
  let offset = 0;
  const perPage = 100;
  for (let i = 0; i < 50; i++) {
    const sep = basePath.includes('?') ? '&' : '?';
    const path = `${basePath}${sep}limit=${perPage}&offset=${offset}`;
    const data = garage61Get_(path);
    if (!data.items || data.items.length === 0) break;
    all = all.concat(data.items);
    if (data.total !== undefined && all.length >= data.total) break;
    if (data.items.length < perPage) break;
    offset += perPage;
  }
  return all;
}

function garage61FormatTime_(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const mil = ms % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(mil).padStart(3, '0')}`;
}

function garage61Slugify_(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function garage61ReadSheetRaw_(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet "${sheetName}" non trovato`);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

/**
 * Mappa il sessionType numerico di Garage61 al valore stringa VSD.
 *
 * Mappatura verificata via garage61InspectSessionTypes (Maggio 2026):
 *   1 = qualifying
 *   2 = race
 *   3 = time_trial
 *   0 = practice (Garage61 filtra fuori, raro)
 *
 * Fallback safe: valori non riconosciuti → 'practice'.
 */
function garage61MapSessionType_(sessionTypeNum) {
  switch (Number(sessionTypeNum)) {
    case 1: return 'qualifying';
    case 2: return 'race';
    case 3: return 'time_trial';
    case 0:
    default: return 'practice';
  }
}

// ═══════════════════════════════════════════════════════════
// ESPLORATIVE / DEBUG
// ═══════════════════════════════════════════════════════════

function garage61ExploreMe() {
  Logger.log(JSON.stringify(garage61Get_('/me'), null, 2));
}

function garage61ExploreLaps() {
  const slug = PropertiesService.getScriptProperties().getProperty('GARAGE61_TEAM_SLUG');
  const data = garage61Get_(`/laps?teams=${slug}&tracks=77&limit=3`);
  Logger.log(`total: ${data.total}`);
  Logger.log(JSON.stringify(data, null, 2));
}

/**
 * Esplora la shape grezza di /platforms e /tracks su Garage61.
 * Serve a scoprire i nomi esatti dei campi (name, config, country, length...)
 * prima di fidarsi del mapping automatico in garage61FindMissingTracks_.
 * Editor-only, nessuna scrittura.
 */
function garage61ExploreTracks() {
  const platforms = garage61Get_('/platforms');
  Logger.log('── /platforms ──');
  Logger.log(JSON.stringify(platforms, null, 2));

  const tracks = garage61Get_('/tracks?limit=5');
  Logger.log('── /tracks (primi 5) ──');
  Logger.log(JSON.stringify(tracks, null, 2));
}

function garage61InspectSessionTypes() {
  const slug = PropertiesService.getScriptProperties().getProperty('GARAGE61_TEAM_SLUG');
  const tracksRaw = garage61ReadSheetRaw_(SHEETS.TRACKS);
  const mappedTracks = tracksRaw
    .filter(t => String(t.sim || '').toUpperCase() === 'IRC' && t.garage61_id)
    .map(t => Number(t.garage61_id));

  if (mappedTracks.length === 0) {
    Logger.log('⚠️ Nessun track IRC mappato.');
    return;
  }

  Logger.log(`Inspect su ${mappedTracks.length} tracks IRC mappati...`);
  const distribution = {};
  const samples = {};

  mappedTracks.forEach(g61TrackId => {
    let data;
    try {
      data = garage61Get_(`/laps?teams=${slug}&tracks=${g61TrackId}&limit=100&offset=0`);
    } catch (e) {
      Logger.log(`  ✗ track g61=${g61TrackId}: ${e.message}`);
      return;
    }
    (data.items || []).forEach(lap => {
      const st = Number(lap.sessionType);
      distribution[st] = (distribution[st] || 0) + 1;
      if (!samples[st]) {
        samples[st] = {
          lap_time_ms: Math.round(lap.lapTime * 1000),
          track: lap.track && lap.track.name,
          driver: lap.driver && `${lap.driver.firstName} ${lap.driver.lastName}`,
          mapped_to: garage61MapSessionType_(st),
        };
      }
    });
  });

  Logger.log('───');
  Logger.log('Distribuzione sessionType nei lap iRacing del team:');
  Object.keys(distribution).sort().forEach(st => {
    Logger.log(`  sessionType=${st} → ${distribution[st]} lap (mappato a "${garage61MapSessionType_(st)}")`);
    if (samples[st]) {
      Logger.log(`    es. ${samples[st].driver} @ ${samples[st].track} ${garage61FormatTime_(samples[st].lap_time_ms)}`);
    }
  });
}

// ═══════════════════════════════════════════════════════════
// SETUP OPERATIONS (idempotenti)
// ═══════════════════════════════════════════════════════════

function garage61PopulateIRacingIds() {
  const slug = PropertiesService.getScriptProperties().getProperty('GARAGE61_TEAM_SLUG');
  const team = garage61Get_(`/teams/${slug}`);
  if (!team.members || team.members.length === 0) {
    Logger.log('Nessun membro nel team Garage61.');
    return;
  }

  const candidates = [];
  team.members.forEach(m => {
    const acc = (m.accounts || []).find(a => a.platform === 'iracing');
    if (!acc) return;
    candidates.push({
      fullName: `${m.firstName} ${m.lastName}`.toLowerCase().trim(),
      iracingId: String(acc.id),
    });
  });

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.DRIVERS);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const realNameCol = headers.indexOf('real_name');
  const iracingIdCol = headers.indexOf('iracing_id');
  const driverIdCol = headers.indexOf('driver_id');
  if (realNameCol === -1 || iracingIdCol === -1) {
    throw new Error('Colonne real_name o iracing_id mancanti in Drivers');
  }

  let matched = 0, skipped = 0;
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const realName = String(row[realNameCol] || '').toLowerCase().trim();
    const current = String(row[iracingIdCol] || '').trim();
    if (!realName || current) { skipped++; continue; }
    const found = candidates.find(c => c.fullName === realName);
    if (found) {
      sheet.getRange(i + 1, iracingIdCol + 1).setValue(found.iracingId);
      Logger.log(`✓ ${row[driverIdCol]} (${realName}) → ${found.iracingId}`);
      matched++;
    }
  }
  Logger.log(`✅ Match: ${matched}, saltati: ${skipped}`);
}

function garage61PopulateCarIds() {
  const allCars = garage61FetchAll_('/cars');
  Logger.log(`📋 ${allCars.length} cars Garage61 totali`);
  const lookup = new Map();
  allCars.forEach(c => lookup.set(String(c.name).toLowerCase().trim(), c));

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.CARS);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const carIdCol = headers.indexOf('car_id');
  const carNameCol = headers.indexOf('car_name');
  const simCol = headers.indexOf('sim');
  const g61Col = headers.indexOf('garage61_id');
  if (g61Col === -1) throw new Error('Colonna garage61_id mancante in Cars');

  let matched = 0;
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (String(row[simCol] || '').toUpperCase() !== 'IRC') continue;
    if (String(row[g61Col] || '').trim()) continue;
    const carName = String(row[carNameCol] || '').toLowerCase().trim();
    if (!carName) continue;
    const found = lookup.get(carName);
    if (found) {
      sheet.getRange(i + 1, g61Col + 1).setValue(found.id);
      Logger.log(`✓ ${row[carIdCol] || '(no car_id)'} → ${found.id}`);
      matched++;
    }
  }
  Logger.log(`✅ Match scritti: ${matched}`);
}

/**
 * Individua i tracciati iRacing presenti nel catalogo Garage61 ma assenti
 * nel tab Tracks (nessuna riga IRC con quel garage61_id).
 *
 * Schema reale di /tracks (confermato via garage61ExploreTracks() il 27/07/2026):
 *   { id: 498, name: "Adelaide Street Circuit", variant: "", platform: "iracing", platform_id: "580" }
 * NOTA: "platform" è la stringa id piattaforma (es. "iracing"), non un oggetto.
 * "platform_id" è l'id interno del layout/config lato piattaforma, non usato qui.
 * Garage61 NON espone country né lunghezza del tracciato: quei due campi
 * restano sempre vuoti e vanno eventualmente compilati a mano.
 *
 * @returns {{toAdd: Array<Object>, platformName: string, totalG61Tracks: number, alreadyMapped: number}}
 */
function garage61FindMissingTracks_() {
  const platforms = garage61Get_('/platforms');
  const platformList = platforms.items || platforms || [];
  const iracingPlatform = platformList.find(p => {
    const n = String(p.name || p.shortName || p.id || '').toLowerCase();
    return n.includes('iracing');
  });
  if (!iracingPlatform) {
    throw new Error('Piattaforma iRacing non trovata in /platforms. Esegui garage61ExploreTracks() e controlla i nomi.');
  }

  const allTracks = garage61FetchAll_('/tracks');
  const iracingTracks = allTracks.filter(t => String(t.platform) === String(iracingPlatform.id));

  const tracksRaw = garage61ReadSheetRaw_(SHEETS.TRACKS);
  const mappedG61Ids = new Set(
    tracksRaw
      .filter(t => String(t.sim || '').toUpperCase() === 'IRC' && String(t.garage61_id || '').trim())
      .map(t => String(t.garage61_id).trim())
  );

  const existingTrackIds = new Set(tracksRaw.map(t => String(t.track_id || '').trim()).filter(Boolean));

  const toAdd = [];
  iracingTracks.forEach(t => {
    const g61Id = String(t.id);
    if (mappedG61Ids.has(g61Id)) return;

    const name = t.name || '(nome sconosciuto)';
    const variant = t.variant || '';
    // Non disponibili dall'API Garage61 — da compilare a mano se servono.
    const country = '';
    const lengthKm = '';

    let slug = garage61Slugify_(name);
    if (variant) slug += '-' + garage61Slugify_(variant);
    let trackId = 'irc-' + slug;
    if (existingTrackIds.has(trackId)) {
      let n = 2;
      while (existingTrackIds.has(`${trackId}-${n}`)) n++;
      trackId = `${trackId}-${n}`;
    }
    existingTrackIds.add(trackId);

    toAdd.push({
      track_id: trackId,
      sim: 'IRC',
      track_name: name,
      variant: variant,
      length_km: lengthKm,
      country: country,
      active: 'TRUE',
      garage61_id: g61Id,
    });
  });

  return {
    toAdd,
    platformName: iracingPlatform.name || iracingPlatform.shortName,
    totalG61Tracks: iracingTracks.length,
    alreadyMapped: mappedG61Ids.size,
  };
}

/**
 * Dry-run: mostra nel log quali tracciati verrebbero aggiunti a Tracks,
 * senza scrivere nulla. Esegui SEMPRE questo prima di garage61AddMissingTracks().
 */
function garage61TestMissingTracks() {
  const result = garage61FindMissingTracks_();
  Logger.log(`Piattaforma: ${result.platformName}`);
  Logger.log(`Tracciati Garage61 (iRacing): ${result.totalG61Tracks}`);
  Logger.log(`Già mappati in Tracks: ${result.alreadyMapped}`);
  Logger.log(`Da aggiungere: ${result.toAdd.length}`);
  Logger.log('───');
  result.toAdd.forEach(t => {
    Logger.log(`  ${t.track_id} | "${t.track_name}"${t.variant ? ' [' + t.variant + ']' : ''} | g61_id=${t.garage61_id}`);
  });
  if (result.toAdd.length > 0) {
    Logger.log('───');
    Logger.log('country e length_km NON sono forniti da Garage61: restano vuoti, compilali a mano su Tracks se ti servono.');
    Logger.log('Se l\'elenco sembra corretto, esegui garage61AddMissingTracks() per scrivere davvero.');
  }
}

/**
 * Scrittura reale: aggiunge a Tracks le righe individuate da
 * garage61FindMissingTracks_(). Idempotente (si basa su garage61_id già
 * presente per evitare doppioni), ma esegui garage61TestMissingTracks()
 * prima per controllare i dati.
 */
function garage61AddMissingTracks() {
  const result = garage61FindMissingTracks_();
  if (result.toAdd.length === 0) {
    Logger.log('Nessun tracciato da aggiungere. Tracks è già allineato con Garage61.');
    return;
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.TRACKS);
  if (!sheet) throw new Error('Sheet "Tracks" non trovato');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  const rows = result.toAdd.map(t => headers.map(h => (t[h] !== undefined ? t[h] : '')));
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  invalidateSheetCache_(SHEETS.TRACKS);

  Logger.log(`✅ Scritte ${rows.length} righe in Tracks.`);
  result.toAdd.forEach(t => Logger.log(`  + ${t.track_id} (g61_id=${t.garage61_id})`));
}

// ═══════════════════════════════════════════════════════════
// TRACCIATI MANCANTI — versione mirata (solo storico squadra)
// ═══════════════════════════════════════════════════════════
// garage61FindMissingTracks_() confronta con l'INTERO catalogo iRacing
// (~450 layout: ovali dirt, rallycross, layout storici mai usati dal
// team). Questa versione invece guarda solo i lap che il team ha
// REALMENTE registrato su Garage61 e propone solo i tracciati non
// ancora mappati tra quelli — lista realistica, non il catalogo intero.
// ═══════════════════════════════════════════════════════════

/**
 * Individua i tracciati IRC su cui il team ha effettivamente girato
 * (storico completo via /laps, group=none, nessun filtro tracks) ma
 * che non sono ancora mappati in Tracks.
 *
 * Limite: garage61FetchAll_ si ferma a 5000 lap (50 pagine × 100). Se lo
 * storico del team è più lungo, tracciati usati solo in lap molto
 * datati potrebbero non emergere: il log segnala se il cap è stato
 * raggiunto.
 *
 * @returns {{toAdd: Array<Object>, totalLapsScanned: number, alreadyMapped: number, capHit: boolean}}
 */
function garage61FindMissingTracksFromHistory_() {
  const slug = PropertiesService.getScriptProperties().getProperty('GARAGE61_TEAM_SLUG');
  const allLaps = garage61FetchAll_(`/laps?teams=${slug}&group=none`);

  const tracksRaw = garage61ReadSheetRaw_(SHEETS.TRACKS);
  const mappedG61Ids = new Set(
    tracksRaw
      .filter(t => String(t.sim || '').toUpperCase() === 'IRC' && String(t.garage61_id || '').trim())
      .map(t => String(t.garage61_id).trim())
  );
  const existingTrackIds = new Set(tracksRaw.map(t => String(t.track_id || '').trim()).filter(Boolean));

  const seen = new Map(); // garage61_id → track object grezzo
  allLaps.forEach(lap => {
    const t = lap.track;
    if (!t || t.id === undefined) return;
    const g61Id = String(t.id);
    if (mappedG61Ids.has(g61Id)) return;
    if (!seen.has(g61Id)) seen.set(g61Id, t);
  });

  const toAdd = [];
  seen.forEach((t, g61Id) => {
    const name = t.name || '(nome sconosciuto)';
    const variant = t.variant || '';

    let slug2 = garage61Slugify_(name);
    if (variant) slug2 += '-' + garage61Slugify_(variant);
    let trackId = 'irc-' + slug2;
    if (existingTrackIds.has(trackId)) {
      let n = 2;
      while (existingTrackIds.has(`${trackId}-${n}`)) n++;
      trackId = `${trackId}-${n}`;
    }
    existingTrackIds.add(trackId);

    toAdd.push({
      track_id: trackId,
      sim: 'IRC',
      track_name: name,
      variant: variant,
      length_km: '',
      country: '',
      active: 'TRUE',
      garage61_id: g61Id,
    });
  });

  return {
    toAdd,
    totalLapsScanned: allLaps.length,
    alreadyMapped: mappedG61Ids.size,
    capHit: allLaps.length >= 5000,
  };
}

/**
 * Dry-run mirato: mostra solo i tracciati che il team ha davvero guidato
 * e non sono ancora mappati. Esegui SEMPRE prima di garage61AddMissingTracksFromHistory().
 */
function garage61TestMissingTracksFromHistory() {
  const result = garage61FindMissingTracksFromHistory_();
  Logger.log(`Lap analizzati: ${result.totalLapsScanned}`);
  Logger.log(`Già mappati in Tracks: ${result.alreadyMapped}`);
  Logger.log(`Tracciati usati dal team ma non mappati: ${result.toAdd.length}`);
  Logger.log('───');
  result.toAdd.forEach(t => {
    Logger.log(`  ${t.track_id} | "${t.track_name}"${t.variant ? ' [' + t.variant + ']' : ''} | g61_id=${t.garage61_id}`);
  });
  if (result.capHit) {
    Logger.log('───');
    Logger.log('⚠️ Raggiunto il cap di 5000 lap scansionati: storico più vecchio potrebbe non essere stato controllato.');
  }
  if (result.totalLapsScanned === 0) {
    Logger.log('⚠️ Nessun lap trovato per il team. Verifica GARAGE61_TEAM_SLUG o esegui garage61ExploreLaps() per controllare la shape.');
  }
}

/**
 * Scrittura reale (versione mirata): aggiunge a Tracks solo i tracciati
 * che il team ha davvero guidato e non sono ancora mappati.
 */
function garage61AddMissingTracksFromHistory() {
  const result = garage61FindMissingTracksFromHistory_();
  if (result.toAdd.length === 0) {
    Logger.log('Nessun tracciato da aggiungere. Tracks copre già tutto lo storico del team.');
    return;
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.TRACKS);
  if (!sheet) throw new Error('Sheet "Tracks" non trovato');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  const rows = result.toAdd.map(t => headers.map(h => (t[h] !== undefined ? t[h] : '')));
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  invalidateSheetCache_(SHEETS.TRACKS);

  Logger.log(`✅ Scritte ${rows.length} righe in Tracks.`);
  result.toAdd.forEach(t => Logger.log(`  + ${t.track_id} (g61_id=${t.garage61_id})`));
}

function garage61BackfillCarIds() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.CARS);
  if (!sheet) throw new Error('Sheet "Cars" non trovato');
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const carIdCol = headers.indexOf('car_id');
  const carNameCol = headers.indexOf('car_name');
  const simCol = headers.indexOf('sim');
  if (carIdCol === -1 || carNameCol === -1 || simCol === -1) {
    throw new Error('Colonne mancanti in Cars (necessarie: car_id, car_name, sim)');
  }

  const existing = new Set();
  for (let i = 1; i < values.length; i++) {
    const id = String(values[i][carIdCol] || '').trim();
    if (id) existing.add(id);
  }

  let filled = 0, skippedHasId = 0, skippedNoName = 0, collisions = 0;
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const current = String(row[carIdCol] || '').trim();
    if (current) { skippedHasId++; continue; }
    const carName = String(row[carNameCol] || '').trim();
    const sim = String(row[simCol] || '').trim().toLowerCase();
    if (!carName || !sim) { skippedNoName++; continue; }

    const slug = garage61Slugify_(carName);
    let newId = `${sim}-${slug}`;
    if (existing.has(newId)) {
      let n = 2;
      while (existing.has(`${newId}-${n}`)) n++;
      newId = `${newId}-${n}`;
      collisions++;
    }
    existing.add(newId);
    sheet.getRange(i + 1, carIdCol + 1).setValue(newId);
    Logger.log(`✓ riga ${i + 1}: "${carName}" → ${newId}`);
    filled++;
  }
  Logger.log(`✅ Backfilled: ${filled}, skip già id: ${skippedHasId}, skip no name: ${skippedNoName}, collisioni: ${collisions}`);
}

function garage61BackfillRaceClass() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.CARS);
  if (!sheet) throw new Error('Sheet "Cars" non trovato');
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const carIdCol = headers.indexOf('car_id');
  const categoryCol = headers.indexOf('category');
  const raceClassCol = headers.indexOf('race_class');
  const simCol = headers.indexOf('sim');
  if (categoryCol === -1 || raceClassCol === -1) {
    throw new Error('Colonne mancanti in Cars (necessarie: category, race_class)');
  }

  let filled = 0, skippedHasRC = 0, skippedNoCategory = 0;
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const currentRC = String(row[raceClassCol] || '').trim();
    if (currentRC) { skippedHasRC++; continue; }
    const category = String(row[categoryCol] || '').trim();
    if (!category) { skippedNoCategory++; continue; }

    sheet.getRange(i + 1, raceClassCol + 1).setValue(category);
    Logger.log(`✓ riga ${i + 1}: ${row[carIdCol] || '(no id)'} [${row[simCol]}] race_class ← "${category}"`);
    filled++;
  }
  Logger.log(`✅ Backfilled: ${filled}, skip già popolato: ${skippedHasRC}, skip no category: ${skippedNoCategory}`);
}

/**
 * Backfill session_type sui lap già presenti in BestLaps importati da Garage61.
 *
 * Per ogni lap nel sheet con garage61_lap_id valido, ri-fetch da Garage61
 * e aggiorna la cella session_type col valore corretto. Necessario one-shot
 * dopo il deploy v11 perché i lap importati prima avevano session_type
 * hardcoded "practice".
 *
 * Strategia: itera solo sui tracks dove ci sono lap importati (per
 * minimizzare le chiamate API). Per ognuno fetch in paginazione e match
 * via garage61_lap_id. Batch write alla fine.
 *
 * Idempotente: se rieseguito, riscrive gli stessi valori (no-op effettivo).
 */
function garage61BackfillSessionType() {
  Logger.log('[BACKFILL session_type] avviato...');

  const slug = PropertiesService.getScriptProperties().getProperty('GARAGE61_TEAM_SLUG');
  if (!slug) throw new Error('GARAGE61_TEAM_SLUG non configurato');

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.BEST_LAPS);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const g61LapIdCol = headers.indexOf('garage61_lap_id');
  const sessionTypeCol = headers.indexOf('session_type');
  const trackIdCol = headers.indexOf('track_id');
  if (g61LapIdCol === -1 || sessionTypeCol === -1) {
    throw new Error('Colonne mancanti in BestLaps (garage61_lap_id, session_type)');
  }

  // Mappa: garage61_lap_id → rowNumber (1-indexed nel sheet)
  // Inoltre: tracks VSD da considerare (solo dove abbiamo lap da Garage61)
  const lapRowByG61Id = new Map();
  const tracksWithG61Laps = new Set();
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const g61Id = String(row[g61LapIdCol] || '').trim();
    if (!g61Id) continue;
    lapRowByG61Id.set(g61Id, i + 1); // sheet rows sono 1-indexed
    const trackId = String(row[trackIdCol] || '').trim();
    if (trackId) tracksWithG61Laps.add(trackId);
  }

  Logger.log(`  Lap da Garage61 in BestLaps: ${lapRowByG61Id.size}`);
  Logger.log(`  Tracks con lap Garage61: ${tracksWithG61Laps.size}`);
  if (lapRowByG61Id.size === 0) {
    Logger.log('Nessun lap Garage61 in BestLaps. Niente da backfillare.');
    return { updated: 0 };
  }

  // Lookup: vsdTrackId → garage61_id
  const tracksRaw = garage61ReadSheetRaw_(SHEETS.TRACKS);
  const g61TrackByVsdId = new Map();
  tracksRaw.forEach(t => {
    if (t.track_id && t.garage61_id) {
      g61TrackByVsdId.set(t.track_id, Number(t.garage61_id));
    }
  });

  const stats = { updated: 0, notFound: 0, errors: 0, distribution: {} };
  const updates = [];   // { row, value }

  for (const vsdTrackId of tracksWithG61Laps) {
    const g61TrackId = g61TrackByVsdId.get(vsdTrackId);
    if (!g61TrackId) {
      Logger.log(`  ⚠️  ${vsdTrackId}: track non più mappato in sheet, skippo`);
      continue;
    }

    let offset = 0;
    const perPage = 100;
    for (let iter = 0; iter < 50; iter++) {
      let data;
      try {
        data = garage61Get_(`/laps?teams=${slug}&tracks=${g61TrackId}&limit=${perPage}&offset=${offset}`);
      } catch (e) {
        Logger.log(`  ✗ ${vsdTrackId}: ${e.message}`);
        stats.errors++;
        break;
      }
      const laps = data.items || [];
      if (laps.length === 0) break;

      laps.forEach(lap => {
        const rowNum = lapRowByG61Id.get(lap.id);
        if (!rowNum) return; // questo lap non è nel nostro sheet
        const sessionType = garage61MapSessionType_(lap.sessionType);
        updates.push({ row: rowNum, value: sessionType });
        stats.distribution[sessionType] = (stats.distribution[sessionType] || 0) + 1;
        lapRowByG61Id.delete(lap.id); // marca come trovato
      });

      if (laps.length < perPage) break;
      if (data.total !== undefined && offset + laps.length >= data.total) break;
      offset += perPage;
    }
  }

  stats.notFound = lapRowByG61Id.size;

  // Batch write
  if (updates.length > 0) {
    updates.forEach(u => {
      sheet.getRange(u.row, sessionTypeCol + 1).setValue(u.value);
    });
    stats.updated = updates.length;
  }

  Logger.log('───');
  Logger.log(`[BACKFILL session_type] Riepilogo:`);
  Logger.log(`  ✅ Aggiornati: ${stats.updated}`);
  Logger.log(`  ⚠️  Non trovati su Garage61: ${stats.notFound} (lap potenzialmente eliminati o non più accessibili)`);
  if (stats.errors > 0) Logger.log(`  ⚠️  Errori API: ${stats.errors}`);
  Logger.log(`  Distribuzione session_type aggiornati:`);
  Object.keys(stats.distribution).sort().forEach(st => {
    Logger.log(`    - ${st}: ${stats.distribution[st]}`);
  });

  return stats;
}

// ═══════════════════════════════════════════════════════════
// SYNC CORE
// ═══════════════════════════════════════════════════════════

function garage61DraftUnmappedCars_(unmappedCarsSeen, carsRaw) {
  const carsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.CARS);
  const carsHeaders = carsSheet.getRange(1, 1, 1, carsSheet.getLastColumn()).getValues()[0];

  const existingCarIds = new Set(
    carsRaw.map(c => String(c.car_id || '').trim()).filter(Boolean)
  );

  const draftRows = [];
  const draftedList = [];

  unmappedCarsSeen.forEach((carName, g61CarId) => {
    const slug = garage61Slugify_(carName);
    let newCarId = `irc-${slug}`;
    if (existingCarIds.has(newCarId)) {
      let n = 2;
      while (existingCarIds.has(`${newCarId}-${n}`)) n++;
      newCarId = `${newCarId}-${n}`;
    }
    existingCarIds.add(newCarId);

    const record = {
      car_id: newCarId,
      sim: 'IRC',
      car_name: carName,
      manufacturer: '',
      category: '',
      race_class: '',
      active: 'TRUE',
      garage61_id: g61CarId,
    };
    draftRows.push(carsHeaders.map(h => record[h] !== undefined ? record[h] : ''));
    draftedList.push({ garage61_id: g61CarId, car_id: newCarId, name: carName });
    Logger.log(`  ✏️  Draft: ${newCarId} ← g61=${g61CarId} "${carName}"`);
  });

  if (draftRows.length > 0) {
    carsSheet.getRange(carsSheet.getLastRow() + 1, 1, draftRows.length, carsHeaders.length)
      .setValues(draftRows);
      invalidateSheetCache_(SHEETS.CARS);
  }

  return { drafted: draftRows.length, draftedList };
}

function garage61SyncLaps_(options) {
  options = options || {};
  const writeToSheet = options.writeToSheet === true;
  const tag = writeToSheet ? '[SYNC]' : '[DRY-RUN]';
  Logger.log(`${tag} avviato...`);

  const slug = PropertiesService.getScriptProperties().getProperty('GARAGE61_TEAM_SLUG');
  if (!slug) throw new Error('GARAGE61_TEAM_SLUG non configurato');

  const driversRaw = garage61ReadSheetRaw_(SHEETS.DRIVERS);
  const carsRaw = garage61ReadSheetRaw_(SHEETS.CARS);
  const tracksRaw = garage61ReadSheetRaw_(SHEETS.TRACKS);
  const bestLapsRaw = garage61ReadSheetRaw_(SHEETS.BEST_LAPS);

  const driverByIracingId = new Map();
  driversRaw.forEach(d => {
    if (!d.driver_id) return;
    const ir = String(d.iracing_id || '').trim();
    if (ir && String(d.status || '').toLowerCase() === 'active') {
      driverByIracingId.set(ir, d.driver_id);
    }
  });

  const carByG61Id = new Map();
  carsRaw.forEach(c => {
    if (!c.car_id) return;
    if (String(c.sim || '').toUpperCase() !== 'IRC') return;
    if (String(c.active || '').toUpperCase() === 'FALSE') return;
    const g61 = c.garage61_id;
    if (g61 !== '' && g61 !== null && g61 !== undefined) {
      carByG61Id.set(Number(g61), c.car_id);
    }
  });

  const trackByG61Id = new Map();
  tracksRaw.forEach(t => {
    if (!t.track_id) return;
    if (String(t.sim || '').toUpperCase() !== 'IRC') return;
    if (String(t.active || '').toUpperCase() === 'FALSE') return;
    const g61 = t.garage61_id;
    if (g61 !== '' && g61 !== null && g61 !== undefined) {
      trackByG61Id.set(Number(g61), t.track_id);
    }
  });

  const existingG61LapIds = new Set();
  let maxLapNum = 0;
  bestLapsRaw.forEach(l => {
    const g61id = String(l.garage61_lap_id || '').trim();
    if (g61id) existingG61LapIds.add(g61id);
    const m = String(l.lap_id || '').match(/LAP(\d+)/i);
    if (m) maxLapNum = Math.max(maxLapNum, parseInt(m[1], 10));
  });

  Logger.log(`  Lookup: ${driverByIracingId.size} drivers, ${carByG61Id.size} cars, ${trackByG61Id.size} tracks mappati.`);
  Logger.log(`  Dedup: ${existingG61LapIds.size} lap già importati. maxLapNum=${maxLapNum}.`);

  if (trackByG61Id.size === 0) {
    Logger.log('⚠️ Nessun track IRC mappato. Nulla da sincronizzare.');
    return {
      imported: 0, tracksProcessed: 0, lapsTotal: 0,
      skippedDedup: 0, skippedQuality: 0, skippedCarUnmapped: 0,
      skippedDriverUnmapped: 0, errors: 0,
      unmappedCarsDrafted: 0, unmappedCarsDraftedList: [],
      unmappedCars: [], unmappedDrivers: [],
    };
  }

  const team = garage61Get_(`/teams/${slug}`);
  const iracingBySlug = new Map();
  (team.members || []).forEach(m => {
    const acc = (m.accounts || []).find(a => a.platform === 'iracing');
    if (acc) iracingBySlug.set(m.slug, String(acc.id));
  });
  Logger.log(`  Team members con iRacing account: ${iracingBySlug.size}`);

  const stats = {
    tracksProcessed: 0, lapsTotal: 0, imported: 0,
    skippedDedup: 0, skippedQuality: 0, skippedCarUnmapped: 0, skippedDriverUnmapped: 0,
    errors: 0,
  };
  const unmappedCarsSeen = new Map();
  const unmappedDriversSeen = new Map();
  const newRecords = [];
  const sessionTypeDistribution = {};
  const now = new Date().toISOString();

  for (const [g61TrackId, vsdTrackId] of trackByG61Id) {
    stats.tracksProcessed++;
    let trackLapCount = 0;
    let offset = 0;
    const perPage = 100;

    for (let iter = 0; iter < 50; iter++) {
      const path = `/laps?teams=${slug}&tracks=${g61TrackId}&limit=${perPage}&offset=${offset}`;
      let data;
      try {
        data = garage61Get_(path);
      } catch (e) {
        Logger.log(`  ✗ ${vsdTrackId}: ${e.message}`);
        stats.errors++;
        break;
      }
      const laps = data.items || [];
      if (laps.length === 0) break;

      laps.forEach(lap => {
        stats.lapsTotal++;
        trackLapCount++;

        if (existingG61LapIds.has(lap.id)) { stats.skippedDedup++; return; }
        if (!lap.clean || lap.incomplete || lap.offtrack
            || lap.pitlane || lap.pitIn || lap.pitOut
            || lap.missing || lap.discontinuity) {
          stats.skippedQuality++;
          return;
        }

        const g61CarId = lap.car && Number(lap.car.id);
        const vsdCarId = carByG61Id.get(g61CarId);
        if (!vsdCarId) {
          stats.skippedCarUnmapped++;
          if (lap.car && !unmappedCarsSeen.has(g61CarId)) {
            unmappedCarsSeen.set(g61CarId, lap.car.name);
          }
          return;
        }

        const driverSlug = lap.driver && lap.driver.slug;
        const iracingId = iracingBySlug.get(driverSlug);
        const driverId = iracingId && driverByIracingId.get(iracingId);
        if (!driverId) {
          stats.skippedDriverUnmapped++;
          if (lap.driver && !unmappedDriversSeen.has(driverSlug)) {
            unmappedDriversSeen.set(driverSlug, `${lap.driver.firstName} ${lap.driver.lastName}`);
          }
          return;
        }

        const lapTimeMs = Math.round(lap.lapTime * 1000);
        const setDate = String(lap.startTime).split('T')[0];
        const conditions = (lap.precipitation > 0 || lap.trackWetness > 0) ? 'wet' : 'dry';
        const sessionType = garage61MapSessionType_(lap.sessionType);
        sessionTypeDistribution[sessionType] = (sessionTypeDistribution[sessionType] || 0) + 1;
        maxLapNum++;
        const lapId = 'LAP' + String(maxLapNum).padStart(3, '0');

        newRecords.push({
          lap_id: lapId,
          driver_id: driverId,
          sim: 'IRC',
          track_id: vsdTrackId,
          car_id: vsdCarId,
          lap_time_ms: lapTimeMs,
          lap_time_display: garage61FormatTime_(lapTimeMs),
          set_date: setDate,
          conditions: conditions,
          session_type: sessionType,
          setup_shared: 'FALSE',
          setup_link: '',
          replay_url: '',
          verified_by: 'VSD005',
          verified_at: now,
          notes: 'Imported from Garage61',
          created_at: now,
          garage61_lap_id: lap.id,
        });
        existingG61LapIds.add(lap.id);
        stats.imported++;
      });

      if (laps.length < perPage) break;
      if (data.total !== undefined && offset + laps.length >= data.total) break;
      offset += perPage;
    }

    if (trackLapCount > 0) {
      Logger.log(`  ${vsdTrackId} (g61=${g61TrackId}): ${trackLapCount} lap`);
    }
  }

  Logger.log('───');
  Logger.log(`${tag} Riepilogo:`);
  Logger.log(`  Tracks processati: ${stats.tracksProcessed}`);
  Logger.log(`  Lap ricevuti totali: ${stats.lapsTotal}`);
  Logger.log(`  ✅ Da importare: ${stats.imported}`);
  Logger.log(`  ⏭️  Skip dedup: ${stats.skippedDedup}`);
  Logger.log(`  ⏭️  Skip qualità: ${stats.skippedQuality}`);
  Logger.log(`  ⏭️  Skip car non mappato: ${stats.skippedCarUnmapped}`);
  Logger.log(`  ⏭️  Skip driver non identificato: ${stats.skippedDriverUnmapped}`);
  if (stats.errors > 0) Logger.log(`  ⚠️  Errori API: ${stats.errors}`);

  if (Object.keys(sessionTypeDistribution).length > 0) {
    Logger.log(`  Session type distribution:`);
    Object.keys(sessionTypeDistribution).sort().forEach(st => {
      Logger.log(`    - ${st}: ${sessionTypeDistribution[st]}`);
    });
  }

  if (unmappedCarsSeen.size > 0) {
    Logger.log(`  Cars Garage61 senza mapping VSD:`);
    unmappedCarsSeen.forEach((name, id) => Logger.log(`    - g61=${id} "${name}"`));
  }
  if (unmappedDriversSeen.size > 0) {
    Logger.log(`  Drivers Garage61 senza mapping VSD:`);
    unmappedDriversSeen.forEach((name, slug) => Logger.log(`    - ${slug} "${name}"`));
  }

  stats.unmappedCars = Array.from(unmappedCarsSeen.entries()).map(([id, name]) => ({ id, name }));
  stats.unmappedDrivers = Array.from(unmappedDriversSeen.entries()).map(([slug, name]) => ({ slug, name }));
  stats.unmappedCarsDrafted = 0;
  stats.unmappedCarsDraftedList = [];
  stats.sessionTypeDistribution = sessionTypeDistribution;

  if (writeToSheet) {
    if (newRecords.length > 0) {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.BEST_LAPS);
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const rows = newRecords.map(r => headers.map(h => (r[h] !== undefined ? r[h] : '')));
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
      Logger.log(`✅ ${rows.length} righe scritte in BestLaps.`);
    } else {
      Logger.log('Nessun nuovo lap da scrivere.');
    }

    if (unmappedCarsSeen.size > 0) {
      Logger.log(`📝 Auto-draft cars unmapped:`);
      const draftResult = garage61DraftUnmappedCars_(unmappedCarsSeen, carsRaw);
      stats.unmappedCarsDrafted = draftResult.drafted;
      stats.unmappedCarsDraftedList = draftResult.draftedList;
      if (draftResult.drafted > 0) {
        Logger.log(`✏️  ${draftResult.drafted} cars draftate nel tab Cars.`);
        Logger.log(`    Completa manufacturer/category/race_class nel sheet per attivare il match al prossimo sync.`);
      }
    }
  } else {
    Logger.log('🚫 DRY-RUN: nessuna riga scritta.');
    if (newRecords.length > 0) {
      Logger.log('Esempio primi 2 record:');
      newRecords.slice(0, 2).forEach(r => Logger.log(JSON.stringify(r, null, 2)));
    }
  }

  return stats;
}

function garage61TestSync() {
  garage61SyncLaps_({ writeToSheet: false });
}

/**
 * ENTRY POINT — Scheduled Garage61 Sync (Sprint 0 - 5 giu 2026)
 *
 * Eseguito automaticamente da Apps Script time-driven trigger ogni 4 ore.
 *
 * SETUP TRIGGER (una tantum):
 *   Editor Apps Script → menu Trigger (icona orologio sx) → "Aggiungi trigger"
 *     - Funzione da eseguire:   garage61RunSync
 *     - Sorgente evento:        Basato su tempo
 *     - Tipo trigger di tempo:  Timer ore
 *     - Intervallo orario:      Ogni 4 ore
 *     - Notifiche errori:       Immediatamente (email su failure)
 *
 * Stesso sync chiamato dall'admin UI (button "Avvia Sync Garage61"
 * in /admin/sync-garage61, via action laps.syncFromGarage61).
 *
 * Operazione idempotente: lap già presenti vengono skippati via dedup.
 * Garage61 upstream ha lag ~1-3h → frequenza ogni 4h è il giusto compromesso.
 *
 * NB: importa solo "best lap puliti" (practice/qualifying clean).
 * Race laps di gara NON vengono importati da questo sync (Wave 9.8 backlog).
 */
function garage61RunSync() {
  garage61SyncLaps_({ writeToSheet: true });
}

// ═══════════════════════════════════════════════════════════
// API HANDLER (action: laps.syncFromGarage61)
// ═══════════════════════════════════════════════════════════

function handleLapsSyncFromGarage61(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');
  if (!ctx.isStaff) return fail('Operazione riservata a staff e admin');

  try {
    const stats = garage61SyncLaps_({ writeToSheet: true });
    return ok(stats);
  } catch (e) {
    Logger.log('handleLapsSyncFromGarage61 error: ' + e.message);
    return fail(e.message || 'Errore durante il sync Garage61');
  }
}

