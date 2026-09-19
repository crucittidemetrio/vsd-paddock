// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — pitwall.session (porting di apps-script/PitwallSessions.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handlePitwallSession):
//   - auth richiesto (chiunque nel team)
//   - session_id obbligatorio
//   - classifica per miglior giro (ascendente), tempi assenti in coda
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
    if (!sessionId) return json({ ok: false, error: 'session_id mancante' }, 400);

    const { data: rows, error } = await supabase
      .from('pitwall_sessions')
      .select('*')
      .eq('session_id', sessionId);
    if (error) return json({ ok: false, error: error.message }, 400);
    if (!rows || rows.length === 0) return json({ ok: false, error: 'Sessione non trovata: ' + sessionId }, 404);

    const drivers = rows
      .map((r: any) => ({
        driver_id: r.driver_id || '',
        driver_name_external: r.driver_name_external || '',
        vehicle_name: r.vehicle_name || '',
        vehicle_class: r.vehicle_class || '',
        best_lap_time_ms: r.best_lap_time_ms ?? null,
        laps_completed: r.laps_completed ?? 0,
        final_place: r.final_place ?? null,
      }))
      .sort((a: any, b: any) => {
        if (a.best_lap_time_ms == null && b.best_lap_time_ms == null) return 0;
        if (a.best_lap_time_ms == null) return 1;
        if (b.best_lap_time_ms == null) return -1;
        return a.best_lap_time_ms - b.best_lap_time_ms;
      });

    return json({
      ok: true,
      data: {
        session_id: sessionId,
        track_name: rows[0].track_name || '',
        sim: rows[0].sim || '',
        session_type: rows[0].session_type,
        captured_at: rows[0].captured_at || '',
        drivers,
      },
    });
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
