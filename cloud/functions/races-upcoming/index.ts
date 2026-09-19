// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — races.upcoming (porting di apps-script/Races.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handleRacesUpcoming):
//   - auth richiesto
//   - status === 'scheduled' AND date > now, ordinate ASC, top 3
//
// championship_name: sempre null qui, stesso motivo di races-list
// (Championships non ancora portato, vedi #252).
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

    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from('races')
      .select('*')
      .eq('status', 'scheduled')
      .gt('date', nowIso)
      .order('date', { ascending: true })
      .limit(3);

    if (error) return json({ ok: false, error: error.message }, 400);

    const races = (data ?? []).map((r: any) => ({ ...r, championship_name: null }));

    return json({ ok: true, data: { races, count: races.length } });
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
