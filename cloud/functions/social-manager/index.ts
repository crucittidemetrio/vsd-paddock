// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — dispatcher consolidato "misc" (slug storico
// social-manager, ora ANCHE dominio #261: Race Reports + Reazioni +
// aggregatori Showcase/landing.data — porting fedele di
// apps-script/SocialManager.js + Reports.js + Showcase.js +
// LandingData.js + seedReports.js)
// ═══════════════════════════════════════════════════════════
// DEVIAZIONE ARCHITETTURALE — decisa con l'utente il 17 set 2026: il
// progetto è fermo a 100/100 Edge Function sul piano free (nessun
// delete_edge_function via API MCP) e l'utente ha confermato di voler
// continuare a RIUSARE/ACCORPARE più domini nello stesso slug invece
// di alzare piano o liberare uno slug già in uso da un altro dominio.
// Questa function, deployata sotto lo slug `endurance-auditions-get`
// (a sua volta già un riuso del mirror legacy di Endurance/#259),
// smette quindi di essere "solo Social Manager" e diventa il
// dispatcher generalista per ogni nuovo dominio senza slot libero —
// non più un dispatcher per-dominio pulito, ma l'unica strada per
// restare gratis. Precedente per #262-265: continuare ad accorpare
// qui, o in un futuro slug altrettanto riusato, salvo diversa
// indicazione dell'utente.
//
// A differenza del gate unico "solo admin" precedente (valido SOLO
// per le azioni Social Manager), qui l'auth è risolta UNA VOLTA in
// testa a Deno.serve ma resa OPZIONALE — Showcase è pubblico nel
// sorgente (nessuna ctx richiesta), Race Reports/Reazioni/landing
// richiedono un pilota autenticato qualsiasi, Social Manager resta
// SOLO admin. Ogni gruppo di azioni applica il proprio gate via
// requireAdmin()/requireAuth()/requireStaffOrAdmin() dopo aver
// individuato l'azione, non prima.
//
// Azioni Social Manager (SOLO admin) — invariate:
//   posts.list / posts.create / posts.update / posts.remove
//   metrics.list / metrics.add
//   media.list / media.add / media.remove
//   plan.dismissedList / plan.dismiss / plan.undismiss
//   generateText / discord.stats / plan.runDigest
//
// Azioni Race Reports/Reazioni/aggregatori (#261) — NUOVE:
//   reports.list / reports.recent           → auth: qualsiasi pilota
//   reports.update                          → NUOVO, non nel sorgente:
//     il sorgente compila incident_notes/damage_report/strategy_notes/
//     staff_rating/staff_notes SOLO a mano nel Google Sheet — non
//     praticabile per un team abbonato al SaaS senza accesso a quel
//     foglio. Stesso principio deviazione già usato per
//     championships-add/update (#252). Gate: staff/admin (staff_rating/
//     staff_notes sono campi staff-only nel modello sorgente).
//   reports.seedForRace                     → NUOVO: equivalente
//     invocabile di seedRaceReportsForRace_ (sorgente lo esegue SEMPRE
//     automaticamente dopo un import risultati, non come action
//     separata) — qui esposto anche come azione a sé per poter
//     backfillare gare importate prima di questo porting. Gate:
//     staff/admin. Il trigger automatico post-import resta comunque
//     fedele: vedi race-results-import/index.ts.
//   reportReactions.list / reportReactions.toggle → auth: qualsiasi pilota
//   landing.data                            → auth: qualsiasi pilota
//   laps.raceLaps                           → auth: qualsiasi pilota.
//     Portato QUI (anticipato da #262) perché landing.data non è
//     fedelmente costruibile senza — race_laps deriva 1:1 da
//     race_results/races/cars già portati, nessuna nuova tabella.
//     #262 resta quindi scoped a syncFromGarage61 + Best Lap
//     Submissions, non più a laps.raceLaps.
//   showcase.summary / showcase.mediaKit    → PUBBLICO (nessuna auth),
//     stesso pattern team_slug + client service role già usato per
//     Clash of Classes/ChampionshipInterest quando il chiamante è
//     anonimo.
//
// Azioni Best Lap Submissions + Garage61 (#262) — NUOVE, stesso slug:
//   lapSubmissions.submit/listMine        → auth: qualsiasi pilota
//   lapSubmissions.listPending/approve/reject/remove → SOLO admin
//     (fedele a ctx.isAdmin nel sorgente, non isStaff — la validazione
//     foto/video resta riservata). approve riusa addBestLapWithRecordCheck
//     (stessa logica di laps.add/best-laps-add, incluso il controllo
//     nuovo record + notifica Discord).
//   laps.syncFromGarage61                 → staff-o-admin. Porting
//     fedele di garage61SyncLaps_ (apps-script/garage61.js): fetch
//     incrementale via after=teams.garage61_last_sync_at, dedup su
//     garage61_lap_id, matching driver via iracing_id, auto-draft cars
//     Garage61 senza mapping nel catalogo globale `cars`, notifica
//     Discord per ogni nuovo record di squadra (max 1 per pista per
//     sync). GARAGE61_TOKEN resta un Edge Function secret GLOBALE
//     (deviazione documentata nello schema 029_best_lap_submissions.sql:
//     single-tenant reale oggi, da rivedere con un secondo team).
//     Il trigger a tempo ogni 4h del sorgente NON ha equivalente qui
//     (richiederebbe uno scheduler esterno/pg_cron, fuori scope per un
//     porting di endpoint esistenti — stesso principio già annotato per
//     skill-index-snapshot/plan.runDigest): l'azione è invocabile solo
//     on-demand (bottone admin), esattamente come già accade lato
//     Apps Script via /admin/sync-garage61.
//
// Azione Pit Wall Realtime (#263) — NUOVA, stesso slug:
//   pitwall.broadcastLive                 → staff-o-admin (stesso
//     gate di pitwall.logSession: chi gestisce il bridge scrive per
//     tutta la griglia). Inoltra payload.data così com'è (schema
//     telemetria non fissato qui, resta responsabilità bridge/
//     frontend, #264) su un canale Supabase Realtime Broadcast
//     privato pitwall:{team_id} via REST (/realtime/v1/api/broadcast,
//     SERVICE_ROLE_KEY), autorizzato in lettura dalla RLS di
//     030_pitwall_realtime.sql. Nessuna persistenza — i frame restano
//     effimeri, fedele al bridge originale. Sostituisce il WebSocket
//     `ws://localhost:8090/ws/` del bridge C#, limitato al solo PC
//     locale — il cambio lato bridge/frontend che consuma davvero
//     questo canale resta scope di #264 (rewire frontend reale).
//
// Azione Roster Admin (NUOVA, 19/09/2026) — stesso slug:
//   roster.adminUpdate                    → staff-o-admin scrive
//     status/removed_at/race_number di un altro driver del team;
//     `role` SOLO admin. Nessun equivalente in apps-script/Roster.js
//     (là si editava a mano il Google Sheet). Chiude il gap per cui,
//     dopo il cutover #329, il Roster leggeva da Supabase ma nulla vi
//     scriveva status/role — vedi commento inline all'azione per
//     dettagli.
//   roster.deletionCandidates / roster.adminDelete → SOLO admin.
//     Hard-delete di ex piloti (removed_at valorizzato) che non hanno
//     MAI generato dati reali in nessuna delle ~20 tabelle collegate a
//     drivers.id (best_laps, race_results, race_reports, RSVP, Clash,
//     Endurance, fuel, lap_data, incident*, skill_index_history...).
//     Richiesto da Demetrio per ripulire piloti "fantasma" mai attivi.
//     adminDelete ri-verifica sempre lato server, mai fidandosi della
//     candidate list letta in precedenza dal client.
//   roster.availableSlots / roster.adminCreate (NUOVE, 19/09/2026) →
//     staff-o-admin. Gap: dopo aver chiuso update/delete non esisteva
//     ALCUN modo di aggiungere un pilota nuovo dal sito — il trigger
//     link_driver_on_signup (005_link_discord_signup.sql) collega
//     apposta un login Discord solo a un driver GIÀ esistente, non ne
//     crea mai uno. availableSlots calcola il prossimo driver_code
//     libero (riusando i buchi lasciati da un hard-delete, es. VSD001/
//     VSD025) e i race_number già assegnati nel team. adminCreate crea
//     la riga: driver_code auto-assegnato se omesso, race_number
//     validato contro duplicati, role forzato a 'driver' se il
//     chiamante non è admin (uno staff non può auto-promuoversi
//     creando un admin fittizio).
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const VSD_COLORS: Record<string, number> = { cyan: 0x00d9ff, green: 0x4ade80, orange: 0xfbbf24, red: 0xf87171 };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PADDOCK_URL = 'https://vsd-paddock.vercel.app';
const REPORT_REACTION_EMOJI = ['🔥', '👏', '😂', '💀', '😬'];

const SOCIAL_AI_SYSTEM_PROMPT =
  'Sei il copywriter social di Virtual Sim-Driver (VSD), team italiano di ' +
  'sim racing endurance su Le Mans Ultimate, iRacing e Assetto Corsa Evo. ' +
  'Scrivi in italiano, tono energico ma non urlato, frasi brevi, coerente ' +
  'con contenuti già pubblicati dal team (motorsport reale come riferimento, ' +
  'non gaming casual). Includi 3-6 hashtag pertinenti in fondo. Massimo 80 ' +
  'parole. Rispondi SOLO col testo del post, nessuna premessa o spiegazione.';

const SOCIAL_DIGEST_PILLARS = [
  { id: 'anteprima', label: 'Anteprima gara', icon: '📣', offsetDays: -7 },
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

async function postToDiscordWebhook(payload: unknown, envName: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const url = Deno.env.get(envName);
    if (!url) return { ok: false, error: 'webhook_not_configured' };
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res.ok) return { ok: true };
    return { ok: false, error: 'http_' + res.status };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function generateWithAnthropic(prompt: string): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('Chiave Anthropic non configurata (ANTHROPIC_API_KEY secret mancante).');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: SOCIAL_AI_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('Errore Anthropic API: ' + (body?.error?.message || ('HTTP ' + res.status)));
  const text = body?.content?.[0]?.text;
  if (!text) throw new Error('Risposta Anthropic vuota o in formato inatteso');
  return text;
}

async function generateWithGemini(prompt: string): Promise<string> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('Chiave Gemini non configurata (GEMINI_API_KEY secret mancante).');

  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      model: 'gemini-3.5-flash',
      system_instruction: SOCIAL_AI_SYSTEM_PROMPT,
      input: prompt,
      generation_config: { thinking_level: 'minimal', max_output_tokens: 600 },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('Errore Gemini API: ' + (body?.error?.message || ('HTTP ' + res.status)));

  const steps = body.steps || [];
  const modelStep = [...steps].reverse().find((s: any) => s.type === 'model_output');
  const textBlocks = (modelStep?.content || []).filter((c: any) => c.type === 'text');
  const text = textBlocks.map((b: any) => b.text).join('');
  if (!text) {
    const statusInfo = body.status && body.status !== 'completed' ? ` (status: ${body.status})` : '';
    throw new Error('Risposta Gemini vuota o in formato inatteso' + statusInfo);
  }
  return text;
}

// ─── Helper condiviso landing.data / laps.raceLaps ───
// Porting fedele di handleLapsRaceLaps (BestLaps.js): giri derivati da
// RaceResults per piloti VSD, nessuna tabella dedicata — calcolato a
// runtime, stesso principio già usato per academy.ranking/records.team.
function buildCarNameMap(cars: any[]): Record<string, string> {
  const map: Record<string, string> = {};
  cars.forEach((c: any) => {
    [c.full_name, c.car_name].forEach((n: any) => {
      if (n) {
        const k = String(n).toLowerCase().trim();
        if (!map[k]) map[k] = c.car_id;
      }
    });
  });
  return map;
}

async function computeRaceLaps(supabase: any, teamId: string) {
  const { data: results } = await supabase.from('race_results').select('*').eq('team_id', teamId);
  const { data: races } = await supabase.from('races').select('race_id, race_name').eq('team_id', teamId);
  const { data: cars } = await supabase.from('cars').select('car_id, car_name, full_name');

  const raceNameMap: Record<string, string> = {};
  (races || []).forEach((r: any) => { if (r.race_id) raceNameMap[r.race_id] = r.race_name; });
  const carMatchMap = buildCarNameMap(cars || []);

  const laps = (results || [])
    .filter((r: any) => r.is_vsd_driver === true && Number(r.best_lap_ms) > 0)
    .map((r: any) => {
      const lapMs = Number(r.best_lap_ms);
      const externalName = r.car_external_name ? String(r.car_external_name).trim() : '';
      const carId = externalName ? (carMatchMap[externalName.toLowerCase()] || '') : '';
      return {
        lap_id: `RACELAP-${r.result_id}`,
        driver_id: r.driver_id,
        sim: r.sim,
        track_id: r.track_id,
        car_id: carId,
        car_external_name: externalName,
        lap_time_ms: lapMs,
        lap_time_display: r.best_lap_display || '',
        set_date: r.set_date,
        conditions: 'race',
        session_type: r.session_type || 'race',
        setup_shared: '',
        setup_link: '',
        replay_url: '',
        verified_by: 'auto',
        verified_at: r.imported_at || '',
        notes: '',
        race_id: r.race_id,
        race_name: raceNameMap[r.race_id] || '',
        source: 'race',
      };
    })
    .sort((a: any, b: any) => a.lap_time_ms - b.lap_time_ms);

  return { laps, count: laps.length };
}

// ─── Helper condivisi lapSubmissions.* / laps.syncFromGarage61 (#262) ───

function normalizeLapTimeInput(raw: unknown): string {
  let value = String(raw ?? '').trim().replace(',', '.');
  if (/^\d{1,2}\.\d{1,3}$/.test(value)) value = '0:' + value;
  return value;
}

function parseLapTimeToMs(display: unknown): number | null {
  const value = normalizeLapTimeInput(display);
  const match = value.match(/^(\d+):(\d{1,2})\.(\d{1,3})$/);
  if (!match) return null;
  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  if (seconds >= 60) return null;
  const msPart = match[3].padEnd(3, '0').slice(0, 3);
  const ms = parseInt(msPart, 10);
  return minutes * 60000 + seconds * 1000 + ms;
}

function msToLapDisplay(ms: number | null): string {
  if (ms == null || isNaN(ms) || ms <= 0) return '';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function isCurrentTesserato(d: any): boolean {
  if (!d) return false;
  if (d.is_system_account) return false;
  if (d.removed_at) return false;
  return String(d.status).toLowerCase() === 'active';
}

// Porting fedele di handleLapsAdd (record-check + insert), riusato sia
// da lapSubmissions.approve sia — concettualmente — da best-laps-add
// (dove la stessa logica è duplicata per convenzione di repo, essendo
// uno slug Edge Function separato: stesso principio già usato per
// resolveDriver duplicato nelle fuel-* in #257).
async function addBestLapWithRecordCheck(
  supabase: any,
  teamId: string,
  verifiedBy: string,
  lap: { driver_id: string; sim: string; track_id: string; car_id: string; lap_time_ms: number; lap_time_display: string; set_date?: string | null; conditions?: string; air_temp_c?: number | null; track_temp_c?: number | null; session_type?: string; notes?: string | null },
): Promise<{ lapRow: any; isNewRecord: boolean; previousBestDisplay: string | null; driverName: string; trackName: string }> {
  const [{ data: existingLaps }, { data: driversRows }, { data: driverRow }, { data: trackRow }] = await Promise.all([
    supabase.from('best_laps').select('driver_id, lap_time_ms, lap_time_display').eq('team_id', teamId).eq('sim', lap.sim).eq('track_id', lap.track_id),
    supabase.from('drivers').select('id, is_system_account, removed_at, status').eq('team_id', teamId),
    supabase.from('drivers').select('display_name').eq('id', lap.driver_id).maybeSingle(),
    supabase.from('tracks').select('track_name').eq('track_id', lap.track_id).maybeSingle(),
  ]);
  const driverById = new Map((driversRows || []).map((d: any) => [d.id, d]));
  let previousBestMs: number | null = null;
  let previousBestDisplay: string | null = null;
  (existingLaps || []).forEach((l: any) => {
    const ms = Number(l.lap_time_ms);
    if (!ms || ms <= 0) return;
    if (!isCurrentTesserato(driverById.get(l.driver_id))) return;
    if (previousBestMs === null || ms < previousBestMs) {
      previousBestMs = ms;
      previousBestDisplay = l.lap_time_display || msToLapDisplay(ms);
    }
  });
  const isNewRecord = isCurrentTesserato(driverById.get(lap.driver_id)) && (previousBestMs === null || lap.lap_time_ms < previousBestMs);

  const now = new Date().toISOString();
  const { data: lapRow, error } = await supabase.from('best_laps').insert({
    team_id: teamId,
    driver_id: lap.driver_id,
    sim: lap.sim,
    track_id: lap.track_id,
    car_id: lap.car_id,
    lap_time_ms: lap.lap_time_ms,
    lap_time_display: lap.lap_time_display,
    set_date: lap.set_date || now.split('T')[0],
    conditions: lap.conditions || 'dry',
    air_temp_c: lap.air_temp_c ?? null,
    track_temp_c: lap.track_temp_c ?? null,
    session_type: lap.session_type || 'practice',
    verified_by: verifiedBy,
    verified_at: now,
    notes: lap.notes || null,
  }).select().maybeSingle();
  if (error) throw new Error(error.message);

  return {
    lapRow, isNewRecord, previousBestDisplay,
    driverName: driverRow?.display_name || lap.driver_id,
    trackName: trackRow?.track_name || lap.track_id,
  };
}

async function notifyNewTeamRecordEmbed(driverName: string, trackName: string, sim: string, lapTimeDisplay: string, previousDisplay: string | null) {
  const embed = {
    author: { name: 'VSD Paddock' },
    title: '🏆 Nuovo record di squadra!',
    description: `**${driverName}** — ${trackName} (${sim})\n⏱️ **${lapTimeDisplay}**` +
      (previousDisplay ? ` _(precedente: ${previousDisplay})_` : ' _(primo tempo registrato su questa pista)_'),
    color: 0xa855f7,
    timestamp: new Date().toISOString(),
    footer: { text: 'Muro dei Record' },
    url: PADDOCK_URL + '/records',
  };
  await postToDiscordWebhook({ embeds: [embed] }, 'DISCORD_WEBHOOK_URL');
}

// ─── Garage61 API (#262) ───
const GARAGE61_BASE_URL = 'https://garage61.net/api/v1';

async function garage61Get(path: string): Promise<any> {
  const token = Deno.env.get('GARAGE61_TOKEN');
  if (!token) throw new Error('GARAGE61_TOKEN non configurato (Edge Function secret globale mancante)');
  const res = await fetch(GARAGE61_BASE_URL + path, {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('Garage61 API error: HTTP ' + res.status);
  return body;
}

function garage61MapSessionType(n: unknown): string {
  switch (Number(n)) {
    case 1: return 'qualifying';
    case 2: return 'race';
    case 3: return 'time_trial';
    default: return 'practice';
  }
}

function garage61FormatTime(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const mil = ms % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(mil).padStart(3, '0')}`;
}

function garage61Slugify(name: string): string {
  return String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

// ─── Pit Wall Realtime relay (#263) ───
// Porting del "canale live" del VSD Pitwall Bridge (WebSocket
// localhost, mai raggiungibile da un viewer remoto) su un canale
// Supabase Realtime Broadcast privato pitwall:{team_id}, autorizzato
// dalla RLS in 030_pitwall_realtime.sql. Nessuna persistenza: i frame
// live restano effimeri, fedele al comportamento del bridge reale
// (che non scrive nulla su disco per il live, solo per lo snapshot di
// fine sessione già in pitwall_sessions).
async function broadcastRealtime(topic: string, event: string, payload: unknown): Promise<void> {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const url = Deno.env.get('SUPABASE_URL')! + '/realtime/v1/api/broadcast';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: serviceKey, Authorization: 'Bearer ' + serviceKey },
    body: JSON.stringify({ messages: [{ topic, event, payload, private: true }] }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error('Realtime broadcast error: HTTP ' + res.status + (body ? ' — ' + body.slice(0, 200) : ''));
  }
}

// ─── Roster Admin: ricerca contributi per l'hard-delete piloti (NUOVO, 19/09/2026) ───
// "Contributo" = qualunque riga driver-specifica che rappresenterebbe
// una perdita di dati storici reali (partecipazioni, tempi, segnalazioni,
// RSVP, ecc.) se il driver venisse cancellato — NON le colonne "attore"
// puramente amministrative (verified_by/created_by/updated_by/...), che
// restano SET NULL senza perdita di informazione utile all'utente.
// Import fedele della foreign-key map reale (information_schema, verificata
// il 19/09/2026): alcune di queste colonne sono ON DELETE CASCADE (la riga
// sparirebbe con lui, es. best_laps), altre SET NULL (la riga
// resterebbe ma orfana, es. race_results) — in ENTRAMBI i casi vogliamo
// bloccare la cancellazione se il driver ha mai generato quella riga.
const ROSTER_CONTRIBUTION_TABLES: Array<{ table: string; column: string }> = [
  { table: 'best_laps', column: 'driver_id' },
  { table: 'best_lap_submissions', column: 'driver_id' },
  { table: 'race_results', column: 'driver_id' },
  { table: 'race_reports', column: 'driver_id' },
  { table: 'race_rsvps', column: 'driver_id' },
  { table: 'race_crews', column: 'driver_id' },
  { table: 'clash_participants', column: 'driver_id' },
  { table: 'clash_results', column: 'driver_id' },
  { table: 'championship_interest', column: 'driver_id' },
  { table: 'endurance_participants', column: 'driver_id' },
  { table: 'endurance_stints', column: 'driver_id' },
  { table: 'fuel_log', column: 'driver_id' },
  { table: 'fuel_live_pings', column: 'driver_id' },
  { table: 'incident_reports', column: 'reporter_driver_id' },
  { table: 'incident_reports', column: 'against_driver_id' },
  { table: 'incident_resolutions', column: 'penalized_driver_id' },
  { table: 'lap_data', column: 'driver_id' },
  { table: 'pitwall_sessions', column: 'driver_id' },
  { table: 'report_reactions', column: 'driver_id' },
  { table: 'session_rsvps', column: 'driver_id' },
  { table: 'skill_index_history', column: 'driver_id' },
];

async function findDriverIdsWithContributions(serviceClient: any, driverIds: string[]): Promise<Map<string, string[]>> {
  const found = new Map<string, string[]>();
  if (driverIds.length === 0) return found;
  await Promise.all(ROSTER_CONTRIBUTION_TABLES.map(async ({ table, column }) => {
    const { data } = await serviceClient.from(table).select(column).in(column, driverIds);
    (data || []).forEach((row: any) => {
      const id = row[column];
      if (!id) return;
      const list = found.get(id) || [];
      if (!list.includes(table)) list.push(table);
      found.set(id, list);
    });
  }));
  return found;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    let supabase: any = null;
    let me: any = null;

    if (authHeader) {
      supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: meRow } = await supabase
          .from('drivers')
          .select('id, team_id, role, display_name, driver_code')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        me = meRow || null;
      }
    }

    const payload = await req.json().catch(() => ({}));
    const action = String(payload?.action || '').trim();
    const teamId = me ? me.team_id : null;

    function requireAdmin(): Response | null {
      if (!me || me.role !== 'admin') return json({ ok: false, error: 'Accesso riservato ad admin/team principal' }, me ? 403 : 401);
      return null;
    }
    function requireAuth(): Response | null {
      if (!me) return json({ ok: false, error: 'Auth richiesto' }, 401);
      return null;
    }
    function requireStaffOrAdmin(): Response | null {
      if (!me || (me.role !== 'admin' && me.role !== 'staff')) return json({ ok: false, error: 'Operazione riservata a staff/admin' }, me ? 403 : 401);
      return null;
    }

    // ═══════════════════════════════════════════════════════
    // ROSTER ADMIN (NUOVA, 19/09/2026) — gap chiuso su segnalazione di
    // Demetrio: nessuna funzione scriveva status/role/removed_at di un
    // driver su Supabase. Dopo il cutover #329 il Roster pubblico legge
    // da Supabase, ma l'unico modo per "cambiare stato" a un pilota era
    // modificare il vecchio Google Sheet — non più sincronizzato in
    // tempo reale col sito. Aggiunta qui (non come funzione standalone)
    // per lo stesso motivo di deviazione architetturale spiegato in
    // cima al file: piano free fermo a 100/100 Edge Function.
    //
    // role modificabile SOLO da admin (uno staff non può promuoversi/
    // promuovere altri a staff/admin né retrocedere un admin).
    // status/removed_at/race_number: staff o admin.
    // driver_id nel payload è il driver_code (VSD00X), mai l'uuid
    // interno — stesso contratto uniforme del resto del progetto.
    // L'account di sistema (is_system_account) non è mai modificabile.
    // ═══════════════════════════════════════════════════════

    if (action === 'roster.adminUpdate') {
      const denied = requireStaffOrAdmin(); if (denied) return denied;

      const targetDriverCode = payload?.driver_id ? String(payload.driver_id).trim() : '';
      if (!targetDriverCode) return json({ ok: false, error: 'driver_id (driver_code) obbligatorio' }, 400);

      const rosterServiceClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

      const { data: target, error: targetErr } = await rosterServiceClient
        .from('drivers')
        .select('id, is_system_account')
        .eq('team_id', teamId)
        .eq('driver_code', targetDriverCode)
        .maybeSingle();
      if (targetErr) return json({ ok: false, error: targetErr.message }, 400);
      if (!target) return json({ ok: false, error: 'Driver non trovato nel team: ' + targetDriverCode }, 404);
      if (target.is_system_account) return json({ ok: false, error: 'Account di sistema non modificabile' }, 400);

      const VALID_STATUS = ['active', 'trial', 'inactive'];
      const VALID_ROLE = ['driver', 'staff', 'admin'];
      const updates: Record<string, unknown> = {};

      if ('status' in payload) {
        const status = String(payload.status);
        if (!VALID_STATUS.includes(status)) {
          return json({ ok: false, error: 'status non valido. Ammessi: ' + VALID_STATUS.join(', ') }, 400);
        }
        updates.status = status;
      }

      if ('role' in payload) {
        if (me.role !== 'admin') return json({ ok: false, error: 'Solo un admin può modificare il ruolo' }, 403);
        const role = String(payload.role);
        if (!VALID_ROLE.includes(role)) {
          return json({ ok: false, error: 'role non valido. Ammessi: ' + VALID_ROLE.join(', ') }, 400);
        }
        updates.role = role;
      }

      if ('removed_at' in payload) {
        const value = payload.removed_at;
        if (value === null) {
          updates.removed_at = null;
        } else {
          const d = new Date(String(value));
          if (isNaN(d.getTime())) return json({ ok: false, error: 'removed_at non valido (attesa data ISO o null)' }, 400);
          updates.removed_at = d.toISOString();
        }
      }

      if ('race_number' in payload) {
        const value = payload.race_number;
        updates.race_number = value === null || value === '' ? null : Number(value);
      }

      if (Object.keys(updates).length === 0) {
        return json({ ok: false, error: 'Nessun campo valido da aggiornare' }, 400);
      }

      updates.updated_at = new Date().toISOString();

      const { data, error } = await rosterServiceClient
        .from('drivers')
        .update(updates)
        .eq('id', target.id)
        .select()
        .maybeSingle();

      if (error) return json({ ok: false, error: error.message }, 400);
      if (!data) return json({ ok: false, error: 'Aggiornamento non riuscito' }, 500);

      const driver = { ...data, driver_id: data.driver_code, is_ex_vsd: !!data.removed_at };
      return json({ ok: true, data: { driver } });
    }

    // roster.deletionCandidates / roster.adminDelete (NUOVO, 19/09/2026,
    // richiesto da Demetrio): hard-delete di ex piloti VSD che non hanno
    // mai generato dati reali (partecipazioni, tempi, segnalazioni...).
    // SOLO admin (più sensibile di adminUpdate: irreversibile). La
    // candidate list è solo informativa — adminDelete RI-verifica sempre
    // lato server prima di cancellare, non si fida mai della lista letta
    // dal client in una chiamata precedente.
    if (action === 'roster.deletionCandidates') {
      const denied = requireAdmin(); if (denied) return denied;
      const rosterServiceClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

      const { data: exDrivers, error: exErr } = await rosterServiceClient
        .from('drivers')
        .select('id, driver_code, display_name, removed_at, join_date')
        .eq('team_id', teamId)
        .eq('is_system_account', false)
        .not('removed_at', 'is', null);
      if (exErr) return json({ ok: false, error: exErr.message }, 400);

      const ids = (exDrivers || []).map((d: any) => d.id);
      const contributions = await findDriverIdsWithContributions(rosterServiceClient, ids);

      const candidates = (exDrivers || [])
        .filter((d: any) => !contributions.has(d.id))
        .map((d: any) => ({ driver_id: d.driver_code, display_name: d.display_name, removed_at: d.removed_at, join_date: d.join_date }));

      return json({ ok: true, data: { candidates, count: candidates.length } });
    }

    if (action === 'roster.adminDelete') {
      const denied = requireAdmin(); if (denied) return denied;
      const targetDriverCode = payload?.driver_id ? String(payload.driver_id).trim() : '';
      if (!targetDriverCode) return json({ ok: false, error: 'driver_id (driver_code) obbligatorio' }, 400);

      const rosterServiceClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

      const { data: target, error: targetErr } = await rosterServiceClient
        .from('drivers')
        .select('id, is_system_account, removed_at')
        .eq('team_id', teamId)
        .eq('driver_code', targetDriverCode)
        .maybeSingle();
      if (targetErr) return json({ ok: false, error: targetErr.message }, 400);
      if (!target) return json({ ok: false, error: 'Driver non trovato nel team: ' + targetDriverCode }, 404);
      if (target.is_system_account) return json({ ok: false, error: 'Account di sistema non eliminabile' }, 400);
      if (!target.removed_at) return json({ ok: false, error: 'Solo un ex pilota (rimosso) può essere eliminato definitivamente' }, 400);

      const contributions = await findDriverIdsWithContributions(rosterServiceClient, [target.id]);
      const blockedBy = contributions.get(target.id);
      if (blockedBy && blockedBy.length > 0) {
        return json({ ok: false, error: 'Non eliminabile: ha dati in ' + blockedBy.join(', ') }, 400);
      }

      const { error: delErr } = await rosterServiceClient.from('drivers').delete().eq('id', target.id);
      if (delErr) return json({ ok: false, error: delErr.message }, 400);

      return json({ ok: true, data: { deleted: true, driver_id: targetDriverCode } });
    }

    // roster.availableSlots / roster.adminCreate (NUOVE, 19/09/2026,
    // richiesto da Demetrio dopo aver notato che non c'era alcun modo
    // di aggiungere un pilota nuovo dal sito). Formato driver_code
    // atteso: VSDnnn — un driver_code che non rispetta il formato
    // viene semplicemente ignorato nel calcolo dei buchi/prossimo
    // libero (non blocca nulla, permette comunque team con codici
    // diversi in futuro).
    function computeNextDriverCode(codes: string[]): { next: string; free: string[] } {
      const used = new Set<number>();
      codes.forEach(c => {
        const m = /^VSD(\d+)$/.exec(String(c || '').trim());
        if (m) used.add(parseInt(m[1], 10));
      });
      const max = used.size ? Math.max(...used) : 0;
      const free: string[] = [];
      for (let i = 1; i <= max; i++) {
        if (!used.has(i)) free.push('VSD' + String(i).padStart(3, '0'));
      }
      const next = free[0] || ('VSD' + String(max + 1).padStart(3, '0'));
      return { next, free };
    }

    if (action === 'roster.availableSlots') {
      const denied = requireStaffOrAdmin(); if (denied) return denied;
      const rosterServiceClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

      const { data: all, error } = await rosterServiceClient
        .from('drivers')
        .select('driver_code, race_number')
        .eq('team_id', teamId);
      if (error) return json({ ok: false, error: error.message }, 400);

      const { next: nextDriverCode, free: freeDriverCodes } = computeNextDriverCode((all || []).map((d: any) => d.driver_code));

      const usedRaceNumbers = (all || [])
        .map((d: any) => Number(d.race_number))
        .filter((n: number) => !isNaN(n))
        .sort((a: number, b: number) => a - b);

      const usedRaceSet = new Set(usedRaceNumbers);
      const freeRaceNumbersSample: number[] = [];
      for (let n = 1; n <= 99 && freeRaceNumbersSample.length < 20; n++) {
        if (!usedRaceSet.has(n)) freeRaceNumbersSample.push(n);
      }

      return json({ ok: true, data: {
        next_driver_code: nextDriverCode,
        free_driver_codes: freeDriverCodes,
        used_race_numbers: usedRaceNumbers,
        free_race_numbers_sample: freeRaceNumbersSample,
      } });
    }

    if (action === 'roster.adminCreate') {
      const denied = requireStaffOrAdmin(); if (denied) return denied;

      const displayName = String(payload?.display_name || '').trim();
      if (!displayName) return json({ ok: false, error: 'display_name obbligatorio' }, 400);

      const rosterServiceClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

      const { data: allCodes, error: codesErr } = await rosterServiceClient
        .from('drivers')
        .select('driver_code')
        .eq('team_id', teamId);
      if (codesErr) return json({ ok: false, error: codesErr.message }, 400);

      let driverCode = payload?.driver_id ? String(payload.driver_id).trim().toUpperCase() : '';
      if (driverCode) {
        const collision = (allCodes || []).some((d: any) => String(d.driver_code).toUpperCase() === driverCode);
        if (collision) return json({ ok: false, error: 'driver_code già in uso: ' + driverCode }, 400);
      } else {
        driverCode = computeNextDriverCode((allCodes || []).map((d: any) => d.driver_code)).next;
      }

      let raceNumber: number | null = null;
      if ('race_number' in payload && payload.race_number !== null && payload.race_number !== '') {
        raceNumber = Number(payload.race_number);
        if (isNaN(raceNumber)) return json({ ok: false, error: 'race_number non valido' }, 400);
        const { data: dup } = await rosterServiceClient
          .from('drivers')
          .select('id, display_name')
          .eq('team_id', teamId)
          .eq('race_number', String(raceNumber))
          .maybeSingle();
        if (dup) return json({ ok: false, error: 'Numero gara ' + raceNumber + ' già assegnato a ' + dup.display_name }, 400);
      }

      const VALID_ROLE = ['driver', 'staff', 'admin'];
      let role = 'driver';
      if (payload?.role) {
        if (me.role !== 'admin') return json({ ok: false, error: 'Solo un admin può impostare un ruolo diverso da pilota' }, 403);
        role = String(payload.role);
        if (!VALID_ROLE.includes(role)) return json({ ok: false, error: 'role non valido. Ammessi: ' + VALID_ROLE.join(', ') }, 400);
      }

      const VALID_STATUS = ['active', 'trial', 'inactive'];
      const status = payload?.status ? String(payload.status) : 'trial';
      if (!VALID_STATUS.includes(status)) return json({ ok: false, error: 'status non valido. Ammessi: ' + VALID_STATUS.join(', ') }, 400);

      const insertRow: Record<string, unknown> = {
        team_id: teamId,
        driver_code: driverCode,
        display_name: displayName,
        role,
        status,
        race_number: raceNumber === null ? null : raceNumber,
        join_date: payload?.join_date ? String(payload.join_date) : new Date().toISOString().slice(0, 10),
        nationality: payload?.nationality ? String(payload.nationality) : null,
        preferred_sims: Array.isArray(payload?.preferred_sims) ? payload.preferred_sims : null,
        discord_id: payload?.discord_id ? String(payload.discord_id).trim() : null,
        real_name: payload?.real_name ? String(payload.real_name).trim() : null,
        roster_track: payload?.roster_track ? String(payload.roster_track) : null,
      };

      const { data, error } = await rosterServiceClient
        .from('drivers')
        .insert(insertRow)
        .select()
        .maybeSingle();

      if (error) return json({ ok: false, error: error.message }, 400);
      if (!data) return json({ ok: false, error: 'Creazione non riuscita' }, 500);

      const driver = { ...data, driver_id: data.driver_code, is_ex_vsd: !!data.removed_at };
      return json({ ok: true, data: { driver } });
    }

    // ═══════════════════════════════════════════════════════
    // SOCIAL MANAGER (#260) — SOLO admin, invariato
    // ═══════════════════════════════════════════════════════

    if (action === 'posts.list') {
      const denied = requireAdmin(); if (denied) return denied;
      let q = supabase.from('social_posts').select('*').eq('team_id', teamId);
      if (payload?.status) q = q.eq('status', payload.status);
      const { data, error } = await q;
      if (error) return json({ ok: false, error: error.message }, 400);
      const posts = (data || []).sort((a: any, b: any) =>
        String(b.scheduled_date || b.created_at || '').localeCompare(String(a.scheduled_date || a.created_at || '')));
      return json({ ok: true, data: { posts, count: posts.length } });
    }

    if (action === 'posts.create') {
      const denied = requireAdmin(); if (denied) return denied;
      const content = String(payload?.content || '').trim();
      if (!content) return json({ ok: false, error: 'content obbligatorio' }, 400);
      const platforms = Array.isArray(payload?.platforms) ? payload.platforms : [];
      if (platforms.length === 0) return json({ ok: false, error: 'Seleziona almeno una piattaforma' }, 400);

      const { data, error } = await supabase.from('social_posts').insert({
        team_id: teamId,
        content,
        platforms,
        status: 'bozza',
        scheduled_date: payload?.scheduled_date || null,
        link_destination: payload?.link_destination || null,
        created_by: me.id,
        race_id: payload?.race_id || null,
        pillar: payload?.pillar || null,
        media_url: payload?.media_url || null,
      }).select().maybeSingle();
      if (error) return json({ ok: false, error: error.message }, 400);
      return json({ ok: true, data: { post_id: data.post_id, post: data } });
    }

    if (action === 'posts.update') {
      const denied = requireAdmin(); if (denied) return denied;
      const postId = payload?.post_id;
      if (!postId || !UUID_RE.test(String(postId))) return json({ ok: false, error: 'Post non trovato: ' + postId }, 404);

      const { data: existing, error: exErr } = await supabase
        .from('social_posts').select('status').eq('team_id', teamId).eq('post_id', postId).maybeSingle();
      if (exErr) return json({ ok: false, error: exErr.message }, 400);
      if (!existing) return json({ ok: false, error: 'Post non trovato: ' + postId }, 404);

      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      const updatable = ['content', 'platforms', 'status', 'scheduled_date', 'link_destination', 'race_id', 'pillar', 'media_url'];
      for (const key of updatable) {
        if (payload?.[key] !== undefined) update[key] = payload[key];
      }
      if (update.status === 'pubblicato' && existing.status !== 'pubblicato') {
        update.published_at = new Date().toISOString();
      }

      const { error } = await supabase.from('social_posts').update(update).eq('team_id', teamId).eq('post_id', postId);
      if (error) return json({ ok: false, error: error.message }, 400);
      return json({ ok: true, data: { post_id: postId, updated: Object.keys(update) } });
    }

    if (action === 'posts.remove') {
      const denied = requireAdmin(); if (denied) return denied;
      const postId = payload?.post_id;
      if (!postId || !UUID_RE.test(String(postId))) return json({ ok: false, error: 'Post non trovato: ' + postId }, 404);
      const { error, count } = await supabase.from('social_posts').delete({ count: 'exact' }).eq('team_id', teamId).eq('post_id', postId);
      if (error) return json({ ok: false, error: error.message }, 400);
      if (!count) return json({ ok: false, error: 'Post non trovato: ' + postId }, 404);
      return json({ ok: true, data: { post_id: postId, deleted: true } });
    }

    if (action === 'metrics.list') {
      const denied = requireAdmin(); if (denied) return denied;
      let q = supabase.from('social_metrics').select('*').eq('team_id', teamId).order('recorded_date', { ascending: true });
      if (payload?.platform) q = q.eq('platform', payload.platform);
      const { data, error } = await q;
      if (error) return json({ ok: false, error: error.message }, 400);
      return json({ ok: true, data: { metrics: data || [], count: (data || []).length } });
    }

    if (action === 'metrics.add') {
      const denied = requireAdmin(); if (denied) return denied;
      const platform = payload?.platform;
      const followers = Number(payload?.followers);
      if (!platform) return json({ ok: false, error: 'platform obbligatorio' }, 400);
      if (!followers || followers < 0) return json({ ok: false, error: 'followers non valido' }, 400);

      const { data, error } = await supabase.from('social_metrics').insert({
        team_id: teamId,
        platform,
        followers,
        recorded_date: payload?.recorded_date || new Date().toISOString().split('T')[0],
        recorded_by: me.id,
      }).select().maybeSingle();
      if (error) return json({ ok: false, error: error.message }, 400);
      return json({ ok: true, data: { metric_id: data.metric_id, metric: data } });
    }

    if (action === 'generateText') {
      const denied = requireAdmin(); if (denied) return denied;
      const prompt = String(payload?.prompt || '').trim();
      if (!prompt) return json({ ok: false, error: 'prompt obbligatorio' }, 400);
      const provider = payload?.provider === 'anthropic' ? 'anthropic' : 'gemini';
      try {
        const text = provider === 'gemini' ? await generateWithGemini(prompt) : await generateWithAnthropic(prompt);
        return json({ ok: true, data: { text: text.trim(), provider } });
      } catch (e) {
        return json({ ok: false, error: String((e as Error).message || e) }, 400);
      }
    }

    if (action === 'discord.stats') {
      const denied = requireAdmin(); if (denied) return denied;
      const raw = Deno.env.get('DISCORD_INVITE_CODE');
      if (!raw) {
        return json({ ok: false, error: 'Codice invito Discord non configurato (DISCORD_INVITE_CODE secret mancante).' }, 400);
      }
      const relayUrl = Deno.env.get('DISCORD_INVITE_RELAY_URL');
      const relaySecret = Deno.env.get('DISCORD_RELAY_SECRET');
      if (!relayUrl || !relaySecret) {
        return json({ ok: false, error: 'Relay statistiche Discord non configurato (DISCORD_INVITE_RELAY_URL/DISCORD_RELAY_SECRET mancanti).' }, 400);
      }
      const parts = raw.trim().replace(/\/+$/, '').split('/');
      const code = parts[parts.length - 1];
      try {
        const res = await fetch(relayUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-discord-relay-secret': relaySecret },
          body: JSON.stringify({ inviteCode: code }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return json({ ok: false, error: 'Errore relay statistiche Discord: HTTP ' + res.status }, 400);
        if (!body.ok) return json({ ok: false, error: 'Errore Discord API (via relay): ' + (body.error || 'sconosciuto') }, 400);
        return json({ ok: true, data: { guild_name: body.guild_name ?? null, member_count: body.member_count ?? null, online_count: body.online_count ?? null } });
      } catch (e) {
        return json({ ok: false, error: 'Errore chiamata relay Discord: ' + String(e) }, 500);
      }
    }

    if (action === 'media.list') {
      const denied = requireAdmin(); if (denied) return denied;
      let q = supabase.from('social_media').select('*').eq('team_id', teamId).order('uploaded_at', { ascending: false });
      const { data, error } = await q;
      if (error) return json({ ok: false, error: error.message }, 400);
      let media = data || [];
      const tagFilter = payload?.tag ? String(payload.tag).trim().toLowerCase() : '';
      if (tagFilter) media = media.filter((m: any) => String(m.tags || '').toLowerCase().indexOf(tagFilter) !== -1);
      return json({ ok: true, data: { media, count: media.length } });
    }

    if (action === 'media.add') {
      const denied = requireAdmin(); if (denied) return denied;
      const url = String(payload?.url || '').trim();
      if (!url) return json({ ok: false, error: 'url obbligatorio' }, 400);
      const mediaType = payload?.media_type || (/\.(mp4|mov|webm)(\?|$)/i.test(url) ? 'video' : 'image');
      const tags = Array.isArray(payload?.tags) ? payload.tags.join(',') : (payload?.tags || '');

      const { data, error } = await supabase.from('social_media').insert({
        team_id: teamId,
        url,
        filename: payload?.filename || null,
        media_type: mediaType,
        tags,
        uploaded_by: me.id,
      }).select().maybeSingle();
      if (error) return json({ ok: false, error: error.message }, 400);
      return json({ ok: true, data: { media_id: data.media_id, media: data } });
    }

    if (action === 'media.remove') {
      const denied = requireAdmin(); if (denied) return denied;
      const mediaId = payload?.media_id;
      if (!mediaId || !UUID_RE.test(String(mediaId))) return json({ ok: false, error: 'Media non trovato: ' + mediaId }, 404);
      const { error, count } = await supabase.from('social_media').delete({ count: 'exact' }).eq('team_id', teamId).eq('media_id', mediaId);
      if (error) return json({ ok: false, error: error.message }, 400);
      if (!count) return json({ ok: false, error: 'Media non trovato: ' + mediaId }, 404);
      return json({ ok: true, data: { media_id: mediaId, deleted: true } });
    }

    if (action === 'plan.dismissedList') {
      const denied = requireAdmin(); if (denied) return denied;
      const { data, error } = await supabase.from('social_plan_dismissed').select('*').eq('team_id', teamId);
      if (error) return json({ ok: false, error: error.message }, 400);
      return json({ ok: true, data: { dismissed: data || [], count: (data || []).length } });
    }

    if (action === 'plan.dismiss') {
      const denied = requireAdmin(); if (denied) return denied;
      const raceId = String(payload?.race_id || '').trim();
      if (!raceId) return json({ ok: false, error: 'race_id obbligatorio' }, 400);
      const pillar = String(payload?.pillar || '').trim();

      const { data: existing } = await supabase.from('social_plan_dismissed')
        .select('race_id').eq('team_id', teamId).eq('race_id', raceId).eq('pillar', pillar).maybeSingle();
      const now = new Date().toISOString();

      const { error } = await supabase.from('social_plan_dismissed')
        .upsert({ team_id: teamId, race_id: raceId, pillar, dismissed_by: me.id, dismissed_at: now }, { onConflict: 'team_id,race_id,pillar' });
      if (error) return json({ ok: false, error: error.message }, 400);
      return json({ ok: true, data: { race_id: raceId, pillar, dismissed_by: me.id, dismissed_at: now, already: !!existing } });
    }

    if (action === 'plan.undismiss') {
      const denied = requireAdmin(); if (denied) return denied;
      const raceId = String(payload?.race_id || '').trim();
      if (!raceId) return json({ ok: false, error: 'race_id obbligatorio' }, 400);
      const pillar = String(payload?.pillar || '').trim();

      const { error, count } = await supabase.from('social_plan_dismissed')
        .delete({ count: 'exact' }).eq('team_id', teamId).eq('race_id', raceId).eq('pillar', pillar);
      if (error) return json({ ok: false, error: error.message }, 400);
      if (!count) return json({ ok: false, error: 'Sezione non risulta archiviata: ' + raceId + (pillar ? ' / ' + pillar : '') }, 404);
      return json({ ok: true, data: { race_id: raceId, pillar, undismissed: true } });
    }

    if (action === 'plan.runDigest') {
      const denied = requireAdmin(); if (denied) return denied;
      const { data: races } = await supabase.from('races').select('*').eq('team_id', teamId);
      const { data: posts } = await supabase.from('social_posts').select('*').eq('team_id', teamId);
      const { data: dismissedRows } = await supabase.from('social_plan_dismissed').select('race_id').eq('team_id', teamId);
      const dismissed = new Set((dismissedRows || []).map((d: any) => d.race_id));

      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const windowStart = addDays(now, -10);
      const windowEnd = addDays(now, 45);

      const lastRaceByChampionship: Record<string, any> = {};
      (races || []).forEach((r: any) => {
        if (!r.championship_id || !r.date) return;
        const d = new Date(r.date);
        if (isNaN(d.getTime())) return;
        const current = lastRaceByChampionship[r.championship_id];
        if (!current || d.getTime() > new Date(current.date).getTime()) lastRaceByChampionship[r.championship_id] = r;
      });

      const dow = now.getDay();
      const daysToSunday = (7 - dow) % 7;
      const endOfThisWeek = addDays(now, daysToSunday);
      endOfThisWeek.setHours(23, 59, 59, 999);

      const late: string[] = [];
      const thisWeek: string[] = [];

      (races || [])
        .filter((r: any) => {
          if (dismissed.has(r.race_id)) return false;
          const d = r.date ? new Date(r.date) : null;
          return d && !isNaN(d.getTime()) && d >= windowStart && d <= windowEnd;
        })
        .forEach((race: any) => {
          const raceDate = new Date(race.date);
          const isCloser = race.championship_id
            && lastRaceByChampionship[race.championship_id]
            && lastRaceByChampionship[race.championship_id].race_id === race.race_id;
          const pillarDefs = isCloser ? SOCIAL_DIGEST_PILLARS.concat([SOCIAL_DIGEST_CLOSING_PILLAR]) : SOCIAL_DIGEST_PILLARS;

          pillarDefs.forEach((pillar) => {
            const match = (posts || []).find((p: any) => p.race_id === race.race_id && p.pillar === pillar.id);
            if (match && match.status === 'pubblicato') return;

            const pillarDate = addDays(raceDate, pillar.offsetDays);
            pillarDate.setHours(0, 0, 0, 0);
            const daysFromToday = Math.round((pillarDate.getTime() - now.getTime()) / 86400000);
            if (daysFromToday < -3) return;

            const label = pillar.icon + ' ' + pillar.label + ' — ' + (race.race_name || race.race_id);
            if (daysFromToday < 0) late.push(label);
            else if (pillarDate <= endOfThisWeek) thisWeek.push(label);
          });
        });

      const evergreenDue: string[] = [];
      SOCIAL_DIGEST_EVERGREEN_PILLARS.forEach((pillar) => {
        const matches = (posts || []).filter((p: any) => p.pillar === pillar.id && !p.race_id);
        const sorted = matches.slice().sort((a: any, b: any) => {
          const da = String(a.scheduled_date || a.created_at || '');
          const db = String(b.scheduled_date || b.created_at || '');
          return db.localeCompare(da);
        });
        const last = sorted[0] || null;
        const lastDateStr = last ? (last.scheduled_date || last.created_at) : null;
        const lastDate = lastDateStr ? new Date(lastDateStr) : null;
        const daysSince = lastDate && !isNaN(lastDate.getTime()) ? Math.floor((now.getTime() - lastDate.getTime()) / 86400000) : null;
        const isDue = daysSince === null || daysSince >= pillar.cadenceDays;
        if (isDue) evergreenDue.push(pillar.icon + ' ' + pillar.label);
      });

      if (late.length === 0 && thisWeek.length === 0 && evergreenDue.length === 0) {
        return json({ ok: true, data: { skipped: true } });
      }

      const fields: any[] = [];
      if (late.length > 0) fields.push({ name: '🔴 In ritardo (' + late.length + ')', value: late.join('\n').slice(0, 1024) });
      if (thisWeek.length > 0) fields.push({ name: '📅 Questa settimana (' + thisWeek.length + ')', value: thisWeek.join('\n').slice(0, 1024) });
      if (evergreenDue.length > 0) fields.push({ name: '♻️ Evergreen da fare (' + evergreenDue.length + ')', value: evergreenDue.join('\n').slice(0, 1024) });

      const discordPayload = {
        embeds: [{
          author: { name: 'VSD Paddock' },
          title: '📣 Piano editoriale — promemoria settimanale',
          color: VSD_COLORS.cyan,
          fields,
          timestamp: new Date().toISOString(),
          footer: { text: 'Apri Social Manager → Piano editoriale per i dettagli' },
          url: PADDOCK_URL + '/admin/social-manager',
        }],
      };

      const result = await postToDiscordWebhook(discordPayload, 'DISCORD_WEBHOOK_GESTIONE_GARE_URL');
      return json({ ok: result.ok, data: { posted: result.ok, error: result.error, late: late.length, thisWeek: thisWeek.length, evergreenDue: evergreenDue.length } });
    }

    // ═══════════════════════════════════════════════════════
    // RACE REPORTS + REAZIONI (#261) — auth: qualsiasi pilota
    // ═══════════════════════════════════════════════════════

    if (action === 'reports.list') {
      const denied = requireAuth(); if (denied) return denied;
      let q = supabase.from('race_reports').select('*').eq('team_id', teamId);
      if (payload?.race_id) q = q.eq('race_id', payload.race_id);
      if (payload?.driver_id) q = q.eq('driver_id', payload.driver_id);
      const { data, error } = await q;
      if (error) return json({ ok: false, error: error.message }, 400);
      const reports = (data || []).sort((a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return json({ ok: true, data: { reports, count: reports.length } });
    }

    if (action === 'reports.recent') {
      const denied = requireAuth(); if (denied) return denied;
      const limit = Number(payload?.limit) || 5;
      const { data, error } = await supabase.from('race_reports').select('*').eq('team_id', teamId);
      if (error) return json({ ok: false, error: error.message }, 400);
      const sorted = (data || []).sort((a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const top = sorted.slice(0, limit);
      return json({ ok: true, data: { reports: top, count: top.length } });
    }

    if (action === 'reports.update') {
      const denied = requireStaffOrAdmin(); if (denied) return denied;
      const reportId = payload?.report_id;
      if (!reportId || !UUID_RE.test(String(reportId))) return json({ ok: false, error: 'Report non trovato: ' + reportId }, 404);

      const { data: existing, error: exErr } = await supabase
        .from('race_reports').select('report_id').eq('team_id', teamId).eq('report_id', reportId).maybeSingle();
      if (exErr) return json({ ok: false, error: exErr.message }, 400);
      if (!existing) return json({ ok: false, error: 'Report non trovato: ' + reportId }, 404);

      const update: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: me.id };
      const updatable = ['grid_position', 'finish_position', 'best_lap_ms', 'incidents', 'incident_notes', 'damage_report', 'strategy_notes', 'staff_rating', 'staff_notes'];
      for (const key of updatable) {
        if (payload?.[key] !== undefined) update[key] = payload[key];
      }

      const { error } = await supabase.from('race_reports').update(update).eq('team_id', teamId).eq('report_id', reportId);
      if (error) return json({ ok: false, error: error.message }, 400);
      return json({ ok: true, data: { report_id: reportId, updated: Object.keys(update) } });
    }

    if (action === 'reports.seedForRace') {
      const denied = requireStaffOrAdmin(); if (denied) return denied;
      const raceId = String(payload?.race_id || '').trim();
      if (!raceId) return json({ ok: false, error: 'race_id obbligatorio' }, 400);

      const { data: results, error: resErr } = await supabase.from('race_results').select('*').eq('team_id', teamId).eq('race_id', raceId);
      if (resErr) return json({ ok: false, error: resErr.message }, 400);

      const { data: existingReports } = await supabase.from('race_reports').select('driver_id').eq('team_id', teamId).eq('race_id', raceId);
      const existingDrivers = new Set((existingReports || []).map((r: any) => r.driver_id));

      const skipped = { dns: 0, notVsd: 0, notRace: 0, alreadyExists: 0 };
      const draftRows: any[] = [];

      (results || []).forEach((rr: any) => {
        if (rr.is_vsd_driver !== true) { skipped.notVsd++; return; }
        if (rr.dns === true) { skipped.dns++; return; }
        if (String(rr.session_type || 'race').toLowerCase() !== 'race') { skipped.notRace++; return; }
        if (existingDrivers.has(rr.driver_id)) { skipped.alreadyExists++; return; }
        existingDrivers.add(rr.driver_id);

        const isDnf = rr.dnf === true;
        draftRows.push({
          team_id: teamId,
          race_id: raceId,
          driver_id: rr.driver_id,
          grid_position: rr.qual_position ?? null,
          finish_position: isDnf ? null : (rr.finish_position ?? null),
          best_lap_ms: rr.best_lap_ms ?? null,
          incident_notes: isDnf ? '⚠ DNF — investigare causa nel replay' : null,
        });
      });

      if (draftRows.length === 0) {
        return json({ ok: true, data: { drafted: 0, skipped } });
      }

      const { data: inserted, error: insErr } = await supabase.from('race_reports').insert(draftRows).select();
      if (insErr) return json({ ok: false, error: insErr.message }, 400);
      return json({ ok: true, data: { drafted: (inserted || []).length, skipped } });
    }

    if (action === 'reportReactions.list') {
      const denied = requireAuth(); if (denied) return denied;
      const { data, error } = await supabase.from('report_reactions').select('*').eq('team_id', teamId);
      if (error) return json({ ok: false, error: error.message }, 400);
      return json({ ok: true, data: { reactions: data || [], count: (data || []).length } });
    }

    if (action === 'reportReactions.toggle') {
      const denied = requireAuth(); if (denied) return denied;
      const reportId = String(payload?.report_id || '').trim();
      const emoji = String(payload?.emoji || '').trim();
      if (!reportId || !UUID_RE.test(reportId)) return json({ ok: false, error: 'report_id obbligatorio' }, 400);
      if (REPORT_REACTION_EMOJI.indexOf(emoji) === -1) {
        return json({ ok: false, error: 'emoji non valida — atteso una tra: ' + REPORT_REACTION_EMOJI.join(' ') }, 400);
      }

      const { data: existing, error: exErr } = await supabase
        .from('report_reactions').select('reaction_id, emoji').eq('team_id', teamId)
        .eq('report_id', reportId).eq('driver_id', me.id).maybeSingle();
      if (exErr) return json({ ok: false, error: exErr.message }, 400);

      if (existing) {
        if (existing.emoji === emoji) {
          const { error } = await supabase.from('report_reactions').delete().eq('reaction_id', existing.reaction_id);
          if (error) return json({ ok: false, error: error.message }, 400);
          return json({ ok: true, data: { report_id: reportId, emoji: null } });
        }
        const { error } = await supabase.from('report_reactions')
          .update({ emoji, created_at: new Date().toISOString() }).eq('reaction_id', existing.reaction_id);
        if (error) return json({ ok: false, error: error.message }, 400);
        return json({ ok: true, data: { report_id: reportId, emoji } });
      }

      const { error } = await supabase.from('report_reactions').insert({
        team_id: teamId, report_id: reportId, driver_id: me.id, emoji,
      });
      if (error) return json({ ok: false, error: error.message }, 400);
      return json({ ok: true, data: { report_id: reportId, emoji } });
    }

    // ═══════════════════════════════════════════════════════
    // AGGREGATORI (#261)
    // ═══════════════════════════════════════════════════════

    if (action === 'laps.raceLaps') {
      const denied = requireAuth(); if (denied) return denied;
      const result = await computeRaceLaps(supabase, teamId);
      return json({ ok: true, data: result });
    }

    if (action === 'landing.data') {
      const denied = requireAuth(); if (denied) return denied;
      const nowIso = new Date().toISOString();

      const [allRacesRes, upcomingRes, manualLapsRes, reportsRes, driversRes, tracksRes, carsRes, myResultsRes, teamResultsRes] = await Promise.all([
        supabase.from('races').select('*').eq('team_id', teamId),
        supabase.from('races').select('*').eq('team_id', teamId).eq('status', 'scheduled').gt('date', nowIso).order('date', { ascending: true }).limit(3),
        supabase.from('best_laps').select('*').eq('team_id', teamId),
        supabase.from('race_reports').select('*').eq('team_id', teamId),
        supabase.from('drivers').select('*').eq('team_id', teamId),
        supabase.from('tracks').select('*'),
        supabase.from('cars').select('*'),
        supabase.from('race_results').select('*').eq('team_id', teamId).eq('driver_id', me.id).eq('session_type', 'race'),
        supabase.from('race_results').select('*').eq('team_id', teamId).eq('session_type', 'race'),
      ]);

      const raceLapsResult = await computeRaceLaps(supabase, teamId);

      const allReports = reportsRes.data || [];
      const myReports = allReports.filter((r: any) => r.driver_id === me.id);

      function sortResults(rows: any[], limit: number) {
        const sorted = [...rows].sort((a, b) => String(b.set_date || '').localeCompare(String(a.set_date || '')));
        return sorted.slice(0, limit);
      }

      return json({
        ok: true,
        data: {
          all_races: allRacesRes.data || [],
          upcoming_races: upcomingRes.data || [],
          manual_laps: manualLapsRes.data || [],
          race_laps: raceLapsResult.laps,
          all_reports: allReports,
          my_reports: myReports,
          drivers: driversRes.data || [],
          tracks: tracksRes.data || [],
          cars: carsRes.data || [],
          my_race_results: sortResults(myResultsRes.data || [], 200),
          team_race_results: sortResults(teamResultsRes.data || [], 20),
        },
      });
    }

    // ═══════════════════════════════════════════════════════
    // SHOWCASE (#261) — PUBBLICO, nessuna auth
    // ═══════════════════════════════════════════════════════

    if (action === 'showcase.summary' || action === 'showcase.mediaKit') {
      let showcaseTeamId: string | null = me ? me.team_id : null;
      let serviceClient = supabase;
      if (!showcaseTeamId) {
        const teamSlug = payload?.team_slug ? String(payload.team_slug).trim() : '';
        if (!teamSlug) return json({ ok: false, error: 'team_slug obbligatorio per chiamate anonime' }, 400);
        serviceClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        const { data: team, error: teamErr } = await serviceClient.from('teams').select('id').eq('slug', teamSlug).maybeSingle();
        if (teamErr) return json({ ok: false, error: teamErr.message }, 400);
        if (!team) return json({ ok: false, error: 'Team non trovato: ' + teamSlug }, 404);
        showcaseTeamId = team.id;
      } else {
        // Chiamante autenticato: comunque service role per uniformità di
        // accesso cross-tabella (drivers/races/tracks/cars) senza dover
        // verificare RLS driver-per-driver — stesso principio già usato
        // per gli endpoint pubblici di Clash of Classes.
        serviceClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      }

      const [driversRes, racesRes, reportsRes, resultsRes, tracksRes, carsRes] = await Promise.all([
        serviceClient.from('drivers').select('*').eq('team_id', showcaseTeamId),
        serviceClient.from('races').select('*').eq('team_id', showcaseTeamId),
        serviceClient.from('race_reports').select('*').eq('team_id', showcaseTeamId),
        serviceClient.from('race_results').select('*').eq('team_id', showcaseTeamId),
        serviceClient.from('tracks').select('*'),
        serviceClient.from('cars').select('*'),
      ]);

      const drivers = driversRes.data || [];
      const races = racesRes.data || [];
      const reports = reportsRes.data || [];
      const raceResults = resultsRes.data || [];
      const tracks = tracksRes.data || [];
      const cars = carsRes.data || [];

      const trackById: Record<string, any> = {};
      tracks.forEach((t: any) => { trackById[String(t.track_id).toLowerCase()] = t; });
      const carById: Record<string, any> = {};
      cars.forEach((c: any) => { carById[String(c.car_id).toLowerCase()] = c; });
      const raceById: Record<string, any> = {};
      races.forEach((r: any) => { raceById[r.race_id] = r; });

      function getTrackName(trackId: string | null) {
        if (!trackId) return null;
        const t = trackById[String(trackId).toLowerCase()];
        return t ? t.track_name : trackId;
      }
      function getCarName(carId: string | null) {
        if (!carId) return null;
        const c = carById[String(carId).toLowerCase()];
        return c ? c.car_name : carId;
      }
      function getCarCategory(carId: string | null) {
        if (!carId) return null;
        const c = carById[String(carId).toLowerCase()];
        return c ? (c.category || null) : null;
      }

      const activeDrivers = drivers.filter((d: any) => !d.removed_at && String(d.status).toLowerCase() === 'active');
      const completedRaces = races.filter((r: any) => String(r.status).toLowerCase() === 'completed');

      const podiumsFromReports = reports.filter((r: any) => {
        const pos = Number(r.finish_position);
        return !isNaN(pos) && pos > 0 && pos <= 3;
      });
      const podiumsFromResults = raceResults.filter((rr: any) => {
        if (String(rr.session_type).toLowerCase() !== 'race') return false;
        if (rr.is_vsd_driver !== true) return false;
        if (rr.dnf === true) return false;
        if (rr.dns === true) return false;
        const pos = Number(rr.finish_position);
        return !isNaN(pos) && pos > 0 && pos <= 3;
      });
      const seenPodiums = new Set<string>();
      const podiums: any[] = [];
      [...podiumsFromReports, ...podiumsFromResults].forEach((p: any) => {
        const key = `${p.race_id}__${p.driver_id}`;
        if (!seenPodiums.has(key)) { seenPodiums.add(key); podiums.push(p); }
      });

      if (action === 'showcase.summary') {
        const manualLapsRes = await serviceClient.from('best_laps').select('*').eq('team_id', showcaseTeamId);
        const manualLaps = manualLapsRes.data || [];
        const verifiedManualLaps = manualLaps.filter((l: any) => l.verified_by && String(l.verified_by).trim());

        const raceLaps = raceResults
          .filter((rr: any) => rr.is_vsd_driver === true && Number(rr.best_lap_ms) > 0)
          .map((rr: any) => {
            const race = raceById[rr.race_id];
            return {
              driver_id: rr.driver_id,
              lap_time_ms: Number(rr.best_lap_ms),
              lap_time_display: rr.best_lap_display,
              sim: rr.sim || (race ? race.sim : null),
              track_id: rr.track_id || (race ? race.track_id : null),
              car_id: race ? race.car_id : null,
              car_external_name: rr.car_external_name ? String(rr.car_external_name).trim() : null,
              set_date: rr.set_date || (race ? race.date : null),
            };
          })
          .filter((l: any) => l.set_date && l.lap_time_display);

        const allVerifiedLaps = [...verifiedManualLaps, ...raceLaps];

        const podiumByDriver: Record<string, number> = {};
        podiums.forEach((r: any) => { podiumByDriver[r.driver_id] = (podiumByDriver[r.driver_id] || 0) + 1; });

        const topDrivers = activeDrivers
          .map((d: any) => ({ driver_id: d.driver_id, display_name: d.display_name, avatar_url: d.avatar_url || null, podiums: podiumByDriver[d.driver_id] || 0 }))
          .sort((a: any, b: any) => b.podiums - a.podiums)
          .slice(0, 5);

        const now = new Date();
        const upcomingRaces = races
          .filter((r: any) => {
            if (String(r.status).toLowerCase() !== 'scheduled') return false;
            const d = new Date(r.date);
            return !isNaN(d.getTime()) && d > now;
          })
          .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .slice(0, 3)
          .map((r: any) => ({
            race_id: r.race_id, race_name: r.race_name, sim: r.sim, track_id: r.track_id,
            track_name: getTrackName(r.track_id), car_id: r.car_id, car_name: getCarName(r.car_id),
            car_category: getCarCategory(r.car_id), date: r.date, duration_minutes: r.duration_minutes,
            championship: r.championship_id,
          }));

        const recentLaps = allVerifiedLaps.filter((l: any) => l.set_date).sort((a: any, b: any) => new Date(b.set_date).getTime() - new Date(a.set_date).getTime());
        let latestBestLap = null;
        if (recentLaps.length > 0) {
          const l = recentLaps[0];
          const driver = drivers.find((d: any) => d.driver_id === l.driver_id);
          latestBestLap = {
            driver_name: driver ? driver.display_name : l.driver_id,
            lap_time_display: l.lap_time_display, lap_time_ms: l.lap_time_ms, sim: l.sim,
            track_id: l.track_id, track_name: getTrackName(l.track_id), car_id: l.car_id,
            car_name: l.car_external_name || getCarName(l.car_id), set_date: l.set_date,
          };
        }

        return json({
          ok: true,
          data: {
            stats: {
              drivers_count: activeDrivers.length,
              races_count: completedRaces.length,
              podiums_count: podiums.length,
              verified_laps_count: allVerifiedLaps.length,
            },
            topDrivers, upcomingRaces, latestBestLap,
          },
        });
      }

      // showcase.mediaKit
      const socialMetricsRes = await serviceClient.from('social_metrics').select('*').eq('team_id', showcaseTeamId);
      const socialMetrics = socialMetricsRes.data || [];
      const wins = podiums.filter((p: any) => Number(p.finish_position) === 1);

      const raceCountBySim: Record<string, number> = {};
      completedRaces.forEach((r: any) => { const sim = r.sim || 'N/D'; raceCountBySim[sim] = (raceCountBySim[sim] || 0) + 1; });
      const sims = Object.entries(raceCountBySim).map(([sim, races_count]) => ({ sim, races_count })).sort((a, b) => (b.races_count as number) - (a.races_count as number));

      let foundedYear: number | null = null;
      races.forEach((r: any) => {
        const d = r.date ? new Date(r.date) : null;
        if (d && !isNaN(d.getTime())) {
          const y = d.getFullYear();
          if (!foundedYear || y < foundedYear) foundedYear = y;
        }
      });

      const latestByPlatform: Record<string, any> = {};
      socialMetrics.forEach((m: any) => {
        if (!m.platform) return;
        const existing = latestByPlatform[m.platform];
        if (!existing || String(m.recorded_date) > String(existing.recorded_date)) latestByPlatform[m.platform] = m;
      });
      const social = Object.values(latestByPlatform).map((m: any) => ({ platform: m.platform, followers: Number(m.followers) || 0, recorded_date: m.recorded_date }));

      const podiumByDriver: Record<string, number> = {};
      const winByDriver: Record<string, number> = {};
      podiums.forEach((r: any) => { podiumByDriver[r.driver_id] = (podiumByDriver[r.driver_id] || 0) + 1; });
      wins.forEach((r: any) => { winByDriver[r.driver_id] = (winByDriver[r.driver_id] || 0) + 1; });

      const topDrivers = activeDrivers
        .map((d: any) => ({ driver_id: d.driver_id, display_name: d.display_name, podiums: podiumByDriver[d.driver_id] || 0, wins: winByDriver[d.driver_id] || 0 }))
        .filter((d: any) => d.podiums > 0)
        .sort((a: any, b: any) => b.podiums - a.podiums || b.wins - a.wins)
        .slice(0, 6);

      return json({
        ok: true,
        data: {
          stats: {
            drivers_count: activeDrivers.length,
            races_count: completedRaces.length,
            podiums_count: podiums.length,
            wins_count: wins.length,
            founded_year: foundedYear,
          },
          sims, social, topDrivers,
        },
      });
    }

    // ═══════════════════════════════════════════════════════
    // BEST LAP SUBMISSIONS (#262) — invio autonomo piloti + revisione
    // ═══════════════════════════════════════════════════════

    if (action === 'lapSubmissions.submit') {
      const denied = requireAuth(); if (denied) return denied;
      const required = ['sim', 'track_id', 'car_id', 'lap_time_display', 'evidence_url'];
      for (const f of required) {
        if (payload?.[f] === undefined || payload?.[f] === null || String(payload[f]).trim() === '') {
          return json({ ok: false, error: `Campo obbligatorio mancante o vuoto: ${f}` }, 400);
        }
      }
      const lapTimeMs = parseLapTimeToMs(payload.lap_time_display);
      if (lapTimeMs === null) return json({ ok: false, error: 'lap_time_display non valido. Formato atteso: M:SS.mmm (es. 1:30.333)' }, 400);

      const now = new Date().toISOString();
      const { data, error } = await supabase.from('best_lap_submissions').insert({
        team_id: teamId,
        driver_id: me.id,
        sim: String(payload.sim),
        track_id: String(payload.track_id),
        car_id: String(payload.car_id),
        lap_time_ms: lapTimeMs,
        lap_time_display: msToLapDisplay(lapTimeMs),
        set_date: payload.set_date || now.split('T')[0],
        conditions: payload.conditions ? String(payload.conditions) : 'dry',
        air_temp_c: payload.air_temp_c ?? null,
        track_temp_c: payload.track_temp_c ?? null,
        session_type: payload.session_type ? String(payload.session_type) : 'practice',
        notes: payload.notes ? String(payload.notes) : null,
        evidence_url: String(payload.evidence_url),
      }).select().maybeSingle();
      if (error) return json({ ok: false, error: error.message }, 400);

      try {
        const embed = {
          author: { name: 'VSD Paddock' },
          title: '📸 Nuovo Best Lap da validare',
          description: `**${me.display_name || me.id}** — ${data.track_id} (${data.sim})\n⏱️ **${data.lap_time_display}**`,
          color: 0xfbbf24,
          timestamp: new Date().toISOString(),
          footer: { text: data.submission_id },
          url: PADDOCK_URL + '/best-laps',
        };
        await postToDiscordWebhook({ embeds: [embed] }, 'DISCORD_WEBHOOK_ADMIN_URL');
      } catch (_e) {
        // notifica non bloccante, fedele al sorgente
      }

      const submission = { ...data, driver_id: me.driver_code };
      return json({ ok: true, data: { submission_id: data.submission_id, submission } });
    }

    if (action === 'lapSubmissions.listMine') {
      const denied = requireAuth(); if (denied) return denied;
      const { data, error } = await supabase.from('best_lap_submissions').select('*').eq('team_id', teamId).eq('driver_id', me.id);
      if (error) return json({ ok: false, error: error.message }, 400);
      const submissions = (data || [])
        .map((s: any) => ({ ...s, driver_id: me.driver_code }))
        .sort((a: any, b: any) => String(b.submitted_at).localeCompare(String(a.submitted_at)));
      return json({ ok: true, data: { submissions } });
    }

    if (action === 'lapSubmissions.listPending') {
      const denied = requireAdmin(); if (denied) return denied;
      const { data, error } = await supabase.from('best_lap_submissions').select('*, drivers!best_lap_submissions_driver_id_fkey(driver_code)').eq('team_id', teamId).eq('status', 'pending');
      if (error) return json({ ok: false, error: error.message }, 400);
      const submissions = (data || [])
        .map((s: any) => { const { drivers, ...rest } = s; return { ...rest, driver_id: drivers?.driver_code ?? s.driver_id }; })
        .sort((a: any, b: any) => String(a.submitted_at).localeCompare(String(b.submitted_at)));
      return json({ ok: true, data: { submissions } });
    }

    if (action === 'lapSubmissions.approve') {
      const denied = requireAdmin(); if (denied) return denied;
      const submissionId = payload?.submission_id;
      if (!submissionId || !UUID_RE.test(String(submissionId))) return json({ ok: false, error: 'Richiesta non trovata: ' + submissionId }, 404);

      const { data: sub, error: subErr } = await supabase.from('best_lap_submissions').select('*').eq('team_id', teamId).eq('submission_id', submissionId).maybeSingle();
      if (subErr) return json({ ok: false, error: subErr.message }, 400);
      if (!sub) return json({ ok: false, error: 'Richiesta non trovata: ' + submissionId }, 404);
      if (sub.status !== 'pending') return json({ ok: false, error: 'Richiesta già revisionata (stato: ' + sub.status + ')' }, 400);

      let addResult;
      try {
        addResult = await addBestLapWithRecordCheck(supabase, teamId, me.id, {
          driver_id: sub.driver_id, sim: sub.sim, track_id: sub.track_id, car_id: sub.car_id,
          lap_time_ms: sub.lap_time_ms, lap_time_display: sub.lap_time_display, set_date: sub.set_date,
          conditions: sub.conditions, air_temp_c: sub.air_temp_c, track_temp_c: sub.track_temp_c,
          session_type: sub.session_type, notes: sub.notes,
        });
      } catch (e) {
        return json({ ok: false, error: String((e as Error).message || e) }, 400);
      }

      const now = new Date().toISOString();
      const { error: updErr } = await supabase.from('best_lap_submissions')
        .update({ status: 'approved', reviewed_by: me.id, reviewed_at: now })
        .eq('team_id', teamId).eq('submission_id', submissionId);
      if (updErr) return json({ ok: false, error: updErr.message }, 400);

      if (addResult.isNewRecord) {
        try {
          await notifyNewTeamRecordEmbed(addResult.driverName, addResult.trackName, sub.sim, addResult.lapRow.lap_time_display, addResult.previousBestDisplay);
        } catch (_e) {
          // notifica non bloccante
        }
      }

      return json({ ok: true, data: { submission_id: submissionId, lap_id: addResult.lapRow.id, evidence_url: sub.evidence_url } });
    }

    if (action === 'lapSubmissions.reject') {
      const denied = requireAdmin(); if (denied) return denied;
      const submissionId = payload?.submission_id;
      if (!submissionId || !UUID_RE.test(String(submissionId))) return json({ ok: false, error: 'Richiesta non trovata: ' + submissionId }, 404);

      const { data: sub, error: subErr } = await supabase.from('best_lap_submissions').select('status, evidence_url').eq('team_id', teamId).eq('submission_id', submissionId).maybeSingle();
      if (subErr) return json({ ok: false, error: subErr.message }, 400);
      if (!sub) return json({ ok: false, error: 'Richiesta non trovata: ' + submissionId }, 404);
      if (sub.status !== 'pending') return json({ ok: false, error: 'Richiesta già revisionata (stato: ' + sub.status + ')' }, 400);

      const now = new Date().toISOString();
      const { error } = await supabase.from('best_lap_submissions')
        .update({ status: 'rejected', reviewed_by: me.id, reviewed_at: now, review_note: payload?.review_note || null })
        .eq('team_id', teamId).eq('submission_id', submissionId);
      if (error) return json({ ok: false, error: error.message }, 400);

      return json({ ok: true, data: { submission_id: submissionId, evidence_url: sub.evidence_url } });
    }

    if (action === 'lapSubmissions.remove') {
      const denied = requireAdmin(); if (denied) return denied;
      const submissionId = payload?.submission_id;
      if (!submissionId || !UUID_RE.test(String(submissionId))) return json({ ok: false, error: 'Richiesta non trovata: ' + submissionId }, 404);
      const { error, count } = await supabase.from('best_lap_submissions').delete({ count: 'exact' }).eq('team_id', teamId).eq('submission_id', submissionId);
      if (error) return json({ ok: false, error: error.message }, 400);
      if (!count) return json({ ok: false, error: 'Richiesta non trovata: ' + submissionId }, 404);
      return json({ ok: true, data: { removed: submissionId } });
    }

    // ═══════════════════════════════════════════════════════
    // GARAGE61 SYNC (#262) — staff/admin
    // ═══════════════════════════════════════════════════════

    if (action === 'laps.syncFromGarage61') {
      const denied = requireStaffOrAdmin(); if (denied) return denied;

      try {
        const { data: team } = await supabase.from('teams').select('garage61_team_slug, garage61_last_sync_at').eq('id', teamId).maybeSingle();
        const slug = team?.garage61_team_slug;
        if (!slug) return json({ ok: false, error: 'garage61_team_slug non configurato per questo team' }, 400);

        const [{ data: driversRaw }, { data: carsRaw }, { data: tracksRaw }, { data: existingLapsRaw }] = await Promise.all([
          supabase.from('drivers').select('id, iracing_id, status').eq('team_id', teamId),
          supabase.from('cars').select('car_id, sim, garage61_id, active').eq('sim', 'IRC'),
          supabase.from('tracks').select('track_id, track_name, sim, garage61_id, active').eq('sim', 'IRC'),
          supabase.from('best_laps').select('garage61_lap_id').eq('team_id', teamId).not('garage61_lap_id', 'is', null),
        ]);

        const driverByIracingId = new Map<string, string>();
        (driversRaw || []).forEach((d: any) => {
          if (d.iracing_id && String(d.status).toLowerCase() === 'active') driverByIracingId.set(String(d.iracing_id), d.id);
        });
        const carByG61Id = new Map<number, string>();
        (carsRaw || []).forEach((c: any) => { if (c.active && c.garage61_id) carByG61Id.set(Number(c.garage61_id), c.car_id); });
        const trackByG61Id = new Map<number, string>();
        const trackNameByVsdId = new Map<string, string>();
        (tracksRaw || []).forEach((t: any) => {
          if (t.active && t.garage61_id) trackByG61Id.set(Number(t.garage61_id), t.track_id);
          trackNameByVsdId.set(t.track_id, t.track_name);
        });
        const existingG61LapIds = new Set((existingLapsRaw || []).map((l: any) => String(l.garage61_lap_id)));

        if (trackByG61Id.size === 0) {
          return json({ ok: true, data: { imported: 0, tracksProcessed: 0, lapsTotal: 0, message: 'Nessun track IRC mappato' } });
        }

        const teamG61 = await garage61Get(`/teams/${slug}`);
        const iracingBySlug = new Map<string, string>();
        (teamG61.members || []).forEach((m: any) => {
          const acc = (m.accounts || []).find((a: any) => a.platform === 'iracing');
          if (acc) iracingBySlug.set(m.slug, String(acc.id));
        });

        // Record precedente per pista, tra i tesserati attivi — porting
        // fedele del criterio del sorgente (isCurrentTesserato61_), qui
        // basato su is_system_account/removed_at/status invece del
        // driver_id hardcoded "VSD001".
        const [{ data: allBestLaps }, { data: driversFull }] = await Promise.all([
          supabase.from('best_laps').select('driver_id, sim, track_id, lap_time_ms, lap_time_display').eq('team_id', teamId).eq('sim', 'IRC'),
          supabase.from('drivers').select('id, display_name, is_system_account, removed_at, status').eq('team_id', teamId),
        ]);
        const driverFullById = new Map((driversFull || []).map((d: any) => [d.id, d]));
        const preSyncBestByTrack = new Map<string, { ms: number; display: string }>();
        (allBestLaps || []).forEach((l: any) => {
          const ms = Number(l.lap_time_ms);
          if (!ms || ms <= 0) return;
          if (!isCurrentTesserato(driverFullById.get(l.driver_id))) return;
          const cur = preSyncBestByTrack.get(l.track_id);
          if (!cur || ms < cur.ms) preSyncBestByTrack.set(l.track_id, { ms, display: l.lap_time_display || garage61FormatTime(ms) });
        });
        const recordCandidatesByTrack = new Map<string, { ms: number; display: string; driverName: string; previousDisplay: string | null }>();

        const now = new Date();
        const nowIso = now.toISOString();
        const lastSyncAt: string | null = team?.garage61_last_sync_at || null;

        const stats = { tracksProcessed: 0, lapsTotal: 0, imported: 0, skippedDedup: 0, skippedQuality: 0, skippedCarUnmapped: 0, skippedDriverUnmapped: 0, errors: 0 };
        const unmappedCarsSeen = new Map<number, string>();
        const newRows: any[] = [];

        for (const [g61TrackId, vsdTrackId] of trackByG61Id) {
          stats.tracksProcessed++;
          let offset = 0;
          const perPage = 100;
          for (let iter = 0; iter < 50; iter++) {
            const afterParam = lastSyncAt ? `&after=${encodeURIComponent(lastSyncAt)}` : '';
            let data: any;
            try {
              data = await garage61Get(`/laps?teams=${slug}&tracks=${g61TrackId}&limit=${perPage}&offset=${offset}${afterParam}`);
            } catch (e) {
              stats.errors++;
              break;
            }
            const laps = data.items || [];
            if (laps.length === 0) break;

            for (const lap of laps) {
              stats.lapsTotal++;
              if (existingG61LapIds.has(String(lap.id))) { stats.skippedDedup++; continue; }
              if (!lap.clean || lap.incomplete || lap.offtrack || lap.pitlane || lap.pitIn || lap.pitOut || lap.missing || lap.discontinuity) {
                stats.skippedQuality++; continue;
              }
              const g61CarId = lap.car && Number(lap.car.id);
              const vsdCarId = carByG61Id.get(g61CarId);
              if (!vsdCarId) {
                stats.skippedCarUnmapped++;
                if (lap.car && !unmappedCarsSeen.has(g61CarId)) unmappedCarsSeen.set(g61CarId, lap.car.name);
                continue;
              }
              const driverSlug = lap.driver && lap.driver.slug;
              const iracingId = iracingBySlug.get(driverSlug);
              const driverId = iracingId && driverByIracingId.get(iracingId);
              if (!driverId) { stats.skippedDriverUnmapped++; continue; }

              const lapTimeMs = Math.round(lap.lapTime * 1000);
              const setDate = String(lap.startTime).split('T')[0];
              const conditions = (lap.precipitation > 0 || lap.trackWetness > 0) ? 'wet' : 'dry';
              const sessionType = garage61MapSessionType(lap.sessionType);

              newRows.push({
                team_id: teamId, driver_id: driverId, sim: 'IRC', track_id: vsdTrackId, car_id: vsdCarId,
                lap_time_ms: lapTimeMs, lap_time_display: garage61FormatTime(lapTimeMs), set_date: setDate,
                conditions, session_type: sessionType, verified_by: me.id, verified_at: nowIso,
                notes: 'Imported from Garage61', garage61_lap_id: String(lap.id),
              });
              existingG61LapIds.add(String(lap.id));
              stats.imported++;

              if (isCurrentTesserato(driverFullById.get(driverId))) {
                const preSync = preSyncBestByTrack.get(vsdTrackId);
                const candidate = recordCandidatesByTrack.get(vsdTrackId);
                const currentBestMs = candidate ? candidate.ms : (preSync ? preSync.ms : null);
                if (currentBestMs === null || lapTimeMs < currentBestMs) {
                  recordCandidatesByTrack.set(vsdTrackId, {
                    ms: lapTimeMs, display: garage61FormatTime(lapTimeMs),
                    driverName: driverFullById.get(driverId)?.display_name || driverId,
                    previousDisplay: preSync ? preSync.display : null,
                  });
                }
              }
            }

            if (laps.length < perPage) break;
            if (data.total !== undefined && offset + laps.length >= data.total) break;
            offset += perPage;
          }
        }

        if (newRows.length > 0) {
          const { error: insErr } = await supabase.from('best_laps').insert(newRows);
          if (insErr) return json({ ok: false, error: insErr.message }, 400);
        }

        await supabase.from('teams').update({ garage61_last_sync_at: nowIso }).eq('id', teamId);

        // Auto-draft cars Garage61 senza mapping — globale (cars non è
        // team-scoped, stesso principio del sorgente).
        let unmappedCarsDrafted = 0;
        if (unmappedCarsSeen.size > 0) {
          const { data: existingCars } = await supabase.from('cars').select('car_id');
          const existingCarIds = new Set((existingCars || []).map((c: any) => c.car_id));
          const draftRows: any[] = [];
          unmappedCarsSeen.forEach((name, g61CarId) => {
            const slugified = garage61Slugify(name);
            let newCarId = `irc-${slugified}`;
            if (existingCarIds.has(newCarId)) {
              let n = 2;
              while (existingCarIds.has(`${newCarId}-${n}`)) n++;
              newCarId = `${newCarId}-${n}`;
            }
            existingCarIds.add(newCarId);
            draftRows.push({ car_id: newCarId, sim: 'IRC', car_name: name, active: true, garage61_id: String(g61CarId) });
          });
          if (draftRows.length > 0) {
            const { error: draftErr } = await supabase.from('cars').insert(draftRows);
            if (!draftErr) unmappedCarsDrafted = draftRows.length;
          }
        }

        if (recordCandidatesByTrack.size > 0) {
          try {
            for (const [vsdTrackId, rec] of recordCandidatesByTrack) {
              await notifyNewTeamRecordEmbed(rec.driverName, trackNameByVsdId.get(vsdTrackId) || vsdTrackId, 'IRC', rec.display, rec.previousDisplay);
            }
          } catch (_e) {
            // notifica non bloccante
          }
        }

        return json({
          ok: true,
          data: {
            ...stats,
            unmappedCars: Array.from(unmappedCarsSeen.entries()).map(([id, name]) => ({ id, name })),
            unmappedCarsDrafted,
            newRecords: recordCandidatesByTrack.size,
          },
        });
      } catch (e) {
        return json({ ok: false, error: String((e as Error).message || e) }, 400);
      }
    }

    // ═══════════════════════════════════════════════════════
    // PIT WALL REALTIME (#263) — staff/admin, come pitwall.logSession
    // ═══════════════════════════════════════════════════════

    if (action === 'pitwall.broadcastLive') {
      const denied = requireStaffOrAdmin(); if (denied) return denied;
      if (payload?.data === undefined || payload?.data === null) {
        return json({ ok: false, error: 'data obbligatorio (payload telemetria)' }, 400);
      }
      const eventName = payload?.event ? String(payload.event) : 'telemetry';
      const topic = 'pitwall:' + teamId;
      try {
        await broadcastRealtime(topic, eventName, payload.data);
      } catch (e) {
        return json({ ok: false, error: String((e as Error).message || e) }, 502);
      }
      return json({ ok: true, data: { topic, event: eventName } });
    }

    return json({ ok: false, error: 'action non valida: ' + action }, 400);
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
