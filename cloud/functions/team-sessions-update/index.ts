// FIX #331: risposta allineata (session_id alias di id) — stesso principio di team-sessions-list/create.
// Logica di riferimento reale (handleTeamSessionsUpdate):
//   - auth richiesto, SOLO staff/admin
//   - session_id obbligatorio (nel payload, mappato su id)
//   - solo i campi passati nel payload vengono modificati

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
const EDITABLE_FIELDS = [
  'type', 'title', 'championship_id', 'event_id', 'track_id', 'sim',
  'datetime_start', 'duration_min', 'discord_channel', 'notes',
];

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

    const sessionId = String(payload?.session_id || '').trim();
    if (!sessionId) return json({ ok: false, error: 'session_id obbligatorio' }, 400);

    if (payload?.type !== undefined && !TEAM_SESSION_TYPES.includes(String(payload.type))) {
      return json({ ok: false, error: 'type non valido — atteso uno tra: ' + TEAM_SESSION_TYPES.join(', ') }, 400);
    }
    if (payload?.datetime_start !== undefined && isNaN(new Date(payload.datetime_start).getTime())) {
      return json({ ok: false, error: 'datetime_start non valido' }, 400);
    }

    if (me.role !== 'staff' && me.role !== 'admin') {
      return json({ ok: false, error: 'Operazione riservata a staff o admin' }, 403);
    }

    const updates: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
      if (!(field in (payload ?? {}))) continue;
      if (field === 'datetime_start') {
        updates[field] = new Date(payload[field]).toISOString();
      } else if (field === 'duration_min') {
        updates[field] = Number(payload[field]);
      } else {
        updates[field] = payload[field] === null ? null : String(payload[field]);
      }
    }

    if (Object.keys(updates).length === 0) {
      return json({ ok: false, error: 'Nessun campo valido da aggiornare' }, 400);
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('team_sessions')
      .update(updates)
      .eq('id', sessionId)
      .eq('team_id', me.team_id)
      .select('*, drivers(driver_code)')
      .maybeSingle();

    if (error) return json({ ok: false, error: error.message }, 400);
    if (!data) return json({ ok: false, error: 'Sessione non trovata: ' + sessionId }, 404);

    const { id, created_by, drivers, ...rest } = data as any;
    const session = { ...rest, session_id: id, created_by: drivers?.driver_code ?? null };

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
