// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Races Endpoints
// ═══════════════════════════════════════════════════════════
// 3 endpoint sulla tabella Races:
//  - races.list:     tutte le gare, opzionale filtro per status
//  - races.upcoming: prossime 3 gare scheduled e future
//  - races.get:      dettaglio singola gara per race_id
// Strategia: backend semplice, filtri arbitrari client-side.
// ═══════════════════════════════════════════════════════════

/**
 * Helper: parse una data da Google Sheet in oggetto Date.
 * Sheet può restituire stringhe ISO ('2026-05-10T20:00:00') o
 * oggetti Date già pronti (se la cella è formattata come data).
 */
function parseRaceDate(value) {
  if (value instanceof Date) return value;
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * races.list — Tutte le gare.
 * Auth: richiesta.
 *
 * @param {Object} payload - { status?: 'scheduled'|'live'|'completed'|'cancelled' }
 * @param {Object} ctx - Auth context (richiesto)
 * @returns {Object} { ok, data: { races: [...], count } }
 */
function handleRacesList(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');

  const statusFilter = payload && payload.status;
  const races = getCachedSheetData_(SHEETS.RACES, 900);

  const filtered = statusFilter
    ? races.filter(r => r.status === statusFilter)
    : races;

  filtered.sort((a, b) => {
    const da = parseRaceDate(a.date);
    const db = parseRaceDate(b.date);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da.getTime() - db.getTime();
  });

  // JOIN championship_name (Wave 9.8)
  const champMap = getChampionshipNameMap_();
  const enriched = filtered.map(r => ({
    ...r,
    championship_name: r.championship_id ? (champMap[r.championship_id] || null) : null
  }));

  return ok({ races: enriched, count: enriched.length });
}

/**
 * races.upcoming — Prossime 3 gare in calendario.
 * Auth: richiesta.
 *
 * Logica: status === 'scheduled' AND date > now, ordinate per data ASC, top 3.
 *
 * @param {Object} payload - {} (ignorato)
 * @param {Object} ctx - Auth context (richiesto)
 * @returns {Object} { ok, data: { races: [...], count } }
 */
function handleRacesUpcoming(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');

  const now = new Date();
  const races = getCachedSheetData_(SHEETS.RACES, 900);

  const upcoming = races
    .filter(r => {
      if (r.status !== 'scheduled') return false;
      const d = parseRaceDate(r.date);
      return d && d.getTime() > now.getTime();
    })
    .sort((a, b) => parseRaceDate(a.date).getTime() - parseRaceDate(b.date).getTime())
    .slice(0, 3);

  // JOIN championship_name (Wave 9.8)
  const champMap = getChampionshipNameMap_();
  const enriched = upcoming.map(r => ({
    ...r,
    championship_name: r.championship_id ? (champMap[r.championship_id] || null) : null
  }));

  return ok({ races: enriched, count: enriched.length });
}

/**
 * races.get — Dettaglio di una singola gara.
 * Auth: richiesta.
 *
 * @param {Object} payload - { race_id: string }
 * @param {Object} ctx - Auth context (richiesto)
 * @returns {Object} { ok, data: { race: {...} } }
 */
function handleRacesGet(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');

  const raceId = payload && payload.race_id;
  if (!raceId) return fail('race_id mancante');

  const races = getCachedSheetData_(SHEETS.RACES, 900);
  const race = races.find(r => r.race_id === raceId);

  if (!race) return fail('Gara non trovata: ' + raceId);

  // JOIN championship_name (Wave 9.8)
  const champMap = getChampionshipNameMap_();
  race.championship_name = race.championship_id ? (champMap[race.championship_id] || null) : null;

  return ok({ race });
}


/**
 * races.updatePoster — admin only.
 * Imposta o rimuove l'URL della poster per una gara.
 */
function handleRacesUpdatePoster(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');
  if (!ctx.isStaff) return fail('Forbidden: solo staff o admin può modificare le poster');
  if (!payload || !payload.race_id) return fail('race_id mancante');

  const posterUrl = normalizeDrivePosterUrl_((payload.poster_url || '').trim());

  // basic URL check (stringa vuota OK per rimuovere)
  if (posterUrl && !/^https?:\/\//.test(posterUrl)) {
    return fail('URL non valido: deve iniziare con http:// o https://');
  }

  const sheet = getSheet(SHEETS.RACES);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const raceIdIdx = headers.indexOf('race_id');
  const posterIdx = headers.indexOf('poster_url');

  if (raceIdIdx < 0) return fail('Colonna race_id mancante');
  if (posterIdx < 0) return fail('Colonna poster_url mancante');

  let foundRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][raceIdIdx] === payload.race_id) {
      foundRow = i + 1;
      break;
    }
  }
  if (foundRow === -1) return fail('Gara non trovata: ' + payload.race_id);

  sheet.getRange(foundRow, posterIdx + 1).setValue(posterUrl);
  invalidateSheetCache_(SHEETS.RACES);

  return ok({
    race_id: payload.race_id,
    poster_url: posterUrl,
  });
}

/**
 * races.updateGallery — admin only.
 * Imposta la lista di URL screenshot (galleria) per una gara.
 * Ogni URL viene normalizzato (es. Google Drive share link → diretto)
 * e validato. Sovrascrive sempre l'intera lista.
 */
function handleRacesUpdateGallery(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');
  if (!ctx.isStaff) return fail('Forbidden: solo staff o admin può modificare la galleria');
  if (!payload || !payload.race_id) return fail('race_id mancante');

  const rawUrls = Array.isArray(payload.gallery_urls) ? payload.gallery_urls : [];
  const cleanUrls = [];
  for (const raw of rawUrls) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) continue;
    const normalized = normalizeDrivePosterUrl_(trimmed);
    if (!/^https?:\/\//.test(normalized)) {
      return fail('URL non valido: "' + trimmed + '" deve iniziare con http:// o https://');
    }
    cleanUrls.push(normalized);
  }
  if (cleanUrls.length > 20) return fail('Massimo 20 immagini per galleria');

  const sheet = getSheet(SHEETS.RACES);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const raceIdIdx = headers.indexOf('race_id');
  const galleryIdx = headers.indexOf('gallery_urls');

  if (raceIdIdx < 0) return fail('Colonna race_id mancante');
  if (galleryIdx < 0) return fail('Colonna gallery_urls mancante. Esegui migrate_addGalleryUrlsColumn');

  let foundRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][raceIdIdx] === payload.race_id) {
      foundRow = i + 1;
      break;
    }
  }
  if (foundRow === -1) return fail('Gara non trovata: ' + payload.race_id);

  sheet.getRange(foundRow, galleryIdx + 1).setValue(cleanUrls.join(','));
  invalidateSheetCache_(SHEETS.RACES);

  return ok({
    race_id: payload.race_id,
    gallery_urls: cleanUrls,
  });
}

/**
 * Normalizza URL Google Drive "view" in URL diretto utilizzabile come image src.
 * Trasforma:
 *   https://drive.google.com/file/d/FILE_ID/view?usp=sharing
 *   https://drive.google.com/open?id=FILE_ID
 * In:
 *   https://drive.google.com/thumbnail?id=FILE_ID&sz=w1600
 *
 * Lascia invariati URL non Drive o già normalizzati.
 */
function normalizeDrivePosterUrl_(url) {
  if (!url) return url;
  const str = String(url).trim();
  if (!str) return str;

  // Pattern: /file/d/FILE_ID/...
  let match = str.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match) {
    return `https://lh3.googleusercontent.com/d/${match[1]}`;
  }

  // Pattern: ?id=FILE_ID  (open, uc, thumbnail)
  match = str.match(/drive\.google\.com\/(?:open|uc|thumbnail)\?(?:[^&]*&)*id=([a-zA-Z0-9_-]+)/);
  if (match) {
    return `https://lh3.googleusercontent.com/d/${match[1]}`;
  }

  // Pattern: lh3 già normalizzato — pass-through
  if (str.includes('lh3.googleusercontent.com')) return str;

  return str;
}
/**
 * Crea una nuova gara aggiungendola alla tab RACES.
 * Genera automaticamente il race_id incrementale (RACEnnn) e created_at.
 *
 * @param {Object} payload Dati della nuova gara (senza race_id e created_at).
 * @param {Object} ctx Contesto della richiesta (auth).
 * @returns {Object} ok({ race_id, race }) oppure fail.
 */
function handleRacesAdd(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');
  if (!_esIsStaff_(ctx)) return fail('Permessi insufficienti');

  // 1. Validazione campi obbligatori
  const requiredFields = ['race_name', 'sim', 'date', 'format', 'status'];
  for (let i = 0; i < requiredFields.length; i++) {
    const field = requiredFields[i];
    if (payload[field] === undefined || payload[field] === null || String(payload[field]).trim() === '') {
      return fail(`Campo obbligatorio mancante o vuoto: ${field}`);
    }
  }
  if (isNaN(new Date(payload.date).getTime())) {
    return fail('Campo date non parsabile come data valida');
  }

  const sheet = getSheet(SHEETS.RACES);
  if (!sheet) return fail('Foglio RACES non trovato');

  // 2. Lettura diretta + generazione race_id (regex stretta: solo RACE + cifre)
  const data = sheet.getDataRange().getValues();
  const RACE_ID_RE = /^RACE(\d+)$/;
  let maxId = 0;
  for (let i = 1; i < data.length; i++) {
    const id = data[i][0];
    if (typeof id === 'string') {
      const m = id.match(RACE_ID_RE);
      if (m) {
        const num = parseInt(m[1], 10);
        if (num > maxId) maxId = num;
      }
    }
  }
  const newRaceId = 'RACE' + String(maxId + 1).padStart(3, '0');
  const createdAt = new Date().toISOString();

  // 3. Oggetto gara con default
  const newRace = {
    race_id: newRaceId,
    sim: payload.sim,
    round: payload.round || '',
    race_name: payload.race_name,
    track_id: payload.track_id || '',
    car_id: payload.car_id || '',
    date: payload.date,
    duration_minutes: payload.duration_minutes || 0,
    format: payload.format,
    status: payload.status,
    broadcast_url: payload.broadcast_url || '',
    notes: payload.notes || '',
    created_at: createdAt,
    weather: payload.weather || '',
    event_type: payload.event_type || '',
    championship_id: payload.championship_id || '',
    poster_url: payload.poster_url || ''
  };

  // 4. Riga nell'ordine ESATTO delle 17 colonne
  const row = [
    newRace.race_id, newRace.sim, newRace.round, newRace.race_name,
    newRace.track_id, newRace.car_id, newRace.date, newRace.duration_minutes,
    newRace.format, newRace.status, newRace.broadcast_url, newRace.notes,
    newRace.created_at, newRace.weather, newRace.event_type,
    newRace.championship_id, newRace.poster_url
  ];

  // 5. Scrittura + invalidazione cache
  sheet.appendRow(row);
  invalidateSheetCache_(SHEETS.RACES);

  return ok({ race_id: newRaceId, race: newRace });
}

/**
 * Modifica i campi di una gara esistente. Non altera race_id né created_at.
 * Aggiorna solo i campi presenti nel payload.
 *
 * @param {Object} payload { race_id, ...campi da aggiornare }.
 * @param {Object} ctx Contesto della richiesta (auth).
 * @returns {Object} ok({ race_id, updated[] }) oppure fail.
 */
function handleRacesUpdate(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');
  if (!_esIsStaff_(ctx)) return fail('Permessi insufficienti');

  const race_id = payload && payload.race_id;
  if (!race_id) return fail('Campo race_id obbligatorio per l\'aggiornamento');

  if (payload.date && isNaN(new Date(payload.date).getTime())) {
    return fail('Campo date non parsabile come data valida');
  }

  const sheet = getSheet(SHEETS.RACES);
  if (!sheet) return fail('Foglio RACES non trovato');

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return fail('Gara non trovata: ' + race_id);

  const headers = data[0];
  const rowIndex = data.findIndex(row => row[0] === race_id);
  if (rowIndex === -1) return fail('Gara non trovata: ' + race_id);

  const rowToUpdate = rowIndex + 1; // base-1 per getRange
  const updatedFields = [];

  for (const key in payload) {
    if (key === 'race_id' || key === 'created_at') continue;
    const colIndex = headers.indexOf(key);
    if (colIndex !== -1) {
      sheet.getRange(rowToUpdate, colIndex + 1).setValue(payload[key]);
      updatedFields.push(key);
    }
  }

  if (updatedFields.length > 0) {
    invalidateSheetCache_(SHEETS.RACES);
  }

  return ok({ race_id: race_id, updated: updatedFields });
}

/**
 * Rimuove una gara dalla tab RACES, SOLO se non ha stint collegati.
 * Sicurezza: blocca la cancellazione se esistono dati dipendenti (no orfani).
 *
 * @param {Object} payload { race_id }.
 * @param {Object} ctx Contesto della richiesta (auth).
 * @returns {Object} ok({ race_id, deleted }) oppure fail.
 */
function handleRacesRemove(payload, ctx) {
  if (!ctx) return fail('Auth richiesto');
  if (!_esIsStaff_(ctx)) return fail('Permessi insufficienti');

  const race_id = payload && payload.race_id;
  if (!race_id) return fail('Campo race_id obbligatorio per la rimozione');

  // 1. Controllo sicurezza: stint collegati
  const stintsSheet = getSheet(SHEETS.ENDURANCE_STINTS);
  if (stintsSheet) {
    const stintsData = stintsSheet.getDataRange().getValues();
    if (stintsData.length > 1) {
      const stintRaceIdCol = stintsData[0].indexOf('race_id');
      if (stintRaceIdCol !== -1) {
        let linked = 0;
        for (let i = 1; i < stintsData.length; i++) {
          if (stintsData[i][stintRaceIdCol] === race_id) linked++;
        }
        if (linked > 0) {
          return fail(`Impossibile cancellare: la gara ha ${linked} stint collegati. Rimuovili prima.`);
        }
      }
    }
  }

  // 2. Rimozione gara
  const racesSheet = getSheet(SHEETS.RACES);
  if (!racesSheet) return fail('Foglio RACES non trovato');

  const racesData = racesSheet.getDataRange().getValues();
  const rowIndex = racesData.findIndex(row => row[0] === race_id);
  if (rowIndex === -1) return fail('Gara non trovata: ' + race_id);

  racesSheet.deleteRow(rowIndex + 1); // base-1
  invalidateSheetCache_(SHEETS.RACES);

  return ok({ race_id: race_id, deleted: true });
}
