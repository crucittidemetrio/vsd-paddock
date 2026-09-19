// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — endurance-write (dispatcher consolidato per le
// 11 azioni di scrittura del dominio #259: Endurance)
// ═══════════════════════════════════════════════════════════
// Stessa deviazione architetturale documentata in endurance-read/
// index.ts: tetto di 100 Edge Function sul piano free, spend cap
// tenuto disattivato per scelta esplicita dell'utente. Consolida in
// UNA function dispatch-by-action tutte le scritture di Auditions +
// Participants + Stints invece di 11 function separate — nessuna
// logica cambiata rispetto a quanto sarebbe stato ciascun endpoint
// singolo, solo il routing è unificato.
//
// DEPLOY: stesso vincolo di endurance-read (nessun delete_edge_function
// disponibile). Questo codice è deployato SOTTO LO SLUG GIÀ ESISTENTE
// `endurance-auditions-create` (redeploy, nuova versione) — diventa
// il dispatcher WRITE canonico per l'intero dominio #259, non solo
// per auditions.create.
//
// payload.action → auth richiesta (fedele al sorgente, verificata
// per-azione dopo la risoluzione comune di sessione+driver):
//   'auditions.create'          → staff/admin (ctx.isStaff)
//   'auditions.update'          → staff/admin (ctx.isStaff)
//   'participants.add'          → SOLO admin (_epIsAdmin_)
//   'participants.update'       → SOLO admin
//   'participants.remove'       → SOLO admin
//   'stints.add'                → SOLO admin (_esIsStaff_, nonostante il nome)
//   'stints.update'             → SOLO admin
//   'stints.remove'             → SOLO admin
//   'stints.generate'           → SOLO admin (funzione pura, non scrive DB)
//   'stints.validateCoverage'   → SOLO admin (sola lettura)
//   'stints.confirmPlan'        → SOLO admin
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ─── Auditions: costanti/helper ───
const PILOT_CLASSES = ['Hypercar', 'LMP2', 'GT3', 'Open'];
const WEATHER = ['asciutto', 'dinamico', 'bagnato'];
const AUDITION_STATUSES = ['draft', 'scheduled', 'in_progress', 'completed', 'cancelled'];
const AUDITION_NUMERIC_FIELDS = [
  'duration_minutes_real', 'time_multiplier', 'ai_strength_pct',
  'field_size_hypercar', 'field_size_lmp2', 'field_size_gt3',
];
const AUDITION_IMMUTABLE = ['audition_id', 'created_by', 'created_at', 'team_id'];
const AUDITION_MUTABLE_FIELDS = [
  'target_race', 'target_race_date', 'name', 'date', 'sim', 'track_id',
  'pilot_class', 'mandatory_car_id', 'setup_url', 'setup_notes',
  'duration_minutes_real', 'time_multiplier',
  'start_time_ingame', 'ai_strength_pct',
  'field_size_hypercar', 'field_size_lmp2', 'field_size_gt3',
  'weather_condition', 'status', 'notes_internal',
];
const AUDITION_FIELDS = [
  'audition_id', 'target_race', 'target_race_date',
  'name', 'date', 'sim', 'track_id',
  'pilot_class', 'mandatory_car_id', 'setup_url', 'setup_notes',
  'duration_minutes_real', 'time_multiplier', 'duration_minutes_ingame',
  'start_time_ingame', 'end_time_ingame', 'ai_strength_pct',
  'field_size_hypercar', 'field_size_lmp2', 'field_size_gt3',
  'weather_condition', 'status', 'created_by', 'created_at',
  'notes_internal',
];

function validateAuditionPayload(payload: any, mode: 'create' | 'update'): { ok: boolean; error?: string } {
  if (mode === 'create') {
    if (!payload.name || !String(payload.name).trim()) return { ok: false, error: 'name obbligatorio' };
    if (!payload.date) return { ok: false, error: 'date obbligatoria' };
    if (!payload.sim) return { ok: false, error: 'sim obbligatorio' };
  }
  if (payload.pilot_class !== undefined && payload.pilot_class !== '') {
    if (PILOT_CLASSES.indexOf(payload.pilot_class) < 0) {
      return { ok: false, error: 'pilot_class non valida. Valori: ' + PILOT_CLASSES.join(', ') };
    }
  }
  if (payload.weather_condition !== undefined && payload.weather_condition !== '') {
    if (WEATHER.indexOf(payload.weather_condition) < 0) {
      return { ok: false, error: 'weather_condition non valida. Valori: ' + WEATHER.join(', ') };
    }
  }
  if (payload.status !== undefined && payload.status !== '') {
    if (AUDITION_STATUSES.indexOf(payload.status) < 0) {
      return { ok: false, error: 'status non valido. Valori: ' + AUDITION_STATUSES.join(', ') };
    }
  }
  if (payload.target_race_date !== undefined && payload.target_race_date !== '') {
    const d = new Date(payload.target_race_date);
    if (isNaN(d.getTime())) {
      return { ok: false, error: 'target_race_date deve essere una data ISO valida (es. 2026-06-14T14:00:00)' };
    }
  }
  for (const f of AUDITION_NUMERIC_FIELDS) {
    if (payload[f] !== undefined && payload[f] !== '') {
      const n = Number(payload[f]);
      if (isNaN(n) || n < 0) return { ok: false, error: f + ' deve essere numerico >= 0' };
    }
  }
  return { ok: true };
}

function computeEndTimeIngame(startHHMM: string, durationMinutes: number): string {
  const parts = String(startHHMM).split(':');
  if (parts.length !== 2) return '';
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (isNaN(h) || isNaN(m)) return '';
  const totalMinutes = ((h * 60 + m + Number(durationMinutes)) % (24 * 60) + 24 * 60) % (24 * 60);
  const endH = Math.floor(totalMinutes / 60);
  const endM = totalMinutes % 60;
  return String(endH).padStart(2, '0') + ':' + String(endM).padStart(2, '0');
}

function sanitizeAudition(row: any) {
  const out: any = {};
  AUDITION_FIELDS.forEach((f) => { if (f in row) out[f] = row[f]; });
  return out;
}

async function handleAuditionsCreate(supabase: any, me: any, payload: any) {
  if (me.role !== 'staff' && me.role !== 'admin') return json({ ok: false, error: 'Accesso negato: staff only' }, 403);

  const validation = validateAuditionPayload(payload, 'create');
  if (!validation.ok) return json({ ok: false, error: validation.error }, 400);

  const auditionId = 'aud_' + crypto.randomUUID().replace(/-/g, '').substring(0, 8);
  const now = new Date().toISOString();

  const durationReal = Number(payload.duration_minutes_real) || 0;
  const multiplier = Number(payload.time_multiplier) || 1;
  const durationIngame = durationReal * multiplier;

  let endTimeIngame = '';
  if (payload.start_time_ingame && durationIngame > 0) {
    endTimeIngame = computeEndTimeIngame(payload.start_time_ingame, durationIngame);
  }

  const row: any = {
    audition_id: auditionId,
    team_id: me.team_id,
    target_race: payload.target_race || null,
    target_race_date: payload.target_race_date || null,
    name: payload.name,
    date: payload.date,
    sim: payload.sim,
    track_id: payload.track_id || null,
    pilot_class: payload.pilot_class || null,
    mandatory_car_id: payload.mandatory_car_id || null,
    setup_url: payload.setup_url || null,
    setup_notes: payload.setup_notes || null,
    duration_minutes_real: payload.duration_minutes_real ?? null,
    time_multiplier: payload.time_multiplier ?? null,
    duration_minutes_ingame: durationIngame,
    start_time_ingame: payload.start_time_ingame || null,
    end_time_ingame: endTimeIngame || null,
    ai_strength_pct: payload.ai_strength_pct ?? null,
    field_size_hypercar: payload.field_size_hypercar ?? null,
    field_size_lmp2: payload.field_size_lmp2 ?? null,
    field_size_gt3: payload.field_size_gt3 ?? null,
    weather_condition: payload.weather_condition || null,
    status: payload.status || 'draft',
    created_by: me.id,
    created_at: now,
    notes_internal: payload.notes_internal || null,
  };

  const { data: created, error } = await supabase.from('endurance_auditions').insert(row).select().maybeSingle();
  if (error) return json({ ok: false, error: error.message }, 400);

  return json({ ok: true, data: { audition: sanitizeAudition(created) } });
}

async function handleAuditionsUpdate(supabase: any, me: any, payload: any) {
  if (me.role !== 'staff' && me.role !== 'admin') return json({ ok: false, error: 'Accesso negato: staff only' }, 403);

  const auditionId = payload?.audition_id ? String(payload.audition_id).trim() : '';
  if (!auditionId) return json({ ok: false, error: 'audition_id mancante' }, 400);

  const validation = validateAuditionPayload(payload, 'update');
  if (!validation.ok) return json({ ok: false, error: validation.error }, 400);

  const { data: existing, error: findErr } = await supabase
    .from('endurance_auditions')
    .select('*')
    .eq('team_id', me.team_id)
    .eq('audition_id', auditionId)
    .maybeSingle();
  if (findErr) return json({ ok: false, error: findErr.message }, 400);
  if (!existing) return json({ ok: false, error: 'Audition non trovata: ' + auditionId }, 404);

  const updates: any = {};
  AUDITION_MUTABLE_FIELDS.forEach((f) => {
    if (payload[f] !== undefined && AUDITION_IMMUTABLE.indexOf(f) < 0) updates[f] = payload[f];
  });

  const effectiveDurationReal = Number(updates.duration_minutes_real ?? existing.duration_minutes_real) || 0;
  const effectiveMultiplier = Number(updates.time_multiplier ?? existing.time_multiplier) || 1;
  const durationIngame = effectiveDurationReal * effectiveMultiplier;
  updates.duration_minutes_ingame = durationIngame;

  const effectiveStartTime = updates.start_time_ingame ?? existing.start_time_ingame;
  if (effectiveStartTime && durationIngame > 0) {
    updates.end_time_ingame = computeEndTimeIngame(effectiveStartTime, durationIngame);
  }

  const { data: updated, error: updateErr } = await supabase
    .from('endurance_auditions')
    .update(updates)
    .eq('team_id', me.team_id)
    .eq('audition_id', auditionId)
    .select()
    .maybeSingle();
  if (updateErr) return json({ ok: false, error: updateErr.message }, 400);

  return json({ ok: true, data: { audition: sanitizeAudition(updated) } });
}

// ─── Participants ───
const EP_STATUSES = ['registered', 'accepted', 'reserve', 'rejected', 'withdrawn'];

async function handleParticipantsAdd(supabase: any, me: any, payload: any) {
  if (me.role !== 'admin') return json({ ok: false, error: 'admin role required' }, 403);

  const auditionId = String(payload?.audition_id || '').trim();
  const driverId = String(payload?.driver_id || '').trim();
  const status = String(payload?.status || 'registered').trim();
  const notes = String(payload?.notes || '');

  if (!auditionId) return json({ ok: false, error: 'audition_id required' }, 400);
  if (!driverId) return json({ ok: false, error: 'driver_id required' }, 400);
  if (EP_STATUSES.indexOf(status) === -1) {
    return json({ ok: false, error: 'invalid status. allowed: ' + EP_STATUSES.join(', ') }, 400);
  }

  const { data: audition } = await supabase
    .from('endurance_auditions')
    .select('audition_id')
    .eq('team_id', me.team_id)
    .eq('audition_id', auditionId)
    .maybeSingle();
  if (!audition) return json({ ok: false, error: 'audition ' + auditionId + ' not found' }, 404);

  const { data: driver } = await supabase
    .from('drivers')
    .select('id')
    .eq('team_id', me.team_id)
    .eq('id', driverId)
    .maybeSingle();
  if (!driver) return json({ ok: false, error: 'driver ' + driverId + ' not found' }, 404);

  const { data: existing } = await supabase
    .from('endurance_participants')
    .select('participation_id')
    .eq('team_id', me.team_id)
    .eq('audition_id', auditionId)
    .eq('driver_id', driverId)
    .maybeSingle();
  if (existing) return json({ ok: false, error: 'driver ' + driverId + ' already in audition ' + auditionId }, 400);

  const participationId = 'part_' + crypto.randomUUID().replace(/-/g, '').substring(0, 8);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('endurance_participants')
    .insert({
      participation_id: participationId,
      team_id: me.team_id,
      audition_id: auditionId,
      driver_id: driverId,
      status,
      added_at: now,
      added_by: me.id,
      notes,
    })
    .select('participation_id, audition_id, driver_id, status, added_at, added_by, notes')
    .maybeSingle();
  if (error) return json({ ok: false, error: error.message }, 400);

  return json({ ok: true, data });
}

async function handleParticipantsUpdate(supabase: any, me: any, payload: any) {
  if (me.role !== 'admin') return json({ ok: false, error: 'admin role required' }, 403);

  const participationId = String(payload?.participation_id || '').trim();
  if (!participationId) return json({ ok: false, error: 'participation_id required' }, 400);

  const { data: existing, error: findErr } = await supabase
    .from('endurance_participants')
    .select('participation_id, audition_id, driver_id, status, added_at, added_by, notes')
    .eq('team_id', me.team_id)
    .eq('participation_id', participationId)
    .maybeSingle();
  if (findErr) return json({ ok: false, error: findErr.message }, 400);
  if (!existing) return json({ ok: false, error: 'participation ' + participationId + ' not found' }, 404);

  const updates: any = {};
  if (payload.status !== undefined) {
    const newStatus = String(payload.status).trim();
    if (EP_STATUSES.indexOf(newStatus) === -1) return json({ ok: false, error: 'invalid status' }, 400);
    updates.status = newStatus;
  }
  if (payload.notes !== undefined) updates.notes = String(payload.notes);

  const { data: updated, error: updateErr } = await supabase
    .from('endurance_participants')
    .update(updates)
    .eq('team_id', me.team_id)
    .eq('participation_id', participationId)
    .select('participation_id, audition_id, driver_id, status, added_at, added_by, notes')
    .maybeSingle();
  if (updateErr) return json({ ok: false, error: updateErr.message }, 400);

  return json({ ok: true, data: updated });
}

async function handleParticipantsRemove(supabase: any, me: any, payload: any) {
  if (me.role !== 'admin') return json({ ok: false, error: 'admin role required' }, 403);

  const participationId = String(payload?.participation_id || '').trim();
  if (!participationId) return json({ ok: false, error: 'participation_id required' }, 400);

  const { data: existing, error: findErr } = await supabase
    .from('endurance_participants')
    .select('participation_id')
    .eq('team_id', me.team_id)
    .eq('participation_id', participationId)
    .maybeSingle();
  if (findErr) return json({ ok: false, error: findErr.message }, 400);
  if (!existing) return json({ ok: false, error: 'participation ' + participationId + ' not found' }, 404);

  const { error: deleteErr } = await supabase
    .from('endurance_participants')
    .delete()
    .eq('team_id', me.team_id)
    .eq('participation_id', participationId);
  if (deleteErr) return json({ ok: false, error: deleteErr.message }, 400);

  return json({ ok: true, data: { deleted: true, participation_id: participationId } });
}

// ─── Stints ───
const TIRE_COMPOUNDS = ['soft', 'medium', 'hard', 'wet', 'intermediate'];
const STINT_STATUSES = ['planned', 'active', 'completed', 'aborted'];
const STINT_ALLOWED_FIELDS = [
  'driver_id', 'stint_order', 'car_number',
  'planned_start_time', 'planned_end_time', 'planned_duration_min',
  'actual_start_time', 'actual_end_time', 'actual_duration_min',
  'tire_compound', 'pit_stop_at_end', 'fuel_loaded_l',
  'actual_laps', 'best_lap_ms', 'status', 'notes',
];

function validateStint(payload: any, isCreate: boolean): { ok: boolean; error?: string } {
  if (isCreate) {
    if (!payload.race_id) return { ok: false, error: 'race_id obbligatorio' };
    if (!payload.car_number || String(payload.car_number).trim() === '') {
      return { ok: false, error: 'car_number obbligatorio (numero di gara della vettura, es. "7")' };
    }
    if (!payload.driver_id) return { ok: false, error: 'driver_id obbligatorio' };
    if (payload.stint_order == null || Number(payload.stint_order) < 1) {
      return { ok: false, error: 'stint_order deve essere >= 1' };
    }
  }
  if (payload.tire_compound && payload.tire_compound !== '' && TIRE_COMPOUNDS.indexOf(payload.tire_compound) < 0) {
    return { ok: false, error: `tire_compound non valido. Valori ammessi: ${TIRE_COMPOUNDS.join(', ')}` };
  }
  if (payload.status && STINT_STATUSES.indexOf(payload.status) < 0) {
    return { ok: false, error: `status non valido. Valori ammessi: ${STINT_STATUSES.join(', ')}` };
  }
  if (payload.planned_start_time && payload.planned_end_time) {
    const ps = new Date(payload.planned_start_time);
    const pe = new Date(payload.planned_end_time);
    if (!isNaN(ps.getTime()) && !isNaN(pe.getTime()) && ps >= pe) {
      return { ok: false, error: 'planned_start_time deve essere precedente a planned_end_time' };
    }
  }
  if (payload.actual_start_time && payload.actual_end_time) {
    const as = new Date(payload.actual_start_time);
    const ae = new Date(payload.actual_end_time);
    if (!isNaN(as.getTime()) && !isNaN(ae.getTime()) && as >= ae) {
      return { ok: false, error: 'actual_start_time deve essere precedente a actual_end_time' };
    }
  }
  return { ok: true };
}

async function shiftStintsOrder(
  supabase: any,
  teamId: string,
  raceId: string,
  carNumber: string,
  fromOrder: number,
  delta: number,
  excludeStintId?: string,
) {
  let query = supabase
    .from('endurance_stints')
    .select('stint_id, stint_order')
    .eq('team_id', teamId)
    .eq('race_id', raceId)
    .eq('car_number', carNumber)
    .gte('stint_order', fromOrder);
  if (excludeStintId) query = query.neq('stint_id', excludeStintId);
  query = query.order('stint_order', { ascending: delta < 0 });

  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);

  const now = new Date().toISOString();
  for (const row of rows ?? []) {
    const { error: updErr } = await supabase
      .from('endurance_stints')
      .update({ stint_order: row.stint_order + delta, updated_at: now })
      .eq('team_id', teamId)
      .eq('stint_id', row.stint_id);
    if (updErr) throw new Error(updErr.message);
  }
}

function parseNaiveAsUtcMs(naiveIso: unknown): number {
  if (!naiveIso) return NaN;
  const s = String(naiveIso).trim();
  if (!s) return NaN;
  const hasOffset = /Z$|[+-]\d{2}:?\d{2}$/.test(s);
  return new Date(hasOffset ? s : s + 'Z').getTime();
}

function formatUtcAsNaiveIso(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return d.getUTCFullYear()
    + '-' + pad(d.getUTCMonth() + 1)
    + '-' + pad(d.getUTCDate())
    + 'T' + pad(d.getUTCHours())
    + ':' + pad(d.getUTCMinutes())
    + ':' + pad(d.getUTCSeconds());
}

function validateFairShare(stints: any[]) {
  const totalsByDriver: Record<string, number> = {};
  stints.forEach((s) => {
    if (!s.driver_id) return;
    const dur = Number(s.planned_duration_min) || 0;
    totalsByDriver[s.driver_id] = (totalsByDriver[s.driver_id] || 0) + dur;
  });
  const driverIds = Object.keys(totalsByDriver);
  if (driverIds.length < 2) return [];
  const totalMin = driverIds.reduce((sum, id) => sum + totalsByDriver[id], 0);
  if (totalMin <= 0) return [];
  const avgMin = totalMin / driverIds.length;
  const issues: any[] = [];
  driverIds.forEach((id) => {
    const minutes = totalsByDriver[id];
    const deviation = (minutes - avgMin) / avgMin;
    if (Math.abs(deviation) > 0.25) {
      const pct = Math.round(deviation * 100);
      issues.push({
        type: 'unbalanced_share',
        driver_id: id,
        minutes: Math.round(minutes),
        avg_minutes: Math.round(avgMin),
        deviation_pct: pct,
        message: `${id} guida ${Math.round(minutes)} min (${pct > 0 ? '+' : ''}${pct}% sulla media di ${Math.round(avgMin)} min): carico sbilanciato.`,
      });
    }
  });
  return issues;
}

async function handleStintsAdd(supabase: any, me: any, payload: any) {
  if (me.role !== 'admin') return json({ ok: false, error: 'Permessi insufficienti' }, 403);

  const validation = validateStint(payload, true);
  if (!validation.ok) return json({ ok: false, error: validation.error }, 400);

  const raceId = String(payload.race_id);
  const carNumber = String(payload.car_number).trim();
  const desiredOrder = Number(payload.stint_order) || 1;

  await shiftStintsOrder(supabase, me.team_id, raceId, carNumber, desiredOrder, 1);

  const stintId = 'stint_' + crypto.randomUUID().replace(/-/g, '').substring(0, 8);
  const now = new Date().toISOString();

  const newRow = {
    stint_id: stintId,
    team_id: me.team_id,
    race_id: raceId,
    car_number: carNumber,
    driver_id: payload.driver_id,
    stint_order: desiredOrder,
    planned_start_time: payload.planned_start_time || null,
    planned_end_time: payload.planned_end_time || null,
    planned_duration_min: payload.planned_duration_min ?? null,
    actual_start_time: null,
    actual_end_time: null,
    actual_duration_min: null,
    tire_compound: payload.tire_compound || null,
    pit_stop_at_end: payload.pit_stop_at_end === true || payload.pit_stop_at_end === 'TRUE',
    fuel_loaded_l: payload.fuel_loaded_l ?? null,
    actual_laps: null,
    best_lap_ms: null,
    status: payload.status || 'planned',
    notes: payload.notes || null,
    created_at: now,
    created_by: me.id,
    updated_at: now,
  };

  const { data: created, error } = await supabase.from('endurance_stints').insert(newRow).select().maybeSingle();
  if (error) return json({ ok: false, error: error.message }, 400);

  return json({ ok: true, data: { stint: created } });
}

async function handleStintsUpdate(supabase: any, me: any, payload: any) {
  if (me.role !== 'admin') return json({ ok: false, error: 'Permessi insufficienti' }, 403);

  const stintId = payload?.stint_id ? String(payload.stint_id).trim() : '';
  if (!stintId) return json({ ok: false, error: 'stint_id obbligatorio' }, 400);

  const { data: existing, error: findErr } = await supabase
    .from('endurance_stints')
    .select('*')
    .eq('team_id', me.team_id)
    .eq('stint_id', stintId)
    .maybeSingle();
  if (findErr) return json({ ok: false, error: findErr.message }, 400);
  if (!existing) return json({ ok: false, error: 'Stint non trovato' }, 404);

  const validation = validateStint(payload, false);
  if (!validation.ok) return json({ ok: false, error: validation.error }, 400);

  const raceId = existing.race_id;
  const carNumber = String(existing.car_number || '').trim();

  if (payload.stint_order != null && Number(payload.stint_order) !== Number(existing.stint_order)) {
    const oldOrder = Number(existing.stint_order);
    const newOrder = Number(payload.stint_order);
    // BUGFIX (trovato in validazione live #259, 17 set 2026): questa riga resta
    // fisicamente al suo stint_order VECCHIO finché non viene scritta dall'update
    // finale più sotto. Se si lanciano subito i due shift, uno di essi può provare
    // a scrivere esattamente oldOrder su un'altra riga — collisione sul vincolo
    // UNIQUE (team_id, race_id, car_number, stint_order), perché questa riga non
    // ha ancora liberato quello slot. Il sorgente Apps Script non soffre di questo
    // problema (righe di uno Sheet, nessun vincolo UNIQUE) — è una conseguenza
    // diretta dell'aver sostituito il controllo applicativo con un vincolo DB
    // reale. Fix: parcheggiare questa riga su un valore sentinella fuori
    // dall'intervallo attivo (>=1 per il CHECK, ma irraggiungibile in pratica)
    // PRIMA di eseguire gli shift, così nessuno slot intermedio la trova più al
    // vecchio posto. L'update finale la riporta al valore reale (newOrder).
    const { error: parkErr } = await supabase
      .from('endurance_stints')
      .update({ stint_order: 999999 })
      .eq('team_id', me.team_id)
      .eq('stint_id', stintId);
    if (parkErr) return json({ ok: false, error: parkErr.message }, 400);
    await shiftStintsOrder(supabase, me.team_id, raceId, carNumber, oldOrder + 1, -1, stintId);
    await shiftStintsOrder(supabase, me.team_id, raceId, carNumber, newOrder, 1, stintId);
  }

  const updates: any = { updated_at: new Date().toISOString() };
  STINT_ALLOWED_FIELDS.forEach((f) => {
    if (payload[f] !== undefined) {
      updates[f] = f === 'pit_stop_at_end' ? (payload[f] === true || payload[f] === 'TRUE') : payload[f];
    }
  });

  const { data: updated, error: updateErr } = await supabase
    .from('endurance_stints')
    .update(updates)
    .eq('team_id', me.team_id)
    .eq('stint_id', stintId)
    .select()
    .maybeSingle();
  if (updateErr) return json({ ok: false, error: updateErr.message }, 400);

  return json({ ok: true, data: { stint: updated } });
}

async function handleStintsRemove(supabase: any, me: any, payload: any) {
  if (me.role !== 'admin') return json({ ok: false, error: 'Permessi insufficienti' }, 403);

  const stintId = payload?.stint_id ? String(payload.stint_id).trim() : '';
  if (!stintId) return json({ ok: false, error: 'stint_id obbligatorio' }, 400);

  const { data: existing, error: findErr } = await supabase
    .from('endurance_stints')
    .select('race_id, car_number, stint_order')
    .eq('team_id', me.team_id)
    .eq('stint_id', stintId)
    .maybeSingle();
  if (findErr) return json({ ok: false, error: findErr.message }, 400);
  if (!existing) return json({ ok: false, error: 'Stint non trovato' }, 404);

  const raceId = existing.race_id;
  const carNumber = String(existing.car_number || '').trim();
  const removedOrder = Number(existing.stint_order);

  const { error: deleteErr } = await supabase
    .from('endurance_stints')
    .delete()
    .eq('team_id', me.team_id)
    .eq('stint_id', stintId);
  if (deleteErr) return json({ ok: false, error: deleteErr.message }, 400);

  await shiftStintsOrder(supabase, me.team_id, raceId, carNumber, removedOrder + 1, -1);

  return json({ ok: true, data: { removed: stintId } });
}

async function handleStintsGenerate(me: any, payload: any) {
  if (me.role !== 'admin') return json({ ok: false, error: 'Permessi insufficienti' }, 403);

  const { race_id, car_number, race_start_time, total_duration_min, target_stint_min, driver_ids } = payload || {};

  if (!race_id || typeof race_id !== 'string' || race_id.trim() === '') {
    return json({ ok: false, error: 'race_id non valido o mancante' }, 400);
  }
  if (!car_number || String(car_number).trim() === '') {
    return json({ ok: false, error: 'car_number obbligatorio (numero di gara della vettura, es. "7")' }, 400);
  }
  const startMs = parseNaiveAsUtcMs(race_start_time);
  if (isNaN(startMs)) return json({ ok: false, error: 'race_start_time non parsabile come data valida' }, 400);
  if (typeof total_duration_min !== 'number' || total_duration_min <= 0) {
    return json({ ok: false, error: 'total_duration_min deve essere un numero maggiore di 0' }, 400);
  }
  if (typeof target_stint_min !== 'number' || target_stint_min <= 0 || target_stint_min > total_duration_min) {
    return json({ ok: false, error: 'target_stint_min deve essere un numero > 0 e <= total_duration_min' }, 400);
  }
  if (!Array.isArray(driver_ids) || driver_ids.length === 0) {
    return json({ ok: false, error: 'driver_ids deve essere un array con almeno 1 elemento' }, 400);
  }

  const numStints = Math.ceil(total_duration_min / target_stint_min);
  const stints: any[] = [];
  let totalDurationCheck = 0;
  let currentStartMs = startMs;

  for (let i = 0; i < numStints; i++) {
    let durationMin = target_stint_min;
    if (i === numStints - 1) durationMin = total_duration_min - (target_stint_min * (numStints - 1));
    const currentEndMs = currentStartMs + durationMin * 60000;
    const assignedDriverId = driver_ids[i % driver_ids.length];

    stints.push({
      stint_order: i + 1,
      car_number: String(car_number).trim(),
      driver_id: assignedDriverId,
      planned_start_time: formatUtcAsNaiveIso(currentStartMs),
      planned_end_time: formatUtcAsNaiveIso(currentEndMs),
      planned_duration_min: durationMin,
    });

    totalDurationCheck += durationMin;
    currentStartMs = currentEndMs;
  }

  return json({ ok: true, data: { stints, count: stints.length, total_duration_check: totalDurationCheck } });
}

async function handleStintsValidateCoverage(supabase: any, me: any, payload: any) {
  if (me.role !== 'admin') return json({ ok: false, error: 'Permessi insufficienti' }, 403);

  const { race_id, car_number, race_start_time, total_duration_min } = payload || {};

  if (!race_id || typeof race_id !== 'string' || race_id.trim() === '') {
    return json({ ok: false, error: 'race_id mancante o non valido' }, 400);
  }
  const raceStartMs = parseNaiveAsUtcMs(race_start_time);
  if (isNaN(raceStartMs)) return json({ ok: false, error: 'race_start_time non parsabile come data valida' }, 400);
  if (typeof total_duration_min !== 'number' || total_duration_min <= 0) {
    return json({ ok: false, error: 'total_duration_min deve essere un numero > 0' }, 400);
  }

  let query = supabase
    .from('endurance_stints')
    .select('stint_order, driver_id, planned_start_time, planned_end_time, planned_duration_min')
    .eq('team_id', me.team_id)
    .eq('race_id', race_id);
  if (car_number != null && String(car_number).trim() !== '') {
    query = query.eq('car_number', String(car_number).trim());
  }
  const { data: stintsData, error } = await query;
  if (error) return json({ ok: false, error: error.message }, 400);

  const stints = (stintsData ?? []).slice().sort((a: any, b: any) => Number(a.stint_order) - Number(b.stint_order));

  if (stints.length === 0) {
    return json({
      ok: true,
      data: {
        valid: false,
        issues: [{ type: 'no_stints', message: 'Nessuno stint trovato per la gara specificata.' }],
        stint_count: 0,
      },
    });
  }

  const raceEndMs = raceStartMs + total_duration_min * 60000;
  const TOLERANCE_MS = 5000;
  const issues: any[] = [];
  const parsed: Array<{ startMs: number; endMs: number; stint_order: number } | null> = [];

  for (const s of stints) {
    const startMs = parseNaiveAsUtcMs(s.planned_start_time);
    const endMs = parseNaiveAsUtcMs(s.planned_end_time);
    if (isNaN(startMs) || isNaN(endMs)) {
      issues.push({ type: 'invalid_times', message: `Orari mancanti o non validi per lo stint ${s.stint_order}.`, stint_order: s.stint_order });
      parsed.push(null);
    } else {
      parsed.push({ startMs, endMs, stint_order: s.stint_order });
    }
  }

  const firstValid = parsed.find((p) => p !== null) as { startMs: number; endMs: number; stint_order: number } | undefined;
  if (firstValid) {
    const deltaStart = (firstValid.startMs - raceStartMs) / 60000;
    if (Math.abs(firstValid.startMs - raceStartMs) > TOLERANCE_MS) {
      issues.push({ type: 'start_mismatch', message: `Il primo stint non coincide con la partenza della gara. Delta: ${Math.round(deltaStart)} min.`, stint_order: firstValid.stint_order, delta_min: deltaStart });
    }
  }

  let lastValid: { startMs: number; endMs: number; stint_order: number } | null = null;
  for (let i = parsed.length - 1; i >= 0; i--) {
    if (parsed[i]) { lastValid = parsed[i]!; break; }
  }
  if (lastValid) {
    const deltaEnd = (lastValid.endMs - raceEndMs) / 60000;
    if (Math.abs(lastValid.endMs - raceEndMs) > TOLERANCE_MS) {
      issues.push({ type: 'end_mismatch', message: `L'ultimo stint non coincide con la fine prevista della gara. Delta: ${Math.round(deltaEnd)} min.`, stint_order: lastValid.stint_order, delta_min: deltaEnd });
    }
  }

  for (let i = 0; i < parsed.length - 1; i++) {
    const current = parsed[i];
    const next = parsed[i + 1];
    if (!current || !next) continue;
    const diffMs = next.startMs - current.endMs;
    if (diffMs > TOLERANCE_MS) {
      const gap = diffMs / 60000;
      issues.push({ type: 'gap', message: `Buco temporale di ${Math.round(gap)} min dopo lo stint ${current.stint_order}.`, stint_order: current.stint_order, delta_min: gap });
    } else if (diffMs < -TOLERANCE_MS) {
      const overlap = -diffMs / 60000;
      issues.push({ type: 'overlap', message: `Sovrapposizione di ${Math.round(overlap)} min tra lo stint ${current.stint_order} e il successivo.`, stint_order: current.stint_order, delta_min: overlap });
    }
  }

  issues.push(...validateFairShare(stints));

  return json({ ok: true, data: { valid: issues.length === 0, issues, stint_count: stints.length } });
}

async function handleStintsConfirmPlan(supabase: any, me: any, payload: any) {
  if (me.role !== 'admin') return json({ ok: false, error: 'Permessi insufficienti' }, 403);

  const { race_id, car_number, stints, replace_existing } = payload || {};

  if (!race_id || typeof race_id !== 'string' || race_id.trim() === '') {
    return json({ ok: false, error: 'race_id mancante o non valido' }, 400);
  }
  if (!car_number || String(car_number).trim() === '') {
    return json({ ok: false, error: 'car_number obbligatorio (numero di gara della vettura, es. "7")' }, 400);
  }
  const carNumber = String(car_number).trim();

  if (!Array.isArray(stints) || stints.length === 0) {
    return json({ ok: false, error: 'stints deve essere un array non vuoto' }, 400);
  }
  if (typeof replace_existing !== 'boolean') {
    return json({ ok: false, error: 'replace_existing deve essere un valore booleano' }, 400);
  }

  for (let i = 0; i < stints.length; i++) {
    const s = stints[i];
    if (!s.driver_id || typeof s.stint_order !== 'number' || s.stint_order < 1) {
      return json({ ok: false, error: `Stint all'indice ${i} non valido: driver_id mancante o stint_order < 1` }, 400);
    }
  }

  const { data: existingStints, error: existingErr } = await supabase
    .from('endurance_stints')
    .select('stint_id')
    .eq('team_id', me.team_id)
    .eq('race_id', race_id)
    .eq('car_number', carNumber);
  if (existingErr) return json({ ok: false, error: existingErr.message }, 400);

  let replacedCount = 0;
  if ((existingStints ?? []).length > 0) {
    if (replace_existing === false) {
      return json({ ok: false, error: `La vettura #${carNumber} ha già ${existingStints!.length} stint su questa gara. Imposta replace_existing per sostituirli.` }, 400);
    }
    const idsToDelete = existingStints!.map((s: any) => s.stint_id);
    const { error: deleteErr } = await supabase.from('endurance_stints').delete().eq('team_id', me.team_id).in('stint_id', idsToDelete);
    if (deleteErr) return json({ ok: false, error: deleteErr.message }, 400);
    replacedCount = idsToDelete.length;
  }

  const nowIso = new Date().toISOString();
  const records = stints.map((s: any) => ({
    stint_id: 'stint_' + crypto.randomUUID().replace(/-/g, '').substring(0, 8),
    team_id: me.team_id,
    race_id,
    car_number: carNumber,
    stint_order: s.stint_order,
    driver_id: s.driver_id,
    planned_start_time: s.planned_start_time || null,
    planned_end_time: s.planned_end_time || null,
    planned_duration_min: s.planned_duration_min !== undefined ? s.planned_duration_min : null,
    actual_start_time: null,
    actual_end_time: null,
    actual_duration_min: null,
    actual_laps: null,
    best_lap_ms: null,
    status: 'planned',
    tire_compound: s.tire_compound || null,
    fuel_loaded_l: s.fuel_loaded_l ?? null,
    pit_stop_at_end: false,
    notes: s.notes || null,
    created_by: me.id,
    created_at: nowIso,
    updated_at: nowIso,
  }));

  const { error: insertErr } = await supabase.from('endurance_stints').insert(records);
  if (insertErr) return json({ ok: false, error: insertErr.message }, 400);

  return json({ ok: true, data: { written: records.length, replaced: replacedCount, race_id } });
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

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return json({ ok: false, error: 'Auth richiesto' }, 401);

    const { data: me, error: meErr } = await supabase
      .from('drivers')
      .select('id, team_id, role')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (meErr) return json({ ok: false, error: meErr.message }, 400);
    if (!me) return json({ ok: false, error: 'Auth richiesto' }, 401);

    const payload = await req.json().catch(() => ({}));
    const action = String(payload?.action || '');

    switch (action) {
      case 'auditions.create': return await handleAuditionsCreate(supabase, me, payload);
      case 'auditions.update': return await handleAuditionsUpdate(supabase, me, payload);
      case 'participants.add': return await handleParticipantsAdd(supabase, me, payload);
      case 'participants.update': return await handleParticipantsUpdate(supabase, me, payload);
      case 'participants.remove': return await handleParticipantsRemove(supabase, me, payload);
      case 'stints.add': return await handleStintsAdd(supabase, me, payload);
      case 'stints.update': return await handleStintsUpdate(supabase, me, payload);
      case 'stints.remove': return await handleStintsRemove(supabase, me, payload);
      case 'stints.generate': return await handleStintsGenerate(me, payload);
      case 'stints.validateCoverage': return await handleStintsValidateCoverage(supabase, me, payload);
      case 'stints.confirmPlan': return await handleStintsConfirmPlan(supabase, me, payload);
      default: return json({ ok: false, error: 'action sconosciuta: ' + action }, 400);
    }
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
