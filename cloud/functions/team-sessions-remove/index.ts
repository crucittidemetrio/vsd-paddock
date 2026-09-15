// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — teamSessions.remove (porting di TeamSessionsScheduler.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handleTeamSessionsRemove):
//   - auth richiesto
//   - staff/admin possono cancellare QUALUNQUE sessione
//   - un driver non-staff può cancellare SOLO una sessione che ha
//     creato lui stesso E il cui type è ancora "aperto"
//     (allenamento_libero/allenamento_collettivo) — stesso limite
//     applicato in create, per coerenza: chi ha organizzato un
//     allenamento può anche disdirlo
//   - hard delete (niente soft-delete, come il sistema reale) — le
//     RSVP legate vengono eliminate a cascata (qui via FK
//     on delete cascade, non un loop manuale come
//     deleteSessionRsvpsForSession_)
//
// Il controllo si fa qui PRIMA del delete (leggendo la riga) per
// poter restituire lo stesso messaggio d'errore puntuale del sistema
// reale ("Puoi cancellare solo gli allenamenti che hai creato tu...")
// invece del generico 0-righe-toccate che darebbe un DELETE bloccato
// solo dalla RLS. La RLS "team_sessions: staff o autore (se tipo
// aperto) cancellano" (008) resta comunque la barriera reale — qui è
// difesa in profondità per l'UX dell'errore, non l'unica guardia.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TEAM_SESSION_TYPES_OPEN = ['allenamento_libero', 'allenamento_collettivo'];

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
    if (!sessionId) return json({ ok: false, error: 'session_id obbligatorio' }, 400);

    const { data: me, error: meErr } = await supabase
      .from('drivers')
      .select('id, role')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (meErr) return json({ ok: false, error: meErr.message }, 400);
    if (!me) return json({ ok: false, error: 'Driver non collegato a questo account' }, 404);

    const { data: session, error: sessionErr } = await supabase
      .from('team_sessions')
      .select('id, type, created_by')
      .eq('id', sessionId)
      .maybeSingle();
    if (sessionErr) return json({ ok: false, error: sessionErr.message }, 400);
    if (!session) return json({ ok: false, error: 'Sessione non trovata: ' + sessionId }, 404);

    const isStaff = me.role === 'staff' || me.role === 'admin';
    if (!isStaff) {
      const isOwnOpenSession = session.created_by === me.id && TEAM_SESSION_TYPES_OPEN.includes(session.type);
      if (!isOwnOpenSession) {
        return json(
          { ok: false, error: 'Puoi cancellare solo gli allenamenti che hai creato tu — per le altre sessioni serve staff/admin' },
          403,
        );
      }
    }

    const { error: deleteErr } = await supabase.from('team_sessions').delete().eq('id', sessionId);
    if (deleteErr) return json({ ok: false, error: deleteErr.message }, 400);

    return json({ ok: true, data: { deleted: true, session_id: sessionId } });
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
