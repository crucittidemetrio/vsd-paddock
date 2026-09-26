// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — candidates.add (porting fedele di
// apps-script/Candidates.js, handleCandidatesAdd)
// ═══════════════════════════════════════════════════════════
// Auth: staff/admin. Stato iniziale sempre 'new'. #256: logAudit_ e
// notifyNewCandidate_ (Discord, canale admin) implementati.
//
// v2 fix (#334, fallback token legacy — vedi nota completa in
// interest-update): nessun pilota reale ha ancora un account
// Supabase collegato tranne l'admin di test. Se manca/fallisce la
// sessione Supabase, risolve lo staff verificando
// payload.legacy_token contro auth.verify su Apps Script.
//
// v3 (26/09/2026, "candidates.apply" — sostituisce il Google Form
// esterno linkato da JoinUs.jsx): NON è stata creata una nuova Edge
// Function. Il progetto è già al tetto funzioni del piano Supabase
// (#391, "Ottimizzare uso Edge Functions, niente upgrade piano") —
// il primo tentativo di deploy di uno slot `candidates-apply`
// separato ha fallito con PaymentRequiredException ("Max number of
// functions reached"). Stesso precedente già stabilito per
// Endurance (#391, vedi cloud/README.md: "per ogni nuovo dominio,
// valutare fin dall'inizio un dispatcher consolidato... per non
// ririschiare il tetto") — qui applicato aggiungendo un secondo
// ramo pubblico a questo stesso slug esistente, invece di
// consumarne uno nuovo.
//
// Distinzione tra i due rami, in testa a Deno.serve:
//   - payload.mode === 'apply' → ramo PUBBLICO nuovo (nessuna auth,
//     nessun legacy_token): risoluzione team via team_slug (stesso
//     pattern anon di incidents-report/interest-register — vedi
//     ANON_TEAM_SLUG_ACTIONS in supabaseApi.js), source fissato a
//     'Sito' (vs 'Google Form' di default nel ramo staff), niente
//     logAudit (nessun driver attore reale da tracciare).
//   - altrimenti → ramo STAFF originale, invariato (richiede
//     sessione o legacy_token, role staff/admin).
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LEGACY_API_URL = 'https://script.google.com/macros/s/AKfycbyMXxEjZfm5EIsGUnKxpwtBtoeR4hwMG7Pl8ZESF8yG569SS0aIdsWqyu9PdBgR14vLiA/exec';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const VALID_SIMS = ['LMU', 'IRACING', 'AC EVO'];
const MAX_FREE_TEXT = 1500;

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

async function notifyNewCandidate(candidate: any, fromPublicForm: boolean) {
  try {
    const url = Deno.env.get('DISCORD_WEBHOOK_ADMIN_URL');
    if (!url || !candidate?.display_name) return;
    const embed = {
      author: { name: 'VSD Paddock — Selezione' },
      title: fromPublicForm ? '🎯 Nuova candidatura dal sito' : '📋 Nuovo candidato in pipeline',
      description: '**' + candidate.display_name + '**' + (candidate.sim_preference ? ' · ' + candidate.sim_preference : ''),
      color: fromPublicForm ? 0x00d4ff : 0x3b82f6,
      fields: [{ name: 'Fonte', value: candidate.source || '—', inline: true }],
      timestamp: new Date().toISOString(),
      footer: { text: 'Pipeline candidature · Admin' },
      url: 'https://vsd-paddock.vercel.app/admin/candidates',
    };
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ embeds: [embed] }) });
  } catch (_e) { /* non-blocking */ }
}

// ─── Ramo pubblico (v3): candidates.apply — form on-site /joinus ───
// Nessuna sessione richiesta. Honeypot (`payload.website`, invisibile
// lato form reale) per non rivelare il filtro a un eventuale bot: si
// risponde comunque ok:true senza scrivere nulla.
async function handlePublicApply(serviceClient: any, payload: any) {
  if (payload?.website) {
    return json({ ok: true, data: { skipped: true } });
  }

  const displayName = String(payload?.display_name || '').trim();
  if (!displayName) return json({ ok: false, error: 'Nome e cognome obbligatorio' }, 400);
  if (displayName.length > 120) return json({ ok: false, error: 'Nome troppo lungo (max 120 caratteri)' }, 400);

  const contact = String(payload?.contact || '').trim();
  if (!contact) return json({ ok: false, error: 'Email di contatto obbligatoria' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
    return json({ ok: false, error: 'Email non valida' }, 400);
  }

  const simulator = String(payload?.simulator || '').trim().toUpperCase();
  if (!VALID_SIMS.includes(simulator)) {
    return json({ ok: false, error: 'Simulatore non valido — atteso uno tra: ' + VALID_SIMS.join(', ') }, 400);
  }
  const category = String(payload?.category || '').trim();
  if (!category) return json({ ok: false, error: 'Categoria preferita obbligatoria' }, 400);

  const notesRaw = String(payload?.notes || '');
  if (notesRaw.length > MAX_FREE_TEXT) {
    return json({ ok: false, error: `Testo troppo lungo (max ${MAX_FREE_TEXT} caratteri)` }, 400);
  }

  const teamSlug = payload?.team_slug ? String(payload.team_slug).trim() : 'vsd';
  const { data: team, error: teamErr } = await serviceClient
    .from('teams')
    .select('id')
    .eq('slug', teamSlug)
    .maybeSingle();
  if (teamErr) return json({ ok: false, error: teamErr.message }, 400);
  if (!team) return json({ ok: false, error: 'Team non trovato: ' + teamSlug }, 404);

  const row = {
    team_id: team.id,
    display_name: displayName,
    discord_username: String(payload?.discord_username || '').trim() || null,
    contact,
    sim_preference: `${simulator} — ${category}`,
    source: 'Sito',
    status: 'new',
    notes: notesRaw.trim() || null,
    updated_by: null,
  };

  const { data, error } = await serviceClient
    .from('candidates')
    .insert(row)
    .select()
    .maybeSingle();
  if (error) return json({ ok: false, error: error.message }, 400);

  await notifyNewCandidate(data, true);

  return json({ ok: true, data: { candidate_id: data.id, submitted_at: data.created_at } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const payload = await req.json().catch(() => ({}));

    // v3: ramo pubblico, nessuna auth — vedi nota di testa al file.
    if (payload?.mode === 'apply') {
      return await handlePublicApply(serviceClient, payload);
    }

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

    const displayName = String(payload?.display_name || '').trim();
    if (!displayName) return json({ ok: false, error: 'display_name obbligatorio' }, 400);

    const { data, error } = await serviceClient
      .from('candidates')
      .insert({
        team_id: me.team_id,
        display_name: displayName,
        discord_username: String(payload?.discord_username || '') || null,
        contact: String(payload?.contact || '') || null,
        sim_preference: String(payload?.sim_preference || '') || null,
        source: String(payload?.source || 'Google Form'),
        status: 'new',
        notes: String(payload?.notes || '') || null,
        updated_by: me.id,
      })
      .select()
      .maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 400);

    await logAudit(serviceClient, me.team_id, me.id, 'candidates.add', data.id,
      'Nuovo candidato: ' + displayName + ' (fonte: ' + data.source + ')');
    await notifyNewCandidate(data, false);

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
