// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — laps.list (porting di apps-script/BestLaps.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handleLapsList):
//   - auth richiesto
//   - ritorna TUTTI i lap del team, ordinati per lap_time_ms crescente
//   - nessun filtro applicativo: il frontend filtra in memoria
//
// Team scoping via RLS "best_laps: il team legge tutti i tempi" (009).
//
// FIX #331 (stesso pattern di #329/#330): best_laps.driver_id in
// Postgres è lo UUID interno (FK drivers.id), ma tutto il frontend
// (useBestLaps.js: activeDriverIdSet(...).has(l.driver_id), filtro per
// filters.driver_id, AdminBestLaps.jsx: driversById[lap.driver_id])
// si aspetta il codice pilota (VSD005) sotto quel nome — join su
// drivers, driver_code esposto come driver_id.
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
      .from('best_laps')
      .select('*, drivers!best_laps_driver_id_fkey(driver_code)')
      .order('lap_time_ms', { ascending: true });

    if (error) return json({ ok: false, error: error.message }, 400);

    const laps = (data ?? []).map((l: any) => {
      const { drivers, ...rest } = l;
      return { ...rest, driver_id: drivers?.driver_code ?? l.driver_id };
    });

    return json({ ok: true, data: { laps, count: laps.length } });
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
