// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — records.team / Muro dei Record (porting di apps-script/Records.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handleTeamRecords):
//   - auth richiesto
//   - per ogni (sim, track_id, race_class) il giro più veloce tra i
//     tesserati ATTUALMENTE attivi (esclusi rimossi/non-attivi/
//     account di sistema)
//   - include_ex_vsd: bypassa il filtro "solo attivi" e mostra anche
//     ex piloti come detentori — onorato SOLO se l'utente è admin,
//     mai in base al payload da solo
//   - car_id senza race_class assegnato → bucket "non classificato"
//     (race_class: null), non escluso
//   - verified: true se garage61_lap_id valorizzato (qui sempre
//     false per ora: il sync Garage61 non è ancora portato, vedi 009)
//
// DIFFERENZA dal sistema reale: là "VSD001" è l'account di sistema
// hardcoded; qui si usa drivers.is_system_account (flag esplicito
// già presente dallo schema fondamenta, 001) — stesso principio già
// applicato dal commento originale su quella colonna.
//
// FIX #331 (stesso pattern di #329/#330): best_laps.driver_id è lo
// UUID interno, ma il frontend (TeamRecords.jsx e qualsiasi consumer
// futuro) si aspetta il codice pilota sotto quel nome — driverMap è
// già una select('*') su drivers, quindi driver_code è già
// disponibile senza query aggiuntive.
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
    const simFilter = payload?.sim ? String(payload.sim) : null;

    const { data: me, error: meErr } = await supabase
      .from('drivers')
      .select('role')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (meErr) return json({ ok: false, error: meErr.message }, 400);
    if (!me) return json({ ok: false, error: 'Driver non collegato a questo account' }, 404);

    const isAdmin = me.role === 'admin';
    const includeExVsd = isAdmin && (payload?.include_ex_vsd === true || payload?.include_ex_vsd === 'true');

    let lapsQuery = supabase.from('best_laps').select('*');
    if (simFilter) lapsQuery = lapsQuery.eq('sim', simFilter);
    const { data: laps, error: lapsErr } = await lapsQuery;
    if (lapsErr) return json({ ok: false, error: lapsErr.message }, 400);

    const { data: drivers, error: driversErr } = await supabase.from('drivers').select('*');
    if (driversErr) return json({ ok: false, error: driversErr.message }, 400);

    const { data: cars, error: carsErr } = await supabase.from('cars').select('car_id, race_class');
    if (carsErr) return json({ ok: false, error: carsErr.message }, 400);

    const driverMap: Record<string, any> = {};
    (drivers ?? []).forEach((d: any) => { driverMap[d.id] = d; });

    const carRaceClass: Record<string, string | null> = {};
    (cars ?? []).forEach((c: any) => {
      if (c.car_id) carRaceClass[c.car_id] = (c.race_class && String(c.race_class).trim()) || null;
    });

    function isExVsd(driverId: string): boolean {
      const d = driverMap[driverId];
      if (!d) return false;
      return Boolean(d.removed_at) || d.status !== 'active';
    }

    function isEligible(driverId: string): boolean {
      const d = driverMap[driverId];
      if (!d) return false;
      if (d.is_system_account) return false;
      if (includeExVsd) return true;
      return !isExVsd(driverId);
    }

    const filtered = (laps ?? []).filter((l: any) => {
      if (!l.driver_id || !l.sim || !l.track_id) return false;
      const ms = Number(l.lap_time_ms);
      if (!ms || ms <= 0) return false;
      return isEligible(l.driver_id);
    });

    const recordsByKey: Record<string, { lap: any; race_class: string | null }> = {};
    filtered.forEach((l: any) => {
      const raceClass = carRaceClass[l.car_id] ?? null;
      const key = `${l.sim}|${l.track_id}|${raceClass || ''}`;
      const ms = Number(l.lap_time_ms);
      if (!recordsByKey[key] || ms < Number(recordsByKey[key].lap.lap_time_ms)) {
        recordsByKey[key] = { lap: l, race_class: raceClass };
      }
    });

    const records = Object.values(recordsByKey)
      .map(entry => {
        const l = entry.lap;
        const d = driverMap[l.driver_id];
        return {
          sim: l.sim,
          track_id: l.track_id,
          race_class: entry.race_class,
          driver_id: (d && d.driver_code) || l.driver_id,
          display_name: (d && d.display_name) || l.driver_id,
          lap_time_ms: Number(l.lap_time_ms),
          lap_time_display: l.lap_time_display || '',
          car_id: l.car_id || '',
          set_date: l.set_date || '',
          verified: Boolean(l.garage61_lap_id),
          is_ex_vsd: isExVsd(l.driver_id),
        };
      })
      .sort((a, b) =>
        a.sim.localeCompare(b.sim) ||
        a.track_id.localeCompare(b.track_id) ||
        String(a.race_class || 'zzz').localeCompare(String(b.race_class || 'zzz')),
      );

    return json({ ok: true, data: { records, count: records.length } });
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
