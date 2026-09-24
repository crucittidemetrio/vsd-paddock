// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — raceResults.import (porting di
// apps-script/RaceResultsImport.js, handleRaceResultsImport)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale:
//   - auth richiesto, SOLO staff/admin (ctx.isStaff)
//   - payload: { race_id, json_data } — json_data accetta 2 formati:
//       LMU:      array [{carClass, result:[...]}]
//       iRacing:  oggetto {type:'event_result', data:{...}}
//   - matching nome-esterno→driver_id: matchDriverName_ multi-livello
//     (match esatto, poi "nome i.", poi prefisso cognome da real_name)
//   - dedup per (race_id, session_type, driver_key) — driver_key è
//     driver_id se matchato, altrimenti nome esterno lowercased
//   - iRacing: un solo JSON genera FINO A 3 sessioni (qualifying/heat/
//     race), ciascuna trasformata in formato LMU-like e passata allo
//     stesso import core; practice/warmup skippate
//
// GAP CHIUSO (24/09/2026, richiesto da Demetrio — "sistemiamo le
// notifiche perché gradite"): le notifiche Discord post-import
// (notifyRaceImported_, checkAndNotifyPodiums_/
// checkAndNotifyIracingPodiums_, checkAndNotifyMilestones_,
// checkAndNotifyRaceMvp_) sono ora portate qui sotto — vedi
// notifyRaceImported/checkAndNotifyPodiumsLmu/checkAndNotifyPodiumsIracing/
// checkAndNotifyMilestones/checkAndNotifyRaceMvp. Tutte non bloccanti
// (try/catch interno, mai propagate al chiamante), stesso principio di
// seedRaceReportsForRace/recomputeEloSafetyForSim sopra. Deviazione
// deliberata rispetto al sorgente: la thumbnail foto pilota condizionata
// al consenso social (hasSocialConsent_) NON è stata portata — avrebbe
// richiesto una query aggiuntiva per ogni notifica per un dettaglio
// puramente estetico; gli embed restano identici nel contenuto testuale.
// Richiede i secret DISCORD_WEBHOOK_URL (canale pubblico) e, per la push
// personale su traguardi/pilota della gara, PUSH_RELAY_URL/
// PUSH_RELAY_SECRET (stesso relay Vercel già in uso lato Apps Script) —
// se non configurati, le funzioni loggano e ritornano silenziosamente,
// mai un errore propagato all'import.
//
// GAP CHIUSO in #261: il seeding automatico di Race Reports
// (seedRaceReportsForRace_ nel sorgente) è ora replicato qui in
// seedRaceReportsForRace(), chiamato in modo non bloccante (try/catch,
// mai propagato al chiamante) dopo ogni importGroup con
// session_type==='race' — fedele a RaceResultsImport.js righe 580-659,
// che lo esegue sempre dopo un import "race" sia per LMU sia per
// iRacing, avvolto nello stesso try/catch fault-tolerant delle
// notifiche Discord.
//
// invalidateRaceLapsCache_() del sorgente reale non ha equivalente
// qui: è un invalidamento della cache applicativa di Apps Script
// (CacheService), che Postgres non usa — non è un gap, è
// semplicemente un meccanismo che non si applica a questa architettura.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Fallback token legacy (#370 fix, 21/09/2026 — stesso gap di
// #358/#359/#375/#378: nessun pilota reale, incluso l'unico admin
// reale, ha mai ottenuto una sessione Supabase vera — solo il token
// legacy Discord OAuth via Apps Script. Questa funzione richiedeva
// SEMPRE `req.headers.get('Authorization')` + `auth.getUser()` validi,
// senza alcun fallback: raceResults.import era di fatto irraggiungibile
// da chiunque, scoperto qui mentre si agganciava il ricalcolo Elo/
// Safety Rank (#370) — senza un import funzionante l'aggancio non è
// mai testabile né utilizzabile. Stesso pattern resolveLegacyDriver
// già usato in best-laps-list/social-manager/ecc.
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

// ─── Elo + Safety Rank (#370) — aggiornamento dopo ogni import di una
// sessione 'race'. Duplicazione dell'algoritmo di elo.backfill
// (cloud/functions/social-manager/index.ts, #369) — stessa
// duplicazione già praticata nel repo per logica condivisa tra slug
// diversi (addBestLapWithRecordCheck in best-laps-add/social-manager,
// resolveDriver nelle fuel-*).
//
// DECISIONE: non un vero incremento "solo il delta di questa gara",
// ma un ribackfill COMPLETO scoped al solo sim della gara appena
// importata (non team-wide). Motivo: l'ordine cronologico di import
// non è garantito (una gara vecchia può essere importata in ritardo,
// o ri-importata dopo una correzione) — rigiocare tutto lo storico di
// quel sim è l'unico modo per restare sempre corretti, esattamente
// come il backfill stesso è pensato per essere idempotente/
// rilanciabile. Costo trascurabile alla scala di questo team (decine
// di gare per sim). Chiamato in modo non bloccante (try/catch, mai
// propagato al chiamante), stesso principio di seedRaceReportsForRace
// qui sotto.
//
// Usa un client service-role dedicato (non il client JWT dell'utente
// autenticato `supabase`): le tabelle driver_elo_*/driver_safety_*
// (031_elo_safety_rank.sql) concedono a `authenticated` solo
// select/insert/update, MAI delete — né a livello di GRANT né di
// policy RLS — perché il ribackfill deve poter cancellare e
// ricostruire da zero. Stesso pattern già usato per elo.backfill.
const ELO_K_FACTOR = (racesBefore: number) => (racesBefore < 10 ? 40 : racesBefore < 30 ? 24 : 16);
const SAFETY_PENALTY: Record<string, number> = {
  'warning': -2,
  'penalità lieve': -4,
  'penalità media': -8,
  'penalità pesante': -15,
  'squalifica': -25,
};
const SAFETY_REASON: Record<string, string> = {
  'warning': 'warning',
  'penalità lieve': 'lieve',
  'penalità media': 'media',
  'penalità pesante': 'pesante',
  'squalifica': 'squalifica',
};

async function recomputeEloSafetyForSim(teamId: string, sim: string) {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  for (const table of ['driver_elo_history', 'driver_elo_ratings', 'driver_safety_rank_history', 'driver_safety_ranks']) {
    const { error } = await db.from(table).delete().eq('team_id', teamId).eq('sim', sim);
    if (error) throw new Error(`${table}: ${error.message}`);
  }

  const { data: results, error: resErr } = await db
    .from('race_results')
    .select('race_id, sim, car_class, driver_id, finish_position, total_laps, set_date, imported_at')
    .eq('team_id', teamId)
    .eq('sim', sim)
    .eq('session_type', 'race')
    .not('driver_id', 'is', null)
    .not('dns', 'eq', true);
  if (resErr) throw new Error(resErr.message);

  const { data: resolutions, error: resoErr } = await db
    .from('incident_resolutions')
    .select('id, sim, penalized_driver_id, penalty_type, resolved_at')
    .eq('team_id', teamId)
    .eq('sim', sim)
    .not('penalized_driver_id', 'is', null)
    .not('resolved_at', 'is', null);
  if (resoErr) throw new Error(resoErr.message);

  const raceGroups: Record<string, any[]> = {};
  (results ?? []).forEach((r: any) => {
    const key = [r.sim, r.race_id || 'no-race-id', r.car_class].join('|');
    if (!raceGroups[key]) raceGroups[key] = [];
    raceGroups[key].push(r);
  });

  function groupTimestamp(group: any[]): number {
    const dates = group.map((r) => (r.set_date ? new Date(r.set_date).getTime() : new Date(r.imported_at).getTime()));
    return Math.min(...dates);
  }

  const sortedGroupKeys = Object.keys(raceGroups)
    .filter((k) => raceGroups[k].length >= 2)
    .sort((a, b) => groupTimestamp(raceGroups[a]) - groupTimestamp(raceGroups[b]));

  const eloState: Record<string, { rating: number; races: number }> = {};
  const eloHistoryRows: any[] = [];

  sortedGroupKeys.forEach((key) => {
    const group = raceGroups[key];
    const groupSim = group[0].sim;
    const carClass = group[0].car_class;
    const raceId = group[0].race_id;

    const withPosition = group.filter((r: any) => r.finish_position != null);
    if (withPosition.length < 2) return;

    const stateKey = (driverId: string) => `${driverId}|${groupSim}`;
    withPosition.forEach((r: any) => {
      if (!eloState[stateKey(r.driver_id)]) eloState[stateKey(r.driver_id)] = { rating: 1500, races: 0 };
    });

    const preRaceRating: Record<string, number> = {};
    withPosition.forEach((r: any) => { preRaceRating[r.driver_id] = eloState[stateKey(r.driver_id)].rating; });

    withPosition.forEach((r: any) => {
      const myRating = preRaceRating[r.driver_id];
      const myPos = Number(r.finish_position);
      const opponents = withPosition.filter((o: any) => o.driver_id !== r.driver_id);
      if (opponents.length === 0) return;

      let expectedSum = 0;
      let actualSum = 0;
      opponents.forEach((o: any) => {
        const oppRating = preRaceRating[o.driver_id];
        const expected = 1 / (1 + Math.pow(10, (oppRating - myRating) / 400));
        const oppPos = Number(o.finish_position);
        const actual = myPos < oppPos ? 1 : myPos > oppPos ? 0 : 0.5;
        expectedSum += expected;
        actualSum += actual;
      });

      const racesBefore = eloState[stateKey(r.driver_id)].races;
      const k = ELO_K_FACTOR(racesBefore);
      const delta = k * ((actualSum - expectedSum) / opponents.length);
      const ratingBefore = myRating;
      const ratingAfter = ratingBefore + delta;

      eloState[stateKey(r.driver_id)] = { rating: ratingAfter, races: racesBefore + 1 };

      eloHistoryRows.push({
        team_id: teamId,
        driver_id: r.driver_id,
        sim: groupSim,
        race_id: raceId,
        car_class: carClass,
        rating_before: Math.round(ratingBefore * 100) / 100,
        rating_after: Math.round(ratingAfter * 100) / 100,
        delta: Math.round(delta * 100) / 100,
        k_factor: k,
        opponents_count: opponents.length,
      });
    });
  });

  type SafetyEvent = { driverId: string; sim: string; ts: number; kind: 'race' | 'penalty'; raceId?: string; resolutionId?: string; penaltyType?: string };
  const events: SafetyEvent[] = [];

  (results ?? []).forEach((r: any) => {
    const ts = r.set_date ? new Date(r.set_date).getTime() : new Date(r.imported_at).getTime();
    events.push({ driverId: r.driver_id, sim: r.sim, ts, kind: 'race', raceId: r.race_id });
  });
  (resolutions ?? []).forEach((res: any) => {
    if (!SAFETY_PENALTY[res.penalty_type]) return;
    events.push({
      driverId: res.penalized_driver_id, sim: res.sim, ts: new Date(res.resolved_at).getTime(),
      kind: 'penalty', resolutionId: res.id, penaltyType: res.penalty_type,
    });
  });
  events.sort((a, b) => a.ts - b.ts);

  const safetyState: Record<string, { rating: number; races: number }> = {};
  const safetyHistoryRows: any[] = [];

  events.forEach((ev) => {
    const key = `${ev.driverId}|${ev.sim}`;
    if (!safetyState[key]) safetyState[key] = { rating: 100, races: 0 };
    const before = safetyState[key].rating;

    let after = before;
    let reason: string;
    if (ev.kind === 'race') {
      after = Math.min(100, before + 1);
      reason = 'clean_race';
      safetyState[key].races += 1;
    } else {
      after = Math.max(0, before + SAFETY_PENALTY[ev.penaltyType!]);
      reason = SAFETY_REASON[ev.penaltyType!];
    }

    safetyState[key].rating = after;
    safetyHistoryRows.push({
      team_id: teamId,
      driver_id: ev.driverId,
      sim: ev.sim,
      race_id: ev.kind === 'race' ? ev.raceId : null,
      incident_resolution_id: ev.kind === 'penalty' ? ev.resolutionId : null,
      rating_before: Math.round(before * 100) / 100,
      rating_after: Math.round(after * 100) / 100,
      delta: Math.round((after - before) * 100) / 100,
      reason,
    });
  });

  async function bulkInsert(table: string, rows: any[], chunkSize = 500) {
    for (let i = 0; i < rows.length; i += chunkSize) {
      const { error } = await db.from(table).insert(rows.slice(i, i + chunkSize));
      if (error) throw new Error(`${table}: ${error.message}`);
    }
  }

  const eloRatingRows = Object.keys(eloState).map((key) => {
    const [driver_id, rsim] = key.split('|');
    return { team_id: teamId, driver_id, sim: rsim, rating: Math.round(eloState[key].rating * 100) / 100, races: eloState[key].races };
  });
  const safetyRatingRows = Object.keys(safetyState).map((key) => {
    const [driver_id, rsim] = key.split('|');
    return { team_id: teamId, driver_id, sim: rsim, rating: safetyState[key].rating, races: safetyState[key].races };
  });

  await bulkInsert('driver_elo_history', eloHistoryRows);
  await bulkInsert('driver_elo_ratings', eloRatingRows);
  await bulkInsert('driver_safety_rank_history', safetyHistoryRows);
  await bulkInsert('driver_safety_ranks', safetyRatingRows);
}

// ─── Notifiche Discord/push post-import (24/09/2026) ───
// Porting di apps-script/Notifications.js — vedi nota in testa al file.
const PADDOCK_URL = 'https://vsd-paddock.vercel.app';
const VSD_COLORS = { cyan: 0x00d9ff, green: 0x4ade80, orange: 0xfbbf24, purple: 0xa855f7 };

const MILESTONE_THRESHOLDS = [1, 10, 25, 50, 100, 150, 200, 250, 300];
const PODIUM_MILESTONE_THRESHOLDS = [1, 5, 10, 25, 50];
const WIN_MILESTONE_THRESHOLDS = [1, 5, 10, 25];
const MILESTONE_LABELS: Record<number, string> = {
  1: 'Debutto in gara! 🎉', 10: '10 gare disputate', 25: '25 gare disputate',
  50: '50 gare disputate', 100: '100 gare disputate — un secolo! 💯',
  150: '150 gare disputate', 200: '200 gare disputate', 250: '250 gare disputate', 300: '300 gare disputate',
};
const PODIUM_MILESTONE_LABELS: Record<number, string> = {
  1: 'Primo podio! 🎉', 5: '5 podi', 10: '10 podi', 25: '25 podi', 50: '50 podi',
};
const WIN_MILESTONE_LABELS: Record<number, string> = {
  1: 'Prima vittoria! 🎉', 5: '5 vittorie', 10: '10 vittorie', 25: '25 vittorie',
};

async function postToDiscord(payload: unknown) {
  try {
    const url = Deno.env.get('DISCORD_WEBHOOK_URL');
    if (!url) { console.log('[notify] DISCORD_WEBHOOK_URL non configurato'); return; }
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) console.log('[notify] Discord webhook ' + res.status);
  } catch (e) { console.log('[notify] postToDiscord error: ' + e); }
}

async function sendPushNotification(db: any, driverIds: string[] | null, notification: { title: string; body: string; url?: string }) {
  try {
    const relayUrl = Deno.env.get('PUSH_RELAY_URL');
    const relaySecret = Deno.env.get('PUSH_RELAY_SECRET');
    if (!relayUrl || !relaySecret) return;
    let query = db.from('push_subscriptions').select('endpoint, p256dh, auth_key, driver_id');
    if (driverIds) query = query.in('driver_id', driverIds);
    const { data: subs } = await query;
    if (!subs || subs.length === 0) return;
    await fetch(relayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-push-secret': relaySecret },
      body: JSON.stringify({
        subscriptions: subs.map((s: any) => ({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key }, driver_id: s.driver_id })),
        title: notification.title, body: notification.body, url: notification.url || PADDOCK_URL,
      }),
    });
  } catch (e) { console.log('[notify] sendPushNotification error: ' + e); }
}

function notifyRaceImported(race: { race_id: string; race_name?: string; sim?: string }, stats: { imported?: number; vsd_matched?: number }) {
  return postToDiscord({
    embeds: [{
      author: { name: 'VSD Paddock' },
      title: '🏁 Nuovo risultato gara importato',
      description: `**${race.race_name || race.race_id}**`,
      color: VSD_COLORS.cyan,
      fields: [
        { name: 'Sim', value: race.sim || '?', inline: true },
        { name: 'Risultati', value: String(stats.imported || 0), inline: true },
        { name: 'VSD', value: String(stats.vsd_matched || 0), inline: true },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'Apri Race Hub per dettagli' },
      url: `${PADDOCK_URL}/race/${race.race_id}`,
    }],
  });
}

async function checkAndNotifyPodiumsLmu(groups: any[], race: { race_id: string; race_name?: string; sim?: string }, driverNameMap: Record<string, string>) {
  for (const classGroup of groups) {
    for (const r of (classGroup.result || [])) {
      if (!r.position || r.position > 3 || r.dnf || r.dns) continue;
      const matchedId = matchDriverName(r.id, driverNameMap);
      if (!matchedId) continue;
      await notifyVsdPodium(r.id, r.position, race);
    }
  }
}

function notifyVsdPodium(driverName: string, position: number, race: { race_id: string; race_name?: string; sim?: string }) {
  const medals: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };
  const posLabels: Record<number, string> = { 1: 'P1 — VITTORIA', 2: 'P2', 3: 'P3' };
  return postToDiscord({
    embeds: [{
      author: { name: 'VSD Paddock' },
      title: `${medals[position]} Podio VSD!`,
      description: `**${driverName}** ${posLabels[position]}\n${race.race_name || race.race_id}`,
      color: position === 1 ? VSD_COLORS.green : VSD_COLORS.cyan,
      fields: [{ name: 'Sim', value: race.sim || '?', inline: true }],
      timestamp: new Date().toISOString(),
      url: `${PADDOCK_URL}/race/${race.race_id}`,
    }],
  });
}

async function checkAndNotifyMilestones(db: any, teamId: string, driverIds: string[]) {
  const uniqueIds = Array.from(new Set(driverIds.filter(Boolean)));
  if (uniqueIds.length === 0) return;

  const { data: allResults } = await db.from('race_results').select('driver_id, session_type, dns, dnf, finish_position').eq('team_id', teamId).in('driver_id', uniqueIds);
  const { data: drivers } = await db.from('drivers').select('id, display_name').eq('team_id', teamId).in('id', uniqueIds);
  const nameById = new Map<string, string>((drivers ?? []).map((d: any) => [d.id as string, d.display_name as string]));

  for (const driverId of uniqueIds) {
    const rows = (allResults ?? []).filter((r: any) => r.driver_id === driverId && (r.session_type || 'race') === 'race' && r.dns !== true);
    const racesCount = rows.length;
    const podiumsCount = rows.filter((r: any) => r.dnf !== true && Number(r.finish_position) > 0 && Number(r.finish_position) <= 3).length;
    const winsCount = rows.filter((r: any) => r.dnf !== true && Number(r.finish_position) === 1).length;
    const displayName = nameById.get(driverId) || driverId;

    if (MILESTONE_THRESHOLDS.includes(racesCount)) await notifyMilestoneReached(db, driverId, displayName, MILESTONE_LABELS[racesCount] || `${racesCount} gare disputate`);
    if (PODIUM_MILESTONE_THRESHOLDS.includes(podiumsCount)) await notifyMilestoneReached(db, driverId, displayName, PODIUM_MILESTONE_LABELS[podiumsCount]);
    if (WIN_MILESTONE_THRESHOLDS.includes(winsCount)) await notifyMilestoneReached(db, driverId, displayName, WIN_MILESTONE_LABELS[winsCount]);
  }
}

async function notifyMilestoneReached(db: any, driverId: string, displayName: string, label: string) {
  await postToDiscord({
    embeds: [{
      author: { name: 'VSD Paddock' },
      title: '🎖️ Traguardo raggiunto!',
      description: `**${displayName}** — ${label}`,
      color: VSD_COLORS.orange,
      timestamp: new Date().toISOString(),
      footer: { text: 'Continua così!' },
      url: `${PADDOCK_URL}/roster/${driverId}`,
    }],
  });
  await sendPushNotification(db, [driverId], { title: '🎖️ Traguardo raggiunto!', body: label, url: `${PADDOCK_URL}/roster/${driverId}` });
}

async function checkAndNotifyRaceMvp(db: any, teamId: string, race: { race_id: string; race_name?: string; sim?: string }) {
  const { data: raceRows } = await db.from('race_results').select('driver_id, finish_position, car_class, dnf, dns, incidents')
    .eq('team_id', teamId).eq('race_id', race.race_id).eq('session_type', 'race');
  if (!raceRows || raceRows.length === 0) return;

  const fieldSizes = new Map<string, number>();
  raceRows.forEach((r: any) => {
    const key = race.race_id + '__' + r.car_class;
    fieldSizes.set(key, (fieldSizes.get(key) || 0) + 1);
  });

  const vsdFinishers = raceRows.filter((r: any) => r.driver_id && r.dnf !== true && r.dns !== true && Number(r.finish_position) > 0);
  if (vsdFinishers.length === 0) return;

  const scored: Array<{ row: any; finishPct: number; incidents: number | null }> = vsdFinishers.map((r: any) => {
    const pos = Number(r.finish_position);
    const fieldSize = fieldSizes.get(race.race_id + '__' + r.car_class) || 0;
    const finishPct = fieldSize >= 3 ? Math.max(0, Math.min(1, 1 - (pos - 1) / (fieldSize - 1))) : 0;
    const incidents = r.incidents != null && !isNaN(Number(r.incidents)) ? Number(r.incidents) : null;
    return { row: r, finishPct, incidents };
  });

  scored.sort((a: { finishPct: number; incidents: number | null }, b: { finishPct: number; incidents: number | null }) => {
    const ai = a.incidents === null ? Infinity : a.incidents;
    const bi = b.incidents === null ? Infinity : b.incidents;
    if (ai !== bi) return ai - bi;
    return b.finishPct - a.finishPct;
  });

  const mvp = scored[0];
  if (!mvp || mvp.finishPct <= 0) return;

  const driverId = mvp.row.driver_id;
  const { data: driver } = await db.from('drivers').select('display_name').eq('id', driverId).maybeSingle();
  const displayName = driver?.display_name || driverId;
  const cleanLine = mvp.incidents === 0 ? ' · guida pulita (0 incidenti)' : (mvp.incidents != null ? ` · ${mvp.incidents} incidenti` : '');

  await postToDiscord({
    embeds: [{
      author: { name: 'VSD Paddock' },
      title: '⭐ Pilota della gara',
      description: `**${displayName}** — P${Number(mvp.row.finish_position)} (${mvp.row.car_class || '?'})${cleanLine}\n${race.race_name || race.race_id}`,
      color: VSD_COLORS.green,
      timestamp: new Date().toISOString(),
      footer: { text: 'Selezionato su piazzamento normalizzato + pulizia di guida' },
      url: `${PADDOCK_URL}/race/${race.race_id}`,
    }],
  });
  await sendPushNotification(db, [driverId], {
    title: '⭐ Sei il Pilota della gara!',
    body: `${race.race_name || race.race_id} — P${Number(mvp.row.finish_position)}${cleanLine}`,
    url: `${PADDOCK_URL}/race/${race.race_id}`,
  });
}

function msToLapDisplay(ms: number | null | undefined): string {
  if (ms == null || isNaN(ms as number)) return '';
  const total = Number(ms);
  if (total <= 0) return '';
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function msToTimeDisplay(ms: number | null | undefined): string {
  if (ms == null || isNaN(ms as number)) return '';
  const total = Number(ms);
  if (total <= 0) return '';
  const hours = Math.floor(total / 3600000);
  const minutes = Math.floor((total % 3600000) / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

// Porting fedele di matchDriverName_ (RaceResultsImport.js) — stesso
// algoritmo multi-livello già usato in pitwall-log-session, qui contro
// una matchMap driver_code-agnostica costruita da display_name/real_name.
function matchDriverName(externalName: unknown, matchMap: Record<string, string>): string | null {
  if (!externalName) return null;
  const name = String(externalName).toLowerCase().trim();

  if (matchMap[name]) return matchMap[name];

  const parts = name.split(/\s+/);

  if (parts.length === 2 && /^[a-z]\.?$/.test(parts[1])) {
    const variant = `${parts[0]} ${parts[1].charAt(0)}.`;
    if (matchMap[variant]) return matchMap[variant];
  }

  if (parts.length === 2) {
    const firstName = parts[0];
    const cleanSurname = parts[1].replace(/[^a-z]+$/g, '');
    if (cleanSurname.length >= 3) {
      for (const key in matchMap) {
        const keyParts = key.split(' ');
        if (keyParts.length !== 2) continue;
        if (keyParts[0] !== firstName) continue;
        const candidateSurname = keyParts[1].replace(/\.$/, '');
        if (candidateSurname.length > 1 && candidateSurname.indexOf(cleanSurname) === 0) {
          return matchMap[key];
        }
      }
    }
  }

  if (parts.length === 1 && matchMap[parts[0]]) {
    return matchMap[parts[0]];
  }

  return null;
}

function detectSessionType(jsonData: any[]): string | null {
  if (!Array.isArray(jsonData) || jsonData.length === 0) return null;
  const firstGroup = jsonData[0];
  if (!firstGroup?.result || !Array.isArray(firstGroup.result) || firstGroup.result.length === 0) return null;
  const hasPosition = firstGroup.result.some((r: any) => r.position != null);
  return hasPosition ? 'race' : 'qualifying';
}

function normalizeSessionType(simsessionName: string | undefined): string | null {
  const n = (simsessionName || '').toUpperCase();
  if (n.includes('QUALIF')) return 'qualifying';
  if (n.startsWith('HEAT')) return 'heat';
  if (n === 'RACE' || n === 'FEATURE') return 'race';
  return null;
}

function transformIracingResultToLMU(r: any) {
  const bestLapMs = r.best_lap_time && r.best_lap_time > 0 ? Math.round(r.best_lap_time / 10) : null;
  const reasonOut = r.reason_out || '';
  const isDnf = reasonOut !== 'Running' && reasonOut !== '';
  const isDns = r.laps_complete === 0 && r.starting_position === -1;
  const position = r.finish_position != null ? r.finish_position + 1 : null;
  const carNum = (r.livery && r.livery.car_number) || '';

  return {
    id: r.display_name || '',
    carNum,
    car: r.car_name || '',
    totalLaps: r.laps_complete || 0,
    bestLap: bestLapMs,
    totalTime: null,
    position,
    pointsGiven: null,
    penaltyPoints: null,
    pointTotal: r.champ_points || 0,
    dnf: isDnf,
    dns: isDns,
    incidents: r.incidents || 0,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const payload = await req.json().catch(() => ({}));
    if (!payload?.race_id) return json({ ok: false, error: 'race_id mancante' }, 400);
    if (!payload?.json_data) return json({ ok: false, error: 'json_data mancante' }, 400);

    let jsonData = payload.json_data;
    if (typeof jsonData === 'string') {
      try { jsonData = JSON.parse(jsonData); }
      catch (e) { return json({ ok: false, error: 'JSON non valido: ' + String(e) }, 400); }
    }

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
          .select('id, team_id, role')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        me = meRow || null;
      }
    }

    // Fallback token legacy (#370 fix) — vedi nota completa in testa al
    // file. Se risolto, `supabase` passa a service-role (RLS bypassata,
    // come nelle altre 20+ Edge Function con lo stesso fallback): lo
    // scoping per team resta comunque applicato esplicitamente in ogni
    // query sottostante via `.eq('team_id', me.team_id)`, invariato.
    if (!me) {
      const legacyServiceClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const legacyMe = await resolveLegacyDriver(legacyServiceClient, payload?.legacy_token);
      if (legacyMe) {
        me = legacyMe;
        supabase = legacyServiceClient;
      }
    }

    if (!me) return json({ ok: false, error: 'Auth richiesto' }, 401);
    if (me.role !== 'staff' && me.role !== 'admin') {
      return json({ ok: false, error: 'Forbidden: solo staff può importare risultati' }, 403);
    }

    const { data: race, error: raceErr } = await supabase
      .from('races')
      .select('race_id, sim, track_id, date')
      .eq('race_id', String(payload.race_id))
      .maybeSingle();
    if (raceErr) return json({ ok: false, error: raceErr.message }, 400);
    if (!race) return json({ ok: false, error: 'Gara non trovata: ' + payload.race_id }, 404);

    // Mappa nome→driver_id, ristretta al team del chiamante.
    const { data: teamDrivers, error: driversErr } = await supabase
      .from('drivers')
      .select('id, display_name, real_name')
      .eq('team_id', me.team_id);
    if (driversErr) return json({ ok: false, error: driversErr.message }, 400);

    const driverNameMap: Record<string, string> = {};
    (teamDrivers ?? []).forEach((d: any) => {
      if (d.display_name) {
        const key = String(d.display_name).toLowerCase().trim();
        if (!driverNameMap[key]) driverNameMap[key] = d.id;
      }
      if (d.real_name) {
        const rkey = String(d.real_name).toLowerCase().trim();
        if (!driverNameMap[rkey]) driverNameMap[rkey] = d.id;
      }
    });

    // ─── Import core: un gruppo di classi LMU-like → righe race_results ───
    async function importGroup(groups: any[], meta: { race_id: string; sim: string; track_id: string; set_date: string; session_type: string }) {
      const { data: existingRows, error: existErr } = await supabase
        .from('race_results')
        .select('driver_id, driver_name_external')
        .eq('team_id', me!.team_id)
        .eq('race_id', meta.race_id)
        .eq('session_type', meta.session_type);
      if (existErr) throw new Error(existErr.message);

      const existingKeys = new Set<string>();
      (existingRows ?? []).forEach((row: any) => {
        const key = row.driver_id || String(row.driver_name_external || '').toLowerCase().trim();
        if (key) existingKeys.add(key);
      });

      const timestamp = Date.now();
      const importedAt = new Date().toISOString();
      const rowsToInsert: Record<string, unknown>[] = [];
      let skippedCount = 0;

      groups.forEach((classGroup: any, classIdx: number) => {
        const carClass = classGroup.carClass || 'Unknown';
        const results = classGroup.result || [];
        const hasExplicitPosition = results.some((r: any) => r.position != null);

        let sortedResults;
        if (hasExplicitPosition) {
          sortedResults = [...results].sort((a: any, b: any) => (a.position ?? 999) - (b.position ?? 999));
        } else {
          sortedResults = [...results].sort((a: any, b: any) => {
            const aLaps = a.totalLaps || 0;
            const bLaps = b.totalLaps || 0;
            if (bLaps !== aLaps) return bLaps - aLaps;
            const aBest = a.bestLap ?? Infinity;
            const bBest = b.bestLap ?? Infinity;
            return aBest - bBest;
          });
        }

        sortedResults.forEach((r: any, idx: number) => {
          const matchedDriverId = matchDriverName(r.id, driverNameMap);
          const driverKey = matchedDriverId || String(r.id || '').toLowerCase().trim();
          if (driverKey && existingKeys.has(driverKey)) {
            skippedCount++;
            return;
          }
          if (driverKey) existingKeys.add(driverKey);

          const finishPosition = r.position != null ? r.position : idx + 1;

          rowsToInsert.push({
            result_id: `RES-${timestamp}-${classIdx}-${idx}`,
            team_id: me!.team_id,
            race_id: meta.race_id,
            sim: meta.sim,
            track_id: meta.track_id || null,
            set_date: meta.set_date || null,
            session_type: meta.session_type,
            car_class: carClass,
            car_num: r.carNum != null && r.carNum !== '' ? Number(r.carNum) : null,
            car_external_name: r.car || null,
            driver_id: matchedDriverId,
            driver_name_external: r.id || null,
            total_laps: r.totalLaps != null ? Number(r.totalLaps) : null,
            best_lap_ms: r.bestLap != null ? Number(r.bestLap) : null,
            best_lap_display: msToLapDisplay(r.bestLap),
            total_time_ms: r.totalTime != null ? Number(r.totalTime) : null,
            total_time_display: msToTimeDisplay(r.totalTime),
            finish_position: finishPosition,
            points_given: r.pointsGiven != null ? Number(r.pointsGiven) : null,
            penalty_points: r.penaltyPoints != null ? Number(r.penaltyPoints) : null,
            point_total: r.pointTotal != null ? Number(r.pointTotal) : null,
            dnf: r.dnf === true,
            dns: r.dns === true,
            is_vsd_driver: !!matchedDriverId,
            incidents: r.incidents != null ? Number(r.incidents) : null,
            imported_at: importedAt,
            raw_payload: r,
          });
        });
      });

      if (rowsToInsert.length === 0) {
        return { imported: 0, vsd_matched: 0, external: 0, dns: 0, dnf: 0, skipped_duplicates: skippedCount, session_type: meta.session_type, matchedIds: [] as string[] };
      }

      const { error: insertErr } = await supabase.from('race_results').insert(rowsToInsert);
      if (insertErr) throw new Error(insertErr.message);

      const vsdCount = rowsToInsert.filter((r: any) => r.is_vsd_driver).length;
      const dnsCount = rowsToInsert.filter((r: any) => r.dns).length;
      const dnfCount = rowsToInsert.filter((r: any) => r.dnf).length;
      // #24/09: raccolti per checkAndNotifyMilestones — driver_id VSD di
      // TUTTI i risultati appena inseriti (non solo podio/MVP).
      const matchedIds = rowsToInsert.filter((r: any) => r.driver_id).map((r: any) => r.driver_id as string);

      return {
        imported: rowsToInsert.length,
        vsd_matched: vsdCount,
        external: rowsToInsert.length - vsdCount,
        dns: dnsCount,
        dnf: dnfCount,
        skipped_duplicates: skippedCount,
        session_type: meta.session_type,
        matchedIds,
      };
    }

    // Porting fedele di seedRaceReportsForRace_ (apps-script/seedReports.js),
    // richiamato qui in modo non bloccante esattamente come nel sorgente
    // (righe 580-659 di RaceResultsImport.js): mai propagato al chiamante,
    // un eventuale fallimento del seeding non deve far fallire l'import.
    async function seedRaceReportsForRace(raceId: string) {
      try {
        const { data: results } = await supabase
          .from('race_results')
          .select('*')
          .eq('team_id', me!.team_id)
          .eq('race_id', raceId)
          .eq('session_type', 'race');

        const { data: existingReports } = await supabase
          .from('race_reports')
          .select('driver_id')
          .eq('team_id', me!.team_id)
          .eq('race_id', raceId);
        const existingDrivers = new Set((existingReports ?? []).map((r: any) => r.driver_id));

        const draftRows: Record<string, unknown>[] = [];
        (results ?? []).forEach((rr: any) => {
          if (rr.is_vsd_driver !== true) return;
          if (rr.dns === true) return;
          if (existingDrivers.has(rr.driver_id)) return;
          existingDrivers.add(rr.driver_id);

          const isDnf = rr.dnf === true;
          draftRows.push({
            team_id: me!.team_id,
            race_id: raceId,
            driver_id: rr.driver_id,
            grid_position: rr.qual_position ?? null,
            finish_position: isDnf ? null : (rr.finish_position ?? null),
            best_lap_ms: rr.best_lap_ms ?? null,
            incident_notes: isDnf ? '⚠ DNF — investigare causa nel replay' : null,
          });
        });

        if (draftRows.length > 0) {
          await supabase.from('race_reports').insert(draftRows);
        }
      } catch (_e) {
        // Fault-tolerant, fedele al try/catch del sorgente attorno a
        // seedRaceReportsForRace_: un fallimento qui non deve mai
        // interrompere o far fallire la risposta dell'import.
      }
    }

    const isIRacingFormat = jsonData && !Array.isArray(jsonData) && jsonData.type === 'event_result';

    if (isIRacingFormat) {
      const data = jsonData.data;
      if (!data) return json({ ok: false, error: 'iRacing JSON: campo `data` mancante' }, 400);
      const sessions = data.session_results || [];
      if (sessions.length === 0) return json({ ok: false, error: 'iRacing JSON: nessuna session_results trovata' }, 400);

      const carClassDefault = (data.car_classes && data.car_classes[0] && data.car_classes[0].name) || 'Hosted All Cars';
      const aggStats: any = { imported: 0, vsd_matched: 0, external: 0, dnf: 0, dns: 0, by_session: {}, sessions_skipped: 0 };

      for (const session of sessions) {
        const sessionType = normalizeSessionType(session.simsession_name);
        if (!sessionType) { aggStats.sessions_skipped++; continue; }

        const results = session.results || [];
        const groups = [{ carClass: carClassDefault, result: results.map(transformIracingResultToLMU) }];
        const meta = {
          race_id: race.race_id,
          sim: 'IRC',
          track_id: race.track_id || '',
          set_date: (data.start_time || '').substring(0, 10) || (race.date || '').substring(0, 10),
          session_type: sessionType,
        };

        const sessionStats = await importGroup(groups, meta);
        aggStats.imported += sessionStats.imported || 0;
        aggStats.vsd_matched += sessionStats.vsd_matched || 0;
        aggStats.external += sessionStats.external || 0;
        aggStats.dnf += sessionStats.dnf || 0;
        aggStats.dns += sessionStats.dns || 0;
        aggStats.by_session[sessionType] = sessionStats.imported || 0;

        if (sessionType === 'race') {
          await seedRaceReportsForRace(race.race_id);
          try { await recomputeEloSafetyForSim(me!.team_id, 'IRC'); } catch (_e) { /* #370: non bloccante, come seedRaceReportsForRace */ }
          try {
            await checkAndNotifyPodiumsLmu(groups, race, driverNameMap);
            await checkAndNotifyMilestones(supabase, me!.team_id, sessionStats.matchedIds);
            await checkAndNotifyRaceMvp(supabase, me!.team_id, race);
          } catch (_e) { /* #24/09: notifiche non bloccanti, come seedRaceReportsForRace */ }
        }
      }

      try { await notifyRaceImported(race, aggStats); } catch (_e) { /* non bloccante */ }

      return json({ ok: true, data: aggStats });
    }

    if (!Array.isArray(jsonData) || jsonData.length === 0) {
      return json({ ok: false, error: 'json_data deve essere un array (LMU) o un oggetto event_result (iRacing)' }, 400);
    }

    const sessionType = detectSessionType(jsonData);
    if (!sessionType) return json({ ok: false, error: 'Impossibile dedurre session_type dalla struttura JSON' }, 400);

    const meta = {
      race_id: race.race_id,
      sim: race.sim || '',
      track_id: race.track_id || '',
      set_date: (race.date || new Date().toISOString()).substring(0, 10),
      session_type: sessionType,
    };

    const stats = await importGroup(jsonData, meta);

    if (meta.session_type === 'race') {
      await seedRaceReportsForRace(meta.race_id);
      try { await recomputeEloSafetyForSim(me.team_id, meta.sim); } catch (_e) { /* #370: non bloccante, come seedRaceReportsForRace */ }
      try {
        await checkAndNotifyPodiumsLmu(jsonData, race, driverNameMap);
        await checkAndNotifyMilestones(supabase, me.team_id, stats.matchedIds);
        await checkAndNotifyRaceMvp(supabase, me.team_id, race);
      } catch (_e) { /* #24/09: notifiche non bloccanti, come seedRaceReportsForRace */ }
    }

    try { await notifyRaceImported(race, stats); } catch (_e) { /* non bloccante */ }

    return json({ ok: true, data: stats });
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
