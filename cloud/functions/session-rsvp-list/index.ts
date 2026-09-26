// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — sessionRsvp.list (porting di TeamSessionsScheduler.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handleSessionRsvpList):
//   - auth richiesto
//   - session_id obbligatorio
//   - visibile a CHIUNQUE sia loggato nel team — serve sapere chi
//     ci sarà, non solo allo staff.
//
// Team scoping via RLS "session_rsvps: il team legge tutte le
// risposte" (008, join su team_sessions.team_id) — qui il filtro
// applicativo è solo session_id, come nel sistema reale.
//
// FIX #331 (trovato validando Best Laps, poi verificato qui prima di
// procedere): session_rsvps.driver_id in Postgres è lo UUID interno
// (FK verso drivers.id) — MAI il codice pilota ("VSD005") che tutto
// il frontend (EntityRSVP.jsx: `rsvps.find(r => r.driver_id ===
// currentDriverId)`, join id→nome via roster) si aspetta sotto quel
// nome, per coerenza col contratto ereditato da Apps Script. Senza
// join, ogni riga tornava con driver_id=UUID: il confronto con
// currentDriverId ("VSD005") falliva sempre, quindi né il
// riconoscimento "la tua risposta" né il join coi nomi funzionavano
// più — bug silenzioso (nessun errore in console, solo dati poco
// significativi), stesso pattern del bug driver_id in roster (#329)
// ma qui sull'intero schema, non solo su drivers. Fix: join su
// drivers e si restituisce driver_code sotto la chiave driver_id.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LEGACY_API_URL = 'https://script.google.com/macros/s/AKfycbyMXxEjZfm5EIsGUnKxpwtBtoeR4hwMG7Pl8ZESF8yG569SS0aIdsWqyu9PdBgR14vLiA/exec';

// FIX (26/09/2026, segnalato da Demetrio — "Anche Sessioni team da
// errore, come Analisi di Passo"): stesso identico gap già chiuso in
// races-get/standings-by-championship/team-sessions-*. Stesso fallback identico.
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
          .select('id, team_id')
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

    const sessionId = String(payload?.session_id || '').trim();
    if (!sessionId) return json({ ok: false, error: 'session_id obbligatorio' }, 400);

    // Con client service-role (fallback legacy) la RLS è bypassata: si
    // verifica esplicitamente che la sessione appartenga al team di chi
    // chiama prima di esporre le RSVP.
    const { data: sessionRow } = await supabase
      .from('team_sessions')
      .select('id, team_id')
      .eq('id', sessionId)
      .maybeSingle();
    if (!sessionRow || sessionRow.team_id !== me.team_id) {
      return json({ ok: false, error: 'Sessione non trovata: ' + sessionId }, 404);
    }

    const { data, error } = await supabase
      .from('session_rsvps')
      .select('status, note, responded_at, session_id, drivers(driver_code)')
      .eq('session_id', sessionId);
    if (error) return json({ ok: false, error: error.message }, 400);

    const rsvps = (data ?? []).map((r: any) => ({
      session_id: r.session_id,
      driver_id: r.drivers?.driver_code ?? null,
      status: r.status,
      note: r.note,
      responded_at: r.responded_at,
    }));

    return json({ ok: true, data: { rsvps, count: rsvps.length } });
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
