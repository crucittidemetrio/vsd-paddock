// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — laps.add (porting di apps-script/BestLaps.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handleLapsAdd):
//   - auth richiesto, SOLO staff/admin
//   - campi obbligatori: driver_id, sim, track_id, car_id, lap_time_display
//   - lap_time_display accetta virgola e formato sotto il minuto
//     (normalizeLapTimeInput_), poi parsing rigoroso M:SS.mmm
//
// DIFFERENZE deliberate rispetto al sistema reale:
//   - payload.driver_id qui è il driver_code (es. "VSD005"), come nel
//     sistema reale — ma va risolto all'uuid interno (drivers.id) per
//     lo scritto sulla FK. Risoluzione ristretta al team del
//     chiamante: uno staff non può accreditare un giro a un driver di
//     un altro team anche conoscendone il codice.
//
// GAP CHIUSO in #262: il controllo "nuovo record di squadra" + notifica
// Discord (notifyNewTeamRecord_), documentato come non portato in #179,
// è stato aggiunto qui — porting fedele di handleLapsAdd: record
// precedente = giro più veloce su (sim, track_id) di un tesserato
// attivo (is_system_account=false, removed_at null, status='active'),
// qualsiasi session_type. Notifica non bloccante (try/catch), postata
// sul webhook principale (DISCORD_WEBHOOK_URL), non su quello admin.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const REQUIRED_FIELDS = ['driver_id', 'sim', 'track_id', 'car_id', 'lap_time_display'];

function normalizeLapTimeInput(raw: unknown): string {
  let value = String(raw ?? '').trim().replace(',', '.');
  if (/^\d{1,2}\.\d{1,3}$/.test(value)) value = '0:' + value;
  return value;
}

function parseLapTimeToMs(display: unknown): number | null {
  const value = normalizeLapTimeInput(display);
  const match = value.match(/^(\d+):(\d{1,2})\.(\d{1,3})$/);
  if (!match) return null;
  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  if (seconds >= 60) return null;
  const msPart = match[3].padEnd(3, '0').slice(0, 3);
  const ms = parseInt(msPart, 10);
  return minutes * 60000 + seconds * 1000 + ms;
}

function msToLapDisplay(ms: number | null): string {
  if (ms == null || isNaN(ms) || ms <= 0) return '';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function isCurrentTesserato(d: any): boolean {
  if (!d) return false;
  if (d.is_system_account) return false;
  if (d.removed_at) return false;
  return String(d.status).toLowerCase() === 'active';
}

async function postToDiscordWebhook(payload: unknown, envName: string): Promise<void> {
  try {
    const url = Deno.env.get(envName);
    if (!url) return;
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch (_e) {
    // fault-tolerant, fedele al try/catch del sorgente attorno a notifyNewTeamRecord_
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ ok: false, error: 'Auth richiesto' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) return json({ ok: false, error: 'Auth richiesto' }, 401);

    const payload = await req.json().catch(() => ({}));

    for (const field of REQUIRED_FIELDS) {
      const v = payload?.[field];
      if (v === undefined || v === null || String(v).trim() === '') {
        return json({ ok: false, error: `Campo obbligatorio mancante o vuoto: ${field}` }, 400);
      }
    }

    const lapTimeMs = parseLapTimeToMs(payload.lap_time_display);
    if (lapTimeMs === null) {
      return json({ ok: false, error: 'lap_time_display non valido. Formato atteso: M:SS.mmm (es. 1:30.333)' }, 400);
    }

    const { data: me, error: meErr } = await supabase
      .from('drivers')
      .select('id, team_id, role')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (meErr) return json({ ok: false, error: meErr.message }, 400);
    if (!me) return json({ ok: false, error: 'Driver non collegato a questo account' }, 404);
    if (me.role !== 'staff' && me.role !== 'admin') {
      return json({ ok: false, error: 'Permessi insufficienti' }, 403);
    }

    // driver_id dal payload è il driver_code, come nel sistema reale —
    // risolto qui all'uuid, ristretto al team del chiamante.
    const { data: targetDriver, error: targetErr } = await supabase
      .from('drivers')
      .select('id')
      .eq('team_id', me.team_id)
      .eq('driver_code', String(payload.driver_id))
      .maybeSingle();
    if (targetErr) return json({ ok: false, error: targetErr.message }, 400);
    if (!targetDriver) return json({ ok: false, error: 'Driver non trovato nel team: ' + payload.driver_id }, 404);

    // Record di squadra precedente su (sim, track_id), PRIMA di inserire
    // il nuovo giro — porting fedele di handleLapsAdd. Un fallimento qui
    // non deve mai bloccare il salvataggio del giro.
    let previousBestDisplay: string | null = null;
    let isNewRecordCandidate = false;
    try {
      const [{ data: existingLaps }, { data: driversRows }] = await Promise.all([
        supabase.from('best_laps').select('driver_id, lap_time_ms, lap_time_display')
          .eq('team_id', me.team_id).eq('sim', String(payload.sim)).eq('track_id', String(payload.track_id)),
        supabase.from('drivers').select('id, is_system_account, removed_at, status').eq('team_id', me.team_id),
      ]);
      const driverById = new Map((driversRows || []).map((d: any) => [d.id, d]));
      let previousBestMs: number | null = null;
      (existingLaps || []).forEach((l: any) => {
        const ms = Number(l.lap_time_ms);
        if (!ms || ms <= 0) return;
        if (!isCurrentTesserato(driverById.get(l.driver_id))) return;
        if (previousBestMs === null || ms < previousBestMs) {
          previousBestMs = ms;
          previousBestDisplay = l.lap_time_display || msToLapDisplay(ms);
        }
      });
      isNewRecordCandidate = isCurrentTesserato(driverById.get(targetDriver.id))
        && (previousBestMs === null || lapTimeMs < previousBestMs);
    } catch (_e) {
      // calcolo record precedente fallito: non bloccante, fedele al sorgente
    }

    const now = new Date().toISOString();
    const insertRow = {
      team_id: me.team_id,
      driver_id: targetDriver.id,
      sim: String(payload.sim),
      track_id: String(payload.track_id),
      car_id: String(payload.car_id),
      lap_time_ms: lapTimeMs,
      lap_time_display: msToLapDisplay(lapTimeMs),
      set_date: payload.set_date || now.split('T')[0],
      conditions: payload.conditions ? String(payload.conditions) : 'dry',
      air_temp_c: payload.air_temp_c !== undefined && payload.air_temp_c !== null ? Number(payload.air_temp_c) : null,
      track_temp_c: payload.track_temp_c !== undefined && payload.track_temp_c !== null ? Number(payload.track_temp_c) : null,
      session_type: payload.session_type ? String(payload.session_type) : 'practice',
      setup_shared: payload.setup_shared === true || payload.setup_shared === 'TRUE',
      setup_link: payload.setup_link ? String(payload.setup_link) : null,
      replay_url: payload.replay_url ? String(payload.replay_url) : null,
      verified_by: me.id,
      verified_at: now,
      notes: payload.notes ? String(payload.notes) : null,
    };

    const { data, error } = await supabase.from('best_laps').insert(insertRow).select().maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 400);

    if (isNewRecordCandidate) {
      try {
        const [{ data: driverRow }, { data: trackRow }] = await Promise.all([
          supabase.from('drivers').select('display_name').eq('id', targetDriver.id).maybeSingle(),
          supabase.from('tracks').select('track_name').eq('track_id', String(payload.track_id)).maybeSingle(),
        ]);
        const driverName = driverRow?.display_name || String(payload.driver_id);
        const trackName = trackRow?.track_name || String(payload.track_id);
        const embed: any = {
          author: { name: 'VSD Paddock' },
          title: '🏆 Nuovo record di squadra!',
          description: `**${driverName}** — ${trackName} (${payload.sim})\n⏱️ **${data.lap_time_display}**` +
            (previousBestDisplay ? ` _(precedente: ${previousBestDisplay})_` : ' _(primo tempo registrato su questa pista)_'),
          color: 0xa855f7,
          timestamp: new Date().toISOString(),
          footer: { text: 'Muro dei Record' },
          url: 'https://vsd-paddock.vercel.app/records',
        };
        await postToDiscordWebhook({ embeds: [embed] }, 'DISCORD_WEBHOOK_URL');
      } catch (_e) {
        // notifica non bloccante, fedele al sorgente
      }
    }

    return json({ ok: true, data: { lap: data } });
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
