// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — raceCrews.add (porting fedele di
// apps-script/RaceCrews.js, handleRaceCrewsAdd)
// ═══════════════════════════════════════════════════════════
// Auth: staff/admin. Un pilota sta su UNA sola vettura per gara —
// il sorgente lo verifica con due scan applicativi (alreadyOnThisCar/
// onAnotherCar); qui l'unique(race_id, driver_id) sul DB lo garantisce
// a livello di schema, ma controlliamo comunque prima per dare lo
// stesso messaggio d'errore specifico del sorgente invece di un
// generico errore di constraint violation.
//
// FIX (23/09/2026 — stesso audit di rsvp-list, vedi nota lì per il
// perché): aggiunto fallback token legacy (senza il quale nessuno
// staff reale può usare questa azione), e payload.driver_id è per
// contratto il driver_code (es. VSD005, coerente con AdminRaceStints.
// jsx: <option value={d.driver_id}> dove d.driver_id È il codice) —
// va risolto sullo UUID interno prima di ogni query, mai passato
// direttamente al DB.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    if (me.role !== 'staff' && me.role !== 'admin') {
      return json({ ok: false, error: 'Permessi insufficienti' }, 403);
    }

    const raceId = payload?.race_id ? String(payload.race_id).trim() : '';
    const carNumber = payload?.car_number ? String(payload.car_number).trim() : '';
    const driverCode = payload?.driver_id ? String(payload.driver_id).trim() : '';
    if (!raceId) return json({ ok: false, error: 'race_id obbligatorio' }, 400);
    if (!carNumber) return json({ ok: false, error: 'car_number obbligatorio (numero di gara della vettura, es. "7")' }, 400);
    if (!driverCode) return json({ ok: false, error: 'driver_id obbligatorio' }, 400);

    const { data: targetDriver, error: targetErr } = await supabase
      .from('drivers')
      .select('id, driver_code')
      .eq('driver_code', driverCode)
      .maybeSingle();
    if (targetErr) return json({ ok: false, error: targetErr.message }, 400);
    if (!targetDriver) return json({ ok: false, error: 'Pilota non trovato: ' + driverCode }, 404);
    const driverId = targetDriver.id;

    const { data: existing, error: existErr } = await supabase
      .from('race_crews')
      .select('car_number, driver_id')
      .eq('race_id', raceId);
    if (existErr) return json({ ok: false, error: existErr.message }, 400);

    const alreadyOnThisCar = (existing ?? []).find((c: any) => c.car_number === carNumber && c.driver_id === driverId);
    if (alreadyOnThisCar) return json({ ok: false, error: 'Pilota già assegnato a questa vettura' }, 400);

    const onAnotherCar = (existing ?? []).find((c: any) => c.driver_id === driverId && c.car_number !== carNumber);
    if (onAnotherCar) {
      return json({ ok: false, error: `Pilota già assegnato alla vettura #${onAnotherCar.car_number} su questa gara — un pilota guida una sola vettura per evento` }, 400);
    }

    const insertRow = {
      team_id: me.team_id,
      race_id: raceId,
      car_number: carNumber,
      driver_id: driverId,
      notes: payload?.notes ? String(payload.notes) : null,
      added_at: new Date().toISOString(),
      added_by: me.id,
    };

    const { data, error } = await supabase.from('race_crews').insert(insertRow).select().maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 400);

    const crew = data ? { ...data, driver_id: targetDriver.driver_code } : data;

    return json({ ok: true, data: { crew } });
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
