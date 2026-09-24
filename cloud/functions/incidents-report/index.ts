// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — incidents.report (v5 — sistema unificato +
// Discord Interactions Endpoint, #402)
// ═══════════════════════════════════════════════════════════
// v5 (24/09/2026): il progetto Supabase è al tetto di Edge Function
// del piano gratuito (decisione #391, "niente upgrade piano") — una
// nuova funzione dedicata `discord-interactions` non è deployabile
// (PaymentRequiredException). Questa stessa funzione fa doppio
// servizio: se la request porta l'header `x-signature-ed25519`
// (SOLO Discord lo manda) viene trattata come Interactions Endpoint
// per /segnala-incidente — altrimenti è l'endpoint web di sempre,
// invariato. Nessuna richiesta reale può avere entrambe le forme, gli
// header di Discord non sono falsificabili senza la chiave privata
// dell'app. Stessa tabella unificata incident_reports, "stesso
// sistema per tutto".
// ═══════════════════════════════════════════════════════════
// #351: form nativo in-app, community-wide (UE144 è una lega
// multi-team, non solo VSD) — pattern anon/team_slug degli altri
// endpoint pubblici (clash-incidents-report, roster-list). Auth
// opzionale: se presente, reporter_driver_id viene risolto e
// reporter_sim di default è il proprio display_name.
//
// v4 (24/09/2026, "stesso sistema per tutto" — chiude il gap
// architetturale: unico punto di riferimento per web E Discord):
//   - race_id: riferimento opzionale a una gara specifica
//     (races.race_id), validato scoped a team_id — un errore di
//     configurazione sul valore passato non deve mai impedire
//     l'invio di una segnalazione reale (stesso spirito del match
//     against/championship sotto), quindi un race_id non trovato
//     resta silenziosamente NULL.
//   - clash_round: alternativa a race_id/championship per le
//     segnalazioni Clash of Classes (round 1-3). Sostituisce
//     clash-incidents-report come punto di scrittura (vedi quella
//     funzione per il redirect).
//   - replay_url: link clip/telemetria del segnalante.
//   - source: 'web' (default) o 'discord' (slash command).
//
// v3 fix (trovato in validazione end-to-end #352): championship_id ha
// un vincolo FK composito su championships(team_id, id) — NON è testo
// libero. Il payload.championship dal frontend è l'id reale del
// campionato, risolto qui con una lookup scoped a team_id; se non
// trova nulla championship_id resta NULL (non bloccante).
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import nacl from 'https://esm.sh/tweetnacl@1.0.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const VALID_SOURCES = ['web', 'discord'];
const VALID_CLASH_ROUNDS = [1, 2, 3];

// ── Discord Interactions Endpoint (/segnala-incidente) — #402 ──
const DISCORD_TEAM_SLUG = 'vsd';
const DISCORD_INCIDENT_TYPES = [
  'Contatto evitabile', 'Divebomb (attacco irregolare)', 'Unsafe rejoin',
  'Track limits / vantaggio scorretto', 'Blocco difensivo irregolare',
  'Collisione in fase di sorpasso', 'Tamponamento (rear-end)',
  'Incidente al via (start incident)', 'Unsafe pit entry / exit',
  'Comportamento antisportivo', 'Lag / contatto di rete', 'Altro',
];

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

async function verifyDiscordSignature(req: Request, rawBody: string): Promise<boolean> {
  const publicKeyHex = Deno.env.get('DISCORD_PUBLIC_KEY');
  if (!publicKeyHex) return false;
  const signature = req.headers.get('x-signature-ed25519');
  const timestamp = req.headers.get('x-signature-timestamp');
  if (!signature || !timestamp) return false;
  try {
    return nacl.sign.detached.verify(
      new TextEncoder().encode(timestamp + rawBody),
      hexToBytes(signature),
      hexToBytes(publicKeyHex),
    );
  } catch {
    return false;
  }
}

function getDiscordOption(options: any[], name: string): any {
  return options?.find((o: any) => o.name === name)?.value;
}

async function handleDiscordInteraction(rawBody: string): Promise<Response> {
  const interaction = JSON.parse(rawBody || '{}');
  if (interaction.type === 1) return jsonPlain({ type: 1 }); // PING

  const serviceClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: team } = await serviceClient.from('teams').select('id').eq('slug', DISCORD_TEAM_SLUG).maybeSingle();
  if (!team) return jsonPlain({ type: 4, data: { content: '⚠️ Team VSD non trovato lato Paddock.', flags: 64 } });

  // Autocomplete dinamico per "evento" in base ad "ambito" — niente
  // modal, i modali Discord non ammettono select/dropdown.
  if (interaction.type === 4) {
    const options = interaction.data?.options || [];
    const ambito = getDiscordOption(options, 'ambito');
    const focused = options.find((o: any) => o.focused)?.value || '';
    let choices: { name: string; value: string }[] = [];

    if (ambito === 'campionato') {
      const { data } = await serviceClient.from('championships').select('id, name').eq('team_id', team.id).ilike('name', `%${focused}%`).limit(25);
      choices = (data || []).map((c: any) => ({ name: c.name, value: c.id }));
    } else if (ambito === 'gara') {
      const { data } = await serviceClient.from('races').select('race_id, race_name').eq('team_id', team.id).ilike('race_name', `%${focused}%`).order('date', { ascending: false }).limit(25);
      choices = (data || []).map((r: any) => ({ name: r.race_name, value: r.race_id }));
    } else if (ambito === 'clash') {
      choices = [1, 2, 3].map(r => ({ name: `Round ${r}`, value: String(r) })).filter(c => c.name.toLowerCase().includes(focused.toLowerCase()));
    }
    return jsonPlain({ type: 8, data: { choices } });
  }

  if (interaction.type === 2) {
    if (interaction.data?.name !== 'segnala-incidente') {
      return jsonPlain({ type: 4, data: { content: '⚠️ Comando non riconosciuto.', flags: 64 } });
    }
    const options = interaction.data?.options || [];
    const ambito = getDiscordOption(options, 'ambito');
    const evento = String(getDiscordOption(options, 'evento') || '').trim();
    const against = String(getDiscordOption(options, 'segnalato') || '').trim();
    const description = String(getDiscordOption(options, 'descrizione') || '').trim();
    const incidentTypeRaw = String(getDiscordOption(options, 'tipologia') || '').trim();
    const incidentType = DISCORD_INCIDENT_TYPES.includes(incidentTypeRaw) ? incidentTypeRaw : (incidentTypeRaw || null);
    const lap = String(getDiscordOption(options, 'giro') || '').trim();
    const timeInRace = String(getDiscordOption(options, 'minuto') || '').trim();
    const replayUrl = String(getDiscordOption(options, 'replay') || '').trim();

    if (!against || !description) {
      return jsonPlain({ type: 4, data: { content: '⚠️ "segnalato" e "descrizione" sono obbligatori.', flags: 64 } });
    }

    const discordUser = interaction.member?.user || interaction.user;
    const reporterSim = discordUser?.global_name || discordUser?.username || 'Discord';
    const reporterDiscord = discordUser?.username || '';

    let againstDriverId: string | null = null;
    const { data: rosterMatch } = await serviceClient.from('drivers').select('id').eq('team_id', team.id).ilike('display_name', against).maybeSingle();
    if (rosterMatch) againstDriverId = rosterMatch.id;

    const insertRow: Record<string, unknown> = {
      team_id: team.id,
      reporter_sim: reporterSim,
      reporter_discord: reporterDiscord,
      against,
      against_driver_id: againstDriverId,
      description,
      incident_type: incidentType,
      lap: lap || null,
      time_in_race: timeInRace || null,
      replay_url: replayUrl || null,
      source: 'discord',
    };
    if (ambito === 'campionato' && evento) insertRow.championship_id = evento;
    if (ambito === 'gara' && evento) insertRow.race_id = evento;
    if (ambito === 'clash' && evento) insertRow.clash_round = Number(evento);

    const { error } = await serviceClient.from('incident_reports').insert(insertRow);
    if (error) return jsonPlain({ type: 4, data: { content: '❌ Errore durante il salvataggio: ' + error.message, flags: 64 } });

    return jsonPlain({ type: 4, data: { content: `✅ Segnalazione registrata (contro **${against}**). La Direzione Gara la esaminerà entro 48h.`, flags: 64 } });
  }

  return jsonPlain({ error: 'unhandled_interaction_type' }, 400);
}

function jsonPlain(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Ramo Discord: SOLO Discord manda questo header (firmato con la
  // chiave privata dell'app) — nessun rischio di collisione con le
  // chiamate web reali, che non lo mandano mai.
  if (req.headers.get('x-signature-ed25519')) {
    const rawBody = await req.text();
    const validSignature = await verifyDiscordSignature(req, rawBody);
    if (!validSignature) return jsonPlain({ error: 'invalid_signature' }, 401);
    return handleDiscordInteraction(rawBody);
  }

  try {
    const payload = await req.json().catch(() => ({}));
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const description = String(payload?.description || '').trim();
    const against = String(payload?.against || '').trim();
    if (!against) return json({ ok: false, error: 'Nome del pilota/team segnalato mancante' }, 400);
    if (!description) return json({ ok: false, error: 'Descrizione mancante' }, 400);
    if (description.length > 2000) return json({ ok: false, error: 'Descrizione troppo lunga (max 2000 caratteri)' }, 400);

    const source = payload?.source ? String(payload.source) : 'web';
    if (!VALID_SOURCES.includes(source)) {
      return json({ ok: false, error: 'source non valido — atteso uno tra: ' + VALID_SOURCES.join(', ') }, 400);
    }

    let clashRound: number | null = null;
    if (payload?.clash_round !== undefined && payload?.clash_round !== null && payload?.clash_round !== '') {
      const r = Number(payload.clash_round);
      if (VALID_CLASH_ROUNDS.indexOf(r) === -1) {
        return json({ ok: false, error: 'clash_round non valido. Ammessi: ' + VALID_CLASH_ROUNDS.join(', ') }, 400);
      }
      clashRound = r;
    }

    let teamId: string | null = null;
    let reporterDriverId: string | null = null;
    let defaultReporterSim = '';

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
          .select('id, team_id, display_name')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        if (me) {
          teamId = me.team_id;
          reporterDriverId = me.id;
          defaultReporterSim = me.display_name || '';
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

    const reporterSim = String(payload?.reporter_sim || defaultReporterSim || '').trim();
    if (!reporterSim) return json({ ok: false, error: 'Nome del segnalante mancante' }, 400);

    // Match best-effort su against — solo per sapere se il segnalato è
    // un pilota VSD noto, mai un'assunzione bloccante.
    let againstDriverId: string | null = null;
    const { data: rosterMatch } = await serviceClient
      .from('drivers')
      .select('id')
      .eq('team_id', teamId)
      .ilike('display_name', against)
      .maybeSingle();
    if (rosterMatch) againstDriverId = rosterMatch.id;

    // Risoluzione championship_id: championships.id è FK composita
    // (team_id, id) — mai testo libero. Lookup esatta scoped a team_id;
    // nessun match → NULL, mai un errore bloccante.
    let championshipId: string | null = null;
    const championshipRaw = payload?.championship ? String(payload.championship).trim() : '';
    if (championshipRaw) {
      const { data: champMatch } = await serviceClient
        .from('championships')
        .select('id')
        .eq('team_id', teamId)
        .eq('id', championshipRaw)
        .maybeSingle();
      if (champMatch) championshipId = champMatch.id;
    }

    // Risoluzione race_id: races.race_id è la PK testuale ('RACEnnn'),
    // scoped a team_id qui (non un vero FK composito, ma la validazione
    // esplicita evita di salvare un riferimento a una gara di un altro
    // team). Nessun match → NULL, mai bloccante.
    let raceId: string | null = null;
    const raceRaw = payload?.race_id ? String(payload.race_id).trim() : '';
    if (raceRaw) {
      const { data: raceMatch } = await serviceClient
        .from('races')
        .select('race_id')
        .eq('team_id', teamId)
        .eq('race_id', raceRaw)
        .maybeSingle();
      if (raceMatch) raceId = raceMatch.race_id;
    }

    const insertRow = {
      team_id: teamId,
      reporter_driver_id: reporterDriverId,
      reporter_sim: reporterSim,
      reporter_discord: payload?.reporter_discord ? String(payload.reporter_discord).trim() : null,
      against,
      against_driver_id: againstDriverId,
      race_date: payload?.race_date || null,
      track_id: payload?.track ? String(payload.track).trim() : null,
      lap: payload?.lap ? String(payload.lap).trim() : null,
      time_in_race: payload?.time_in_race ? String(payload.time_in_race).trim() : null,
      incident_type: payload?.incident_type ? String(payload.incident_type).trim() : null,
      description,
      championship_id: championshipId,
      race_id: raceId,
      clash_round: clashRound,
      replay_url: payload?.replay_url ? String(payload.replay_url).trim() : null,
      source,
    };

    const { data, error } = await serviceClient
      .from('incident_reports')
      .insert(insertRow)
      .select()
      .maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 400);

    return json({ ok: true, data: { complaint_key: data.id, submitted_at: data.created_at } });
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

// ═══════════════════════════════════════════════════════════
// RUNBOOK #402 — passi che restano da fare fuori da qui (io non
// tocco token/chiavi per policy di sessione, mai da incollare a me):
//
// 1. https://discord.com/developers/applications → app VSD Paddock
//    → General Information → "Public Key" → impostarlo come secret
//    Supabase: DISCORD_PUBLIC_KEY (Project Settings → Edge Functions
//    → Secrets, o `supabase secrets set DISCORD_PUBLIC_KEY=...`).
// 2. Stesso pannello → "Interactions Endpoint URL" → incollare:
//    https://cjbwhrrtxhckbkyxfdgm.supabase.co/functions/v1/incidents-report
//    Discord manda subito un PING: risponde 200 solo se il secret è
//    già impostato, altrimenti il campo non si salva — fare il passo
//    1 PRIMA di questo.
// 3. Registrare il comando globale (una volta, o dopo modifiche alle
//    opzioni) con una PUT autenticata dal proprio bot token — MAI da
//    incollare a me:
//    PUT https://discord.com/api/v10/applications/<APP_ID>/commands
//    Authorization: Bot <TOKEN>
//    [{
//      "name": "segnala-incidente",
//      "description": "Segnala un incidente alla Direzione Gara VSD",
//      "options": [
//        { "name": "ambito", "description": "Cosa riguarda la segnalazione", "type": 3, "required": true,
//          "choices": [
//            { "name": "Campionato", "value": "campionato" },
//            { "name": "Gara specifica", "value": "gara" },
//            { "name": "Clash of Classes", "value": "clash" }
//          ] },
//        { "name": "evento", "description": "Quale campionato/gara/round", "type": 3, "required": true, "autocomplete": true },
//        { "name": "segnalato", "description": "Pilota o team segnalato", "type": 3, "required": true },
//        { "name": "descrizione", "description": "Cosa è successo", "type": 3, "required": true, "max_length": 2000 },
//        { "name": "tipologia", "description": "Tipologia incidente", "type": 3, "required": false,
//          "choices": [ /* una entry {name,value} per ognuna delle 12 in DISCORD_INCIDENT_TYPES */ ] },
//        { "name": "giro", "description": "Giro (opzionale)", "type": 3, "required": false },
//        { "name": "minuto", "description": "Minuto:secondo (opzionale)", "type": 3, "required": false },
//        { "name": "replay", "description": "Link clip/telemetria (opzionale)", "type": 3, "required": false }
//      ]
//    }]
// ═══════════════════════════════════════════════════════════
