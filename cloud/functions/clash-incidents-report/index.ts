// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — clash.incidents.report (v2 — sistema unificato)
// ═══════════════════════════════════════════════════════════
// v1 scriveva su clash_incident_reports, una tabella a parte con
// campi divergenti dal resto del sistema di segnalazione incidenti
// (round fisso invece di gara/campionato, reporting_name/reported_name
// invece di reporter_sim/against). Richiesta di Demetrio: "stesso
// sistema per tutto" — da qui in avanti questa funzione scrive su
// incident_reports (clash_round valorizzato, race_id/championship_id
// null), lo stesso modulo usato da UE144/ACI/Discord.
//
// clash_incident_reports resta intatta come archivio storico in sola
// lettura (nessuna migrazione retroattiva — "immutabile" per lo stesso
// principio già applicato altrove nel progetto).
//
// Auth: NESSUNA richiesta (community-wide, come le iscrizioni). Le
// sanzioni restano a discrezione della Direzione Generale VSD,
// comunicate su Discord — questo endpoint raccoglie solo la
// segnalazione grezza (nessun workflow di decisione qui, fedele al
// sorgente). Stesso pattern team_slug/service-role degli altri
// endpoint pubblici di questo dominio.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const CLASH_VALID_ROUNDS = [1, 2, 3];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const payload = await req.json().catch(() => ({}));
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const round = Number(payload?.round);
    if (CLASH_VALID_ROUNDS.indexOf(round) === -1) {
      return json({ ok: false, error: 'round non valido. Ammessi: ' + CLASH_VALID_ROUNDS.join(', ') }, 400);
    }
    const reportingName = String(payload?.reporting_name || '').trim();
    const reportedName = String(payload?.reported_name || '').trim();
    const description = String(payload?.description || '').trim();

    if (!reportingName) return json({ ok: false, error: 'Nome del segnalante mancante' }, 400);
    if (!reportedName) return json({ ok: false, error: 'Nome del pilota segnalato mancante' }, 400);
    if (!description) return json({ ok: false, error: 'Descrizione mancante' }, 400);
    if (description.length > 2000) return json({ ok: false, error: 'Descrizione troppo lunga (max 2000 caratteri)' }, 400);

    let teamId: string | null = null;
    let reporterDriverId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        const { data: me } = await serviceClient
          .from('drivers')
          .select('id, team_id')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        if (me) {
          teamId = me.team_id;
          reporterDriverId = me.id;
        }
      }
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

    // Match best-effort su reported_name — solo per sapere se il
    // segnalato è un pilota VSD noto, mai un'assunzione bloccante.
    let againstDriverId: string | null = null;
    const { data: rosterMatch } = await serviceClient
      .from('drivers')
      .select('id')
      .eq('team_id', teamId)
      .ilike('display_name', reportedName)
      .maybeSingle();
    if (rosterMatch) againstDriverId = rosterMatch.id;

    const replayUrl = String(payload?.replay_url || '').trim();

    const { data, error } = await serviceClient
      .from('incident_reports')
      .insert({
        team_id: teamId,
        reporter_driver_id: reporterDriverId,
        reporter_sim: reportingName,
        reporter_discord: payload?.reporter_discord ? String(payload.reporter_discord).trim() : null,
        against: reportedName,
        against_driver_id: againstDriverId,
        description,
        clash_round: round,
        replay_url: replayUrl || null,
        source: 'web',
      })
      .select()
      .maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 400);

    return json({ ok: true, data: { report_id: data.id, submitted_at: data.created_at, status: 'pending' } });
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
