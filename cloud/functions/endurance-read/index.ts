// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — endurance-read (dispatcher consolidato per le
// 4 azioni di sola lettura del dominio #259: Endurance)
// ═══════════════════════════════════════════════════════════
// DEVIAZIONE ARCHITETTURALE, non di logica: il progetto Supabase ha
// raggiunto il tetto di 100 Edge Function del piano free (spend cap
// disattivato per scelta esplicita dell'utente — "ottimizza per non
// cambiare piano e mantenere tutto gratuito", 17 set 2026). Da qui in
// avanti, per gli endpoint di sola lettura di un dominio, si consolida
// in UN'unica function dispatch-by-action invece di una function per
// azione (pattern usato ovunque nei domini #250-#258) — nessuna
// funzionalità persa, nessuna azione già validata riscritta, solo
// meno slug.
//
// DEPLOY: nessuno slug nuovo disponibile (l'API Supabase MCP non
// offre un delete_edge_function, quindi gli slug già consumati non
// sono recuperabili). Questo codice è deployato SOTTO LO SLUG
// GIÀ ESISTENTE `endurance-auditions-list` (redeploy, nuova
// versione) — diventa il dispatcher READ canonico per l'intero
// dominio #259, non solo per auditions.list. Lo slug gemello
// `endurance-auditions-get`, deployato prima della decisione di
// consolidare, resta INVARIATO come endpoint legacy ridondante
// (funzionalmente equivalente ad action:'auditions.get' qui) — non
// dà fastidio, occupa uno slot già consumato comunque. Il file
// locale cloud/functions/endurance-auditions-list/index.ts (versione
// single-action) è superseded da questo.
//
// payload.action:
//   'auditions.list'   → porting fedele di Endurance.js, handleEnduranceAuditionsList
//   'auditions.get'    → porting fedele di Endurance.js, handleEnduranceAuditionsGet
//   'participants.list'→ porting fedele di EnduranceParticipants.js, handleEnduranceParticipantsList
//   'stints.list'      → porting fedele di EnduranceStints.js, handleEnduranceStintsList
//
// Auth per azione (fedele al sorgente — vedi 026_endurance.sql):
//   auditions.list/get   → pubblico (team_slug/service-role), isStaff reale per masking/draft.
//   participants.list    → pubblico (team_slug/service-role), NESSUN masking (fedele: il
//                           sorgente non ha alcun check, nemmeno un no-op).
//   stints.list           → sessione valida OBBLIGATORIA, nessun fallback team_slug
//                           (fedele all'intento del commento originale "Auth: richiesta").
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Fallback token legacy (FIX #337, 20/09/2026 — stesso pattern di
// #331/#358/#359, vedi nota completa in cloud/functions/best-laps-list/
// index.ts): nessun pilota reale ha una sessione Supabase reale, solo il
// token legacy Discord OAuth via Apps Script. Necessario qui perché
// RaceDetail.jsx (pagina PUBBLICA /race/:raceId) chiama stints.list per
// ogni gara endurance incondizionatamente — senza fallback, ogni pilota
// avrebbe visto silenziosamente zero stint sulla pagina gara.
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

const AUDITION_PRIVATE_FIELDS = [
  'audition_id', 'target_race', 'target_race_date',
  'name', 'date', 'sim', 'track_id',
  'pilot_class', 'mandatory_car_id', 'setup_url', 'setup_notes',
  'duration_minutes_real', 'time_multiplier', 'duration_minutes_ingame',
  'start_time_ingame', 'end_time_ingame', 'ai_strength_pct',
  'field_size_hypercar', 'field_size_lmp2', 'field_size_gt3',
  'weather_condition', 'status', 'created_by', 'created_at',
  'notes_internal',
];
const AUDITION_PUBLIC_FIELDS = AUDITION_PRIVATE_FIELDS.filter((f) => f !== 'notes_internal');

function sanitizeAudition(row: any, isStaff: boolean) {
  const fields = isStaff ? AUDITION_PRIVATE_FIELDS : AUDITION_PUBLIC_FIELDS;
  const out: any = {};
  fields.forEach((f) => { if (f in row) out[f] = row[f]; });
  return out;
}

async function resolvePublicTeam(serviceClient: any, authHeader: string | null, payload: any) {
  // Ritorna { teamId, isStaff }. Se authHeader assente/invalid, richiede
  // team_slug nel payload (chiamata anonima) — stesso pattern di
  // interest-list/candidates pubblici.
  let teamId: string | null = null;
  let isStaff = false;
  if (authHeader) {
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (user) {
      const { data: me } = await serviceClient
        .from('drivers')
        .select('team_id, role')
        .eq('auth_user_id', user.id)
        .maybeSingle();
      if (me) {
        teamId = me.team_id;
        isStaff = me.role === 'staff' || me.role === 'admin';
      }
    }
  }
  if (!teamId) {
    const teamSlug = payload?.team_slug ? String(payload.team_slug).trim() : '';
    if (!teamSlug) return { error: json({ ok: false, error: 'team_slug obbligatorio per chiamate anonime' }, 400) };
    const { data: team, error: teamErr } = await serviceClient
      .from('teams')
      .select('id')
      .eq('slug', teamSlug)
      .maybeSingle();
    if (teamErr) return { error: json({ ok: false, error: teamErr.message }, 400) };
    if (!team) return { error: json({ ok: false, error: 'Team non trovato: ' + teamSlug }, 404) };
    teamId = team.id;
  }
  return { teamId, isStaff };
}

async function handleAuditionsList(serviceClient: any, authHeader: string | null, payload: any) {
  const resolved = await resolvePublicTeam(serviceClient, authHeader, payload);
  if ('error' in resolved) return resolved.error;
  const { teamId, isStaff } = resolved;

  let query = serviceClient.from('endurance_auditions').select('*').eq('team_id', teamId);
  if (!isStaff) query = query.neq('status', 'draft');
  if (payload?.status) query = query.eq('status', String(payload.status));
  if (payload?.sim) query = query.eq('sim', String(payload.sim));
  query = query.order('date', { ascending: false });

  const { data: rows, error } = await query;
  if (error) return json({ ok: false, error: error.message }, 400);

  const sanitized = (rows ?? []).map((r: any) => sanitizeAudition(r, isStaff));
  return json({ ok: true, data: { auditions: sanitized, count: sanitized.length } });
}

async function handleAuditionsGet(serviceClient: any, authHeader: string | null, payload: any) {
  const auditionId = payload?.audition_id ? String(payload.audition_id).trim() : '';
  if (!auditionId) return json({ ok: false, error: 'audition_id mancante' }, 400);

  const resolved = await resolvePublicTeam(serviceClient, authHeader, payload);
  if ('error' in resolved) return resolved.error;
  const { teamId, isStaff } = resolved;

  const { data: audition, error } = await serviceClient
    .from('endurance_auditions')
    .select('*')
    .eq('team_id', teamId)
    .eq('audition_id', auditionId)
    .maybeSingle();
  if (error) return json({ ok: false, error: error.message }, 400);
  if (!audition) return json({ ok: false, error: 'Audition non trovata: ' + auditionId }, 404);

  if (audition.status === 'draft' && !isStaff) {
    return json({ ok: false, error: 'Audition non disponibile' }, 403);
  }

  return json({ ok: true, data: { audition: sanitizeAudition(audition, isStaff) } });
}

async function handleParticipantsList(serviceClient: any, authHeader: string | null, payload: any) {
  const resolved = await resolvePublicTeam(serviceClient, authHeader, payload);
  if ('error' in resolved) return resolved.error;
  const { teamId } = resolved;

  let query = serviceClient
    .from('endurance_participants')
    .select('participation_id, audition_id, driver_id, status, added_at, added_by, notes')
    .eq('team_id', teamId);

  const auditionId = payload?.audition_id ? String(payload.audition_id).trim() : '';
  if (auditionId) query = query.eq('audition_id', auditionId);

  const { data, error } = await query;
  if (error) return json({ ok: false, error: error.message }, 400);

  // FIX #337 (20/09/2026, trovato PRIMA del cutover frontend, mai esposto a
  // utenti reali): driver_id qui era l'uuid interno Postgres (drivers.id),
  // invece del driver_code (contratto pubblico, vedi FIX #330 e i fix
  // analoghi in #329/#331/#333/#334/#335/#336). AdminEnduranceForm.jsx e
  // EnduranceDetail.jsx costruiscono `rosterById`/`driverMap` chiave
  // driver_code (da roster.list()) e fanno `driverMap[p.driver_id]` — con
  // l'uuid grezzo il lookup fallisce SEMPRE, mostrando un uuid al posto
  // del nome pilota (e un link /roster/:driverId rotto in EnduranceDetail).
  // Risolto: risoluzione batch uuid → driver_code.
  const driverIds = Array.from(new Set((data ?? []).map((r: any) => r.driver_id).filter(Boolean)));
  let driverCodeMap: Record<string, string> = {};
  if (driverIds.length > 0) {
    const { data: drivers } = await serviceClient.from('drivers').select('id, driver_code').in('id', driverIds);
    (drivers ?? []).forEach((d: any) => { driverCodeMap[d.id] = d.driver_code; });
  }
  const out = (data ?? []).map((r: any) => ({ ...r, driver_id: driverCodeMap[r.driver_id] || r.driver_id }));

  return json({ ok: true, data: out });
}

async function handleStintsList(authHeader: string | null, payload: any) {
  // FIX #337: sessione Supabase reale O fallback token legacy — vedi
  // commento in testa al file.
  let me: any = null;
  let supabase: any = null;

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
        .select('team_id')
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

  const raceId = payload?.race_id ? String(payload.race_id).trim() : '';
  if (!raceId) return json({ ok: false, error: 'race_id obbligatorio' }, 400);

  const { data: stints, error } = await supabase
    .from('endurance_stints')
    .select('*')
    .eq('team_id', me.team_id)
    .eq('race_id', raceId)
    .order('car_number', { ascending: true })
    .order('stint_order', { ascending: true });
  if (error) return json({ ok: false, error: error.message }, 400);

  // FIX #337: stesso bug di handleParticipantsList qui sopra — driver_id
  // era l'uuid grezzo di endurance_stints.driver_id. AdminRaceStints.jsx,
  // StintPlanner.jsx, RaceDetail.jsx/StintTimeline.jsx e SwapPilotModal.jsx
  // fanno tutti `driverById[s.driver_id]` chiave driver_code — con l'uuid
  // il lookup fallisce e la UI mostra l'uuid al posto del nome pilota in
  // ogni vista stint (planner, timeline pubblica, pannello admin).
  const stintDriverIds = Array.from(new Set((stints ?? []).map((s: any) => s.driver_id).filter(Boolean)));
  let stintDriverCodeMap: Record<string, string> = {};
  if (stintDriverIds.length > 0) {
    const { data: drivers } = await supabase.from('drivers').select('id, driver_code').in('id', stintDriverIds);
    (drivers ?? []).forEach((d: any) => { stintDriverCodeMap[d.id] = d.driver_code; });
  }
  const outStints = (stints ?? []).map((s: any) => ({ ...s, driver_id: stintDriverCodeMap[s.driver_id] || s.driver_id }));

  return json({ ok: true, data: { stints: outStints, count: outStints.length } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const payload = await req.json().catch(() => ({}));
    const action = String(payload?.action || '');
    const authHeader = req.headers.get('Authorization');

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    switch (action) {
      case 'auditions.list':
        return await handleAuditionsList(serviceClient, authHeader, payload);
      case 'auditions.get':
        return await handleAuditionsGet(serviceClient, authHeader, payload);
      case 'participants.list':
        return await handleParticipantsList(serviceClient, authHeader, payload);
      case 'stints.list':
        return await handleStintsList(authHeader, payload);
      default:
        return json({ ok: false, error: 'action sconosciuta: ' + action }, 400);
    }
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
