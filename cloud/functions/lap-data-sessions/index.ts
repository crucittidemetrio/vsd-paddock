// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — lapData.sessions (porting fedele di
// apps-script/LapData.js, handleLapDataSessions)
// ═══════════════════════════════════════════════════════════
// Auth richiesta, nessuna restrizione di ruolo (fedele al sorgente).
// Elenco sessioni importate, più recenti prima.
//
// Nota (#336): driver_id qui è usato SOLO per contare driver_count
// (dimensione di un Set), mai esposto come stringa identificabile in
// risposta — nessun fix driver_id→driver_code necessario.
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

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return json({ ok: false, error: 'Auth richiesto' }, 401);

    const { data: me, error: meErr } = await supabase
      .from('drivers')
      .select('id, team_id')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (meErr) return json({ ok: false, error: meErr.message }, 400);
    if (!me) return json({ ok: false, error: 'Driver non collegato a questo account' }, 404);

    const { data: rows, error } = await supabase
      .from('lap_data')
      .select('session_id, sim, driver_id, driver_name_external, imported_at')
      .eq('team_id', me.team_id);
    if (error) return json({ ok: false, error: error.message }, 400);

    const bySession: Record<string, any> = {};
    (rows ?? []).forEach((r: any) => {
      const sid = String(r.session_id || '').trim();
      if (!sid) return;
      if (!bySession[sid]) {
        bySession[sid] = { session_id: sid, sim: r.sim || '', laps: 0, drivers: new Set<string>(), imported_at: r.imported_at || '' };
      }
      bySession[sid].laps++;
      bySession[sid].drivers.add(r.driver_id || r.driver_name_external || '?');
    });

    const sessions = Object.values(bySession)
      .map((s: any) => ({
        session_id: s.session_id,
        sim: s.sim,
        laps: s.laps,
        driver_count: s.drivers.size,
        imported_at: s.imported_at,
      }))
      .sort((a: any, b: any) => String(b.imported_at).localeCompare(String(a.imported_at)));

    return json({ ok: true, data: { sessions } });
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
