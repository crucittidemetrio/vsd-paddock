// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — roster.adminUpdate (NUOVA — non esiste equivalente
// diretto in apps-script/Roster.js: là la gestione stato/ruolo/rimozione
// pilota avveniva editando a mano il Google Sheet Drivers)
// ═══════════════════════════════════════════════════════════
// GAP CHIUSO (19/09/2026, segnalato da Demetrio): dopo il cutover #329,
// il Roster pubblico legge da Supabase, ma NESSUNA funzione scriveva
// status/role/removed_at su Supabase — l'unico modo per "cambiare
// stato" a un pilota era modificare il vecchio Google Sheet, che da
// quel momento non è più sincronizzato in tempo reale col sito. Un
// admin che si segnava come inattivo (o segnava un altro pilota)
// vedeva la modifica sparire nel nulla lato sito reale. Questa
// funzione chiude il gap: primo endpoint che scrive questi campi
// direttamente su Supabase, così il sito torna a essere l'unica fonte
// scrivibile per la gestione roster.
//
// Auth: SOLO staff/admin. Il campo `role` è modificabile SOLO da
// admin (uno staff non può promuoversi/promuovere altri a staff/admin
// né retrocedere un admin). `status`/`removed_at`/`race_number` sono
// modificabili sia da staff che da admin.
//
// driver_id nel payload è il driver_code (VSD00X), MAI l'uuid interno
// — stesso contratto ormai uniforme in tutto il progetto (#329/#330/
// #331). Risolto al team del chiamante, mai cross-team.
//
// L'account di sistema (is_system_account=true, es. VSD001) non è
// mai modificabile da questo endpoint.
//
// removed_at: string ISO per marcare "ex pilota", oppure null
// esplicito per reintegrare (non basta ometterlo — omesso = non
// toccato). Nessuna modifica automatica di status quando si tocca
// removed_at: è l'admin a decidere esplicitamente entrambi i campi.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const VALID_STATUS = ['active', 'trial', 'inactive'];
const VALID_ROLE = ['driver', 'staff', 'admin'];

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
    const targetDriverCode = payload?.driver_id ? String(payload.driver_id).trim() : '';
    if (!targetDriverCode) return json({ ok: false, error: 'driver_id (driver_code) obbligatorio' }, 400);

    const { data: me, error: meErr } = await supabase
      .from('drivers')
      .select('id, team_id, role')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (meErr) return json({ ok: false, error: meErr.message }, 400);
    if (!me) return json({ ok: false, error: 'Driver non collegato a questo account' }, 404);
    if (me.role !== 'staff' && me.role !== 'admin') {
      return json({ ok: false, error: 'Permessi insufficienti' }, 403);
    }

    // Service role: bypassa RLS. Il gate di autorizzazione è tutto qui
    // sopra (ruolo del chiamante) — stesso principio già usato in
    // roster-list per la risoluzione team-scoped.
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: target, error: targetErr } = await serviceClient
      .from('drivers')
      .select('id, is_system_account')
      .eq('team_id', me.team_id)
      .eq('driver_code', targetDriverCode)
      .maybeSingle();
    if (targetErr) return json({ ok: false, error: targetErr.message }, 400);
    if (!target) return json({ ok: false, error: 'Driver non trovato nel team: ' + targetDriverCode }, 404);
    if (target.is_system_account) return json({ ok: false, error: 'Account di sistema non modificabile' }, 400);

    const updates: Record<string, unknown> = {};

    if ('status' in payload) {
      const status = String(payload.status);
      if (!VALID_STATUS.includes(status)) {
        return json({ ok: false, error: 'status non valido. Ammessi: ' + VALID_STATUS.join(', ') }, 400);
      }
      updates.status = status;
    }

    if ('role' in payload) {
      if (me.role !== 'admin') {
        return json({ ok: false, error: 'Solo un admin può modificare il ruolo' }, 403);
      }
      const role = String(payload.role);
      if (!VALID_ROLE.includes(role)) {
        return json({ ok: false, error: 'role non valido. Ammessi: ' + VALID_ROLE.join(', ') }, 400);
      }
      updates.role = role;
    }

    if ('removed_at' in payload) {
      const value = payload.removed_at;
      if (value === null) {
        updates.removed_at = null;
      } else {
        const d = new Date(String(value));
        if (isNaN(d.getTime())) return json({ ok: false, error: 'removed_at non valido (attesa data ISO o null)' }, 400);
        updates.removed_at = d.toISOString();
      }
    }

    if ('race_number' in payload) {
      const value = payload.race_number;
      updates.race_number = value === null || value === '' ? null : Number(value);
    }

    if (Object.keys(updates).length === 0) {
      return json({ ok: false, error: 'Nessun campo valido da aggiornare' }, 400);
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await serviceClient
      .from('drivers')
      .update(updates)
      .eq('id', target.id)
      .select()
      .maybeSingle();

    if (error) return json({ ok: false, error: error.message }, 400);
    if (!data) return json({ ok: false, error: 'Aggiornamento non riuscito' }, 500);

    const driver = { ...data, driver_id: data.driver_code, is_ex_vsd: !!data.removed_at };

    return json({ ok: true, data: { driver } });
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
