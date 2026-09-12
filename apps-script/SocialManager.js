// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Social Manager
// ═══════════════════════════════════════════════════════════
//
// Strumento di pianificazione contenuti social per staff admin.
// Due tab nuovi nel VSD_HUB_DB: SocialPosts (bozze/programmati/
// pubblicati), SocialMetrics (storico follower inserito a mano).
//
// LIMITE STRUTTURALE, non aggirabile: non esiste nessun connettore
// di pubblicazione Facebook/Instagram nel registro MCP (verificato
// esplicitamente). Questo modulo NON pubblica mai nulla in automatico
// su nessun social — "pubblicato" qui significa solo "Demetrio l'ha
// già postato a mano e lo marca come fatto per tenere traccia".
// Se in futuro nasce un connettore reale, questo è il punto dove
// agganciarlo — oggi sarebbe un bottone che finge di funzionare, e
// non lo costruiamo.
//
// Auth: tutte le action qui sono ctx.isAdmin, non ctx.isStaff — su
// richiesta esplicita di Demetrio ("Admin o Team Principal", non i
// piloti normali né lo staff generico). Più stretto del pattern
// usato per BestLaps/Races.
//
// Setup one-time: esegui setupSocialManagerTabs() dall'editor Apps
// Script prima di usare qualunque action di questo file — crea i
// tab se mancanti, idempotente (skip se già esistenti).

const SOCIAL_POSTS_HEADERS = [
  'post_id', 'content', 'platforms', 'status', 'scheduled_date',
  'link_destination', 'created_by', 'created_at', 'updated_at', 'published_at',
  // race_id/pillar (opzionali): collegano un post a una gara e a un
  // pilastro del calendario editoriale (anteprima/iscrizioni/live/
  // risultati/highlight) — usati da handleSocialEditorialPlan lato
  // frontend per capire quali post mancano ancora. Append in fondo,
  // non in mezzo, per non spostare le colonne di righe già esistenti.
  'race_id', 'pillar',
  // media_url (opzionale): URL di un file caricato in Media Gallery
  // (SocialMedia) scelto per illustrare il post. Sempre append-only.
  'media_url',
];

const SOCIAL_METRICS_HEADERS = [
  'metric_id', 'platform', 'followers', 'recorded_date', 'recorded_by',
];

const SOCIAL_MEDIA_HEADERS = [
  'media_id', 'url', 'filename', 'media_type', 'tags',
  'uploaded_by', 'uploaded_at',
];

// SocialPlanDismissed: sezioni del piano editoriale (useEditorialPlan,
// frontend) archiviate manualmente da un admin, per race_id. Il piano
// mostra le gare in una finestra fissa -10/+45 giorni (vedi commento in
// SocialManager.jsx), ma quella finestra è cieca al contenuto: se i
// pilastri di chiusura (risultati/highlight) non sono ancora pubblicati
// al giorno 10, la sezione sparisce comunque. Questo tab dà un
// controllo manuale indipendente dalla finestra a tempo — un admin
// archivia quando i post di chiusura sono davvero fatti, non quando
// scade un timer. Chiave naturale race_id (una riga per gara al più).
const SOCIAL_PLAN_DISMISSED_HEADERS = [
  'race_id', 'dismissed_by', 'dismissed_at',
];

/**
 * Setup one-time — crea i tab SocialPosts/SocialMetrics se mancanti.
 * Esecuzione: editor Apps Script → dropdown funzioni →
 *             setupSocialManagerTabs → ▶ Esegui (una volta sola).
 */
function setupSocialManagerTabs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const tabs = [
    { name: SHEETS.SOCIAL_POSTS, headers: SOCIAL_POSTS_HEADERS },
    { name: SHEETS.SOCIAL_METRICS, headers: SOCIAL_METRICS_HEADERS },
    { name: SHEETS.SOCIAL_MEDIA, headers: SOCIAL_MEDIA_HEADERS },
    { name: SHEETS.SOCIAL_PLAN_DISMISSED, headers: SOCIAL_PLAN_DISMISSED_HEADERS },
  ];

  const results = [];

  tabs.forEach(tab => {
    let sheet = ss.getSheetByName(tab.name);

    if (sheet) {
      // Migrazione idempotente: se lo schema atteso ha più colonne di
      // quelle già presenti (es. race_id/pillar aggiunte dopo), le
      // aggiunge in coda senza toccare le colonne/righe esistenti.
      const lastCol = sheet.getLastColumn();
      const currentHeaders = lastCol > 0
        ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || ''))
        : [];
      const missing = tab.headers.filter(h => currentHeaders.indexOf(h) === -1);

      if (missing.length === 0) {
        results.push(`⚠  Tab "${tab.name}" già esistente e aggiornato — skip`);
        return;
      }

      const startCol = currentHeaders.length + 1;
      const range = sheet.getRange(1, startCol, 1, missing.length);
      range.setValues([missing]);
      range.setFontWeight('bold');
      range.setBackground('#1f2a44');
      range.setFontColor('#ffffff');
      range.setFontSize(10);
      range.setHorizontalAlignment('left');
      for (let i = 0; i < missing.length; i++) {
        const col = startCol + i;
        sheet.autoResizeColumn(col);
        if (sheet.getColumnWidth(col) < 100) sheet.setColumnWidth(col, 100);
      }

      results.push(`✓  Tab "${tab.name}" aggiornato: colonne aggiunte [${missing.join(', ')}]`);
      return;
    }

    sheet = ss.insertSheet(tab.name);
    sheet.getRange(1, 1, 1, tab.headers.length).setValues([tab.headers]);

    const headerRange = sheet.getRange(1, 1, 1, tab.headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#1f2a44');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontSize(10);
    headerRange.setHorizontalAlignment('left');
    sheet.setFrozenRows(1);

    for (let i = 1; i <= tab.headers.length; i++) {
      sheet.autoResizeColumn(i);
      if (sheet.getColumnWidth(i) < 100) sheet.setColumnWidth(i, 100);
    }

    results.push(`✓  Tab "${tab.name}" creato con ${tab.headers.length} colonne`);
  });

  Logger.log(results.join('\n'));
}

/**
 * Genera un ID progressivo con prefisso, scansionando la colonna A.
 * Stesso pattern di handleLapsAdd (BestLaps.js).
 */
function socialNextId_(sheet, prefix) {
  const data = sheet.getDataRange().getValues();
  let max = 0;
  const re = new RegExp(prefix + '(\\d+)', 'i');
  for (let i = 1; i < data.length; i++) {
    const m = String(data[i][0] || '').match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return prefix + String(max + 1).padStart(3, '0');
}

// ═══════════════════════════════════════════════════════════
// SOCIAL POSTS — CRUD
// ═══════════════════════════════════════════════════════════

/**
 * social.posts.list — Tutti i post, filtro opzionale per status.
 * @param {Object} payload - { status? }
 */
function handleSocialPostsList(payload, ctx) {
  if (!ctx || !ctx.isAdmin) return fail('Accesso riservato ad admin/team principal');

  let posts = sheetToObjects(SHEETS.SOCIAL_POSTS);
  const statusFilter = payload && payload.status;
  if (statusFilter) posts = posts.filter(p => p.status === statusFilter);

  posts.sort((a, b) => {
    const da = a.scheduled_date || a.created_at || '';
    const db = b.scheduled_date || b.created_at || '';
    return String(db).localeCompare(String(da));
  });

  return ok({ posts, count: posts.length });
}

/**
 * social.posts.create — Nuova bozza/post.
 * @param {Object} payload - { content, platforms: string[], scheduled_date?, link_destination? }
 */
function handleSocialPostsCreate(payload, ctx) {
  if (!ctx || !ctx.isAdmin) return fail('Accesso riservato ad admin/team principal');
  if (!payload || !String(payload.content || '').trim()) return fail('content obbligatorio');

  const platforms = Array.isArray(payload.platforms) ? payload.platforms : [];
  if (platforms.length === 0) return fail('Seleziona almeno una piattaforma');

  const sheet = getSheet(SHEETS.SOCIAL_POSTS);
  if (!sheet) return fail('Foglio SocialPosts non trovato — esegui setupSocialManagerTabs() prima');

  const now = new Date().toISOString();
  const postId = socialNextId_(sheet, 'SPOST');

  const newPost = {
    post_id: postId,
    content: payload.content.trim(),
    platforms: platforms.join(','),
    status: 'bozza',
    scheduled_date: payload.scheduled_date || '',
    link_destination: payload.link_destination || '',
    created_by: ctx.driver_id || '',
    created_at: now,
    updated_at: now,
    published_at: '',
    race_id: payload.race_id || '',
    pillar: payload.pillar || '',
    media_url: payload.media_url || '',
  };

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map(h => (newPost[h] !== undefined ? newPost[h] : ''));
  sheet.appendRow(row);

  // scheduled_date è testo puro "YYYY-MM-DD" (nessuna semantica di ora/
  // fuso). Sheets però auto-rileva stringhe che sembrano date e le
  // converte in un valore Data reale sul formato "Automatico" della
  // colonna — poi in lettura via API torna come timestamp UTC completo,
  // sfasato di un giorno per chi legge/scrive da un fuso diverso da UTC
  // (bug osservato 1 ago 2026: 2026-08-01 diventato "2026-07-31T22:00...Z").
  // Forzare la cella a testo DOPO la scrittura e riscrivere il valore
  // impedisce la conversione automatica.
  const scheduledDateCol = headers.indexOf('scheduled_date') + 1;
  if (scheduledDateCol > 0 && newPost.scheduled_date) {
    const cell = sheet.getRange(sheet.getLastRow(), scheduledDateCol);
    cell.setNumberFormat('@');
    cell.setValue(newPost.scheduled_date);
  }

  return ok({ post_id: postId, post: newPost });
}

/**
 * social.posts.update — Modifica un post esistente, incluso il
 * cambio di status (es. 'programmato' → 'pubblicato' dopo che
 * Demetrio l'ha postato a mano sui social).
 * @param {Object} payload - { post_id, ...campi da aggiornare }
 */
function handleSocialPostsUpdate(payload, ctx) {
  if (!ctx || !ctx.isAdmin) return fail('Accesso riservato ad admin/team principal');

  const postId = payload && payload.post_id;
  if (!postId) return fail('post_id obbligatorio');

  const sheet = getSheet(SHEETS.SOCIAL_POSTS);
  if (!sheet) return fail('Foglio SocialPosts non trovato');

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rowIndex = data.findIndex(row => row[0] === postId);
  if (rowIndex === -1) return fail('Post non trovato: ' + postId);

  const statusColIdx = headers.indexOf('status');
  const currentStatus = statusColIdx !== -1 ? data[rowIndex][statusColIdx] : '';

  const payloadToApply = { ...payload };
  if (Array.isArray(payloadToApply.platforms)) {
    payloadToApply.platforms = payloadToApply.platforms.join(',');
  }
  payloadToApply.updated_at = new Date().toISOString();

  // Se il post passa a 'pubblicato' per la prima volta, timbra published_at.
  if (payloadToApply.status === 'pubblicato' && currentStatus !== 'pubblicato') {
    payloadToApply.published_at = new Date().toISOString();
  }

  const rowToUpdate = rowIndex + 1;
  const updatedFields = [];
  for (const key in payloadToApply) {
    if (key === 'post_id' || key === 'created_at' || key === 'created_by') continue;
    const colIndex = headers.indexOf(key);
    if (colIndex !== -1) {
      const cell = sheet.getRange(rowToUpdate, colIndex + 1);
      // Stesso fix di handleSocialPostsCreate: scheduled_date è testo
      // puro "YYYY-MM-DD", va forzato a formato testo prima di scrivere
      // altrimenti Sheets lo auto-converte in Data e lo sfasa di un
      // giorno in lettura (vedi commento lì per i dettagli).
      if (key === 'scheduled_date') cell.setNumberFormat('@');
      cell.setValue(payloadToApply[key]);
      updatedFields.push(key);
    }
  }

  return ok({ post_id: postId, updated: updatedFields });
}

/**
 * social.posts.remove — Elimina un post/bozza.
 * @param {Object} payload - { post_id }
 */
function handleSocialPostsRemove(payload, ctx) {
  if (!ctx || !ctx.isAdmin) return fail('Accesso riservato ad admin/team principal');

  const postId = payload && payload.post_id;
  if (!postId) return fail('post_id obbligatorio');

  const sheet = getSheet(SHEETS.SOCIAL_POSTS);
  if (!sheet) return fail('Foglio SocialPosts non trovato');

  const data = sheet.getDataRange().getValues();
  const rowIndex = data.findIndex(row => row[0] === postId);
  if (rowIndex === -1) return fail('Post non trovato: ' + postId);

  sheet.deleteRow(rowIndex + 1);
  return ok({ post_id: postId, deleted: true });
}

// ═══════════════════════════════════════════════════════════
// SOCIAL METRICS — tracking follower manuale
// ═══════════════════════════════════════════════════════════

/**
 * social.metrics.list — Storico follower, filtro opzionale piattaforma.
 * @param {Object} payload - { platform? }
 */
function handleSocialMetricsList(payload, ctx) {
  if (!ctx || !ctx.isAdmin) return fail('Accesso riservato ad admin/team principal');

  let metrics = sheetToObjects(SHEETS.SOCIAL_METRICS);
  const platformFilter = payload && payload.platform;
  if (platformFilter) metrics = metrics.filter(m => m.platform === platformFilter);

  metrics.sort((a, b) => String(a.recorded_date).localeCompare(String(b.recorded_date)));

  return ok({ metrics, count: metrics.length });
}

/**
 * social.metrics.add — Nuova rilevazione follower (inserita a mano).
 * @param {Object} payload - { platform: 'instagram'|'facebook', followers, recorded_date? }
 */
function handleSocialMetricsAdd(payload, ctx) {
  if (!ctx || !ctx.isAdmin) return fail('Accesso riservato ad admin/team principal');

  const platform = payload && payload.platform;
  const followers = payload && Number(payload.followers);
  if (!platform) return fail('platform obbligatorio');
  if (!followers || followers < 0) return fail('followers non valido');

  const sheet = getSheet(SHEETS.SOCIAL_METRICS);
  if (!sheet) return fail('Foglio SocialMetrics non trovato — esegui setupSocialManagerTabs() prima');

  const metricId = socialNextId_(sheet, 'SMET');
  const newMetric = {
    metric_id: metricId,
    platform,
    followers,
    recorded_date: payload.recorded_date || new Date().toISOString().split('T')[0],
    recorded_by: ctx.driver_id || '',
  };

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map(h => (newMetric[h] !== undefined ? newMetric[h] : ''));
  sheet.appendRow(row);

  return ok({ metric_id: metricId, metric: newMetric });
}

// ═══════════════════════════════════════════════════════════
// GENERAZIONE TESTO — Anthropic API o Gemini API, a scelta
// ═══════════════════════════════════════════════════════════
//
// Due provider disponibili, selezionabili dal frontend (payload.provider):
//  - 'anthropic' (default) → richiede ANTHROPIC_API_KEY nelle Proprietà
//    script, chiave a pagamento da console.anthropic.com.
//  - 'gemini' → richiede GEMINI_API_KEY nelle Proprietà script, chiave
//    gratuita da aistudio.google.com/apikey (modelli Flash restano nel
//    tier gratuito). NB: un abbonamento Gemini consumer (Google AI Pro/
//    Ultra sull'account personale) NON dà accesso alla API — è un
//    sistema di billing separato, serve comunque una chiave dedicata.
//
// Chiavi mai in chiaro nel codice, mai esposte al frontend.
// Configurazione manuale: editor Apps Script → ⚙ Impostazioni progetto →
// Proprietà script → Aggiungi proprietà script.

const SOCIAL_AI_SYSTEM_PROMPT =
  'Sei il copywriter social di Virtual Sim-Driver (VSD), team italiano di ' +
  'sim racing endurance su Le Mans Ultimate, iRacing e Assetto Corsa Evo. ' +
  'Scrivi in italiano, tono energico ma non urlato, frasi brevi, coerente ' +
  'con contenuti già pubblicati dal team (motorsport reale come riferimento, ' +
  'non gaming casual). Includi 3-6 hashtag pertinenti in fondo. Massimo 80 ' +
  'parole. Rispondi SOLO col testo del post, nessuna premessa o spiegazione.';

/**
 * social.generateText — Genera un testo di post via AI.
 * @param {Object} payload - { prompt: string, provider?: 'anthropic'|'gemini' }
 */
function handleSocialGenerateText(payload, ctx) {
  if (!ctx || !ctx.isAdmin) return fail('Accesso riservato ad admin/team principal');

  const prompt = payload && String(payload.prompt || '').trim();
  if (!prompt) return fail('prompt obbligatorio');

  // Default Gemini: tier gratuito, nessun costo. Anthropic resta disponibile
  // come opzione a pagamento se in futuro si vuole confrontare la qualità.
  const provider = (payload && payload.provider === 'anthropic') ? 'anthropic' : 'gemini';

  try {
    const text = provider === 'gemini'
      ? generateWithGemini_(prompt)
      : generateWithAnthropic_(prompt);
    return ok({ text: text.trim(), provider });
  } catch (e) {
    return fail(e.message);
  }
}

function generateWithAnthropic_(prompt) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error(
      'Chiave Anthropic non configurata. Aggiungi ANTHROPIC_API_KEY nelle Proprietà ' +
      'script del progetto Apps Script (⚙ Impostazioni progetto → Proprietà script).'
    );
  }

  const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    payload: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: SOCIAL_AI_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
    muteHttpExceptions: true,
  });

  const status = response.getResponseCode();
  const body = JSON.parse(response.getContentText());

  if (status !== 200) {
    const msg = (body && body.error && body.error.message) || ('HTTP ' + status);
    throw new Error('Errore Anthropic API: ' + msg);
  }

  const text = body.content && body.content[0] && body.content[0].text;
  if (!text) throw new Error('Risposta Anthropic vuota o in formato inatteso');
  return text;
}

function generateWithGemini_(prompt) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error(
      'Chiave Gemini non configurata. Aggiungi GEMINI_API_KEY nelle Proprietà ' +
      'script del progetto Apps Script (⚙ Impostazioni progetto → Proprietà script). ' +
      'Chiave gratuita da aistudio.google.com/apikey — un abbonamento Gemini ' +
      'personale non basta, serve una API key dedicata.'
    );
  }

  const response = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-goog-api-key': apiKey,
    },
    payload: JSON.stringify({
      model: 'gemini-3.5-flash',
      system_instruction: SOCIAL_AI_SYSTEM_PROMPT,
      input: prompt,
      generation_config: {
        // 'minimal': per un post breve non serve budget di ragionamento —
        // con 'low' il modello consumava token di thinking e troncava
        // l'output vero e proprio prima della fine (risposte a frammenti).
        thinking_level: 'minimal',
        max_output_tokens: 600,
      },
    }),
    muteHttpExceptions: true,
  });

  const status = response.getResponseCode();
  const body = JSON.parse(response.getContentText());

  if (status !== 200) {
    const msg = (body && body.error && body.error.message) || ('HTTP ' + status);
    throw new Error('Errore Gemini API: ' + msg);
  }

  const steps = body.steps || [];
  const modelStep = [...steps].reverse().find(s => s.type === 'model_output');
  // Concatena TUTTI i blocchi di testo dello step, non solo il primo —
  // con più blocchi (es. testo spezzato) prendere solo find() troncava
  // silenziosamente la risposta a metà.
  const textBlocks = (modelStep && modelStep.content || []).filter(c => c.type === 'text');
  const text = textBlocks.map(b => b.text).join('');

  if (!text) {
    const statusInfo = body.status && body.status !== 'completed' ? ` (status: ${body.status})` : '';
    throw new Error('Risposta Gemini vuota o in formato inatteso' + statusInfo);
  }
  return text;
}

// ═══════════════════════════════════════════════════════════
// DISCORD — numero membri reale via invito pubblico
// ═══════════════════════════════════════════════════════════
//
// Nessun bot da creare, nessun token segreto: l'endpoint pubblico di
// Discord /invites/{code}?with_counts=true restituisce il numero
// approssimativo di membri e online per un server, a partire dal
// codice di un invito permanente — non serve autenticazione.
// Config: Script Property DISCORD_INVITE_CODE — accetta sia il solo
// codice (es. "abcDEF12") sia l'URL completo (es. "discord.gg/abcDEF12"),
// viene estratto l'ultimo segmento del path.

/**
 * social.discord.stats — Membri reali del server Discord VSD.
 * Non salva nulla: il frontend usa il risultato per precompilare il
 * campo "followers" di una rilevazione in SocialMetrics, che l'utente
 * conferma esplicitamente col bottone "Registra" come le altre.
 */
function handleSocialDiscordStats(payload, ctx) {
  if (!ctx || !ctx.isAdmin) return fail('Accesso riservato ad admin/team principal');

  const raw = PropertiesService.getScriptProperties().getProperty('DISCORD_INVITE_CODE');
  if (!raw) {
    return fail(
      'Codice invito Discord non configurato. Aggiungi DISCORD_INVITE_CODE nelle ' +
      'Proprietà script (⚙ Impostazioni progetto → Proprietà script) — va bene sia ' +
      'il solo codice (es. "abcDEF12") sia il link completo (es. "discord.gg/abcDEF12"). ' +
      'Deve essere un invito permanente, non scaduto, del server VSD.'
    );
  }

  const parts = String(raw).trim().replace(/\/+$/, '').split('/');
  const code = parts[parts.length - 1];

  try {
    const response = UrlFetchApp.fetch(
      `https://discord.com/api/v10/invites/${encodeURIComponent(code)}?with_counts=true`,
      { method: 'get', muteHttpExceptions: true }
    );
    const status = response.getResponseCode();
    const body = JSON.parse(response.getContentText());

    if (status !== 200) {
      const msg = (body && body.message) || ('HTTP ' + status);
      return fail('Errore Discord API: ' + msg + ' — verifica che l\'invito sia valido e non scaduto.');
    }

    return ok({
      guild_name: (body.guild && body.guild.name) || null,
      member_count: body.approximate_member_count != null ? body.approximate_member_count : null,
      online_count: body.approximate_presence_count != null ? body.approximate_presence_count : null,
    });
  } catch (e) {
    return fail('Errore chiamata Discord: ' + e.message);
  }
}

// ═══════════════════════════════════════════════════════════
// MEDIA GALLERY — libreria file caricati (Vercel Blob)
// ═══════════════════════════════════════════════════════════
//
// Il file vero e proprio vive su Vercel Blob (upload diretto dal
// browser, vedi api/media-upload.js e api/media-delete.js nel repo
// frontend — Apps Script non tocca mai i byte del file). Questo tab
// salva solo i metadati: URL pubblico, nome file, tipo, tag, chi e
// quando l'ha caricato. Il frontend chiama social.media.add subito
// dopo che l'upload su Blob è andato a buon fine.

/**
 * social.media.list — Tutta la libreria media, filtro opzionale per tag
 * (match case-insensitive su una sottostringa del campo tags).
 * @param {Object} payload - { tag? }
 */
function handleSocialMediaList(payload, ctx) {
  if (!ctx || !ctx.isAdmin) return fail('Accesso riservato ad admin/team principal');

  let media = sheetToObjects(SHEETS.SOCIAL_MEDIA);
  const tagFilter = payload && payload.tag && String(payload.tag).trim().toLowerCase();
  if (tagFilter) {
    media = media.filter(m => String(m.tags || '').toLowerCase().indexOf(tagFilter) !== -1);
  }

  media.sort((a, b) => String(b.uploaded_at || '').localeCompare(String(a.uploaded_at || '')));

  return ok({ media, count: media.length });
}

/**
 * social.media.add — Registra un file già caricato su Vercel Blob.
 * @param {Object} payload - { url, filename, media_type, tags? }
 */
function handleSocialMediaAdd(payload, ctx) {
  if (!ctx || !ctx.isAdmin) return fail('Accesso riservato ad admin/team principal');
  if (!payload || !String(payload.url || '').trim()) return fail('url obbligatorio');

  const sheet = getSheet(SHEETS.SOCIAL_MEDIA);
  if (!sheet) return fail('Foglio SocialMedia non trovato — esegui setupSocialManagerTabs() prima');

  const mediaId = socialNextId_(sheet, 'SMED');
  const newMedia = {
    media_id: mediaId,
    url: payload.url.trim(),
    filename: payload.filename || '',
    media_type: payload.media_type || (String(payload.url).match(/\.(mp4|mov|webm)(\?|$)/i) ? 'video' : 'image'),
    tags: Array.isArray(payload.tags) ? payload.tags.join(',') : (payload.tags || ''),
    uploaded_by: ctx.driver_id || '',
    uploaded_at: new Date().toISOString(),
  };

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map(h => (newMedia[h] !== undefined ? newMedia[h] : ''));
  sheet.appendRow(row);

  return ok({ media_id: mediaId, media: newMedia });
}

/**
 * social.media.remove — Elimina il record dalla libreria. NON cancella
 * il file su Vercel Blob (lo fa il frontend chiamando api/media-delete
 * prima di questa action, coi permessi separati del token Blob).
 * @param {Object} payload - { media_id }
 */
function handleSocialMediaRemove(payload, ctx) {
  if (!ctx || !ctx.isAdmin) return fail('Accesso riservato ad admin/team principal');

  const mediaId = payload && payload.media_id;
  if (!mediaId) return fail('media_id obbligatorio');

  const sheet = getSheet(SHEETS.SOCIAL_MEDIA);
  if (!sheet) return fail('Foglio SocialMedia non trovato');

  const data = sheet.getDataRange().getValues();
  const rowIndex = data.findIndex(row => row[0] === mediaId);
  if (rowIndex === -1) return fail('Media non trovato: ' + mediaId);

  sheet.deleteRow(rowIndex + 1);
  return ok({ media_id: mediaId, deleted: true });
}

// ═══════════════════════════════════════════════════════════
// SOCIAL PLAN DISMISSED — archiviazione manuale sezioni piano
// ═══════════════════════════════════════════════════════════

/**
 * social.plan.dismiss — Archivia una sezione del piano editoriale per
 * una gara, indipendentemente dalla finestra a tempo -10/+45 giorni
 * calcolata lato frontend. Idempotente: se race_id è già archiviato,
 * aggiorna solo dismissed_by/dismissed_at invece di duplicare la riga.
 * @param {Object} payload - { race_id }
 */
function handleSocialPlanDismiss(payload, ctx) {
  if (!ctx || !ctx.isAdmin) return fail('Accesso riservato ad admin/team principal');

  const raceId = payload && String(payload.race_id || '').trim();
  if (!raceId) return fail('race_id obbligatorio');

  const sheet = getSheet(SHEETS.SOCIAL_PLAN_DISMISSED);
  if (!sheet) return fail('Foglio SocialPlanDismissed non trovato — esegui setupSocialManagerTabs() prima');

  const data = sheet.getDataRange().getValues();
  const rowIndex = data.findIndex((row, i) => i > 0 && row[0] === raceId);
  const now = new Date().toISOString();
  const dismissedBy = ctx.driver_id || '';

  if (rowIndex !== -1) {
    sheet.getRange(rowIndex + 1, 2, 1, 2).setValues([[dismissedBy, now]]);
    return ok({ race_id: raceId, dismissed_by: dismissedBy, dismissed_at: now, already: true });
  }

  sheet.appendRow([raceId, dismissedBy, now]);
  return ok({ race_id: raceId, dismissed_by: dismissedBy, dismissed_at: now, already: false });
}

/**
 * social.plan.undismiss — Rimette in vista una sezione archiviata per
 * errore. Rimuove semplicemente la riga da SocialPlanDismissed; se la
 * gara è ancora nella finestra -10/+45 giorni, il piano la rimostra
 * al prossimo refresh.
 * @param {Object} payload - { race_id }
 */
function handleSocialPlanUndismiss(payload, ctx) {
  if (!ctx || !ctx.isAdmin) return fail('Accesso riservato ad admin/team principal');

  const raceId = payload && String(payload.race_id || '').trim();
  if (!raceId) return fail('race_id obbligatorio');

  const sheet = getSheet(SHEETS.SOCIAL_PLAN_DISMISSED);
  if (!sheet) return fail('Foglio SocialPlanDismissed non trovato');

  const data = sheet.getDataRange().getValues();
  const rowIndex = data.findIndex((row, i) => i > 0 && row[0] === raceId);
  if (rowIndex === -1) return fail('race_id non risulta archiviato: ' + raceId);

  sheet.deleteRow(rowIndex + 1);
  return ok({ race_id: raceId, undismissed: true });
}

/**
 * social.plan.dismissed.list — Tutti i race_id attualmente archiviati,
 * per far filtrare al frontend il piano editoriale lato client.
 */
function handleSocialPlanDismissedList(payload, ctx) {
  if (!ctx || !ctx.isAdmin) return fail('Accesso riservato ad admin/team principal');

  const dismissed = sheetToObjects(SHEETS.SOCIAL_PLAN_DISMISSED);
  return ok({ dismissed, count: dismissed.length });
}

// ═══════════════════════════════════════════════════════════
// DIGEST PIANO EDITORIALE — promemoria settimanale su Discord
// ═══════════════════════════════════════════════════════════
// Colma un buco reale, emerso dall'audit del 12 set 2026 (apertura
// gruppo FB, Demetrio unico operatore social): il piano editoriale
// (SocialManager.jsx, useEditorialTimeline) sa perfettamente cosa è
// "in ritardo" o "da fare questa settimana", ma quel calcolo vive solo
// nel browser — se non apri la tab Piano editoriale, non lo sai.
// Un promemoria che arriva DA SOLO su Discord ogni lunedì chiude il
// gap, invece di dover ricordarsi di controllare.
//
// Replica la logica di pillars/bucket di useEditorialPlan e
// useEditorialTimeline lato server — non è importabile da lì (mondi
// diversi, frontend vs Apps Script), quindi è tenuta volutamente più
// semplice: solo "in ritardo" + "questa settimana" (le due fasce che
// richiedono azione a breve; "prossima settimana"/"più avanti" restano
// da controllare a mano nella tab) più i pilastri evergreen scaduti.
//
// Registrazione trigger: setupTriggers() in Triggers.js (lunedì 8:00).

const SOCIAL_DIGEST_PILLARS = [
  { id: 'anteprima', label: 'Anteprima gara', icon: '📣', offsetDays: -7 },
  { id: 'live', label: 'Live/race day', icon: '🔴', offsetDays: 0 },
  { id: 'risultati', label: 'Risultati', icon: '🏆', offsetDays: 1 },
  { id: 'highlight', label: 'Highlight/Reel', icon: '🎬', offsetDays: 3 },
];
const SOCIAL_DIGEST_CLOSING_PILLAR = { id: 'chiusura_campionato', label: 'Chiusura campionato', icon: '🏁', offsetDays: 4 };
const SOCIAL_DIGEST_EVERGREEN_PILLARS = [
  { id: 'spotlight', label: 'Pilot spotlight', icon: '🎙️', cadenceDays: 14 },
  { id: 'dietro_quinte', label: 'Dietro le quinte', icon: '🔧', cadenceDays: 14 },
  { id: 'milestone', label: 'News/milestone squadra', icon: '📰', cadenceDays: 14 },
  { id: 'community', label: 'Community engagement', icon: '💬', cadenceDays: 14 },
];

function addDaysSocialDigest_(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/**
 * Promemoria settimanale del piano editoriale su Discord (canale
 * gestione-gare). Fault-tolerant: try/catch, non lancia mai — un
 * trigger fallito qui non deve rompere altro.
 * Dropdown function → runSocialPlanDigest → ▶ Esegui (test manuale),
 * oppure lasciare al trigger settimanale (Triggers.js).
 */
function runSocialPlanDigest() {
  try {
    const races = sheetToObjects(SHEETS.RACES);
    const posts = sheetToObjects(SHEETS.SOCIAL_POSTS);
    const dismissedRows = sheetToObjects(SHEETS.SOCIAL_PLAN_DISMISSED);
    const dismissed = new Set(dismissedRows.map(d => d.race_id));

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const windowStart = addDaysSocialDigest_(now, -10);
    const windowEnd = addDaysSocialDigest_(now, 45);

    // Ultima gara di ogni campionato — stessa logica di useEditorialPlan
    // (SocialManager.jsx): calcolata su TUTTE le gare, non solo quelle
    // nella finestra, altrimenti una chiusura oltre i 45gg non verrebbe
    // mai riconosciuta come tale quando entra a sua volta in finestra.
    const lastRaceByChampionship = {};
    races.forEach(r => {
      if (!r.championship_id || !r.date) return;
      const d = new Date(r.date);
      if (isNaN(d.getTime())) return;
      const current = lastRaceByChampionship[r.championship_id];
      if (!current || d.getTime() > new Date(current.date).getTime()) {
        lastRaceByChampionship[r.championship_id] = r;
      }
    });

    const dow = now.getDay(); // 0=Dom..6=Sab
    const daysToSunday = (7 - dow) % 7;
    const endOfThisWeek = addDaysSocialDigest_(now, daysToSunday);
    endOfThisWeek.setHours(23, 59, 59, 999);

    const late = [];
    const thisWeek = [];

    races
      .filter(r => {
        if (dismissed.has(r.race_id)) return false;
        const d = r.date ? new Date(r.date) : null;
        return d && !isNaN(d.getTime()) && d >= windowStart && d <= windowEnd;
      })
      .forEach(race => {
        const raceDate = new Date(race.date);
        const isCloser = race.championship_id
          && lastRaceByChampionship[race.championship_id]
          && lastRaceByChampionship[race.championship_id].race_id === race.race_id;
        const pillarDefs = isCloser ? SOCIAL_DIGEST_PILLARS.concat([SOCIAL_DIGEST_CLOSING_PILLAR]) : SOCIAL_DIGEST_PILLARS;

        pillarDefs.forEach(pillar => {
          const match = posts.find(p => p.race_id === race.race_id && p.pillar === pillar.id);
          if (match && match.status === 'pubblicato') return; // fatto, non serve promemoria

          const pillarDate = addDaysSocialDigest_(raceDate, pillar.offsetDays);
          pillarDate.setHours(0, 0, 0, 0);
          const daysFromToday = Math.round((pillarDate.getTime() - now.getTime()) / 86400000);
          if (daysFromToday < -3) return; // stale, si nasconde anche in UI (useEditorialTimeline)

          const label = pillar.icon + ' ' + pillar.label + ' — ' + (race.race_name || race.race_id);
          if (daysFromToday < 0) late.push(label);
          else if (pillarDate <= endOfThisWeek) thisWeek.push(label);
        });
      });

    // Pilastri evergreen scaduti — stessa logica di useEvergreenPlan
    // (SocialManager.jsx): ultimo post per categoria (senza race_id),
    // in ritardo se sono passati >= cadenceDays giorni (o mai creato).
    const evergreenDue = [];
    SOCIAL_DIGEST_EVERGREEN_PILLARS.forEach(pillar => {
      const matches = posts.filter(p => p.pillar === pillar.id && !p.race_id);
      const sorted = matches.slice().sort((a, b) => {
        const da = String(a.scheduled_date || a.created_at || '');
        const db = String(b.scheduled_date || b.created_at || '');
        return db.localeCompare(da);
      });
      const last = sorted[0] || null;
      const lastDateStr = last ? (last.scheduled_date || last.created_at) : null;
      const lastDate = lastDateStr ? new Date(lastDateStr) : null;
      const daysSince = lastDate && !isNaN(lastDate.getTime())
        ? Math.floor((now.getTime() - lastDate.getTime()) / 86400000)
        : null;
      const isDue = daysSince === null || daysSince >= pillar.cadenceDays;
      if (isDue) evergreenDue.push(pillar.icon + ' ' + pillar.label);
    });

    if (late.length === 0 && thisWeek.length === 0 && evergreenDue.length === 0) {
      Logger.log('Digest piano editoriale: nulla da segnalare questa settimana.');
      return { ok: true, skipped: true };
    }

    const fields = [];
    if (late.length > 0) fields.push({ name: '🔴 In ritardo (' + late.length + ')', value: late.join('\n').slice(0, 1024) });
    if (thisWeek.length > 0) fields.push({ name: '📅 Questa settimana (' + thisWeek.length + ')', value: thisWeek.join('\n').slice(0, 1024) });
    if (evergreenDue.length > 0) fields.push({ name: '♻️ Evergreen da fare (' + evergreenDue.length + ')', value: evergreenDue.join('\n').slice(0, 1024) });

    const payload = {
      embeds: [{
        author: { name: 'VSD Paddock' },
        title: '📣 Piano editoriale — promemoria settimanale',
        color: VSD_COLORS.cyan,
        fields: fields,
        timestamp: new Date().toISOString(),
        footer: { text: 'Apri Social Manager → Piano editoriale per i dettagli' },
        url: PADDOCK_URL + '/admin/social-manager',
      }],
    };

    return postToDiscordWebhook_(payload, 'DISCORD_WEBHOOK_GESTIONE_GARE_URL');
  } catch (e) {
    Logger.log('⚠️  runSocialPlanDigest error: ' + e.message);
    return { ok: false, error: e.message };
  }
}
