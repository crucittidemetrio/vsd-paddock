// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — raceResults.list (porting di apps-script/RaceResults.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handleRaceResultsList):
//   - filtri opzionali: race_id, session_type, driver_id, limit, sort
//     ('date_desc' | 'date_asc', default: car_class + finish_position)
//   - restituisce SOLO un sottoinsieme curato di colonne — incidents,
//     imported_at, raw_payload sono scritti dall'import ma MAI
//     restituiti da list, fedele al sorgente.
//
// DEVIAZIONE DELIBERATA: qui richiede auth. Nel sorgente reale
// handleRaceResultsList non fa ALCUN controllo ctx — è un endpoint
// pubblico (Wave 10.3: "anonymous è un tier valido per endpoint
// pubblici"). In questo schema multi-tenant condiviso non esiste un
// modo pulito di scoping team_id per un visitatore anonimo senza un
// parametro aggiuntivo — fuori scope per questa fase, vedi nota in
// 016_race_results.sql.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Fallback token legacy (stesso pattern #331/#358/#359, esteso il
// 21/09/2026 — vedi nota completa in races-list/index.ts).
const LEGACY_API_URL = 'https://script.google.com/macros/s/AKfycbyMXxEjZfm5EIsGUnKxpwtBtoeR4hwMG7Pl8ZESF8yG569SS0aIdsWqyu9PdBgR14vLiA/exec';

async function resolveLegacyDriver(serviceClient: any, legacyToken: string | undefined) {
  if (!legacyToken) return null;
  try {
    const r = await fetch(LEGACY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'auth.verify', token: legacyToken, payload: {} }),
    });
    const j = await r.json();
    const driverCode = j?.ok && j.data?.valid ? j.data?.driver?.driver_id : null;
    if (!driverCode) return null;
    const { data: d } = await serviceClient
      .from('drivers')
      .select('id, team_id, role, display_name, driver_code')
      .eq('driver_code', driverCode)
      .maybeSingle();
    if (!d) return null;
    return { ...d, role: j.data.driver.role || d.role };
  } catch {
    return null;
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const payload = await req.json().catch(() => ({}));
    const authHeader = req.headers.get('Authorization');
    let supabase: any = null;
    let me: any = null;

    if (authHeader) {
      supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: meRow } = await supabase
          .from('drivers')
          .select('id, team_id, role, display_name, driver_code')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        me = meRow || null;
      }
    }

    if (!me) {
      const legacyServiceClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const legacyMe = await resolveLegacyDriver(legacyServiceClient, payload?.legacy_token);
      if (legacyMe) {
        me = legacyMe;
        supabase = legacyServiceClient;
      }
    }

    if (!me) return json({ ok: false, error: 'Auth richiesto' }, 401);

    const raceIdFilter = payload?.race_id ? String(payload.race_id) : null;
    const sessionFilter = payload?.session_type ? String(payload.session_type) : null;
    const driverIdFilter = payload?.driver_id ? String(payload.driver_id) : null;
    const limit = payload?.limit ? Number(payload.limit) : null;
    const sortOrder = payload?.sort ? String(payload.sort) : null;

    let query = supabase.from('race_results').select('*').eq('team_id', me.team_id);
    if (raceIdFilter) query = query.eq('race_id', raceIdFilter);
    if (sessionFilter) query = query.eq('session_type', sessionFilter);
    if (driverIdFilter) {
      // il filtro arriva come driver_code: lo traduco in UUID
      const { data: dm } = await supabase.from('drivers').select('id').eq('team_id', me.team_id).eq('driver_code', driverIdFilter).maybeSingle();
      query = query.eq('driver_id', dm?.id ?? '00000000-0000-0000-0000-000000000000');
    }

    const { data, error } = await query;
    if (error) return json({ ok: false, error: error.message }, 400);

    // #467: race_results.driver_id è l'UUID interno; il frontend (roster,
    // driverMap) ragiona in driver_code (VSDxxx). Senza questa traduzione
    // ogni riga VSD non trovava il pilota e /results restava vuota.
    const { data: drvRows } = await supabase
      .from('drivers').select('id, driver_code').eq('team_id', me.team_id);
    const codeById: Record<string, string> = {};
    (drvRows ?? []).forEach((d: any) => { if (d.driver_code) codeById[d.id] = d.driver_code; });

    let results = (data ?? []).map((r: any) => ({
      result_id: r.result_id,
      race_id: r.race_id || '',
      sim: r.sim || '',
      track_id: r.track_id || '',
      set_date: r.set_date || '',
      session_type: r.session_type || '',
      car_class: r.car_class || '',
      car_num: r.car_num ?? null,
      car_external_name: r.car_external_name || '',
      driver_id: codeById[r.driver_id] || '',
      driver_name_external: r.driver_name_external || '',
      total_laps: r.total_laps ?? null,
      best_lap_ms: r.best_lap_ms ?? null,
      best_lap_display: r.best_lap_display || '',
      total_time_ms: r.total_time_ms ?? null,
      total_time_display: r.total_time_display || '',
      finish_position: r.finish_position ?? null,
      points_given: r.points_given ?? null,
      penalty_points: r.penalty_points ?? null,
      point_total: r.point_total ?? null,
      dnf: r.dnf === true,
      dns: r.dns === true,
      is_vsd_driver: r.is_vsd_driver === true,
    }));

    if (sortOrder === 'date_desc') {
      results.sort((a, b) => String(b.set_date).localeCompare(String(a.set_date)));
    } else if (sortOrder === 'date_asc') {
      results.sort((a, b) => String(a.set_date).localeCompare(String(b.set_date)));
    } else {
      results.sort((a, b) => {
        if (a.car_class !== b.car_class) return a.car_class.localeCompare(b.car_class);
        return (a.finish_position || 999) - (b.finish_position || 999);
      });
    }

    const totalAvailable = results.length;
    const finalResults = limit && limit > 0 ? results.slice(0, limit) : results;

    return json({ ok: true, data: { results: finalResults, count: finalResults.length, totalAvailable } });
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
