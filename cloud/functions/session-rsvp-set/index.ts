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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SESSION_RSVP_STATUSES = ['confirmed', 'declined', 'tentative'];

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
    const status = String(payload?.status || '').trim();
    if (!sessionId) return json({ ok: false, error: 'session_id obbligatorio' }, 400);
    if (!SESSION_RSVP_STATUSES.includes(status)) {
      return json({ ok: false, error: 'status non valido — atteso uno tra: ' + SESSION_RSVP_STATUSES.join(', ') }, 400);
    }

    const { data: me, error: meErr } = await supabase
      .from('drivers')
      .select('id, driver_code')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (meErr) return json({ ok: false, error: meErr.message }, 400);
    if (!me) return json({ ok: false, error: 'Driver non collegato a questo account' }, 404);

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
