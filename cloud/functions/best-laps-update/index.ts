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
//
// FIX #331: la riga tornata da .select() include comunque driver_id
// grezzo (uuid) perché non è un campo modificato ma fa parte della
// riga intera restituita — alias a driver_code via join, stesso
// principio di best-laps-list.
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
    if (me.role !== 'staff' && me.role !== 'admin') {
      return json({ ok: false, error: 'Permessi insufficienti' }, 403);
    }

    const lapId = String(payload?.lap_id || '').trim();
    if (!lapId) return json({ ok: false, error: 'Campo lap_id obbligatorio per l\'aggiornamento' }, 400);

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
      .eq('team_id', me.team_id)
      .select('*, drivers!best_laps_driver_id_fkey(driver_code)')
      .maybeSingle();

    if (error) return json({ ok: false, error: error.message }, 400);
    if (!data) return json({ ok: false, error: 'Lap non trovato: ' + lapId }, 404);

    const { drivers, driver_id, ...rest } = data as any;
    const lap = { ...rest, driver_id: drivers?.driver_code ?? driver_id };

    return json({ ok: true, data: { lap } });
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
