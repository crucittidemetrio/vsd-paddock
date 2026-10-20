// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — notifications-cron (#388)
// Porting dei 8 check Discord/push TIME-DRIVEN di Apps Script, che dal
// cutover dei rispettivi domini leggevano Sheet ormai frozen/stale
// (Notifications.js/Push.js/RaceRSVP.js/Sponsors.js/SkillIndex.js/
// TeamSessionsScheduler.js — mai eseguiti su dati Supabase). Consolidati
// QUI in un'unica Edge Function (non 8 separate) per restare ben sotto
// il tetto di 100 function del piano free: lo slot #74 di ~74 in uso.
//
// Chiamata da pg_cron via pg_net (vedi migrazione notifications_cron_schedule),
// una entry per check con la propria cadenza — stesso principio dei
// trigger time-driven Apps Script, ma nativo Postgres. Ogni check è
// invocato con ?check=<nome>, fault-tolerant (try/catch per singolo
// check: un fallimento non deve bloccare gli altri se mai chiamati in
// batch — qui comunque sempre uno alla volta).
//
// Dedup: Apps Script usava PropertiesService (persistente, mai ripulito)
// o CacheService (TTL). Qui un'unica tabella notification_dedup
// (key text primary key) sostituisce entrambi — per i check con TTL
// reale (upcoming race push, 2h) si cancella la entry scaduta prima di
// controllare; per gli altri (rsvp reminder, stint alert, team session
// reminder) il comportamento è quello "mai ripulito" di PropertiesService,
// fedele al sorgente.
//
// Deviazione deliberata: come in race-results-import, niente thumbnail
// foto pilota condizionata al consenso social (hasSocialConsent_) — vedi
// nota lì per il motivo. postWeeklyDigest_/notifyChampionshipCrowned_
// leggono/scrivono anche `championship crowned` dedup via Script
// Properties nel sorgente: quella specifica notifica (fine campionato)
// resta legata al flusso di standings/championships, non a questo cron
// — non tra gli 8 elencati da Demetrio, fuori perimetro di questo lavoro.
//
// #467 (10/10/2026): sorgente recuperato dal deploy live (v10) e
// versionato; aggiunto il 9° check `rosterActivity` (stato attivo/
// inattivo automatico dei piloti — vedi cloud/schema/037).
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PADDOCK_URL = 'https://vsd-paddock.vercel.app';
const VSD_COLORS = { cyan: 0x00d9ff, green: 0x4ade80, orange: 0xfbbf24, red: 0xf87171, blue: 0x3b82f6, purple: 0xa855f7 };

function db() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

async function postToDiscordWebhook(envName: string, payload: unknown) {
  try {
    const url = Deno.env.get(envName);
    if (!url) { console.log(`[cron] ${envName} non configurato`); return; }
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) console.log(`[cron] ${envName} risposta ${res.status}`);
  } catch (e) { console.log(`[cron] postToDiscordWebhook(${envName}) error: ${e}`); }
}
const postPublic = (p: unknown) => postToDiscordWebhook('DISCORD_WEBHOOK_URL', p);
const postAdmin = (p: unknown) => postToDiscordWebhook('DISCORD_WEBHOOK_ADMIN_URL', p);
const postBarSport = (p: unknown) => postToDiscordWebhook('DISCORD_WEBHOOK_BARSPORT_URL', p);
const postGestioneGare = (p: unknown) => postToDiscordWebhook('DISCORD_WEBHOOK_GESTIONE_GARE_URL', p);

async function sendPush(supa: any, driverIds: string[] | null, notification: { title: string; body: string; url?: string }) {
  try {
    const relayUrl = Deno.env.get('PUSH_RELAY_URL');
    const relaySecret = Deno.env.get('PUSH_RELAY_SECRET');
    if (!relayUrl || !relaySecret) return;
    let query = supa.from('push_subscriptions').select('endpoint, p256dh, auth_key, driver_id');
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
  } catch (e) { console.log('[cron] sendPush error: ' + e); }
}

// Dedup: true se già notificato (entry presente e non scaduta), altrimenti
// registra la chiave e ritorna false. ttlSeconds null = mai scade (fedele
// a PropertiesService); un numero = comportamento CacheService.
async function alreadyNotified(supa: any, key: string, ttlSeconds: number | null): Promise<boolean> {
  const { data } = await supa.from('notification_dedup').select('created_at').eq('key', key).maybeSingle();
  if (data) {
    if (ttlSeconds == null) return true;
    const ageSec = (Date.now() - new Date(data.created_at).getTime()) / 1000;
    if (ageSec < ttlSeconds) return true;
    // scaduta: cancella e prosegui come non notificata
    await supa.from('notification_dedup').delete().eq('key', key);
  }
  await supa.from('notification_dedup').insert({ key });
  return false;
}

function msToLapDisplay(ms: number | null | undefined): string {
  if (ms == null || isNaN(ms as number) || Number(ms) <= 0) return '';
  const total = Number(ms);
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

// ─── 1) runBirthdayCheck — apps-script/Notifications.js checkBirthdaysToday_ ───
async function runBirthdayCheck() {
  const supa = db();
  const now = new Date();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();

  const { data: consents } = await supa.from('consents').select('driver_id, birth_date').not('birth_date', 'is', null);
  const { data: drivers } = await supa.from('drivers').select('id, display_name, discord_id, status, removed_at');
  const driverMap = new Map<string, any>((drivers ?? []).map((d: any) => [d.id, d]));

  const seen = new Set<string>();
  const birthdayDrivers: any[] = [];
  (consents ?? []).forEach((c: any) => {
    if (!c.driver_id || seen.has(c.driver_id)) return;
    const bd = new Date(c.birth_date);
    if (isNaN(bd.getTime()) || bd.getUTCMonth() !== month || bd.getUTCDate() !== day) return;
    const d = driverMap.get(c.driver_id);
    if (!d || d.status !== 'active' || d.removed_at) return;
    seen.add(c.driver_id);
    birthdayDrivers.push(d);
  });

  if (birthdayDrivers.length === 0) return { ok: true, skipped: true };

  const mentions = birthdayDrivers.map((d) => (d.discord_id ? `<@${d.discord_id}>` : `**${d.display_name}**`)).join(' ');
  const isPlural = birthdayDrivers.length > 1;

  await postBarSport({
    content: mentions,
    embeds: [{
      author: { name: 'VSD Paddock' },
      title: '🎂 Buon compleanno!',
      description: isPlural
        ? `Oggi festeggiamo ${birthdayDrivers.length} piloti del team! Tanti auguri da tutta VSD 🥳🏁`
        : `Oggi festeggia ${birthdayDrivers[0].display_name}! Tanti auguri da tutta VSD 🥳🏁`,
      color: VSD_COLORS.orange,
      timestamp: new Date().toISOString(),
    }],
  });
  return { ok: true, notified: birthdayDrivers.map((d) => d.display_name) };
}

// ─── 2) runWeeklyDigest — apps-script/Notifications.js postWeeklyDigest_ ───
async function runWeeklyDigest() {
  const supa = db();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);

  const { data: allResults } = await supa.from('race_results').select('race_id, driver_id, session_type, dns, dnf, finish_position, best_lap_ms, set_date, is_vsd_driver');
  const { data: races } = await supa.from('races').select('race_id, race_name, status, date');
  const racesById = new Map<string, any>((races ?? []).map((r: any) => [r.race_id, r]));
  const { data: drivers } = await supa.from('drivers').select('id, display_name, status, removed_at');
  const driverMap = new Map<string, any>((drivers ?? []).map((d: any) => [d.id, d]));
  const activeDrivers = (drivers ?? []).filter((d: any) => d.status === 'active' && !d.removed_at);

  const weekResults = (allResults ?? []).filter((r: any) => {
    if (r.is_vsd_driver !== true) return false;
    if ((r.session_type || 'race') !== 'race') return false;
    if (r.dns === true) return false;
    const d = r.set_date ? new Date(r.set_date) : null;
    return d && !isNaN(d.getTime()) && d >= weekAgo && d <= now;
  });

  const upcomingCandidates = (races ?? [])
    .filter((r: any) => String(r.status).toLowerCase() === 'scheduled')
    .map((r: any) => ({ race: r, date: r.date ? new Date(r.date) : null }))
    .filter((x: any) => x.date && !isNaN(x.date.getTime()) && x.date >= now)
    .sort((a: any, b: any) => a.date.getTime() - b.date.getTime());
  const upcomingRace = upcomingCandidates[0];

  if (weekResults.length === 0 && !upcomingRace) return { ok: true, skipped: true };

  const raceIds = Array.from(new Set(weekResults.map((r: any) => r.race_id)));
  const podiums = weekResults
    .filter((r: any) => r.dnf !== true && Number(r.finish_position) > 0 && Number(r.finish_position) <= 3)
    .sort((a: any, b: any) => Number(a.finish_position) - Number(b.finish_position));

  let best: any = null;
  weekResults.forEach((r: any) => {
    const ms = Number(r.best_lap_ms);
    if (ms > 0 && (!best || ms < Number(best.best_lap_ms))) best = r;
  });

  const fields: any[] = [];
  if (weekResults.length > 0) {
    fields.push({ name: 'Gare disputate', value: String(raceIds.length), inline: true });
    fields.push({ name: 'Risultati VSD', value: String(weekResults.length), inline: true });
  }
  if (podiums.length > 0) {
    const medals: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };
    const podiumLines = podiums.slice(0, 8).map((r: any) => {
      const driver = driverMap.get(r.driver_id);
      const name = driver ? driver.display_name : r.driver_id;
      const race = racesById.get(r.race_id);
      return `${medals[Number(r.finish_position)]} **${name}** — ${race ? (race.race_name || race.race_id) : r.race_id}`;
    }).join('\n');
    fields.push({ name: 'Podi della settimana', value: podiumLines, inline: false });
  }
  if (best) {
    const driver = driverMap.get(best.driver_id);
    const name = driver ? driver.display_name : best.driver_id;
    const race = racesById.get(best.race_id);
    fields.push({
      name: 'Miglior giro della settimana',
      value: `⏱️ **${name}** — ${msToLapDisplay(Number(best.best_lap_ms))} (${race ? (race.race_name || race.race_id) : best.race_id})`,
      inline: false,
    });
  }

  let upcomingLabel: string | null = null;
  if (upcomingRace) {
    const race = upcomingRace.race;
    const { data: rsvps } = await supa.from('race_rsvps').select('status').eq('race_id', race.race_id).eq('status', 'confirmed');
    const confirmedCount = (rsvps ?? []).length;
    const dateLabel = upcomingRace.date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
    upcomingLabel = `${race.race_name || race.race_id} — ${dateLabel}`;
    fields.push({
      name: 'Prossima gara',
      value: `🏁 **${upcomingLabel}**\nConfermati: ${confirmedCount}/${activeDrivers.length}`,
      inline: false,
    });
  }

  await postPublic({
    embeds: [{
      author: { name: 'VSD Paddock' },
      title: '📅 Riepilogo settimanale',
      description: 'Cosa è successo negli ultimi 7 giorni sul Paddock',
      color: VSD_COLORS.blue,
      fields,
      timestamp: new Date().toISOString(),
      footer: { text: 'Prossimo digest tra 7 giorni' },
      url: PADDOCK_URL,
    }],
  });

  const pushBodyParts: string[] = [];
  if (weekResults.length > 0) pushBodyParts.push(`${raceIds.length} gare, ${podiums.length} podi VSD`);
  if (upcomingLabel) pushBodyParts.push(`Prossima: ${upcomingLabel}`);
  if (pushBodyParts.length > 0) {
    await sendPush(supa, null, { title: '📅 Riepilogo settimanale VSD Paddock', body: pushBodyParts.join(' · '), url: PADDOCK_URL });
  }
  return { ok: true, results: weekResults.length, podiums: podiums.length };
}

// ─── 3) runSponsorFollowUpDigest — apps-script/Sponsors.js ───
async function runSponsorFollowUpDigest() {
  const supa = db();
  const { data: sponsors } = await supa.from('sponsors').select('company_name, status, next_follow_up').not('status', 'in', '("declined","lapsed")');

  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  const dow = now.getUTCDay();
  const daysToSunday = (7 - dow) % 7;
  const endOfThisWeek = new Date(now.getTime() + daysToSunday * 86400000);
  endOfThisWeek.setUTCHours(23, 59, 59, 999);

  const late: string[] = [];
  const thisWeek: string[] = [];
  (sponsors ?? []).forEach((s: any) => {
    if (!s.next_follow_up) return;
    const d = new Date(s.next_follow_up);
    if (isNaN(d.getTime())) return;
    const label = s.company_name + (s.status ? ` (${s.status})` : '');
    if (d < now) late.push(label);
    else if (d <= endOfThisWeek) thisWeek.push(label);
  });

  if (late.length === 0 && thisWeek.length === 0) return { ok: true, skipped: true };

  const fields: any[] = [];
  if (late.length > 0) fields.push({ name: `🔴 Follow-up scaduti (${late.length})`, value: late.join('\n').slice(0, 1024) });
  if (thisWeek.length > 0) fields.push({ name: `📅 Da fare questa settimana (${thisWeek.length})`, value: thisWeek.join('\n').slice(0, 1024) });

  await postAdmin({
    embeds: [{
      author: { name: 'VSD Paddock — Partnership' },
      title: '🤝 Follow-up sponsor — promemoria settimanale',
      color: VSD_COLORS.orange,
      fields,
      timestamp: new Date().toISOString(),
      footer: { text: 'CRM Sponsor · Admin' },
      url: `${PADDOCK_URL}/admin/sponsors`,
    }],
  });
  return { ok: true, late: late.length, thisWeek: thisWeek.length };
}

// ─── 4) runRsvpReminderCheck — apps-script/RaceRSVP.js ───
async function runRsvpReminderCheck() {
  const supa = db();
  const now = new Date();
  const windowStart = new Date(now.getTime() + 1 * 86400000);
  const windowEnd = new Date(now.getTime() + 3 * 86400000);

  const { data: races } = await supa.from('races').select('race_id, race_name, status, date').eq('status', 'scheduled');
  const upcoming = (races ?? []).filter((r: any) => {
    const d = r.date ? new Date(r.date) : null;
    return d && !isNaN(d.getTime()) && d >= windowStart && d <= windowEnd;
  });
  if (upcoming.length === 0) return { ok: true, skipped: true };

  const { data: drivers } = await supa.from('drivers').select('id, status, removed_at').eq('status', 'active');
  const activeDrivers = (drivers ?? []).filter((d: any) => !d.removed_at);
  if (activeDrivers.length === 0) return { ok: true, skipped: true };

  let notifiedTotal = 0;
  for (const race of upcoming) {
    const { data: rsvps } = await supa.from('race_rsvps').select('driver_id').eq('race_id', race.race_id);
    const responded = new Set((rsvps ?? []).map((r: any) => r.driver_id));
    const missing = activeDrivers.filter((d: any) => !responded.has(d.id));
    if (missing.length === 0) continue;

    const toNotify: string[] = [];
    for (const d of missing) {
      const key = `rsvp_reminder_${race.race_id}_${d.id}`;
      if (!(await alreadyNotified(supa, key, null))) toNotify.push(d.id);
    }
    if (toNotify.length === 0) continue;

    await sendPush(supa, toNotify, {
      title: `🏁 Conferma presenza: ${race.race_name || race.race_id}`,
      body: 'Non hai ancora risposto — facci sapere se ci sarai.',
      url: `${PADDOCK_URL}/race/${race.race_id}`,
    });
    notifiedTotal += toNotify.length;
  }
  return { ok: true, notified: notifiedTotal };
}

// ─── 5) runSkillIndexSnapshot — apps-script/SkillIndex.js ───
// Porting di computeDriverSkill_/computeFieldSizes_ (SkillIndex.js) —
// stesso algoritmo già duplicato in academy-ranking (#269).
function computeFieldSizes(results: any[]): Map<string, number> {
  const sizes = new Map<string, number>();
  results.forEach((r: any) => {
    const key = r.race_id + '__' + r.car_class;
    sizes.set(key, (sizes.get(key) || 0) + 1);
  });
  return sizes;
}

function computeDriverSkill(driverId: string, results: any[], fieldSizes: Map<string, number>) {
  // Finestra rolling sulle ultime 15 gare 'race' non-DNS del pilota,
  // fedele a computeDriverSkill_ (SkillIndex.js).
  const rows = results
    .filter((r: any) => r.driver_id === driverId && (r.session_type || 'race') === 'race' && r.dns !== true)
    .sort((a: any, b: any) => new Date(b.set_date || 0).getTime() - new Date(a.set_date || 0).getTime())
    .slice(0, 15);
  if (rows.length < 3) return null; // dati insufficienti, stesso minimo del sorgente

  let finishPctSum = 0;
  let finishPctCount = 0;
  let podiumCount = 0;
  let incidentsSum = 0;
  let incidentsCount = 0;

  rows.forEach((r: any) => {
    if (r.dnf !== true && Number(r.finish_position) > 0) {
      const fieldSize = fieldSizes.get(r.race_id + '__' + r.car_class) || 0;
      if (fieldSize >= 3) {
        const pct = Math.max(0, Math.min(1, 1 - (Number(r.finish_position) - 1) / (fieldSize - 1)));
        finishPctSum += pct;
        finishPctCount++;
      }
      if (Number(r.finish_position) <= 3) podiumCount++;
    }
    if (r.incidents != null && !isNaN(Number(r.incidents))) {
      incidentsSum += Number(r.incidents);
      incidentsCount++;
    }
  });

  const avgFinishPct = finishPctCount > 0 ? finishPctSum / finishPctCount : 0;
  const podiumRate = rows.length > 0 ? podiumCount / rows.length : 0;
  const avgIncidents = incidentsCount > 0 ? incidentsSum / incidentsCount : 0;
  // Score 0-100: 70% piazzamento normalizzato, 30% tasso podio, penalità incidenti.
  const score = Math.round(Math.max(0, Math.min(100, (avgFinishPct * 70 + podiumRate * 30) - avgIncidents * 2)));

  return { score, races_counted: rows.length, avg_finish_pct: Math.round(avgFinishPct * 100), podium_rate: Math.round(podiumRate * 100), avg_incidents: Math.round(avgIncidents * 100) / 100 };
}

async function runSkillIndexSnapshot() {
  const supa = db();
  const today = new Date().toISOString().slice(0, 10);

  const { data: existing } = await supa.from('skill_index_history').select('driver_id').eq('snapshot_date', today);
  const alreadySnapshotted = new Set((existing ?? []).map((r: any) => r.driver_id));

  const { data: results } = await supa.from('race_results').select('race_id, car_class, driver_id, session_type, dns, dnf, finish_position, incidents, set_date').eq('is_vsd_driver', true);
  const fieldSizes = computeFieldSizes(results ?? []);
  const { data: drivers } = await supa.from('drivers').select('id, team_id, status, removed_at').eq('status', 'active');
  const activeDrivers = (drivers ?? []).filter((d: any) => !d.removed_at);

  const rows: any[] = [];
  activeDrivers.forEach((d: any) => {
    if (alreadySnapshotted.has(d.id)) return;
    const skill = computeDriverSkill(d.id, results ?? [], fieldSizes);
    if (!skill) return;
    rows.push({
      team_id: d.team_id, driver_id: d.id, score: skill.score, races_counted: skill.races_counted,
      avg_finish_pct: skill.avg_finish_pct, podium_rate: skill.podium_rate, avg_incidents: skill.avg_incidents,
      snapshot_date: today,
    });
  });

  if (rows.length === 0) return { ok: true, skipped: true };
  const { error } = await supa.from('skill_index_history').insert(rows);
  if (error) throw new Error(error.message);
  return { ok: true, snapshots: rows.length };
}

// ─── 6) runStintNotificationsCheck — apps-script/Notifications.js ───
const STINT_NOTIFY_THRESHOLD_MIN = 30;

async function runStintNotificationsCheck() {
  const supa = db();
  const { data: races } = await supa.from('races').select('race_id, race_name, status').eq('status', 'in_progress');
  if (!races || races.length === 0) return { ok: true, skipped: true };

  const nowMs = Date.now();
  let alertsSent = 0;

  for (const race of races) {
    const { data: stints } = await supa.from('endurance_stints').select('*').eq('race_id', race.race_id);
    if (!stints || stints.length === 0) continue;

    for (const s of stints) {
      const status = String(s.status || '').toLowerCase();
      if (status === 'completed' || status === 'aborted') continue;
      const startMs = new Date(s.planned_start_time).getTime();
      if (isNaN(startMs)) continue;
      const minsToStart = (startMs - nowMs) / 60000;
      if (minsToStart <= 0 || minsToStart > STINT_NOTIFY_THRESHOLD_MIN) continue;

      const key = `stint_notified_${s.stint_id}`;
      if (await alreadyNotified(supa, key, null)) continue;

      const { data: driver } = await supa.from('drivers').select('display_name').eq('id', s.driver_id).maybeSingle();
      const driverName = driver?.display_name || 'Pilota';
      const isFirst = Number(s.stint_order) === 1;
      const raceName = race.race_name || race.race_id;
      const minsRounded = Math.round(minsToStart);
      const title = isFirst ? `🏁 ${raceName} — Via!` : `🔄 Cambio pilota tra ~${minsRounded} min`;
      const desc = isFirst
        ? `**${driverName}** al via nel primo stint. In bocca al lupo! 🍀`
        : `Preparati **${driverName}** — stint ${s.stint_order} tra circa ${minsRounded} minuti.`;

      await postPublic({
        embeds: [{
          title, description: desc,
          color: isFirst ? VSD_COLORS.green : VSD_COLORS.orange,
          footer: { text: `${raceName} · Stint ${s.stint_order}` },
          url: `${PADDOCK_URL}/race/${race.race_id}`,
        }],
      });

      if (s.driver_id) {
        const pushTitle = isFirst ? '🏁 Sei al via!' : '🔄 Il tuo stint si avvicina';
        const pushBody = isFirst
          ? `${raceName} — primo stint, in bocca al lupo!`
          : `${raceName} — stint ${s.stint_order} tra circa ${minsRounded} min.`;
        await sendPush(supa, [s.driver_id], { title: pushTitle, body: pushBody, url: `${PADDOCK_URL}/race/${race.race_id}` });
      }
      alertsSent++;
    }
  }
  return { ok: true, alerts: alertsSent };
}

// ─── 7) runUpcomingRacePushCheck — apps-script/Push.js ───
async function runUpcomingRacePushCheck() {
  const supa = db();
  const now = new Date();
  const windowStart = new Date(now.getTime() + 45 * 60000);
  const windowEnd = new Date(now.getTime() + 75 * 60000);

  const { data: races } = await supa.from('races').select('race_id, race_name, sim, track_id, status, date').eq('status', 'scheduled');
  const upcoming = (races ?? []).filter((r: any) => {
    const d = r.date ? new Date(r.date) : null;
    return d && !isNaN(d.getTime()) && d >= windowStart && d <= windowEnd;
  });
  if (upcoming.length === 0) return { ok: true, skipped: true };

  let notified = 0;
  for (const race of upcoming) {
    const key = `push_race_reminder_${race.race_id}`;
    if (await alreadyNotified(supa, key, 7200)) continue; // TTL 2h, come CacheService nel sorgente

    let trackName = race.track_id;
    if (race.track_id) {
      const { data: track } = await supa.from('tracks').select('track_name').eq('track_id', race.track_id).maybeSingle();
      if (track?.track_name) trackName = track.track_name;
    }

    await sendPush(supa, null, {
      title: `🏁 Tra circa un'ora: ${race.race_name || race.race_id}`,
      body: [race.sim, trackName].filter(Boolean).join(' · '),
      url: `${PADDOCK_URL}/race/${race.race_id}`,
    });
    notified++;
  }
  return { ok: true, notified };
}

// ─── 8) runTeamSessionReminderCheck — apps-script/TeamSessionsScheduler.js ───
const TEAM_SESSION_TYPE_LABELS: Record<string, string> = {
  allenamento_libero: 'Allenamento libero',
  allenamento_collettivo: 'Allenamento collettivo',
  qualifica: 'Qualifica/Prova campionato',
  evento_esterno: 'Evento esterno',
  riunione: 'Riunione team',
};
const TEAM_SESSION_REMINDER_WINDOWS = [
  { hoursBefore: 24, key: '24h' },
  { hoursBefore: 2, key: '2h' },
];

async function runTeamSessionReminderCheck() {
  const supa = db();
  const now = new Date();
  const { data: sessions } = await supa.from('team_sessions').select('id, type, title, datetime_start');
  if (!sessions || sessions.length === 0) return { ok: true, skipped: true };

  let notified = 0;
  for (const session of sessions) {
    const start = new Date(session.datetime_start);
    if (isNaN(start.getTime())) continue;
    const hoursUntil = (start.getTime() - now.getTime()) / 3600000;
    if (hoursUntil <= 0) continue;

    for (const w of TEAM_SESSION_REMINDER_WINDOWS) {
      if (hoursUntil > w.hoursBefore || hoursUntil <= w.hoursBefore - 1) continue;
      const key = `team_session_reminder_${session.id}_${w.key}`;
      if (await alreadyNotified(supa, key, null)) continue;

      const label = TEAM_SESSION_TYPE_LABELS[session.type] || session.type;
      const whenLabel = w.key === '24h' ? 'tra 24 ore' : 'tra 2 ore';
      await postGestioneGare({
        embeds: [{
          author: { name: 'VSD Paddock' },
          title: `⏰ Sessione team ${whenLabel}`,
          description: `**${session.title}** (${label})`,
          color: VSD_COLORS.orange,
          timestamp: new Date().toISOString(),
          footer: { text: 'Non hai ancora confermato? Fallo dal Calendario' },
          // Deep link: apre il Calendario in Lista, scrollato ed evidenziato
          // sulla sessione con il pannello RSVP (Calendar.jsx ?session=).
          url: `${PADDOCK_URL}/calendar?session=${session.id}`,
        }],
      });
      notified++;
    }
  }
  return { ok: true, notified };
}

// ─── 9) runRosterActivity — #467 stato attivo/inattivo automatico ───
// Ogni lunedì (pg_cron notif-roster-activity): 1) legge chi ha il ruolo
// Statbot "Attivo del Mese" via relay Vercel (api/discord-role-members)
// → drivers.discord_active_at; 2) ricalcola subito lo stato
// (refresh_driver_activity, la stessa funzione SQL che pg_cron esegue
// ogni giorno alle 04:00); 3) digest allo staff: piloti in uscita
// (≥45 gg) + cambi di stato automatici degli ultimi 7 giorni + esito
// del controllo Discord. Se il relay fallisce si prosegue con i soli
// dati del Paddock (il segnale Discord è additivo, mai bloccante).
async function runRosterActivity() {
  const supa = db();

  const { data: drivers } = await supa.from('drivers')
    .select('id, discord_id, removed_at, is_system_account')
    .not('discord_id', 'is', null);
  const candidates = (drivers ?? []).filter((d: any) => !d.removed_at && !d.is_system_account && d.discord_id);

  let discordNote = '';
  try {
    const relayUrl = Deno.env.get('DISCORD_RELAY_URL');
    const relaySecret = Deno.env.get('DISCORD_RELAY_SECRET');
    if (!relayUrl || !relaySecret) throw new Error('relay non configurato');
    const endpoint = new URL(relayUrl).origin + '/api/discord-role-members';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-discord-relay-secret': relaySecret },
      body: JSON.stringify({ discordIds: candidates.map((d: any) => String(d.discord_id)) }),
    });
    const body = await res.json().catch(() => ({ ok: false, error: 'http_' + res.status }));
    if (!body.ok) throw new Error(body.error || 'http_' + res.status);
    const withRole = new Set<string>(body.with_role || []);
    const ids = candidates.filter((d: any) => withRole.has(String(d.discord_id))).map((d: any) => d.id);
    if (ids.length > 0) {
      await supa.from('drivers').update({ discord_active_at: new Date().toISOString() }).in('id', ids);
    }
    discordNote = `✅ Ruolo "${body.role_name}": ${ids.length} piloti`;
  } catch (e) {
    discordNote = `⚠️ Controllo Discord non riuscito (${String((e as any)?.message || e).slice(0, 120)}) — valutati solo i dati del Paddock`;
  }

  const { data: evalRows, error: rpcErr } = await supa.rpc('refresh_driver_activity', { p_apply: true });
  if (rpcErr) throw new Error(rpcErr.message);

  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: changes } = await supa.from('audit_log')
    .select('target_id, details, created_at')
    .eq('action', 'roster.auto_status')
    .gte('created_at', weekAgo)
    .order('created_at', { ascending: true });

  const rows = (evalRows ?? []) as any[];
  const nameByCode = new Map(rows.map((r) => [r.driver_code, r.display_name]));
  const warnings = rows.filter((r) => r.warning);

  if (warnings.length === 0 && (changes ?? []).length === 0) {
    return { ok: true, skipped: true, discord: discordNote };
  }

  const fields: any[] = [];
  if (warnings.length > 0) {
    fields.push({
      name: `🟠 In uscita — ${warnings.length} (oltre 45 giorni, inattivi a 60)`,
      value: warnings.map((r) => `**${r.display_name}** — ${r.days_idle} gg${r.source ? ` (ultima: ${r.source})` : ''}`).join('\n').slice(0, 1024),
    });
  }
  if ((changes ?? []).length > 0) {
    fields.push({
      name: `🔁 Cambi di stato automatici (7 giorni) — ${(changes ?? []).length}`,
      value: (changes ?? []).map((c: any) => `**${nameByCode.get(c.target_id) || c.target_id}** — ${c.details}`).join('\n').slice(0, 1024),
    });
  }
  fields.push({ name: 'Discord', value: discordNote.slice(0, 1024) });

  // La function è pubblica (verify_jwt off, come tutti i check cron):
  // al massimo UN digest al giorno, anche se invocata più volte.
  if (await alreadyNotified(supa, `roster_activity_digest_${new Date().toISOString().slice(0, 10)}`, null)) {
    return { ok: true, skipped: 'digest già inviato oggi', discord: discordNote };
  }

  await postAdmin({
    embeds: [{
      author: { name: 'VSD Paddock — Roster' },
      title: '👥 Attività piloti — riepilogo settimanale',
      description: 'Per mettere un pilota in pausa senza che l\'automatismo lo riattivi, impostalo a mano su **Inattivo** dalla sua scheda (Gestione roster). Reimpostandolo **Attivo** riparte un periodo pieno di 60 giorni.',
      color: VSD_COLORS.purple,
      fields,
      timestamp: new Date().toISOString(),
      url: `${PADDOCK_URL}/roster`,
    }],
  });
  return { ok: true, warnings: warnings.length, changes: (changes ?? []).length, discord: discordNote };
}

// ─── 10) runResultsMissingCheck — gare passate senza risultati ───
// 10/10/2026 (Big 6 R3 Silverstone: disputata, vinta in LMGT3, ma senza
// risultati caricati → classifica falsata senza che nessuno se ne accorga).
// Ogni giorno: gare non annullate, iniziate da più di 24 h e da meno di 60
// giorni, senza nessuna riga in race_results (sessione gara). Un avviso
// allo staff, al massimo uno ogni 7 giorni per gara.
async function runResultsMissingCheck() {
  const supa = db();
  const now = Date.now();
  const { data: races } = await supa.from('races')
    .select('race_id, race_name, status, date, championship_id')
    .neq('status', 'cancelled')
    .lt('date', new Date(now - 24 * 3600 * 1000).toISOString())
    .gt('date', new Date(now - 60 * 24 * 3600 * 1000).toISOString());
  if (!races || races.length === 0) return { ok: true, missing: 0 };

  const ids = races.map((r: any) => r.race_id);
  const { data: res } = await supa.from('race_results').select('race_id').in('race_id', ids).eq('session_type', 'race');
  const withResults = new Set((res ?? []).map((r: any) => r.race_id));
  const missing = races.filter((r: any) => !withResults.has(r.race_id));

  const toNotify: any[] = [];
  for (const r of missing) {
    if (!(await alreadyNotified(supa, `results_missing_${r.race_id}`, 7 * 24 * 3600))) toNotify.push(r);
  }
  if (toNotify.length === 0) return { ok: true, missing: missing.length, notified: 0 };

  const fmt = (iso: string) => new Date(iso).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit' });
  await postAdmin({
    embeds: [{
      author: { name: 'VSD Paddock — Risultati' },
      title: `📥 ${toNotify.length === 1 ? 'Una gara disputata è' : toNotify.length + ' gare disputate sono'} senza risultati`,
      description: toNotify
        .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)))
        .map((r: any) => `• **${r.race_name || r.race_id}** — ${fmt(r.date)}${r.status === 'scheduled' ? ' _(ancora "In programma": se non si è corsa, annullala)_' : ''}`)
        .join('\n')
        .slice(0, 3800) + '\n\nFinché non vengono importati, classifiche, Punti Merito ed Elo non contano queste gare.',
      color: VSD_COLORS.orange,
      timestamp: new Date().toISOString(),
      url: `${PADDOCK_URL}/admin/import-results`,
    }],
  });
  return { ok: true, missing: missing.length, notified: toNotify.length };
}

// ─── 11) runGarage61Sync — sync automatico giri iRacing (20/10/2026) ───
// Il trigger Apps Script ogni 4h era sospeso dal 20/09 (#361: scriveva
// sul foglio legacy). Da allora i giri Garage61 arrivavano solo col
// bottone manuale /admin/garage61-sync — e l'attività pilota (#467)
// risultava ferma al 19/09 per tutti i piloti iRacing. Stessa logica
// di laps.syncFromGarage61 (social-manager), qui senza utente: verified_by
// null, foto record non inclusa (stessa scelta degli altri check cron).
// Endpoint pubblico (verify_jwt off): al massimo un sync ogni 3 ore per
// team, controllato su teams.garage61_last_sync_at.
const GARAGE61_BASE_URL = 'https://garage61.net/api/v1';

async function garage61Get(path: string): Promise<any> {
  const token = Deno.env.get('GARAGE61_TOKEN');
  if (!token) throw new Error('GARAGE61_TOKEN non configurato');
  const res = await fetch(GARAGE61_BASE_URL + path, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('Garage61 API error: HTTP ' + res.status);
  return body;
}

function g61SessionType(n: unknown): string {
  switch (Number(n)) { case 1: return 'qualifying'; case 2: return 'race'; case 3: return 'time_trial'; default: return 'practice'; }
}

function g61Slugify(name: string): string {
  return String(name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-+/g, '-');
}

function isCurrentTesserato(d: any): boolean {
  return !!d && !d.is_system_account && !d.removed_at && String(d.status).toLowerCase() === 'active';
}

async function syncTeamGarage61(supa: any, team: any) {
  const teamId = team.id;
  const slug = team.garage61_team_slug;
  const [{ data: driversFull }, { data: carsRaw }, { data: tracksRaw }, { data: existingLapsRaw }, { data: allBestLaps }] = await Promise.all([
    supa.from('drivers').select('id, display_name, iracing_id, status, is_system_account, removed_at').eq('team_id', teamId),
    supa.from('cars').select('car_id, sim, garage61_id, active').eq('sim', 'IRC'),
    supa.from('tracks').select('track_id, track_name, sim, garage61_id, active').eq('sim', 'IRC'),
    supa.from('best_laps').select('garage61_lap_id').eq('team_id', teamId).not('garage61_lap_id', 'is', null),
    supa.from('best_laps').select('driver_id, track_id, lap_time_ms, lap_time_display').eq('team_id', teamId).eq('sim', 'IRC'),
  ]);

  const driverById = new Map<string, any>((driversFull ?? []).map((d: any) => [d.id, d]));
  const driverByIracingId = new Map<string, string>();
  (driversFull ?? []).forEach((d: any) => { if (d.iracing_id && String(d.status).toLowerCase() === 'active') driverByIracingId.set(String(d.iracing_id), d.id); });
  const carByG61Id = new Map<number, string>();
  (carsRaw ?? []).forEach((c: any) => { if (c.active && c.garage61_id) carByG61Id.set(Number(c.garage61_id), c.car_id); });
  const trackByG61Id = new Map<number, string>();
  const trackName = new Map<string, string>();
  (tracksRaw ?? []).forEach((t: any) => { if (t.active && t.garage61_id) trackByG61Id.set(Number(t.garage61_id), t.track_id); trackName.set(t.track_id, t.track_name); });
  const existing = new Set((existingLapsRaw ?? []).map((l: any) => String(l.garage61_lap_id)));

  const preBest = new Map<string, { ms: number; display: string }>();
  (allBestLaps ?? []).forEach((l: any) => {
    const ms = Number(l.lap_time_ms);
    if (!ms || !isCurrentTesserato(driverById.get(l.driver_id))) return;
    const cur = preBest.get(l.track_id);
    if (!cur || ms < cur.ms) preBest.set(l.track_id, { ms, display: l.lap_time_display || msToLapDisplay(ms) });
  });

  const teamG61 = await garage61Get(`/teams/${slug}`);
  const iracingBySlug = new Map<string, string>();
  (teamG61.members || []).forEach((m: any) => {
    const acc = (m.accounts || []).find((a: any) => a.platform === 'iracing');
    if (acc) iracingBySlug.set(m.slug, String(acc.id));
  });

  const nowIso = new Date().toISOString();
  const afterParam = team.garage61_last_sync_at ? `&after=${encodeURIComponent(team.garage61_last_sync_at)}` : '';
  const stats = { tracks: 0, laps: 0, imported: 0, dedup: 0, quality: 0, carUnmapped: 0, driverUnmapped: 0, errors: 0 };
  const unmappedCars = new Map<number, string>();
  const rows: any[] = [];
  const records = new Map<string, { ms: number; driverId: string; prev: string | null }>();

  for (const [g61TrackId, vsdTrackId] of trackByG61Id) {
    stats.tracks++;
    let offset = 0;
    for (let iter = 0; iter < 50; iter++) {
      let data: any;
      try { data = await garage61Get(`/laps?teams=${slug}&tracks=${g61TrackId}&limit=100&offset=${offset}${afterParam}`); }
      catch (_e) { stats.errors++; break; }
      const laps = data.items || [];
      if (laps.length === 0) break;
      for (const lap of laps) {
        stats.laps++;
        if (existing.has(String(lap.id))) { stats.dedup++; continue; }
        if (!lap.clean || lap.incomplete || lap.offtrack || lap.pitlane || lap.pitIn || lap.pitOut || lap.missing || lap.discontinuity) { stats.quality++; continue; }
        const g61CarId = lap.car && Number(lap.car.id);
        const carId = carByG61Id.get(g61CarId);
        if (!carId) { stats.carUnmapped++; if (lap.car && !unmappedCars.has(g61CarId)) unmappedCars.set(g61CarId, lap.car.name); continue; }
        const iracingId = iracingBySlug.get(lap.driver && lap.driver.slug);
        const driverId = iracingId && driverByIracingId.get(iracingId);
        if (!driverId) { stats.driverUnmapped++; continue; }
        const ms = Math.round(lap.lapTime * 1000);
        rows.push({
          team_id: teamId, driver_id: driverId, sim: 'IRC', track_id: vsdTrackId, car_id: carId,
          lap_time_ms: ms, lap_time_display: msToLapDisplay(ms), set_date: String(lap.startTime).split('T')[0],
          conditions: (lap.precipitation > 0 || lap.trackWetness > 0) ? 'wet' : 'dry',
          session_type: g61SessionType(lap.sessionType), verified_at: nowIso,
          notes: 'Imported from Garage61', garage61_lap_id: String(lap.id),
        });
        existing.add(String(lap.id));
        stats.imported++;
        if (isCurrentTesserato(driverById.get(driverId))) {
          const pre = preBest.get(vsdTrackId);
          const cand = records.get(vsdTrackId);
          const best = cand ? cand.ms : (pre ? pre.ms : null);
          if (best === null || ms < best) records.set(vsdTrackId, { ms, driverId, prev: pre ? pre.display : null });
        }
      }
      if (laps.length < 100) break;
      if (data.total !== undefined && offset + laps.length >= data.total) break;
      offset += 100;
    }
  }

  if (rows.length > 0) {
    const { error } = await supa.from('best_laps').insert(rows);
    if (error) throw new Error(error.message);
  }
  await supa.from('teams').update({ garage61_last_sync_at: nowIso }).eq('id', teamId);

  if (unmappedCars.size > 0) {
    const { data: allCars } = await supa.from('cars').select('car_id');
    const ids = new Set((allCars ?? []).map((c: any) => c.car_id));
    const drafts: any[] = [];
    unmappedCars.forEach((name, g61CarId) => {
      let id = `irc-${g61Slugify(name)}`;
      if (ids.has(id)) { let n = 2; while (ids.has(`${id}-${n}`)) n++; id = `${id}-${n}`; }
      ids.add(id);
      drafts.push({ car_id: id, sim: 'IRC', car_name: name, active: true, garage61_id: String(g61CarId) });
    });
    if (drafts.length) await supa.from('cars').insert(drafts);
  }

  for (const [trackId, rec] of records) {
    const name = driverById.get(rec.driverId)?.display_name || rec.driverId;
    await postPublic({
      embeds: [{
        author: { name: 'VSD Paddock' },
        title: '🏆 Nuovo record di squadra!',
        description: `**${name}** — ${trackName.get(trackId) || trackId} (IRC)\n⏱️ **${msToLapDisplay(rec.ms)}**` +
          (rec.prev ? ` _(precedente: ${rec.prev})_` : ' _(primo tempo registrato su questa pista)_'),
        color: VSD_COLORS.purple,
        timestamp: new Date().toISOString(),
        footer: { text: 'Muro dei Record · Garage61' },
        url: `${PADDOCK_URL}/records`,
      }],
    });
  }
  return { ...stats, newRecords: records.size, unmappedCarsDrafted: unmappedCars.size };
}

async function runGarage61Sync() {
  const supa = db();
  const { data: teams } = await supa.from('teams').select('id, garage61_team_slug, garage61_last_sync_at').not('garage61_team_slug', 'is', null);
  const out: any[] = [];
  for (const t of teams ?? []) {
    if (t.garage61_last_sync_at && Date.now() - new Date(t.garage61_last_sync_at).getTime() < 3 * 3600 * 1000) {
      out.push({ team: t.garage61_team_slug, skipped: 'ultimo sync < 3h' });
      continue;
    }
    try { out.push({ team: t.garage61_team_slug, ...(await syncTeamGarage61(supa, t)) }); }
    catch (e) { out.push({ team: t.garage61_team_slug, error: String((e as any)?.message || e) }); }
  }
  return { ok: true, teams: out };
}

const CHECKS: Record<string, () => Promise<unknown>> = {
  birthday: runBirthdayCheck,
  weeklyDigest: runWeeklyDigest,
  sponsorFollowUp: runSponsorFollowUpDigest,
  rsvpReminder: runRsvpReminderCheck,
  skillIndexSnapshot: runSkillIndexSnapshot,
  stintNotifications: runStintNotificationsCheck,
  upcomingRacePush: runUpcomingRacePushCheck,
  teamSessionReminder: runTeamSessionReminderCheck,
  rosterActivity: runRosterActivity,
  resultsMissing: runResultsMissingCheck,
  garage61Sync: runGarage61Sync,
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const check = url.searchParams.get('check') || (await req.json().catch(() => ({})))?.check;
    if (!check || !CHECKS[check]) {
      return new Response(JSON.stringify({ ok: false, error: 'check mancante o sconosciuto: ' + check + '. Validi: ' + Object.keys(CHECKS).join(', ') }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const result = await CHECKS[check]();
    return new Response(JSON.stringify({ ok: true, check, result }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
