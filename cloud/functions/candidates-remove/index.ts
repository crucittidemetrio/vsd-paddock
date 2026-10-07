// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — candidates.remove (porting di apps-script/Candidates.js)
// ═══════════════════════════════════════════════════════════
// Auth: staff/admin (sessione Supabase o token legacy, #334). Hard delete.
// #469: sorgente recuperato dal deploy live (v16) e versionato nel repo.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LEGACY_API_URL = 'https://script.google.com/macros/s/AKfycbyMXxEjZfm5EIsGUnKxpwtBtoeR4hwMG7Pl8ZESF8yG569SS0aIdsWqyu9PdBgR14vLiA/exec';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
    if (!me || (me.role !== 'staff' && me.role !== 'admin')) {
      return json({ ok: false, error: 'Accesso riservato allo staff' }, 403);
    }

    const candidateId = String(payload?.candidate_id || '').trim();
    if (!candidateId) return json({ ok: false, error: 'candidate_id obbligatorio' }, 400);

    const { data, error } = await serviceClient
      .from('candidates')
      .delete()
      .eq('id', candidateId)
      .eq('team_id', me.team_id)
      .select()
      .maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 400);
    if (!data) return json({ ok: false, error: 'Candidato non trovato: ' + candidateId }, 404);

    return json({ ok: true, data: { deleted: true, candidate_id: candidateId } });
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
