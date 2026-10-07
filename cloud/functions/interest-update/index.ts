// VSD-Paddock Cloud — interest.update (porting di apps-script/ChampionshipInterest.js)
// Login richiesto (sessione Supabase o token legacy, #334): aggiorna SOLO la
// riga legata al proprio driver_id.
// #469: sorgente recuperato dal deploy live (v16) e versionato.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
      .select('id, team_id, driver_code, role')
      .eq('driver_code', driverCode)
      .maybeSingle();
    if (!d) return null;
    return { id: d.id, team_id: d.team_id, role: j.data.driver.role || d.role };
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const payload = await req.json().catch(() => ({}));

    let me: { id: string; team_id: string; role: string } | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        const { data: d } = await serviceClient
          .from('drivers')
          .select('id, team_id, role')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        if (d) me = d;
      }
    }
    if (!me) me = await resolveLegacyDriver(serviceClient, payload?.legacy_token);
    if (!me) return json({ ok: false, error: 'Serve essere loggati per modificare la propria segnalazione' }, 401);

    const key = String(payload?.championship_key || '').trim();
    if (!key) return json({ ok: false, error: 'championship_key obbligatorio' }, 400);

    const { data: row, error: rowErr } = await serviceClient
      .from('championship_interest')
      .select('*')
      .eq('team_id', me.team_id)
      .eq('championship_key', key)
      .eq('driver_id', me.id)
      .neq('status', 'withdrawn')
      .maybeSingle();
    if (rowErr) return json({ ok: false, error: rowErr.message }, 400);
    if (!row) return json({ ok: false, error: 'Nessuna segnalazione trovata da aggiornare — registrati prima' }, 404);

    const updates: Record<string, unknown> = {};
    if (payload.category !== undefined) updates.category = String(payload.category || '').trim() || null;
    if (payload.vehicle !== undefined) updates.vehicle = String(payload.vehicle || '').trim() || null;
    if (payload.discord_handle !== undefined) updates.discord_handle = String(payload.discord_handle || '').trim() || null;
    if (payload.note !== undefined) updates.note = String(payload.note || '').trim().slice(0, 300) || null;

    const { data, error } = await serviceClient
      .from('championship_interest')
      .update(updates)
      .eq('id', row.id)
      .select()
      .maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 400);

    return json({ ok: true, data: { interest_id: data.id, category: data.category || '', vehicle: data.vehicle || '' } });
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

