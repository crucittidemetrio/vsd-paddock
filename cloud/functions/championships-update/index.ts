// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — championships.update (chiude gap #387,
// vedi nota completa in championships-add/index.ts)
// ═══════════════════════════════════════════════════════════
// Gate: staff/admin. Whitelist esplicita di campi editabili — id,
// team_id, created_at, standings_json e points_adjustments_json
// restano fuori: i due json hanno già i loro endpoint dedicati
// (championships.importStandings/saveAdjustments), coerente con la
// stessa scelta fatta in best-laps-update (whitelist, non blacklist).
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

const VALID_STATUSES = ['draft', 'upcoming', 'active', 'completed'];
const EDITABLE_FIELDS = ['name', 'sim', 'season', 'status', 'format', 'start_date', 'end_date', 'notes', 'banner_url'];

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

    const id = String(payload?.id || '').trim();
    if (!id) return json({ ok: false, error: 'Campo id obbligatorio per l\'aggiornamento' }, 400);

    const updates: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
      if (!(field in (payload ?? {}))) continue;
      if (field === 'status') {
        const status = String(payload.status);
        if (!VALID_STATUSES.includes(status)) {
          return json({ ok: false, error: 'status non valido — atteso uno tra: ' + VALID_STATUSES.join(', ') }, 400);
        }
        updates.status = status;
      } else if (field === 'start_date' || field === 'end_date') {
        if (payload[field] === null || payload[field] === '') {
          updates[field] = null;
        } else if (isNaN(new Date(payload[field]).getTime())) {
          return json({ ok: false, error: `Campo ${field} non parsabile come data valida` }, 400);
        } else {
          updates[field] = new Date(payload[field]).toISOString().slice(0, 10);
        }
      } else {
        updates[field] = payload[field] === null ? null : String(payload[field]);
      }
    }

    if (Object.keys(updates).length === 0) {
      return json({ ok: false, error: 'Nessun campo valido da aggiornare' }, 400);
    }

    const { data, error } = await supabase
      .from('championships')
      .update(updates)
      .eq('id', id)
      .eq('team_id', me.team_id)
      .select()
      .maybeSingle();

    if (error) return json({ ok: false, error: error.message }, 400);
    if (!data) return json({ ok: false, error: 'Campionato non trovato: ' + id }, 404);

    return json({ ok: true, data: { championship: data } });
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
