// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — races.get (porting di apps-script/Races.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handleRacesGet):
//   - auth richiesto
//   - payload.race_id obbligatorio
//   - 404 se non trovata (o non del team del chiamante — RLS)
//
// championship_name: sempre null, stesso motivo di races-list/upcoming
// (Championships non ancora portato, vedi #252).
//
// FIX (23/09/2026 — trovato validando live via Chrome dopo il push di
// Demetrio, richiesto esplicitamente da "adesso puoi verificare"):
// races-get era rimasta l'UNICA funzione del dominio Races senza il
// fallback token legacy aggiunto a races-list/races-upcoming in #375
// — ogni pagina /race/:id del sito (Race Hub → dettaglio gara) andava
// in "Gara non trovata" per QUALSIASI utente reale, incluso Demetrio
// stesso (verificato: nessuna sessione Supabase vera nemmeno per lui,
// solo token legacy — stesso esito già documentato in #376). Bug
// silenzioso perché il frontend interpreta la risposta 401 "Auth
// richiesto" come "gara non trovata" anziché come errore esplicito.
// Stesso identico fallback delle altre funzioni del dominio.
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

    const raceId = payload?.race_id ? String(payload.race_id) : '';
    if (!raceId) return json({ ok: false, error: 'race_id mancante' }, 400);

    // Con client service-role (fallback legacy) la RLS è bypassata: lo
    // scoping team_id va applicato esplicitamente qui, stesso principio
    // di races-list.
    const { data, error } = await supabase
      .from('races')
      .select('*')
      .eq('race_id', raceId)
      .eq('team_id', me.team_id)
      .maybeSingle();

    if (error) return json({ ok: false, error: error.message }, 400);
    if (!data) return json({ ok: false, error: 'Gara non trovata: ' + raceId }, 404);

    const race = { ...data, championship_name: null };

    return json({ ok: true, data: { race } });
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
