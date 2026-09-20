// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — lapData.session (porting fedele di
// apps-script/LapData.js, handleLapDataSession)
// ═══════════════════════════════════════════════════════════
// Auth richiesta, nessuna restrizione di ruolo. Dettaglio giri di una
// sessione. "clean" = stessa definizione di isCleanLap_ in FuelLog.js
// (non in_pits, non yellow_flag).
//
// FIX #336 (20/09/2026, trovato PRIMA del cutover frontend, mai
// esposto a utenti reali): driver_id restituito era l'uuid interno
// Postgres (drivers.id, da lap_data.driver_id) invece del driver_code
// (contratto pubblico, vedi FIX #330). PaceAnalysis.jsx costruisce le
// etichette legenda del grafico con `lap.driver_id || lap.driver_name_external`
// — ogni giro di un pilota VSD riconosciuto avrebbe mostrato un uuid
// grezzo al posto del nome, sempre (non un caso limite come in
// audit-log-list, qui è la label primaria del grafico). Risolto:
// driver_code + driver_name aggiunti in uscita, risolti in batch dalla
// tabella drivers per gli id presenti nei giri della sessione.
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

    const payload = await req.json().catch(() => ({}));
    const sessionId = payload && String(payload.session_id || '').trim();
    if (!sessionId) return json({ ok: false, error: 'session_id mancante' }, 400);

    const { data: rows, error } = await supabase
      .from('lap_data')
      .select('*')
      .eq('team_id', me.team_id)
      .eq('session_id', sessionId)
      .order('lap_number', { ascending: true });
    if (error) return json({ ok: false, error: error.message }, 400);

    if (!rows || rows.length === 0) return json({ ok: false, error: 'Sessione non trovata: ' + sessionId }, 404);

    // FIX #336: risoluzione batch driver_id (uuid) → driver_code/display_name.
    const driverIds = Array.from(new Set(rows.map((r: any) => r.driver_id).filter(Boolean)));
    let driverCodeMap: Record<string, string> = {};
    let driverNameMap: Record<string, string> = {};
    if (driverIds.length > 0) {
      const { data: drivers } = await supabase
        .from('drivers')
        .select('id, display_name, driver_code')
        .in('id', driverIds);
      (drivers ?? []).forEach((d: any) => {
        driverCodeMap[d.id] = d.driver_code;
        driverNameMap[d.id] = d.display_name;
      });
    }

    const laps = rows.map((r: any) => ({
      // FIX #336: driver_code al posto dell'uuid grezzo, più driver_name
      // risolto per la legenda (PaceAnalysis.jsx preferisce driver_name).
      driver_id: (r.driver_id && driverCodeMap[r.driver_id]) || r.driver_id || '',
      driver_name: (r.driver_id && driverNameMap[r.driver_id]) || null,
      driver_name_external: r.driver_name_external || '',
      lap_number: Number(r.lap_number) || 0,
      lap_time_ms: r.lap_time_ms != null ? Number(r.lap_time_ms) : null,
      sector1_ms: r.sector1_ms != null ? Number(r.sector1_ms) : null,
      sector2_ms: r.sector2_ms != null ? Number(r.sector2_ms) : null,
      sector3_ms: r.sector3_ms != null ? Number(r.sector3_ms) : null,
      speed_min_kmh: r.speed_min_kmh != null ? Number(r.speed_min_kmh) : null,
      speed_max_kmh: r.speed_max_kmh != null ? Number(r.speed_max_kmh) : null,
      speed_avg_kmh: r.speed_avg_kmh != null ? Number(r.speed_avg_kmh) : null,
      in_pits: r.in_pits === true,
      yellow_flag: r.yellow_flag === true,
      track_temp_c: r.track_temp_c != null ? Number(r.track_temp_c) : null,
      air_temp_c: r.air_temp_c != null ? Number(r.air_temp_c) : null,
      fuel_l: r.fuel_l != null ? Number(r.fuel_l) : null,
      clean: r.in_pits !== true && r.yellow_flag !== true,
    }));

    return json({ ok: true, data: { session_id: sessionId, sim: rows[0].sim || '', laps } });
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
