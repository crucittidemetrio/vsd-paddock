// VSD-Paddock Cloud — treasury.add (porting di apps-script/Treasury.js)
// SOLO admin (sessione Supabase o token legacy). type entrata/uscita,
// amount > 0, counterparty e date obbligatori. Audit log.
// #469: sorgente recuperato dal deploy live (v18) e versionato.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TREASURY_TYPES = ['entrata', 'uscita'];

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

async function logAudit(supabase: any, teamId: string, driverId: string, action: string, target: string, summary: string) {
  try {
    await supabase.from('audit_log').insert({ team_id: teamId, driver_id: driverId, action, target_id: target, details: summary });
  } catch (_e) { /* non-blocking */ }
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
      return json({ ok: false, error: 'Accesso riservato agli admin' }, 403);
    }

    const type = String(payload?.type || '');
    if (TREASURY_TYPES.indexOf(type) === -1) {
      return json({ ok: false, error: 'type non valido — atteso uno tra: ' + TREASURY_TYPES.join(', ') }, 400);
    }
    const amount = Number(payload?.amount);
    if (!(amount > 0)) return json({ ok: false, error: 'amount deve essere maggiore di zero' }, 400);
    const counterparty = String(payload?.counterparty || '').trim();
    if (!counterparty) return json({ ok: false, error: 'counterparty obbligatorio' }, 400);
    const date = String(payload?.date || '').trim();
    if (!date) return json({ ok: false, error: 'date obbligatoria' }, 400);

    const { data, error } = await serviceClient
      .from('treasury_entries')
      .insert({
        team_id: me.team_id,
        date,
        type,
        amount,
        counterparty,
        description: String(payload?.description || '') || null,
        updated_by: me.id,
      })
      .select()
      .maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 400);

    await logAudit(serviceClient, me.team_id, me.id, 'treasury.add', data.id, type + ' di €' + amount + ' — ' + counterparty);

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

