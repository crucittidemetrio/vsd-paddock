// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — teamSessions.list (porting di TeamSessionsScheduler.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handleTeamSessionsList):
//   - auth richiesto
//   - visibile a CHIUNQUE sia loggato nel team, non solo staff —
//     il team deve sapere quando sono gli allenamenti.
//
// FIX #331 (trovato validando #330 prima di proseguire, non da
// analisi statica): la PK Postgres si chiama `id`, ma TUTTO il
// frontend (Calendar.jsx: `race_id: s.session_id`; AdminTeamSessions.jsx:
// `key={s.session_id}`, `handleRemove(s.session_id, ...)`) legge
// `session_id` — il nome usato da sempre da Apps Script (dove la riga
// del foglio esponeva quel campo). Senza questo alias, `s.session_id`
// era `undefined` per ogni sessione: il pannello RSVP in Calendar.jsx
// riceveva `sessionId=undefined` e ogni tentativo di conferma presenza
// falliva con "session_id obbligatorio" (session-rsvp-set lo valida
// per primo) — bug silenzioso lato UI, visibile solo provando a
// rispondere. Stesso principio del fix driver_id in roster (#329) e
// session_rsvps (#331): si alias nell'output, mai nello schema.
// `created_by` è lo UUID interno (FK drivers.id) ma AdminTeamSessions.jsx
// lo confronta con `driver.driver_id` (il codice, es. VSD005) per
// decidere se mostrare il tasto elimina al pilota che ha creato la
// sessione — stesso fix, join su drivers.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function toSession(t: any) {
  const { id, created_by, drivers, ...rest } = t;
  return { ...rest, session_id: id, created_by: drivers?.driver_code ?? null };
}

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

    const { data, error } = await supabase
      .from('team_sessions')
      .select('*, drivers(driver_code)')
      .order('datetime_start', { ascending: true });
    if (error) return json({ ok: false, error: error.message }, 400);

    const sessions = (data ?? []).map(toSession);
    return json({ ok: true, data: { sessions, count: sessions.length } });
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
