// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — rsvp.set (porting fedele di
// apps-script/RaceRSVP.js, handleRsvpSet)
// ═══════════════════════════════════════════════════════════
// Il pilota loggato imposta/aggiorna la PROPRIA risposta per una
// gara. driver_id è sempre risolto dall'auth (mai dal payload).
// Upsert per (race_id, driver_id) — qui via constraint DB nativo
// invece della scansione manuale del sorgente (cerca riga esistente,
// altrimenti appende).
//
// FIX (23/09/2026 — stesso audit di rsvp-list, vedi nota lì per il
// perché): aggiunto fallback token legacy (senza il quale nessun
// pilota reale può usare questa azione), e la riga restituita ora
// espone driver_id come driver_code invece dello UUID interno, per
// coerenza con tutto il resto del contratto frontend.
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

const RSVP_STATUSES = ['confirmed', 'declined', 'tentative'];

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
    const status = payload?.status ? String(payload.status).trim() : '';
    if (!raceId) return json({ ok: false, error: 'race_id obbligatorio' }, 400);
    if (!RSVP_STATUSES.includes(status)) {
      return json({ ok: false, error: 'status non valido — atteso uno tra: ' + RSVP_STATUSES.join(', ') }, 400);
    }

    const row = {
      team_id: me.team_id,
      race_id: raceId,
      driver_id: me.id,
      status,
      note: payload?.note ? String(payload.note) : null,
      responded_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('race_rsvps')
      .upsert(row, { onConflict: 'race_id,driver_id' })
      .select()
      .maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 400);

    const result = data ? { ...data, driver_id: me.driver_code ?? data.driver_id } : data;

    return json({ ok: true, data: result });
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
