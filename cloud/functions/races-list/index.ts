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
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Fallback token legacy (stesso pattern #331/#358/#359, esteso qui il
// 21/09/2026 — gap trovato diagnosticando "sistema non più utilizzabile
// da notebook", segnalato da Demetrio: races.list non aveva mai
// ricevuto questo fallback nei giri precedenti, quindi falliva con
// "Auth richiesto" per qualunque pilota senza una sessione Supabase
// reale — cioè quasi chiunque, tranne su un browser con una vecchia
// sessione di test rimasta agganciata).
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

    const statusFilter = payload?.status ? String(payload.status) : null;

    // Con client service-role (fallback legacy) la RLS è bypassata: lo
    // scoping team_id va applicato esplicitamente qui (con sessione
    // Supabase reale è ridondante ma innocuo, la RLS lo farebbe comunque).
    let query = supabase.from('races').select('*').eq('team_id', me.team_id).order('date', { ascending: true });
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
