// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — laps.add (porting di apps-script/BestLaps.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handleLapsAdd):
//   - auth richiesto, SOLO staff/admin
//   - campi obbligatori: driver_id, sim, track_id, car_id, lap_time_display
//   - lap_time_display accetta virgola e formato sotto il minuto
//     (normalizeLapTimeInput_), poi parsing rigoroso M:SS.mmm
//
// DIFFERENZE deliberate rispetto al sistema reale:
//   - payload.driver_id qui è il driver_code (es. "VSD005"), come nel
//     sistema reale — ma va risolto all'uuid interno (drivers.id) per
//     lo scritto sulla FK. Risoluzione ristretta al team del
//     chiamante: uno staff non può accreditare un giro a un driver di
//     un altro team anche conoscendone il codice.
//
// GAP CHIUSO in #262: il controllo "nuovo record di squadra" + notifica
// Discord (notifyNewTeamRecord_), documentato come non portato in #179,
// è stato aggiunto qui — porting fedele di handleLapsAdd: record
// precedente = giro più veloce su (sim, track_id) di un tesserato
// attivo (is_system_account=false, removed_at null, status='active'),
// qualsiasi session_type. Notifica non bloccante (try/catch), postata
// sul webhook principale (DISCORD_WEBHOOK_URL), non su quello admin.
//
// FIX #331: la riga si salva con driver_id = uuid interno (corretto,
// FK reale) ma la risposta al frontend deve esporre driver_code sotto
// quella chiave — payload.driver_id è già il driver_code validato
// contro il team del chiamante poco sopra, quindi si riusa direttamente
// senza una query aggiuntiva.
//
// FIX #362 (20/09/2026): stesso alias id→lap_id di best-laps-list —
// vedi header di quel file per la diagnosi completa.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Fallback token legacy (stesso pattern #331/#358/#359/#392/#360): nessun
// pilota/staff reale ha mai una sessione Supabase autentica, solo il token
// legacy Discord OAuth via Apps Script. Questo endpoint non era mai stato
// incluso nel giro di fix precedenti — segnalato da Demetrio il 26/09/2026
// ("Auth richiesto" sull'inserimento manuale in AdminBestLaps.jsx).
const LEGACY_API_URL = 'https://script.google.com/macros/s/AKfycbyMXxEjZfm5EIsGUnKxpwtBtoeR4hwMG7Pl8ZESF8yG569SS0aIdsWqyu9PdBgR14vLiA/exec';

async function resolveLegacyDriver(serviceClient: any, legacyToken: string | undefined) {
  if (!legacyToken) return null;
  try {
    const r = await fetch(LEGACY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'auth.verify', token: legacyToken, payload: {} }),
    });
    const j = await r.json();
    const driverCode = j?.ok && j.data?.valid ? j.data?.driver?.driver_id : null;
    if (!driverCode) return null;
    const { data: d } = await serviceClient
      .from('drivers')
      .select('id, team_id, role, display_name, driver_code')
      .eq('driver_code', driverCode)
      .maybeSingle();
    if (!d) return null;
    return { ...d, role: j.data.driver.role || d.role };
  } catch {
    return null;
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const REQUIRED_FIELDS = ['driver_id', 'sim', 'track_id', 'car_id', 'lap_time_display'];

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

// #444 (26/09/2026): foto pilota nell'embed "Nuovo record di squadra!",
// mai portata da apps-script/Notifications.js (gap documentato e
// accettato in race-results-import/index.ts, riaperto su richiesta di
// Demetrio). Sorgente foto: drivers.avatar_url (upload reale, #381) al
// posto del vecchio pattern /drivers/{id}.jpg su Google Drive. Gate
// identico al legacy: solo se il pilota ha accettato social_consent
// per la versione corrente del documento consensi.
const CONSENT_VERSION = 'v1-2026-08-08'; // allineato a src/pages/ConsentForm.jsx

async function getDriverThumbnailUrl(supabase: any, teamId: string, driverId: string, avatarUrl: string | null | undefined): Promise<string | null> {
  if (!avatarUrl) return null;
  try {
    const { data: consentRow } = await supabase
      .from('consents')
      .select('social_consent')
      .eq('team_id', teamId)
      .eq('driver_id', driverId)
      .eq('consent_version', CONSENT_VERSION)
      .maybeSingle();
    return consentRow?.social_consent ? avatarUrl : null;
  } catch {
    return null;
  }
}

async function postToDiscordWebhook(payload: unknown, envName: string): Promise<void> {
  try {
    const url = Deno.env.get(envName);
    if (!url) return;
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch (_e) {
    // fault-tolerant, fedele al try/catch del sorgente attorno a notifyNewTeamRecord_
  }
}


// ═══════════════════════════════════════════════════════════
// 20/10/2026 — Best lap automatici dal plugin SimHub (ACE e altri sim)
// ═══════════════════════════════════════════════════════════
// Il plugin VsdLapDataLogger invia ogni giro valido con il DEVICE TOKEN
// del pilota (devices.createToken, HMAC stateless, stesso schema dei
// fuel-*). Nessuna Edge Function nuova (piano free a 100/100): stesso
// slug di laps.add, distinto dal tipo di Authorization.
//   1) risoluzione pista/auto: alias staff/auto → fuzzy trigram (039)
//   2) ogni giro finisce in auto_lap_inbox (attività pilota + storico)
//   3) se pista e auto sono abbinate e il giro batte il personale del
//      pilota su (sim, pista, auto) → best_laps + eventuale notifica record
// Azioni staff (stesso slug, payload.action): autoInbox.list / autoInbox.map
const AUTO_MATCH_MIN_SCORE = 0.75;
const AUTO_SIMS = new Set(['ACE', 'LMU', 'ACC', 'IRC']);

function b64urlDecode(b64url: string): string {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function b64urlEncodeBytes(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacB64url(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return b64urlEncodeBytes(new Uint8Array(sig));
}

async function verifyDeviceToken(token: string): Promise<{ driver_id: string; team_id: string } | null> {
  try {
    const secret = Deno.env.get('DEVICE_TOKEN_SECRET');
    if (!secret || !token || token.split('.').length === 3) return null; // un JWT non è un device token
    const decoded = b64urlDecode(token);
    const cut = decoded.lastIndexOf('|');
    if (cut === -1) return null;
    const payload = decoded.slice(0, cut);
    if (decoded.slice(cut + 1) !== await hmacB64url(payload, secret)) return null;
    const [driverId, teamId, exp] = payload.split('|');
    if (!driverId || !teamId || !Number(exp) || Date.now() > Number(exp)) return null;
    return { driver_id: driverId, team_id: teamId };
  } catch {
    return null;
  }
}

function mapSessionType(raw: unknown): string {
  const s = String(raw || '').toLowerCase();
  if (s.includes('qual')) return 'qualifying';
  if (s.includes('race') || s.includes('gara')) return 'race';
  if (s.includes('hot') || s.includes('time') || s.includes('trial')) return 'time_trial';
  return 'practice';
}

const numOrNull = (v: unknown) => (v === undefined || v === null || v === '' || isNaN(Number(v)) ? null : Number(v));

async function resolveName(svc: any, teamId: string, sim: string, kind: 'track' | 'car', candidates: string[]) {
  const clean = candidates.map((c) => String(c || '').trim()).filter(Boolean);
  if (clean.length === 0) return null;
  const { data } = await svc.rpc('resolve_sim_name', { p_team: teamId, p_sim: sim, p_kind: kind, p_candidates: clean });
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.mapped_id) return null;
  if (row.via === 'alias') return row.mapped_id as string;
  if (Number(row.score) < AUTO_MATCH_MIN_SCORE) return null;
  // fuzzy sicuro → alias automatico, così il prossimo giro non ricalcola
  await svc.from('sim_name_aliases').upsert(
    clean.map((c) => ({ team_id: teamId, sim, kind, raw_key: c.toLowerCase(), mapped_id: row.mapped_id, source: 'auto', score: Number(row.score) })),
    { onConflict: 'team_id,sim,kind,raw_key', ignoreDuplicates: true },
  );
  return row.mapped_id as string;
}

// Promuove un giro dell'inbox (già abbinato) a best_laps se è il nuovo
// personale del pilota su (sim, pista, auto). Notifica record di squadra
// sulla pista come laps.add. Ritorna lo stato finale dell'inbox.
async function promoteInboxLap(svc: any, row: any): Promise<{ status: string; lap?: any; isTeamRecord?: boolean }> {
  const { data: prevPb } = await svc.from('best_laps').select('lap_time_ms')
    .eq('team_id', row.team_id).eq('driver_id', row.driver_id).eq('sim', row.sim)
    .eq('track_id', row.track_id).eq('car_id', row.car_id)
    .order('lap_time_ms', { ascending: true }).limit(1).maybeSingle();
  if (prevPb && Number(prevPb.lap_time_ms) <= Number(row.lap_time_ms)) {
    await svc.from('auto_lap_inbox').update({ status: 'not_pb', processed_at: new Date().toISOString() }).eq('id', row.id);
    return { status: 'not_pb' };
  }

  // record di squadra precedente su (sim, pista) — stesso criterio di laps.add
  let previousBestMs: number | null = null;
  let previousBestDisplay: string | null = null;
  const [{ data: trackLaps }, { data: driversRows }] = await Promise.all([
    svc.from('best_laps').select('driver_id, lap_time_ms, lap_time_display').eq('team_id', row.team_id).eq('sim', row.sim).eq('track_id', row.track_id),
    svc.from('drivers').select('id, display_name, avatar_url, is_system_account, removed_at, status').eq('team_id', row.team_id),
  ]);
  const byId = new Map((driversRows || []).map((d: any) => [d.id, d]));
  (trackLaps || []).forEach((l: any) => {
    const ms = Number(l.lap_time_ms);
    if (!ms || !isCurrentTesserato(byId.get(l.driver_id))) return;
    if (previousBestMs === null || ms < previousBestMs) { previousBestMs = ms; previousBestDisplay = l.lap_time_display || msToLapDisplay(ms); }
  });
  const me: any = byId.get(row.driver_id);
  const isTeamRecord = isCurrentTesserato(me) && (previousBestMs === null || Number(row.lap_time_ms) < previousBestMs);

  const { data: lap, error } = await svc.from('best_laps').insert({
    team_id: row.team_id, driver_id: row.driver_id, sim: row.sim, track_id: row.track_id, car_id: row.car_id,
    lap_time_ms: row.lap_time_ms, lap_time_display: msToLapDisplay(row.lap_time_ms),
    set_date: String(row.created_at || new Date().toISOString()).split('T')[0],
    conditions: 'dry', air_temp_c: row.air_temp_c, track_temp_c: row.track_temp_c,
    session_type: row.session_type || 'practice', verified_at: new Date().toISOString(),
    notes: 'Auto SimHub' + (row.plugin_version ? ' v' + row.plugin_version : ''),
  }).select().maybeSingle();
  if (error) throw new Error(error.message);
  await svc.from('auto_lap_inbox').update({ status: 'imported', best_lap_id: lap.id, processed_at: new Date().toISOString() }).eq('id', row.id);

  if (isTeamRecord) {
    try {
      const { data: tr } = await svc.from('tracks').select('track_name').eq('track_id', row.track_id).maybeSingle();
      const embed: any = {
        author: { name: 'VSD Paddock' },
        title: '🏆 Nuovo record di squadra!',
        description: `**${me?.display_name || 'Pilota'}** — ${tr?.track_name || row.track_id} (${row.sim})\n⏱️ **${lap.lap_time_display}**` +
          (previousBestDisplay ? ` _(precedente: ${previousBestDisplay})_` : ' _(primo tempo registrato su questa pista)_'),
        color: 0xa855f7,
        timestamp: new Date().toISOString(),
        footer: { text: 'Muro dei Record · SimHub' },
        url: 'https://vsd-paddock.vercel.app/records',
      };
      const thumb = await getDriverThumbnailUrl(svc, row.team_id, row.driver_id, me?.avatar_url);
      if (thumb) embed.thumbnail = { url: thumb };
      await postToDiscordWebhook({ embeds: [embed] }, 'DISCORD_WEBHOOK_URL');
    } catch (_e) { /* non bloccante */ }
  }
  return { status: 'imported', lap, isTeamRecord };
}

async function handleAutoSubmit(svc: any, dev: { driver_id: string; team_id: string }, p: any): Promise<Response> {
  const sim = String(p?.sim || '').toUpperCase();
  if (!AUTO_SIMS.has(sim)) return json({ ok: false, error: 'sim non supportato: ' + sim }, 400);
  const lapMs = Math.round(Number(p?.lap_time_ms));
  // 20 s – 30 min: fuori da qui è un giro fantasma/uscita box
  if (!lapMs || lapMs < 20000 || lapMs > 1800000) return json({ ok: false, error: 'lap_time_ms fuori range' }, 400);
  const rawTrack = String(p?.track || '').trim();
  const rawCar = String(p?.car || '').trim();
  if (!rawTrack || !rawCar) return json({ ok: false, error: 'track e car obbligatori' }, 400);

  const { data: drv } = await svc.from('drivers').select('id, team_id, removed_at').eq('id', dev.driver_id).eq('team_id', dev.team_id).maybeSingle();
  if (!drv || drv.removed_at) return json({ ok: false, error: 'Pilota non attivo' }, 403);

  const trackCands = [rawTrack, p?.track_alt, p?.track_name].filter(Boolean);
  const carCands = [rawCar, p?.car_alt].filter(Boolean);
  const [trackId, carId] = await Promise.all([
    resolveName(svc, dev.team_id, sim, 'track', trackCands),
    resolveName(svc, dev.team_id, sim, 'car', carCands),
  ]);

  const { data: row, error } = await svc.from('auto_lap_inbox').insert({
    team_id: dev.team_id, driver_id: dev.driver_id, sim,
    raw_track: rawTrack, raw_track_alt: [p?.track_alt, p?.track_name].filter(Boolean).join(' | ') || null,
    raw_car: rawCar, raw_car_alt: p?.car_alt ? String(p.car_alt) : null,
    track_id: trackId, car_id: carId, lap_time_ms: lapMs,
    sector1_ms: numOrNull(p?.sector1_ms), sector2_ms: numOrNull(p?.sector2_ms), sector3_ms: numOrNull(p?.sector3_ms),
    session_type: mapSessionType(p?.session_type),
    air_temp_c: numOrNull(p?.air_temp_c), track_temp_c: numOrNull(p?.track_temp_c),
    plugin_version: p?.plugin_version ? String(p.plugin_version).slice(0, 20) : null,
    status: 'unmapped',
  }).select().maybeSingle();
  if (error) return json({ ok: false, error: error.message }, 400);

  if (!trackId || !carId) {
    return json({ ok: true, data: { status: 'unmapped', track_id: trackId, car_id: carId } });
  }
  const res = await promoteInboxLap(svc, row);
  return json({ ok: true, data: { status: res.status, track_id: trackId, car_id: carId, team_record: !!res.isTeamRecord } });
}

async function handleInboxAction(svc: any, me: any, payload: any): Promise<Response> {
  if (payload.action === 'autoInbox.list') {
    const { data: rows } = await svc.from('auto_lap_inbox')
      .select('id, driver_id, sim, raw_track, raw_track_alt, raw_car, raw_car_alt, track_id, car_id, lap_time_ms, session_type, status, created_at')
      .eq('team_id', me.team_id).order('created_at', { ascending: false }).limit(300);
    const { data: drivers } = await svc.from('drivers').select('id, driver_code, display_name').eq('team_id', me.team_id);
    const byId = new Map((drivers || []).map((d: any) => [d.id, d]));
    const { data: aliases } = await svc.from('sim_name_aliases').select('sim, kind, raw_key, mapped_id, source').eq('team_id', me.team_id).order('created_at', { ascending: false });
    return json({
      ok: true,
      data: {
        laps: (rows || []).map((r: any) => ({
          ...r, lap_time_display: msToLapDisplay(r.lap_time_ms),
          driver_code: byId.get(r.driver_id)?.driver_code || null,
          driver_name: byId.get(r.driver_id)?.display_name || null,
        })),
        aliases: aliases || [],
      },
    });
  }

  if (payload.action === 'autoInbox.map') {
    const sim = String(payload.sim || '').toUpperCase();
    const kind = payload.kind === 'car' ? 'car' : payload.kind === 'track' ? 'track' : null;
    const raw = String(payload.raw || '').trim();
    const mapped = String(payload.mapped_id || '').trim();
    if (!sim || !kind || !raw || !mapped) return json({ ok: false, error: 'sim, kind, raw e mapped_id obbligatori' }, 400);
    const table = kind === 'track' ? 'tracks' : 'cars';
    const col = kind === 'track' ? 'track_id' : 'car_id';
    const { data: exists } = await svc.from(table).select(col).eq(col, mapped).eq('sim', sim).maybeSingle();
    if (!exists) return json({ ok: false, error: `${mapped} non esiste nel catalogo ${sim}` }, 400);

    await svc.from('sim_name_aliases').upsert(
      { team_id: me.team_id, sim, kind, raw_key: raw.toLowerCase(), mapped_id: mapped, source: 'staff', score: 1 },
      { onConflict: 'team_id,sim,kind,raw_key' },
    );
    // applica l'abbinamento a tutti i giri ancora in attesa con quel nome grezzo
    const rawCol = kind === 'track' ? 'raw_track' : 'raw_car';
    const { data: pending } = await svc.from('auto_lap_inbox').select(`id, ${rawCol}`)
      .eq('team_id', me.team_id).eq('sim', sim).eq('status', 'unmapped');
    const ids = (pending || []).filter((r: any) => String(r[rawCol] || '').trim().toLowerCase() === raw.toLowerCase()).map((r: any) => r.id);
    if (ids.length) await svc.from('auto_lap_inbox').update({ [col]: mapped }).in('id', ids);

    // riprocessa in ordine cronologico i giri ora completi
    const { data: ready } = await svc.from('auto_lap_inbox').select('*')
      .eq('team_id', me.team_id).eq('status', 'unmapped').not('track_id', 'is', null).not('car_id', 'is', null)
      .order('created_at', { ascending: true }).limit(200);
    let imported = 0, notPb = 0;
    for (const r of ready || []) {
      const res = await promoteInboxLap(svc, r);
      if (res.status === 'imported') imported++; else notPb++;
    }
    return json({ ok: true, data: { imported, not_pb: notPb } });
  }

  if (payload.action === 'autoInbox.reject') {
    const { error } = await svc.from('auto_lap_inbox').update({ status: 'rejected', processed_at: new Date().toISOString() })
      .eq('team_id', me.team_id).eq('id', String(payload.id || ''));
    if (error) return json({ ok: false, error: error.message }, 400);
    return json({ ok: true, data: { rejected: true } });
  }

  return json({ ok: false, error: 'azione sconosciuta: ' + payload.action }, 400);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const payload = await req.json().catch(() => ({}));
    const authHeader = req.headers.get('Authorization');
    let supabase: any = null;
    let me: any = null;

    // Plugin SimHub: Authorization = device token (non un JWT Supabase)
    const bearer = (authHeader || '').replace(/^Bearer\s+/i, '');
    const device = await verifyDeviceToken(bearer);
    if (device) {
      const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      return await handleAutoSubmit(svc, device, payload);
    }

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
          .select('id, team_id, role')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        me = meRow || null;
      }
    }

    if (!me) {
      const legacyServiceClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const legacyMe = await resolveLegacyDriver(legacyServiceClient, payload?.legacy_token);
      if (legacyMe) {
        me = legacyMe;
        supabase = legacyServiceClient;
      }
    }

    if (!me) return json({ ok: false, error: 'Auth richiesto' }, 401);
    if (me.role !== 'staff' && me.role !== 'admin') {
      return json({ ok: false, error: 'Permessi insufficienti' }, 403);
    }

    if (typeof payload?.action === 'string' && payload.action.startsWith('autoInbox.')) {
      const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      return await handleInboxAction(svc, me, payload);
    }

    for (const field of REQUIRED_FIELDS) {
      const v = payload?.[field];
      if (v === undefined || v === null || String(v).trim() === '') {
        return json({ ok: false, error: `Campo obbligatorio mancante o vuoto: ${field}` }, 400);
      }
    }

    const lapTimeMs = parseLapTimeToMs(payload.lap_time_display);
    if (lapTimeMs === null) {
      return json({ ok: false, error: 'lap_time_display non valido. Formato atteso: M:SS.mmm (es. 1:30.333)' }, 400);
    }

    // driver_id dal payload è il driver_code, come nel sistema reale —
    // risolto qui all'uuid, ristretto al team del chiamante.
    const { data: targetDriver, error: targetErr } = await supabase
      .from('drivers')
      .select('id, avatar_url')
      .eq('team_id', me.team_id)
      .eq('driver_code', String(payload.driver_id))
      .maybeSingle();
    if (targetErr) return json({ ok: false, error: targetErr.message }, 400);
    if (!targetDriver) return json({ ok: false, error: 'Driver non trovato nel team: ' + payload.driver_id }, 404);

    // Record di squadra precedente su (sim, track_id), PRIMA di inserire
    // il nuovo giro — porting fedele di handleLapsAdd. Un fallimento qui
    // non deve mai bloccare il salvataggio del giro.
    let previousBestDisplay: string | null = null;
    let isNewRecordCandidate = false;
    try {
      const [{ data: existingLaps }, { data: driversRows }] = await Promise.all([
        supabase.from('best_laps').select('driver_id, lap_time_ms, lap_time_display')
          .eq('team_id', me.team_id).eq('sim', String(payload.sim)).eq('track_id', String(payload.track_id)),
        supabase.from('drivers').select('id, is_system_account, removed_at, status').eq('team_id', me.team_id),
      ]);
      const driverById = new Map((driversRows || []).map((d: any) => [d.id, d]));
      let previousBestMs: number | null = null;
      (existingLaps || []).forEach((l: any) => {
        const ms = Number(l.lap_time_ms);
        if (!ms || ms <= 0) return;
        if (!isCurrentTesserato(driverById.get(l.driver_id))) return;
        if (previousBestMs === null || ms < previousBestMs) {
          previousBestMs = ms;
          previousBestDisplay = l.lap_time_display || msToLapDisplay(ms);
        }
      });
      isNewRecordCandidate = isCurrentTesserato(driverById.get(targetDriver.id))
        && (previousBestMs === null || lapTimeMs < previousBestMs);
    } catch (_e) {
      // calcolo record precedente fallito: non bloccante, fedele al sorgente
    }

    const now = new Date().toISOString();
    const insertRow = {
      team_id: me.team_id,
      driver_id: targetDriver.id,
      sim: String(payload.sim),
      track_id: String(payload.track_id),
      car_id: String(payload.car_id),
      lap_time_ms: lapTimeMs,
      lap_time_display: msToLapDisplay(lapTimeMs),
      set_date: payload.set_date || now.split('T')[0],
      conditions: payload.conditions ? String(payload.conditions) : 'dry',
      air_temp_c: payload.air_temp_c !== undefined && payload.air_temp_c !== null ? Number(payload.air_temp_c) : null,
      track_temp_c: payload.track_temp_c !== undefined && payload.track_temp_c !== null ? Number(payload.track_temp_c) : null,
      session_type: payload.session_type ? String(payload.session_type) : 'practice',
      setup_shared: payload.setup_shared === true || payload.setup_shared === 'TRUE',
      setup_link: payload.setup_link ? String(payload.setup_link) : null,
      replay_url: payload.replay_url ? String(payload.replay_url) : null,
      verified_by: me.id,
      verified_at: now,
      notes: payload.notes ? String(payload.notes) : null,
    };

    const { data, error } = await supabase.from('best_laps').insert(insertRow).select().maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 400);

    if (isNewRecordCandidate) {
      try {
        const [{ data: driverRow }, { data: trackRow }] = await Promise.all([
          supabase.from('drivers').select('display_name').eq('id', targetDriver.id).maybeSingle(),
          supabase.from('tracks').select('track_name').eq('track_id', String(payload.track_id)).maybeSingle(),
        ]);
        const driverName = driverRow?.display_name || String(payload.driver_id);
        const trackName = trackRow?.track_name || String(payload.track_id);
        const embed: any = {
          author: { name: 'VSD Paddock' },
          title: '🏆 Nuovo record di squadra!',
          description: `**${driverName}** — ${trackName} (${payload.sim})\n⏱️ **${data.lap_time_display}**` +
            (previousBestDisplay ? ` _(precedente: ${previousBestDisplay})_` : ' _(primo tempo registrato su questa pista)_'),
          color: 0xa855f7,
          timestamp: new Date().toISOString(),
          footer: { text: 'Muro dei Record' },
          url: 'https://vsd-paddock.vercel.app/records',
        };
        const thumbUrl = await getDriverThumbnailUrl(supabase, me.team_id, targetDriver.id, targetDriver.avatar_url);
        if (thumbUrl) embed.thumbnail = { url: thumbUrl };
        await postToDiscordWebhook({ embeds: [embed] }, 'DISCORD_WEBHOOK_URL');
      } catch (_e) {
        // notifica non bloccante, fedele al sorgente
      }
    }

    const lap = data ? { ...data, driver_id: String(payload.driver_id), lap_id: data.id } : data;

    return json({ ok: true, data: { lap } });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
