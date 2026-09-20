// FIX #331: risposta allineata (session_id alias di id) — stesso principio di team-sessions-list/create.
// Logica di riferimento reale (handleTeamSessionsUpdate):
//   - auth richiesto, SOLO staff/admin
//   - session_id obbligatorio (nel payload, mappato su id)
//   - solo i campi passati nel payload vengono modificati

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ ok: false, error: 'Auth richiesto' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) return json({ ok: false, error: 'Auth richiesto' }, 401);

    const payload = await req.json().catch(() => ({}));
    const sessionId = String(payload?.session_id || '').trim();
    if (!sessionId) return json({ ok: false, error: 'session_id obbligatorio' }, 400);

    if (payload?.type !== undefined && !TEAM_SESSION_TYPES.includes(String(payload.type))) {
      return json({ ok: false, error: 'type non valido — atteso uno tra: ' + TEAM_SESSION_TYPES.join(', ') }, 400);
    }
    if (payload?.datetime_start !== undefined && isNaN(new Date(payload.datetime_start).getTime())) {
      return json({ ok: false, error: 'datetime_start non valido' }, 400);
    }

    const { data: me, error: meErr } = await supabase
      .from('drivers')
      .select('role')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (meErr) return json({ ok: false, error: meErr.message }, 400);
    if (!me) return json({ ok: false, error: 'Driver non collegato a questo account' }, 404);
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
