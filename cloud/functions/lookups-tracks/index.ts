// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — lookups.tracks (porting di apps-script/Lookups.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handleLookupsTracks): identica a
// lookups-cars ma sulla tabella tracks (catalogo globale, vedi 009).
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
    const sim = payload?.sim ? String(payload.sim) : null;

    let query = supabase.from('tracks').select('*').eq('active', true);
    if (sim) query = query.eq('sim', sim);

    const { data, error } = await query;
    if (error) return json({ ok: false, error: error.message }, 400);

    const tracks = (data ?? []).sort((a: any, b: any) =>
      String(a.track_name || '').toLowerCase().localeCompare(String(b.track_name || '').toLowerCase()),
    );

    return json({ ok: true, data: { tracks, count: tracks.length } });
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
