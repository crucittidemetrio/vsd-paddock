// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — championships.saveAdjustments (porting fedele
// di apps-script/Standings.js, handleChampionshipsSaveAdjustments)
// ═══════════════════════════════════════════════════════════
// Auth: staff/admin. Salva l'array COMPLETO di aggiustamenti manuali
// (bonus/penalità/scarti) — l'endpoint sovrascrive sempre tutto
// l'array, fedele al sorgente.
//
// payload: { championship_id, adjustments: [{ id?, driver_key,
// car_class, race_id?, delta, reason? }] }
//
// #455 (30/09/2026): aggiunto fallback legacy_token — questa funzione
// non l'aveva MAI ricevuto (unica differenza dalle sue "gemelle"
// championships-add/championships-update, che lo hanno da #387/#395),
// quindi "Aggiustamenti punti" in ChampionshipDetail.jsx era
// inutilizzabile per qualunque staff/admin reale (nessuno ha mai una
// sessione Supabase vera, solo il token legacy — stessa causa radice
// di #331/#358/#359/#392/#443). Segnalato da Demetrio: bonus pole
// position Pelloni (Clash of Classes, Silverston R1) → "Auth
// richiesto". Stesso resolveLegacyDriver di championships-update.
//
// GAP NOTI: notifyPointsAdjustment_ (Discord per ogni nuovo
// aggiustamento) e logAudit_ NON portati — dipendono da domini non
// ancora portati (Discord/AuditLog, Fase 3 #256). Il diff "solo i
// nuovi" (oldIds/newOnes) del sorgente serviva solo a decidere quali
// notificare — qui non ha più motivo di esistere, ma resta scritto
// il set completo esattamente come nel sorgente.
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
      return json({ ok: false, error: 'Forbidden: solo staff/admin' }, 403);
    }

    const championshipId = payload?.championship_id ? String(payload.championship_id) : '';
    if (!championshipId) return json({ ok: false, error: 'championship_id mancante' }, 400);

    const adjustments = Array.isArray(payload?.adjustments) ? payload.adjustments : [];
    for (const a of adjustments) {
      if (!a.driver_key) return json({ ok: false, error: 'driver_key mancante in un aggiustamento' }, 400);
      if (!a.car_class) return json({ ok: false, error: 'car_class mancante in un aggiustamento' }, 400);
      if (typeof a.delta !== 'number') return json({ ok: false, error: 'delta deve essere un numero' }, 400);
      if (!a.id) a.id = 'adj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    }

    const { data, error } = await supabase
      .from('championships')
      .update({ points_adjustments_json: adjustments })
      .eq('id', championshipId)
      .eq('team_id', me.team_id)
      .select()
      .maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 400);
    if (!data) return json({ ok: false, error: 'Campionato non trovato: ' + championshipId }, 404);

    return json({ ok: true, data: { championship_id: championshipId, saved: adjustments.length } });
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
