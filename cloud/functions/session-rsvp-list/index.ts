// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — sessionRsvp.list (porting di TeamSessionsScheduler.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handleSessionRsvpList):
//   - auth richiesto
//   - session_id obbligatorio
//   - visibile a CHIUNQUE sia loggato nel team — serve sapere chi
//     ci sarà, non solo allo staff.
//
// Team scoping via RLS "session_rsvps: il team legge tutte le
// risposte" (008, join su team_sessions.team_id) — qui il filtro
// applicativo è solo session_id, come nel sistema reale.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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

    const { data, error } = await supabase.from('session_rsvps').select('*').eq('session_id', sessionId);
    if (error) return json({ ok: false, error: error.message }, 400);

    return json({ ok: true, data: { rsvps: data ?? [], count: (data ?? []).length } });
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
