// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — sessionRsvp.set (porting di TeamSessionsScheduler.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handleSessionRsvpSet):
//   - auth richiesto
//   - session_id + status obbligatori, status uno tra
//     SESSION_RSVP_STATUSES (confirmed/declined/tentative)
//   - upsert della PROPRIA riga soltanto, per (session_id, driver_id)
//     — mai la riga di qualcun altro
//
// driver_id sempre dal contesto (mai dal payload), come in
// roster-update-self. L'upsert usa lo unique(session_id, driver_id)
// definito in 008 — niente più il loop manuale "cerca riga esistente,
// altrimenti appendRow" del sistema reale: qui è un singolo
// .upsert(..., { onConflict: 'session_id,driver_id' }) atomico.
//
// FIX #331: la riga si salva con driver_id = UUID interno (corretto,
// è la FK reale verso drivers.id) ma la risposta al frontend deve
// esporre lo stesso contratto driver_id=driver_code usato ovunque
// (vedi session-rsvp-list) — per coerenza, anche se oggi nessun
// consumer legge il valore di ritorno di questa mutation (solo
// invalidateQueries).
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

const SESSION_RSVP_STATUSES = ['confirmed', 'declined', 'tentative'];

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
          .select('id, team_id, driver_code')
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
    const status = String(payload?.status || '').trim();
    if (!sessionId) return json({ ok: false, error: 'session_id obbligatorio' }, 400);
    if (!SESSION_RSVP_STATUSES.includes(status)) {
      return json({ ok: false, error: 'status non valido — atteso uno tra: ' + SESSION_RSVP_STATUSES.join(', ') }, 400);
    }

    // Con client service-role (fallback legacy) la RLS è bypassata: si
    // verifica esplicitamente che la sessione appartenga al team di chi
    // chiama prima di scrivere la RSVP.
    const { data: sessionRow } = await supabase
      .from('team_sessions')
      .select('id, team_id')
      .eq('id', sessionId)
      .maybeSingle();
    if (!sessionRow || sessionRow.team_id !== me.team_id) {
      return json({ ok: false, error: 'Sessione non trovata: ' + sessionId }, 404);
    }

    const note = payload?.note ? String(payload.note) : null;
    const upsertRow = {
      session_id: sessionId,
      driver_id: me.id,
      status,
      note,
      responded_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('session_rsvps')
      .upsert(upsertRow, { onConflict: 'session_id,driver_id' })
      .select()
      .maybeSingle();

    if (error) return json({ ok: false, error: error.message }, 400);

    const rsvp = data ? { ...data, driver_id: me.driver_code } : data;

    return json({ ok: true, data: { rsvp } });
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
