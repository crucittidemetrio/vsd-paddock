// VSD-Paddock Cloud — consent.accept (porting di apps-script/Consent.js)
// Self-service. is_minor calcolato server-side da birth_date; dati genitore
// obbligatori se minorenne. Upsert su (team_id, driver_id, consent_version).
// Auth: sessione Supabase o token legacy (#334, bug "consenso non registrato").
// #469: sorgente recuperato dal deploy live (v16) e versionato.

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

function computeIsMinor(birthDate: string): boolean {
  const bd = new Date(birthDate);
  if (isNaN(bd.getTime())) return false;
  const today = new Date();
  let age = today.getFullYear() - bd.getFullYear();
  const m = today.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
  return age < 18;
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
    if (!me) return json({ ok: false, error: 'Login richiesto' }, 401);

    const birthDate = String(payload?.birth_date || '').trim();
    if (!birthDate) return json({ ok: false, error: 'birth_date obbligatoria' }, 400);

    const isMinor = computeIsMinor(birthDate);

    if (isMinor) {
      const parentName = String(payload?.parent_name || '').trim();
      const parentEmail = String(payload?.parent_email || '').trim();
      if (!parentName || !parentEmail) {
        return json({ ok: false, error: 'Per i minorenni sono obbligatori nome e email del genitore/tutore' }, 400);
      }
    }

    const record = {
      team_id: me.team_id,
      driver_id: me.id,
      consent_version: CONSENT_VERSION,
      site_consent: !!payload?.site_consent,
      social_consent: !!payload?.social_consent,
      birth_date: birthDate,
      is_minor: isMinor,
      parent_name: isMinor ? String(payload?.parent_name || '').trim() : null,
      parent_email: isMinor ? String(payload?.parent_email || '').trim() : null,
      parent_declared: isMinor ? true : null,
    };

    const { data, error } = await serviceClient
      .from('consents')
      .upsert(record, { onConflict: 'team_id,driver_id,consent_version' })
      .select()
      .maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 400);

    return json({ ok: true, data });
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

