// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — laps.update (porting di apps-script/BestLaps.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handleLapsUpdate):
//   - auth richiesto, SOLO staff/admin
//   - lap_id obbligatorio
//   - se lap_time_display cambia, ricalcola lap_time_ms
//   - non altera lap_id/created_at/garage61_lap_id
//
// DEVIAZIONE deliberata: il sistema reale usa una BLACKLIST (tutto è
// modificabile tranne lap_id/created_at/garage61_lap_id — driver_id
// compreso). Qui uso una WHITELIST esplicita che esclude anche
// driver_id/verified_by/verified_at/team_id: riassegnare un giro a un
// altro pilota è un'operazione rara e più delicata di un tempo/nota,
// e qui driver_id è un uuid interno (non il driver_code leggibile del
// sistema reale) — più sicuro trattarla come "non supportata da questo
// endpoint" piuttosto che esporre un uuid grezzo da passare a mano.
// Il controllo nuovo-record + notifica restano fuori scope (vedi
// best-laps-add).
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const EDITABLE_FIELDS = [
  'sim', 'track_id', 'car_id', 'lap_time_display', 'set_date', 'conditions',
  'air_temp_c', 'track_temp_c', 'session_type', 'setup_shared', 'setup_link',
  'replay_url', 'notes',
];

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
    const lapId = String(payload?.lap_id || '').trim();
    if (!lapId) return json({ ok: false, error: 'Campo lap_id obbligatorio per l\'aggiornamento' }, 400);

    const { data: me, error: meErr } = await supabase
      .from('drivers')
      .select('role')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (meErr) return json({ ok: false, error: meErr.message }, 400);
    if (!me) return json({ ok: false, error: 'Driver non collegato a questo account' }, 404);
    if (me.role !== 'staff' && me.role !== 'admin') {
      return json({ ok: false, error: 'Permessi insufficienti' }, 403);
    }

    const updates: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
      if (!(field in (payload ?? {}))) continue;
      if (field === 'lap_time_display') {
        const ms = parseLapTimeToMs(payload[field]);
        if (ms === null) {
          return json({ ok: false, error: 'lap_time_display non valido. Formato atteso: M:SS.mmm (es. 1:30.333)' }, 400);
        }
        updates.lap_time_ms = ms;
        updates.lap_time_display = msToLapDisplay(ms);
      } else if (field === 'air_temp_c' || field === 'track_temp_c') {
        updates[field] = payload[field] === null || payload[field] === '' ? null : Number(payload[field]);
      } else if (field === 'setup_shared') {
        updates[field] = payload[field] === true || payload[field] === 'TRUE';
      } else {
        updates[field] = payload[field] === null ? null : String(payload[field]);
      }
    }

    if (Object.keys(updates).length === 0) {
      return json({ ok: false, error: 'Nessun campo valido da aggiornare' }, 400);
    }

    const { data, error } = await supabase
      .from('best_laps')
      .update(updates)
      .eq('id', lapId)
      .select()
      .maybeSingle();

    if (error) return json({ ok: false, error: error.message }, 400);
    if (!data) return json({ ok: false, error: 'Lap non trovato: ' + lapId }, 404);

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
