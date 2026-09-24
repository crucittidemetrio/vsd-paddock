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
// #331/#358/#359.
//
// v3 (24/09/2026, unificazione segnalazione incidenti — "stesso
// sistema per tutto"): aggiunto anche un path ANONIMO (team_slug),
// stesso pattern di roster-list/races-list/incidents-report — serve a
// popolare il selettore "Campionato" nel form di segnalazione incidenti
// per un visitatore non loggato (community esterna UE144). Auth-first:
// il ramo anonimo è solo un fallback quando né sessione né legacy
// token sono presenti.
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

    let query = supabase.from('championships').select('*').eq('team_id', teamId);
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
