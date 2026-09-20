// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — academy.ranking (porting fedele di
// apps-script/Academy.js, handleAcademyRanking + Fase 2/3)
// ═══════════════════════════════════════════════════════════
// Rating "VR" per pilota, per sim, calcolato a runtime da
// race_results — nessuna tabella dedicata (stessa scelta "unica
// fonte di verità" del sorgente).
//
// PM (Punti Merito): scala F1 ricalibrata per finish_position
// class-relative + bonus giro veloce/presenza≥75%/pole opportunistico.
// Solo session_type='race' contribuisce (fedele al sorgente).
//
// PP (Punti Penalità, Fase 2): letti a runtime da
// incident_resolutions — contribuisce solo se sim+penalized_driver_id
// sono stati compilati esplicitamente in fase di risoluzione.
//
// Badge (Fase 3): percentili PER SIM (non soglie fisse) su chi ha
// almeno ACADEMY_BADGE_MIN_RACES gare in quel sim.
//
// paceRanking: classifica "passo puro" (gap % medio dal giro veloce
// di gruppo), scollegata da PM/PP/badge.
//
// DIFFERENZA dal sorgente: "VSD001" hardcoded → drivers.is_system_account
// (stesso principio già applicato in records-team/roster-list qui in
// cloud/). isCurrentTesserato_ replica lo stesso filtro (active,
// non removed, non sistema).
//
// Auth: qualsiasi membro del team loggato (fedele: ctx.driver_id
// richiesto, nessuna distinzione staff/driver).
//
// FIX #331 (stesso pattern di #329/#330): race_results.driver_id è lo
// UUID interno (FK drivers.id) — pmByDriver/paceByDriver sono quindi
// keyed sull'uuid. Il frontend/altre pagine che consumano questa
// risposta si aspettano il codice pilota sotto driver_id (contratto
// uniforme in tutto il progetto) — driver_code aggiunto alla select
// drivers e usato per alias nell'output finale di ranking/paceRanking.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Fallback token legacy (#331 fix, 20/09/2026 — vedi nota completa in
// cloud/functions/social-manager/index.ts): nessun pilota reale ha mai
// una sessione Supabase reale, solo il token legacy Discord OAuth via
// Apps Script. Stesso pattern già usato per le 19 Edge Function di
// #334 e per il dispatcher social-manager.
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
      .select('id, team_id, role, display_name, driver_code')
      .eq('driver_code', driverCode)
      .maybeSingle();
    if (!d) return null;
    return { ...d, role: j.data.driver.role || d.role };
  } catch {
    return null;
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ACADEMY_PM_BASE_TABLE: Record<number, number> = { 1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2, 10: 1 };
function pmBase(position: number | null): number {
  if (!position || position < 1) return 0;
  return ACADEMY_PM_BASE_TABLE[position] || 0;
}

const PP_PENALTY_POINTS: Record<string, number> = {
  '': 0,
  'nessuna': 0,
  'warning': -1,
  'penalità lieve': -2,
  'penalità media': -4,
  'penalità pesante': -7,
  'squalifica': -10,
};

const ACADEMY_BADGE_MIN_RACES = 5;
const ACADEMY_BADGE_CUTOFFS = { platino: 0.10, oro: 0.35, argento: 0.65 };
const ACADEMY_PACE_MIN_RACES = 3;

function computePenaltyPoints(resolutions: any[], sim: string): Record<string, { pp: number; penalties_count: number }> {
  const ppByDriver: Record<string, { pp: number; penalties_count: number }> = {};
  resolutions.forEach((r: any) => {
    const driverId = r.penalized_driver_id ? String(r.penalized_driver_id).trim() : '';
    const resSim = r.sim ? String(r.sim).trim() : '';
    if (!driverId || resSim !== sim) return;
    const points = PP_PENALTY_POINTS[String(r.penalty_type || '')];
    if (points === undefined) return;
    if (!ppByDriver[driverId]) ppByDriver[driverId] = { pp: 0, penalties_count: 0 };
    ppByDriver[driverId].pp += points;
    if (points !== 0) ppByDriver[driverId].penalties_count += 1;
  });
  return ppByDriver;
}

function assignAcademyBadges(ranking: any[]) {
  const qualifying = ranking.filter((r) => r.races >= ACADEMY_BADGE_MIN_RACES);
  const n = qualifying.length;
  if (n === 0) return;

  const platinoEnd = Math.max(1, Math.round(n * ACADEMY_BADGE_CUTOFFS.platino));
  const oroEnd = Math.max(platinoEnd + 1, Math.round(n * ACADEMY_BADGE_CUTOFFS.oro));
  const argentoEnd = Math.max(oroEnd + 1, Math.round(n * ACADEMY_BADGE_CUTOFFS.argento));

  qualifying.forEach((r, idx) => {
    const rank = idx + 1;
    if (rank <= platinoEnd) r.badge = 'platino';
    else if (rank <= oroEnd) r.badge = 'oro';
    else if (rank <= argentoEnd) r.badge = 'argento';
    else r.badge = 'bronzo';
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const payload = await req.json().catch(() => ({}));
    const authHeader = req.headers.get('Authorization');
    let supabase: any = null;
    let me: any = null;

    if (authHeader) {
      supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: meRow } = await supabase
          .from('drivers')
          .select('id, team_id, role, display_name, driver_code')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        me = meRow || null;
      }
    }

    if (!me) {
      const legacyServiceClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const legacyMe = await resolveLegacyDriver(legacyServiceClient, payload?.legacy_token);
      if (legacyMe) {
        me = legacyMe;
        supabase = legacyServiceClient;
      }
    }

    if (!me) return json({ ok: false, error: 'Auth richiesto' }, 401);

    const sim = payload?.sim ? String(payload.sim) : '';
    if (!sim) return json({ ok: false, error: 'sim mancante' }, 400);

    const { data: allResults, error: resErr } = await supabase
      .from('race_results')
      .select('race_id, sim, car_class, session_type, driver_id, total_laps, best_lap_ms, finish_position, track_id')
      .eq('team_id', me.team_id)
      .eq('sim', sim)
      .not('driver_id', 'is', null);
    if (resErr) return json({ ok: false, error: resErr.message }, 400);
    const results = allResults ?? [];

    // Raggruppa per (race_id, car_class, session_type)
    const groups: Record<string, any[]> = {};
    results.forEach((r: any) => {
      const key = [r.race_id, r.car_class, r.session_type].join('|');
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });

    const pmByDriver: Record<string, { pm: number; races: number }> = {};
    const paceByDriver: Record<string, { gapSum: number; races: number; bestLapMs: number | null; bestLapTrackId: string | null }> = {};

    Object.keys(groups).forEach((key) => {
      const group = groups[key];
      const sessionType = group[0].session_type;
      if (sessionType !== 'race') return;

      const leaderLaps = Math.max(0, ...group.map((r: any) => Number(r.total_laps) || 0));
      const validLaps = group.filter((r: any) => r.best_lap_ms != null && Number(r.best_lap_ms) > 0);
      const fastestMs = validLaps.length ? Math.min(...validLaps.map((r: any) => Number(r.best_lap_ms))) : null;

      const poleKey = [group[0].race_id, group[0].car_class, 'qualifying'].join('|');
      const poleGroup = groups[poleKey];
      let poleDriverId: string | null = null;
      if (poleGroup && poleGroup.length) {
        const poleWinner = poleGroup.slice().sort((a: any, b: any) => (Number(a.finish_position) || 999) - (Number(b.finish_position) || 999))[0];
        poleDriverId = poleWinner ? poleWinner.driver_id : null;
      }

      group.forEach((r: any) => {
        if (!r.driver_id) return;

        let pm = pmBase(Number(r.finish_position));
        if (fastestMs != null && Number(r.best_lap_ms) === fastestMs) pm += 1;
        if (leaderLaps > 0 && (Number(r.total_laps) || 0) / leaderLaps >= 0.75) pm += 1;
        if (poleDriverId && r.driver_id === poleDriverId) pm += 1;

        if (!pmByDriver[r.driver_id]) pmByDriver[r.driver_id] = { pm: 0, races: 0 };
        pmByDriver[r.driver_id].pm += pm;
        pmByDriver[r.driver_id].races += 1;

        if (fastestMs != null && r.best_lap_ms != null && Number(r.best_lap_ms) > 0) {
          const lapMs = Number(r.best_lap_ms);
          const gapPct = ((lapMs - fastestMs) / fastestMs) * 100;
          if (!paceByDriver[r.driver_id]) paceByDriver[r.driver_id] = { gapSum: 0, races: 0, bestLapMs: null, bestLapTrackId: null };
          const pace = paceByDriver[r.driver_id];
          pace.gapSum += gapPct;
          pace.races += 1;
          if (pace.bestLapMs == null || lapMs < pace.bestLapMs) {
            pace.bestLapMs = lapMs;
            pace.bestLapTrackId = r.track_id || null;
          }
        }
      });
    });

    const { data: drivers, error: driversErr } = await supabase
      .from('drivers')
      .select('id, driver_code, display_name, avatar_url, status, removed_at, is_system_account')
      .eq('team_id', me.team_id);
    if (driversErr) return json({ ok: false, error: driversErr.message }, 400);
    const driverMap: Record<string, any> = {};
    (drivers ?? []).forEach((d: any) => { driverMap[d.id] = d; });

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

    const { data: resolutions, error: resoErr } = await supabase
      .from('incident_resolutions')
      .select('penalized_driver_id, sim, penalty_type')
      .eq('team_id', me.team_id);
    if (resoErr) return json({ ok: false, error: resoErr.message }, 400);
    const ppByDriver = computePenaltyPoints(resolutions ?? [], sim);

    const paceRanking = Object.keys(paceByDriver)
      .filter(isCurrentTesserato)
      .filter((driverId) => paceByDriver[driverId].races >= ACADEMY_PACE_MIN_RACES)
      .map((driverId) => {
        const p = paceByDriver[driverId];
        return {
          driver_id: driverCode(driverId),
          display_name: driverMap[driverId]?.display_name || driverId,
          avatar_url: driverMap[driverId]?.avatar_url || '',
          avg_gap_pct: Math.round((p.gapSum / p.races) * 100) / 100,
          best_lap_ms: p.bestLapMs,
          best_lap_track_id: p.bestLapTrackId,
          races: p.races,
        };
      })
      .sort((a, b) => a.avg_gap_pct - b.avg_gap_pct);

    const ranking = Object.keys(pmByDriver)
      .filter(isCurrentTesserato)
      .map((driverId) => {
        const pm = pmByDriver[driverId].pm;
        const pp = ppByDriver[driverId]?.pp || 0;
        return {
          driver_id: driverCode(driverId),
          display_name: driverMap[driverId]?.display_name || driverId,
          avatar_url: driverMap[driverId]?.avatar_url || '',
          pm, pp, vr: pm + pp,
          races: pmByDriver[driverId].races,
          penalties_count: ppByDriver[driverId]?.penalties_count || 0,
          badge: null as string | null,
        };
      })
      .sort((a, b) => b.vr - a.vr);

    assignAcademyBadges(ranking);

    return json({
      ok: true,
      data: { sim, ranking, count: ranking.length, paceRanking, paceRankingMinRaces: ACADEMY_PACE_MIN_RACES },
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
