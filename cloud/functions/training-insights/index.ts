// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — training.insights (porting fedele di
// apps-script/TrainingInsights.js, handleTrainingInsights)
// ═══════════════════════════════════════════════════════════
// Dashboard di allenamento calcolata a runtime da best_laps — nessuna
// tabella dedicata, stesso principio di Records.js/Academy.js.
//
// "Giro di allenamento" = session_type 'practice' o 'time_trial' —
// qualifica/gara NON conta come allenamento anche se il giro finisce
// comunque in best_laps.
//
// Il record squadra per pista (riferimento per il gap) è calcolato su
// TUTTI i session_type (stesso criterio di Records.js), non solo
// quelli di allenamento.
//
// DIFFERENZA dal sorgente: "VSD001" hardcoded → drivers.is_system_account
// (stesso principio già applicato in academy-ranking/records-team).
//
// Auth: qualsiasi membro del team loggato (fedele: ctx.driver_id
// richiesto, stesso gate di records.team).
//
// FIX #331 (stesso pattern di #329/#330): best_laps.driver_id è lo
// UUID interno, ma il frontend si aspetta il codice pilota — driver_code
// aggiunto alla select drivers e usato per alias driver_id/
// team_best_driver_id nell'output finale. Il calcolo interno (isCurrentTesserato,
// raggruppamento byDriver, teamBestByTrack) resta sull'id interno,
// stabile e non ambiguo — solo l'output è aliasato.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TRAINING_SESSION_TYPES = ['practice', 'time_trial'];
const TRAINING_WINDOW_7D_MS = 7 * 24 * 60 * 60 * 1000;
const TRAINING_WINDOW_30D_MS = 30 * 24 * 60 * 60 * 1000;

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(value as string);
  return isNaN(d.getTime()) ? null : d;
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
    const sim = payload?.sim ? String(payload.sim) : 'LMU';

    const { data: me, error: meErr } = await supabase
      .from('drivers')
      .select('id, team_id')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (meErr) return json({ ok: false, error: meErr.message }, 400);
    if (!me) return json({ ok: false, error: 'Driver non collegato a questo account' }, 404);

    const { data: allLaps, error: lapsErr } = await supabase
      .from('best_laps')
      .select('driver_id, sim, track_id, lap_time_ms, lap_time_display, session_type, set_date')
      .eq('team_id', me.team_id)
      .eq('sim', sim);
    if (lapsErr) return json({ ok: false, error: lapsErr.message }, 400);

    const { data: drivers, error: driversErr } = await supabase
      .from('drivers')
      .select('id, driver_code, display_name, status, removed_at, is_system_account')
      .eq('team_id', me.team_id);
    if (driversErr) return json({ ok: false, error: driversErr.message }, 400);
    const driverMap: Record<string, any> = {};
    (drivers ?? []).forEach((d: any) => { driverMap[d.id] = d; });

    const { data: races, error: racesErr } = await supabase
      .from('races')
      .select('race_id, race_name, sim, status, date, track_id')
      .eq('team_id', me.team_id)
      .eq('sim', sim)
      .eq('status', 'scheduled');
    if (racesErr) return json({ ok: false, error: racesErr.message }, 400);

    function isCurrentTesserato(driverId: string): boolean {
      const d = driverMap[driverId];
      if (!d) return false;
      if (d.is_system_account) return false;
      if (d.removed_at) return false;
      return d.status === 'active';
    }

    function driverCode(driverId: string): string {
      return driverMap[driverId]?.driver_code || driverId;
    }

    const simLaps = (allLaps ?? []).filter((l: any) => {
      if (!l.driver_id || !l.sim || !l.track_id) return false;
      const ms = Number(l.lap_time_ms);
      if (!ms || ms <= 0) return false;
      return isCurrentTesserato(l.driver_id);
    });

    const teamBestByTrack: Record<string, { ms: number; display: string; driver_id: string }> = {};
    simLaps.forEach((l: any) => {
      const ms = Number(l.lap_time_ms);
      if (!teamBestByTrack[l.track_id] || ms < teamBestByTrack[l.track_id].ms) {
        teamBestByTrack[l.track_id] = { ms, display: l.lap_time_display || '', driver_id: l.driver_id };
      }
    });

    const trainingLaps = simLaps.filter((l: any) => TRAINING_SESSION_TYPES.includes(l.session_type));

    const now = new Date();
    const cutoff7 = new Date(now.getTime() - TRAINING_WINDOW_7D_MS);
    const cutoff30 = new Date(now.getTime() - TRAINING_WINDOW_30D_MS);

    const byDriver: Record<string, any> = {};
    function ensureDriver(driverId: string) {
      if (!byDriver[driverId]) {
        byDriver[driverId] = {
          driver_id: driverId,
          display_name: driverMap[driverId]?.display_name || driverId,
          laps_7d: 0,
          laps_30d: 0,
          last_session_date: null as Date | null,
          bestByTrack: {} as Record<string, { ms: number; display: string }>,
          lapsByTrack: {} as Record<string, number>,
        };
      }
      return byDriver[driverId];
    }

    trainingLaps.forEach((l: any) => {
      const entry = ensureDriver(l.driver_id);
      const d = parseDate(l.set_date);
      if (d) {
        if (d >= cutoff30) entry.laps_30d++;
        if (d >= cutoff7) entry.laps_7d++;
        if (!entry.last_session_date || d > entry.last_session_date) entry.last_session_date = d;
      }
      const ms = Number(l.lap_time_ms);
      const tid = l.track_id;
      if (!entry.bestByTrack[tid] || ms < entry.bestByTrack[tid].ms) {
        entry.bestByTrack[tid] = { ms, display: l.lap_time_display || '' };
      }
      entry.lapsByTrack[tid] = (entry.lapsByTrack[tid] || 0) + 1;
    });

    (drivers ?? []).forEach((d: any) => {
      if (isCurrentTesserato(d.id)) ensureDriver(d.id);
    });

    const driverSummaries = Object.values(byDriver)
      .map((entry: any) => {
        const tracks = Object.keys(entry.bestByTrack)
          .map((tid) => {
            const pb = entry.bestByTrack[tid];
            const teamBest = teamBestByTrack[tid];
            return {
              track_id: tid,
              personal_best_ms: pb.ms,
              personal_best_display: pb.display,
              team_best_ms: teamBest ? teamBest.ms : null,
              team_best_driver_id: teamBest ? driverCode(teamBest.driver_id) : null,
              laps: entry.lapsByTrack[tid] || 0,
            };
          })
          .sort((a, b) => b.laps - a.laps);

        return {
          driver_id: driverCode(entry.driver_id),
          display_name: entry.display_name,
          laps_7d: entry.laps_7d,
          laps_30d: entry.laps_30d,
          last_session_date: entry.last_session_date ? entry.last_session_date.toISOString() : null,
          tracks,
        };
      })
      .sort((a: any, b: any) => b.laps_7d - a.laps_7d || b.laps_30d - a.laps_30d || a.display_name.localeCompare(b.display_name));

    const nowMs = now.getTime();
    const upcomingSimRaces = (races ?? [])
      .filter((r: any) => { const d = parseDate(r.date); return d && d.getTime() > nowMs; })
      .sort((a: any, b: any) => (parseDate(a.date) as Date).getTime() - (parseDate(b.date) as Date).getTime());
    const nextRace = upcomingSimRaces.length > 0 ? upcomingSimRaces[0] : null;

    const requestedTrackId = payload?.track_id ? String(payload.track_id) : null;
    const readinessTrackId = requestedTrackId || (nextRace && (nextRace as any).track_id) || null;

    let readiness: any = null;
    if (readinessTrackId) {
      readiness = Object.values(byDriver)
        .map((entry: any) => ({
          driver_id: driverCode(entry.driver_id),
          display_name: entry.display_name,
          laps_on_track: entry.lapsByTrack[readinessTrackId] || 0,
        }))
        .sort((a: any, b: any) => b.laps_on_track - a.laps_on_track);
    }

    return json({
      ok: true,
      data: {
        sim,
        generated_at: now.toISOString(),
        drivers: driverSummaries,
        next_race: nextRace ? {
          race_id: (nextRace as any).race_id,
          race_name: (nextRace as any).race_name,
          track_id: (nextRace as any).track_id,
          date: (nextRace as any).date,
        } : null,
        readiness_track_id: readinessTrackId,
        readiness,
      },
    });
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
