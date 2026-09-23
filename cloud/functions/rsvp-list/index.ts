// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — rsvp.list (porting fedele di
// apps-script/RaceRSVP.js, handleRsvpList)
// ═══════════════════════════════════════════════════════════
// Auth: qualsiasi membro del team loggato — visibile a tutta la
// squadra, non solo allo staff (fedele al sorgente).
//
// FIX (23/09/2026 — dominio #253 mai effettivamente rifinito dopo il
// porting iniziale, scoperto durante l'audit generale richiesto da
// Demetrio "verifica cosa è necessario migrare ancora"): questa
// funzione non era mai stata toccata da nessuna delle campagne di fix
// già applicate a ~25 altre Edge Function di questo progetto, quindi
// aveva ANCORA entrambi i bug tipici:
//   1. Nessun fallback token legacy — 401 "Auth richiesto" per
//      chiunque non avesse mai rifatto login con una sessione
//      Supabase vera (quasi tutti i piloti reali).
//   2. race_rsvps.driver_id è lo UUID interno (FK drivers.id), ma il
//      frontend (useRaceRSVP.js → RaceDetail.jsx: respondedIds.has(
//      d.driver_id) confrontato con activeDrivers che usa driver_code)
//      si aspetta il codice pilota (VSD005) sotto quel nome — stesso
//      identico pattern già fixato in best-laps-list e ~6 altre
//      Edge Function.
// Fix: aggiunto lo stesso fallback + join drivers usati altrove.
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

    const raceId = payload?.race_id ? String(payload.race_id).trim() : '';
    if (!raceId) return json({ ok: false, error: 'race_id obbligatorio' }, 400);

    const { data: rsvps, error } = await supabase
      .from('race_rsvps')
      .select('id, race_id, driver_id, status, note, responded_at, drivers!race_rsvps_driver_id_fkey(driver_code)')
      .eq('race_id', raceId);
    if (error) return json({ ok: false, error: error.message }, 400);

    const mapped = (rsvps ?? []).map((r: any) => {
      const { drivers, ...rest } = r;
      return { ...rest, driver_id: drivers?.driver_code ?? r.driver_id };
    });

    return json({ ok: true, data: { rsvps: mapped, count: mapped.length } });
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
