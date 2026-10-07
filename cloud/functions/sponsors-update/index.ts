// VSD-Paddock Cloud — sponsors.update (porting di apps-script/Sponsors.js)
// Staff/admin (sessione Supabase o token legacy). Whitelist campi, status
// validato; audit sul cambio stato, notifica Discord se diventa 'active'.
// #469: sorgente recuperato dal deploy live (v17) e versionato. Fix: campo
// `value` → `value_estimate` (colonna reale), prima l'update con valore falliva.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SPONSOR_STATUSES = ['lead', 'contacted', 'negotiating', 'active', 'declined', 'lapsed'];
const SPONSOR_EDITABLE_FIELDS = [
  'company_name', 'contact_name', 'contact_email', 'contact_phone',
  'status', 'value_estimate', 'next_follow_up', 'notes',
];

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

async function notifySponsorActivated(sponsor: any) {
  try {
    const url = Deno.env.get('DISCORD_WEBHOOK_ADMIN_URL');
    if (!url || !sponsor?.company_name) return;
    const embed = {
      author: { name: 'VSD Paddock — Sponsor' },
      title: '🏆 Sponsor attivato!',
      description: '**' + sponsor.company_name + '**' + (sponsor.value_estimate ? ' · ' + sponsor.value_estimate : ''),
      color: 0xf59e0b,
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

    const sponsorId = String(payload?.sponsor_id || '').trim();
    if (!sponsorId) return json({ ok: false, error: 'sponsor_id obbligatorio' }, 400);

    if (payload.status !== undefined && SPONSOR_STATUSES.indexOf(payload.status) === -1) {
      return json({ ok: false, error: 'status non valido — atteso uno tra: ' + SPONSOR_STATUSES.join(', ') }, 400);
    }

    const { data: before, error: beforeErr } = await serviceClient
      .from('sponsors')
      .select('status, company_name')
      .eq('id', sponsorId)
      .eq('team_id', me.team_id)
      .maybeSingle();
    if (beforeErr) return json({ ok: false, error: beforeErr.message }, 400);
    if (!before) return json({ ok: false, error: 'Sponsor non trovato: ' + sponsorId }, 404);
    const prevStatus = before.status;

    const updates: Record<string, unknown> = {};
    for (const field of SPONSOR_EDITABLE_FIELDS) {
      if (payload[field] === undefined) continue;
      if (field === 'next_follow_up') updates[field] = payload[field] ? String(payload[field]) : null;
      else updates[field] = payload[field] === null ? null : String(payload[field]);
    }
    updates.updated_by = me.id;

    const { data, error } = await serviceClient
      .from('sponsors')
      .update(updates)
      .eq('id', sponsorId)
      .eq('team_id', me.team_id)
      .select()
      .maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 400);
    if (!data) return json({ ok: false, error: 'Sponsor non trovato: ' + sponsorId }, 404);

    if (payload.status !== undefined && payload.status !== prevStatus) {
      await logAudit(serviceClient, me.team_id, me.id, 'sponsors.update', sponsorId,
        'Sponsor ' + data.company_name + ': stato ' + prevStatus + ' → ' + data.status);
      if (data.status === 'active') await notifySponsorActivated(data);
    }

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

