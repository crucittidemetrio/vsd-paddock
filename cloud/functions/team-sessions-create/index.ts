// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — teamSessions.create (porting di TeamSessionsScheduler.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handleTeamSessionsCreate):
//   - auth richiesto
//   - type obbligatorio, uno tra TEAM_SESSION_TYPES
//   - tipi "aperti" (allenamento_libero, allenamento_collettivo) →
//     creabili da QUALSIASI driver del team; gli altri tipi
//     (qualifica, evento_esterno, riunione) → solo staff/admin
//   - title e datetime_start obbligatori
//   - created_by SEMPRE dal contesto (chi chiama), MAI dal payload
//
// Whitelist/gate applicati due volte per design (stesso principio di
// roster-update-self): qui a livello applicativo (per dare un
// messaggio d'errore chiaro), e a livello RLS via la policy
// "team_sessions: crea chi può, secondo il tipo" (008) — anche un bug
// qui non permetterebbe a un driver non-staff di creare una
// "riunione", perché il DB stesso la rifiuterebbe.
//
// Le notifiche Discord (Fase 3 nel sistema reale: notifyTeamSessionCreated_)
// non sono portate in questa Edge Function — restano una differenza
// nota rispetto al sistema reale finché non si decide come/se
// riprodurle su questo stack (probabile Supabase Webhook o trigger
// separato, non logica da duplicare qui).
//
// FIX #331: risposta allineata allo stesso contratto di
// team-sessions-list — session_id alias di id, created_by come
// driver_code (qui sempre = il chiamante stesso, già noto come
// `me.driver_code`, niente join necessario).
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LEGACY_API_URL = 'https://script.google.com/macros/s/AKfycbyMXxEjZfm5EIsGUnKxpwtBtoeR4hwMG7Pl8ZESF8yG569SS0aIdsWqyu9PdBgR14vLiA/exec';

// FIX (26/09/2026, segnalato da Demetrio — "Sessioni team da errore"):
// stesso identico gap già chiuso in races-get/standings-by-championship
// e decine di altre funzioni. Stesso fallback identico.
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

const TEAM_SESSION_TYPES = ['allenamento_libero', 'allenamento_collettivo', 'qualifica', 'evento_esterno', 'riunione'];
const TEAM_SESSION_TYPES_OPEN = ['allenamento_libero', 'allenamento_collettivo'];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const payload = await req.json().catch(() => ({}));
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
          .select('id, team_id, role, driver_code')
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

    const type = String(payload?.type || '').trim();
    const title = String(payload?.title || '').trim();
    const datetimeStart = String(payload?.datetime_start || '').trim();

    if (!TEAM_SESSION_TYPES.includes(type)) {
      return json({ ok: false, error: 'type non valido — atteso uno tra: ' + TEAM_SESSION_TYPES.join(', ') }, 400);
    }
    if (!title) return json({ ok: false, error: 'title obbligatorio' }, 400);
    if (!datetimeStart || isNaN(new Date(datetimeStart).getTime())) {
      return json({ ok: false, error: 'datetime_start obbligatorio e deve essere una data valida' }, 400);
    }

    const isStaff = me.role === 'staff' || me.role === 'admin';
    if (!isStaff && !TEAM_SESSION_TYPES_OPEN.includes(type)) {
      return json({ ok: false, error: 'Solo staff/admin possono creare sessioni di tipo "' + type + '"' }, 403);
    }

    const insertRow = {
      team_id: me.team_id,
      type,
      title,
      championship_id: payload?.championship_id ? String(payload.championship_id) : null,
      event_id: payload?.event_id ? String(payload.event_id) : null,
      track_id: payload?.track_id ? String(payload.track_id) : null,
      sim: payload?.sim ? String(payload.sim) : null,
      datetime_start: new Date(datetimeStart).toISOString(),
      duration_min: payload?.duration_min ? Number(payload.duration_min) : 60,
      discord_channel: payload?.discord_channel ? String(payload.discord_channel) : null,
      notes: payload?.notes ? String(payload.notes) : null,
      created_by: me.id,
    };

    const { data, error } = await supabase.from('team_sessions').insert(insertRow).select().maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 400);

    const session = data ? { ...data, session_id: data.id, created_by: me.driver_code } : data;

    return json({ ok: true, data: { session } });
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
