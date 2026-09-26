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

const LEGACY_API_URL = 'https://script.google.com/macros/s/AKfycbyMXxEjZfm5EIsGUnKxpwtBtoeR4hwMG7Pl8ZESF8yG569SS0aIdsWqyu9PdBgR14vLiA/exec';

// FIX (26/09/2026, segnalato da Demetrio — "Sessioni team da errore"):
// stesso identico gap già chiuso in races-get/standings-by-championship
// e decine di altre funzioni. Stesso fallback identico.
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

const TEAM_SESSION_TYPES_OPEN = ['allenamento_libero', 'allenamento_collettivo'];

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
          .select('id, team_id, role')
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

    // Con client service-role (fallback legacy) la RLS è bypassata: lo
    // scoping team_id va applicato esplicitamente qui.
    const { data: session, error: sessionErr } = await supabase
      .from('team_sessions')
      .select('id, type, created_by')
      .eq('id', sessionId)
      .eq('team_id', me.team_id)
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
