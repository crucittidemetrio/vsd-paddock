// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — laps.leaderboard (porting di apps-script/BestLaps.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handleLapsLeaderboard):
//   - auth richiesto
//   - sim + track_id obbligatori, car_id opzionale
//   - per ogni driver_id, tiene solo il lap col lap_time_ms minore
//     (best assoluto, indipendente da date/conditions/session_type)
//   - ordina per tempo crescente
//
// Team scoping via RLS (query grezza già ristretta al team del
// chiamante), il raggruppamento per driver avviene qui perché
// Postgres/PostgREST non esprime comodamente "keep min row per
// gruppo" in una singola select senza una funzione ad hoc — stesso
// approccio del sistema reale (fatto in JS dopo il filtro, non SQL).
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
    const sim = payload?.sim ? String(payload.sim) : '';
    const trackId = payload?.track_id ? String(payload.track_id) : '';
    const carId = payload?.car_id ? String(payload.car_id) : null;

    if (!sim) return json({ ok: false, error: 'sim mancante' }, 400);
    if (!trackId) return json({ ok: false, error: 'track_id mancante' }, 400);

    let query = supabase.from('best_laps').select('*').eq('sim', sim).eq('track_id', trackId);
    if (carId) query = query.eq('car_id', carId);

    const { data, error } = await query;
    if (error) return json({ ok: false, error: error.message }, 400);

    const byDriver: Record<string, any> = {};
    (data ?? []).forEach((l: any) => {
      const t = Number(l.lap_time_ms);
      if (!byDriver[l.driver_id] || Number(byDriver[l.driver_id].lap_time_ms) > t) {
        byDriver[l.driver_id] = l;
      }
    });

    const laps = Object.values(byDriver).sort(
      (a: any, b: any) => Number(a.lap_time_ms) - Number(b.lap_time_ms),
    );

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
