// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — races.list (porting di apps-script/Races.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handleRacesList):
//   - auth richiesto (qualsiasi ruolo, nessun gate staff/admin)
//   - filtro opzionale payload.status (match esatto, nessuna
//     validazione contro un enum — coerente col sorgente)
//   - ordinamento per data crescente
//
// DIFFERENZA deliberata: championship_name è sempre null qui. Nel
// sorgente reale viene arricchito con un JOIN su getChampionshipNameMap_()
// (tab Championships). Quel dominio non è ancora portato in cloud/
// (Fase 2, task #252) — il campo resta nella risposta per compatibilità
// col frontend reale, ma è sempre null finché Championships non esiste.
// L'isolamento multi-tenant lo fa la RLS (current_driver_team_id()),
// non serve filtrare team_id qui.
//
// v3 (24/09/2026, unificazione segnalazione incidenti — "stesso
// sistema per tutto"): aggiunto un path ANONIMO (team_slug), stesso
// pattern service-role di roster-list/incidents-report/clash-*. Serve
// a popolare il selettore "Gara" nel form di segnalazione incidenti
// anche per un visitatore non loggato (community esterna UE144) — la
// funzione resta comunque auth-first (sessione o legacy token hanno
// sempre priorità), il ramo anonimo è solo un fallback quando nessuno
// dei due è presente, mai un downgrade di sicurezza per un chiamante
// autenticato.
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
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const authHeader = req.headers.get('Authorization');
    let supabase: any = null;
    let teamId: string | null = null;

    if (authHeader) {
      supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: meRow } = await serviceClient
          .from('drivers')
          .select('team_id')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        if (meRow) teamId = meRow.team_id;
      }
    }

    if (!teamId) {
      const legacyMe = await resolveLegacyDriver(serviceClient, payload?.legacy_token);
      if (legacyMe) {
        teamId = legacyMe.team_id;
        supabase = serviceClient;
      }
    }

    if (!teamId) {
      const teamSlug = payload?.team_slug ? String(payload.team_slug).trim() : '';
      if (!teamSlug) return json({ ok: false, error: 'Auth richiesto' }, 401);
      const { data: team, error: teamErr } = await serviceClient
        .from('teams')
        .select('id')
        .eq('slug', teamSlug)
        .maybeSingle();
      if (teamErr) return json({ ok: false, error: teamErr.message }, 400);
      if (!team) return json({ ok: false, error: 'Team non trovato: ' + teamSlug }, 404);
      teamId = team.id;
      supabase = serviceClient;
    }

    const statusFilter = payload?.status ? String(payload.status) : null;

    // Con client service-role (fallback legacy/anonimo) la RLS è
    // bypassata: lo scoping team_id va applicato esplicitamente qui
    // (con sessione Supabase reale è ridondante ma innocuo).
    let query = supabase.from('races').select('*').eq('team_id', teamId).order('date', { ascending: true });
    if (statusFilter) query = query.eq('status', statusFilter);

    const { data, error } = await query;
    if (error) return json({ ok: false, error: error.message }, 400);

    const races = (data ?? []).map((r: any) => ({ ...r, championship_name: null }));

    return json({ ok: true, data: { races, count: races.length } });
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
