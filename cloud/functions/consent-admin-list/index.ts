// VSD-Paddock Cloud — consent.adminList (porting di apps-script/Consent.js)
// Auth: SOLO admin (sessione Supabase o token legacy). Driver attivi/in prova
// con il consenso per la versione corrente; driver_id in uscita = driver_code.
// #469: sorgente recuperato dal deploy live (v17) e versionato.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CONSENT_VERSION = 'v1-2026-08-08';

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
    if (!me || me.role !== 'admin') {
      return json({ ok: false, error: 'Accesso riservato ad admin/team principal' }, 403);
    }

    const { data: drivers, error: drvErr } = await serviceClient
      .from('drivers')
      .select('id, driver_code, display_name, status')
      .eq('team_id', me.team_id)
      .in('status', ['active', 'trial']);
    if (drvErr) return json({ ok: false, error: drvErr.message }, 400);

    const { data: consents, error: consErr } = await serviceClient
      .from('consents')
      .select('*')
      .eq('team_id', me.team_id)
      .eq('consent_version', CONSENT_VERSION);
    if (consErr) return json({ ok: false, error: consErr.message }, 400);

    const byDriver: Record<string, any> = {};
    (consents ?? []).forEach((c: any) => { byDriver[c.driver_id] = c; });

    const list = (drivers ?? []).map((d: any) => ({
      driver_id: d.driver_code,
      display_name: d.display_name,
      status: d.status,
      consent: byDriver[d.id] || null,
    }));

    return json({ ok: true, data: { required_version: CONSENT_VERSION, drivers: list } });
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

