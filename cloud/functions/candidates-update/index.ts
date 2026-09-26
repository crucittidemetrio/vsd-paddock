// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — candidates.update (porting fedele di
// apps-script/Candidates.js, handleCandidatesUpdate)
// ═══════════════════════════════════════════════════════════
// Auth: staff/admin. Valida status contro CANDIDATE_STATUSES,
// aggiorna solo i campi presenti nel payload tra
// CANDIDATE_EDITABLE_FIELDS. logAudit_ sul cambio di stato.
//
// v2 fix (#334, fallback token legacy — vedi nota completa in
// interest-update): nessun pilota reale ha ancora un account
// Supabase collegato tranne l'admin di test. Se manca/fallisce la
// sessione Supabase, risolve lo staff verificando
// payload.legacy_token contro auth.verify su Apps Script.
//
// v3 (26/09/2026): su transizione di stato verso 'accepted',
// posta un messaggio pubblico di benvenuto nel canale Discord
// #accesso-come-pilota-vsd (stesso canale del link /joinus), via
// webhook DISCORD_WEBHOOK_JOINUS_URL. Niente DM reale: il campo
// candidates.discord_username è testo libero, non un vero user id
// Discord collegato (a differenza di drivers.discord_id), quindi
// non è possibile un tag/mention reale — su richiesta esplicita
// dell'utente si veicola invece tramite messaggio pubblico nel
// canale che lo staff già usa per il benvenuto manuale. Notifica
// non bloccante (try/catch silenzioso), stesso pattern di
// notifyNewCandidate in candidates-add.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LEGACY_API_URL = 'https://script.google.com/macros/s/AKfycbyMXxEjZfm5EIsGUnKxpwtBtoeR4hwMG7Pl8ZESF8yG569SS0aIdsWqyu9PdBgR14vLiA/exec';
const CANDIDATE_STATUSES = ['new', 'contacted', 'trial', 'accepted', 'rejected'];
const CANDIDATE_EDITABLE_FIELDS = [
  'display_name', 'discord_username', 'contact',
  'sim_preference', 'source', 'status', 'notes',
];

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

async function logAudit(supabase: any, teamId: string, driverId: string, action: string, target: string, summary: string) {
  try {
    await supabase.from('audit_log').insert({ team_id: teamId, driver_id: driverId, action, target_id: target, details: summary });
  } catch (_e) { /* non-blocking */ }
}

// ─── v3: messaggio di benvenuto pubblico su accettazione ───
async function notifyAcceptedCandidate(candidate: any) {
  try {
    const url = Deno.env.get('DISCORD_WEBHOOK_JOINUS_URL');
    if (!url || !candidate?.display_name) return;

    const simLine = candidate.sim_preference ? `su **${candidate.sim_preference}**` : 'nel team';
    const discordLine = candidate.discord_username
      ? `\nAccount Discord indicato: **${candidate.discord_username}** — verifica gli accessi e assegna il ruolo pilota.`
      : '\nNessun account Discord indicato in candidatura: chiedi al pilota il suo username per completare gli accessi.';

    const content =
      `🎉 **Benvenuto in VSD, ${candidate.display_name}!**\n\n` +
      `La tua candidatura è stata accettata: sei ufficialmente pilota VSD ${simLine}.` +
      discordLine +
      `\n\nFai riferimento al **Team Principal** o allo **Staff** per un primo colloquio di benvenuto e per ogni necessità futura.`;

    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
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

    const candidateId = String(payload?.candidate_id || '').trim();
    if (!candidateId) return json({ ok: false, error: 'candidate_id obbligatorio' }, 400);

    if (payload.status !== undefined && CANDIDATE_STATUSES.indexOf(payload.status) === -1) {
      return json({ ok: false, error: 'status non valido — atteso uno tra: ' + CANDIDATE_STATUSES.join(', ') }, 400);
    }

    const { data: before, error: beforeErr } = await serviceClient
      .from('candidates')
      .select('status, display_name')
      .eq('id', candidateId)
      .eq('team_id', me.team_id)
      .maybeSingle();
    if (beforeErr) return json({ ok: false, error: beforeErr.message }, 400);
    if (!before) return json({ ok: false, error: 'Candidato non trovato: ' + candidateId }, 404);
    const prevStatus = before.status;

    const updates: Record<string, unknown> = {};
    for (const field of CANDIDATE_EDITABLE_FIELDS) {
      if (payload[field] !== undefined) updates[field] = String(payload[field]);
    }
    updates.updated_by = me.id;

    const { data, error } = await serviceClient
      .from('candidates')
      .update(updates)
      .eq('id', candidateId)
      .eq('team_id', me.team_id)
      .select()
      .maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 400);
    if (!data) return json({ ok: false, error: 'Candidato non trovato: ' + candidateId }, 404);

    if (payload.status !== undefined && payload.status !== prevStatus) {
      await logAudit(serviceClient, me.team_id, me.id, 'candidates.update', candidateId,
        'Candidato ' + data.display_name + ': stato ' + prevStatus + ' → ' + data.status);

      if (data.status === 'accepted' && prevStatus !== 'accepted') {
        await notifyAcceptedCandidate(data);
      }
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
