// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — auditLog.list (porting fedele di
// apps-script/AuditLog.js, handleAuditLogList)
// ═══════════════════════════════════════════════════════════
// Auth: staff/admin. Filtri opzionali action/driver_id/q, paginazione
// limit/offset (default 100, max 500), arricchito con driver_name.
//
// FIX #335 (20/09/2026, trovato prima del cutover frontend, non
// ancora esposto a utenti reali): driver_id nella riga restituita era
// l'uuid interno Postgres (drivers.id, da audit_log.driver_id), non
// il driver_code (VSD005...) che è il contratto storico di ogni altro
// dominio già portato (vedi FIX #330 in client.js/supabaseApi.js —
// "driver_id in qualunque payload/risposta è SEMPRE driver_code").
// AdminAuditLog.jsx usa oggi r.driver_id solo come fallback di
// visualizzazione quando driver_name manca (mai per lookup/filtri),
// quindi non era un bug bloccante, ma avrebbe mostrato uuid grezzi
// invece di codici piloti leggibili in quel caso limite — corretto
// per coerenza col resto del progetto prima di collegare il frontend.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Fallback token legacy (stesso pattern #331/#358/#359, esteso il
// 21/09/2026 — vedi nota completa in races-list/index.ts). Nota #335
// originariamente escludeva questo dominio dal fallback ("nessun caso
// reale segnalato per un admin/staff senza sessione Supabase") — caso
// reale ora emerso (Demetrio da notebook), fallback aggiunto.
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

    if (!me || (me.role !== 'staff' && me.role !== 'admin')) {
      return json({ ok: false, error: 'Forbidden: solo staff/admin' }, me ? 403 : 401);
    }

    const limit = Math.min(Math.max(Number(payload?.limit) || 100, 1), 500);
    const offset = Math.max(Number(payload?.offset) || 0, 0);

    // FIX #335: se il filtro driver_id arriva dal client come driver_code
    // (contratto pubblico), risolviamolo all'uuid interno prima di
    // interrogare audit_log (che ha driver_id uuid).
    let driverIdFilter: string | null = null;
    if (payload?.driver_id) {
      const raw = String(payload.driver_id);
      const { data: byCode } = await supabase
        .from('drivers')
        .select('id')
        .eq('team_id', me.team_id)
        .eq('driver_code', raw)
        .maybeSingle();
      driverIdFilter = byCode?.id || raw; // fallback: magari è già un uuid
    }

    let query = supabase
      .from('audit_log')
      .select('*', { count: 'exact' })
      .eq('team_id', me.team_id);

    if (payload?.action) query = query.eq('action', String(payload.action));
    if (driverIdFilter) query = query.eq('driver_id', driverIdFilter);
    if (payload?.q) {
      const q = String(payload.q);
      query = query.or(`target_id.ilike.%${q}%,details.ilike.%${q}%`);
    }

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) return json({ ok: false, error: error.message }, 400);

    const driverIds = Array.from(new Set((data ?? []).map((r: any) => r.driver_id).filter(Boolean)));
    let driverCodeMap: Record<string, string> = {};
    let driverNameMap: Record<string, string> = {};
    if (driverIds.length > 0) {
      const { data: drivers } = await supabase
        .from('drivers')
        .select('id, display_name, driver_code')
        .in('id', driverIds);
      (drivers ?? []).forEach((d: any) => {
        driverNameMap[d.id] = d.display_name;
        driverCodeMap[d.id] = d.driver_code;
      });
    }

    const rows = (data ?? []).map((r: any) => ({
      log_id: r.id,
      timestamp: r.created_at,
      // FIX #335: driver_code (contratto pubblico), non l'uuid interno.
      // Se il driver è stato rimosso nel frattempo (nessun match), resta
      // l'uuid grezzo come fallback innocuo invece di sparire.
      driver_id: (r.driver_id && driverCodeMap[r.driver_id]) || r.driver_id || '',
      driver_name: (r.driver_id && driverNameMap[r.driver_id]) || null,
      action: r.action,
      target_id: r.target_id || '',
      details: r.details || '',
    }));

    return json({ ok: true, data: { rows, total: count ?? rows.length, limit, offset } });
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
