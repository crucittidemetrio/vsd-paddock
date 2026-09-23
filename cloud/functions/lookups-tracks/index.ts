// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — lookups.tracks (porting di apps-script/Lookups.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handleLookupsTracks): identica a
// lookups-cars ma sulla tabella tracks (catalogo globale, vedi 009).
//
// FIX (23/09/2026, richiesto da Demetrio dopo aver notato che due
// tracciati LMU aggiunti direttamente su Supabase non comparivano sul
// sito): causa non di questo file ma di client.js — lookups.tracks/
// lookups.cars non erano mai stati aggiunti a SUPABASE_MIGRATED_ACTIONS,
// quindi il sito ha continuato a leggere il catalogo dal vecchio
// Google Sheet via Apps Script, ignorando questa Edge Function pur
// gia' deployata. Aggiunto qui il fallback token legacy — stesso
// pattern gia' usato in ~25 altre Edge Function di questo progetto
// (best-laps-list, roster-list, ecc.) — perche' quasi nessun pilota
// reale ha mai una sessione Supabase vera (solo il token Discord OAuth
// legacy via Apps Script): senza questo fallback, attivare il cutover
// in SUPABASE_MIGRATED_ACTIONS avrebbe bloccato con 401 "Auth richiesto"
// chiunque non avesse rifatto login — che e' esattamente quanto
// Demetrio ha chiesto di evitare (i piloti non useranno mai un account
// Supabase separato: e' sempre lo stesso login Discord di sempre).
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

    const sim = payload?.sim ? String(payload.sim) : null;

    let query = supabase.from('tracks').select('*').eq('active', true);
    if (sim) query = query.eq('sim', sim);

    const { data, error } = await query;
    if (error) return json({ ok: false, error: error.message }, 400);

    const tracks = (data ?? []).sort((a: any, b: any) =>
      String(a.track_name || '').toLowerCase().localeCompare(String(b.track_name || '').toLowerCase()),
    );

    return json({ ok: true, data: { tracks, count: tracks.length } });
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
