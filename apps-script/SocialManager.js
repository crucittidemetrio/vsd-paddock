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
      sheet.getRange(rowToUpdate, colIndex + 1).setValue(payloadToApply[key]);
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
