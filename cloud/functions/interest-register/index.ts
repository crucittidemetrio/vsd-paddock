// VSD-Paddock Cloud — interest.register (porting di apps-script/ChampionshipInterest.js)
// Auth opzionale (come clash.participants.register). Nessun cap.
// #469: sorgente recuperato dal deploy live (v16) e versionato. Il pilota
// loggato veniva trattato da anonimo (driver_id null) perché era riconosciuta
// solo la sessione Supabase: interest.update poi non trovava mai la sua riga.
// Ora il token legacy lega l'iscrizione al driver.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function resolveLegacyFull(serviceClient: any, legacyToken: string | undefined) {
  if (!legacyToken) return null;
  try {
    const r = await fetch('https://script.google.com/macros/s/AKfycbyMXxEjZfm5EIsGUnKxpwtBtoeR4hwMG7Pl8ZESF8yG569SS0aIdsWqyu9PdBgR14vLiA/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'auth.verify', token: legacyToken, payload: {} }),
    });
    const j = await r.json();
    const driverCode = j?.ok && j.data?.valid ? j.data?.driver?.driver_id : null;
    if (!driverCode) return null;
    const { data: d } = await serviceClient
      .from('drivers')
      .select('id, driver_code, team_id, display_name')
      .eq('driver_code', driverCode)
      .maybeSingle();
    return d || null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const payload = await req.json().catch(() => ({}));
    const key = String(payload?.championship_key || '').trim();
    if (!key) return json({ ok: false, error: 'championship_key obbligatorio' }, 400);

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let teamId: string | null = null;
    let driverId: string | null = null;
    let driverCode: string | null = null;
    let displayName = String(payload?.display_name || '').trim();

    let me: any = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        const { data } = await serviceClient
          .from('drivers')
          .select('id, driver_code, team_id, display_name')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        me = data || null;
      }
    }
    if (!me) me = await resolveLegacyFull(serviceClient, payload?.legacy_token);
    if (me) {
      teamId = me.team_id;
      driverId = me.id;
      driverCode = me.driver_code;
      if (!displayName) displayName = me.display_name || '';
    }
    if (!teamId) {
      const teamSlug = payload?.team_slug ? String(payload.team_slug).trim() : '';
      if (!teamSlug) return json({ ok: false, error: 'team_slug obbligatorio per chiamate anonime' }, 400);
      const { data: team, error: teamErr } = await serviceClient
        .from('teams')
        .select('id')
        .eq('slug', teamSlug)
        .maybeSingle();
      if (teamErr) return json({ ok: false, error: teamErr.message }, 400);
      if (!team) return json({ ok: false, error: 'Team non trovato: ' + teamSlug }, 404);
      teamId = team.id;
    }

    if (!displayName) return json({ ok: false, error: 'Nome pilota mancante' }, 400);

    const category = String(payload?.category || '').trim();
    const vehicle = String(payload?.vehicle || '').trim();
    const discordHandle = String(payload?.discord_handle || '').trim();
    const note = String(payload?.note || '').trim().slice(0, 300);

    const { data: existing, error: existErr } = await serviceClient
      .from('championship_interest')
      .select('driver_id, display_name')
      .eq('team_id', teamId)
      .eq('championship_key', key)
      .neq('status', 'withdrawn');
    if (existErr) return json({ ok: false, error: existErr.message }, 400);

    const nameKey = displayName.toLowerCase();
    const dup = (existing ?? []).find((p: any) =>
      (driverId && p.driver_id === driverId) ||
      String(p.display_name || '').trim().toLowerCase() === nameKey,
    );
    if (dup) return json({ ok: false, error: 'Ti sei già segnalato per questo campionato' }, 400);

    const { data, error } = await serviceClient
      .from('championship_interest')
      .insert({
        team_id: teamId,
        championship_key: key,
        driver_id: driverId,
        display_name: displayName,
        category: category || null,
        vehicle: vehicle || null,
        discord_handle: discordHandle || null,
        note: note || null,
        status: 'registered',
      })
      .select()
      .maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 400);

    return json({
      ok: true,
      data: {
        interest_id: data.id,
        driver_id: driverCode || '',
        display_name: data.display_name,
        category: data.category || '',
        vehicle: data.vehicle || '',
        registered_at: data.registered_at,
        status: data.status,
      },
    });
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

