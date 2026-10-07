// VSD-Paddock Cloud — sponsors.add (porting di apps-script/Sponsors.js)
// Staff/admin (sessione Supabase o token legacy). Stato iniziale 'lead';
// audit log + notifica Discord admin.
// #469 fix: la colonna reale è `value_estimate` (text); il codice scriveva
// `value` (inesistente) → ogni inserimento falliva, pipeline sponsor sempre vuota.
// #469: sorgente recuperato dal deploy live (v17) e versionato.

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

async function logAudit(supabase: any, teamId: string, driverId: string, action: string, target: string, summary: string) {
  try {
    await supabase.from('audit_log').insert({ team_id: teamId, driver_id: driverId, action, target_id: target, details: summary });
  } catch (_e) { /* non-blocking */ }
}

async function notifyNewSponsorLead(sponsor: any) {
  try {
    const url = Deno.env.get('DISCORD_WEBHOOK_ADMIN_URL');
    if (!url || !sponsor?.company_name) return;
    const embed = {
      author: { name: 'VSD Paddock — Sponsor' },
      title: '🤝 Nuovo lead sponsor',
      description: '**' + sponsor.company_name + '**' + (sponsor.contact_name ? ' · ' + sponsor.contact_name : ''),
      color: 0x22c55e,
      timestamp: new Date().toISOString(),
      footer: { text: 'Pipeline sponsor · Admin' },
      url: 'https://vsd-paddock.vercel.app/admin/sponsors',
    };
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ embeds: [embed] }) });
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
    if (!me || (me.role !== 'staff' && me.role !== 'admin')) {
      return json({ ok: false, error: 'Accesso riservato allo staff' }, 403);
    }

    const companyName = String(payload?.company_name || '').trim();
    if (!companyName) return json({ ok: false, error: 'company_name obbligatorio' }, 400);

    const { data, error } = await serviceClient
      .from('sponsors')
      .insert({
        team_id: me.team_id,
        company_name: companyName,
        contact_name: String(payload?.contact_name || '') || null,
        contact_email: String(payload?.contact_email || '') || null,
        contact_phone: String(payload?.contact_phone || '') || null,
        status: 'lead',
        value_estimate: String(payload?.value_estimate ?? payload?.value ?? '').trim() || null,
        next_follow_up: String(payload?.next_follow_up || '') || null,
        notes: String(payload?.notes || '') || null,
        updated_by: me.id,
      })
      .select()
      .maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 400);

    await logAudit(serviceClient, me.team_id, me.id, 'sponsors.add', data.id, 'Nuovo lead sponsor: ' + companyName);
    await notifyNewSponsorLead(data);

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

