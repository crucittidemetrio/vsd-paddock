// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — teamSessions.list (porting di TeamSessionsScheduler.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handleTeamSessionsList):
//   - auth richiesto
//   - visibile a CHIUNQUE sia loggato nel team, non solo staff —
//     il team deve sapere quando sono gli allenamenti.
//
// Qui "team scoping" non è un filtro applicativo: la RLS
// "team_sessions: il team legge tutte le sessioni" (008) filtra già
// per team_id = current_driver_team_id(), quindi un select * senza
// filtri restituisce esattamente e solo le sessioni del team del
// chiamante — stesso principio già usato in roster-list con
// drivers_public.
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

    const { data, error } = await supabase
      .from('team_sessions')
      .select('*')
      .order('datetime_start', { ascending: true });

    if (error) return json({ ok: false, error: error.message }, 400);

    return json({ ok: true, data: { sessions: data ?? [], count: (data ?? []).length } });
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
