// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — championships.list (porting fedele di
// apps-script/championshipsHandlers.js, handleChampionshipsList)
// ═══════════════════════════════════════════════════════════
// Auth: qualsiasi membro del team (nessuna distinzione staff/driver,
// fedele al sorgente — "if (!ctx) return fail" e basta).
// Filtri opzionali: sim, status, season. banner_url normalizzato da
// eventuale link Drive "view" a URL thumbnail diretto (stesso helper
// di races-update-poster).
//
// FIX 21/09/2026 (segnalato da Demetrio, "sistema non più utilizzabile
// da notebook"): aggiunto fallback token legacy, stesso pattern
// #331/#358/#359 — mai incluso qui perché il file non era mai stato
// sincronizzato in git (gap di drift, stesso pattern già visto per
// audit-log-list/messenger-send in #335 e standings-by-championship
// il 21/09/2026). Senza sessione Supabase reale (praticamente ogni
// pilota, solo token legacy Discord OAuth via Apps Script), la pagina
// Campionati mostrava "Nessun campionato disponibile" con 401
// silenzioso.
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

function normalizeDrivePosterUrl(url: string): string {
  if (!url) return url;
  const str = String(url).trim();
  if (!str) return str;

  let match = str.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return `https://lh3.googleusercontent.com/d/${match[1]}`;

  match = str.match(/drive\.google\.com\/(?:open|uc|thumbnail)\?(?:[^&]*&)*id=([a-zA-Z0-9_-]+)/);
  if (match) return `https://lh3.googleusercontent.com/d/${match[1]}`;

  if (str.includes('lh3.googleusercontent.com')) return str;

  return str;
}

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

    let query = supabase.from('championships').select('*').eq('team_id', me.team_id);
    if (payload?.sim) query = query.eq('sim', String(payload.sim));
    if (payload?.status) query = query.eq('status', String(payload.status));
    if (payload?.season) query = query.eq('season', String(payload.season));

    const { data, error } = await query;
    if (error) return json({ ok: false, error: error.message }, 400);

    const championships = (data ?? []).map((c: any) => ({
      ...c,
      banner_url: c.banner_url ? normalizeDrivePosterUrl(String(c.banner_url).trim()) : '',
    }));

    return json({ ok: true, data: { championships, count: championships.length } });
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
