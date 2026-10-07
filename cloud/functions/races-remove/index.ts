// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — races.remove (porting di apps-script/Races.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handleRacesRemove):
//   - auth richiesto, SOLO ADMIN (_esIsStaff_ reale è admin-only)
//   - race_id obbligatorio
//   - blocca la cancellazione se esistono stint Endurance collegati
//   - logAudit_() sulla cancellazione
//
// GAP NOTO (documentato, non un dimenticanza): il controllo "stint
// collegati" QUI È OMESSO perché il dominio Endurance (tabella
// endurance_stints) non è ancora portato in cloud/ (Fase 4, #259).
// Finché quel dominio non esiste, races.remove qui cancella sempre,
// senza il controllo di sicurezza anti-orfani del sorgente reale.
// Va richiuso esplicitamente quando arriva #259 (aggiungere lo stesso
// controllo prima della delete).
//
// logAudit_() OMESSO per lo stesso motivo di races-update: AuditLog
// non è ancora portato (#256).
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// #468 — risoluzione chiamante: sessione Supabase OPPURE token legacy
// (Apps Script auth.verify). Nessun pilota reale ha una sessione Supabase:
// senza il ramo legacy queste funzioni rispondevano sempre "Auth richiesto".
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

async function resolveCaller(req: Request, payload: any): Promise<{ client: any; driverId: string; teamId: string; role: string } | null> {
  const url = Deno.env.get('SUPABASE_URL')!;
  const authHeader = req.headers.get('Authorization');
  if (authHeader) {
    const uc = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await uc.auth.getUser();
    if (user) {
      const { data: d } = await uc.from('drivers').select('id, team_id, role').eq('auth_user_id', user.id).maybeSingle();
      if (d) return { client: uc, driverId: d.id, teamId: d.team_id, role: d.role };
    }
  }
  const sc = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const lg = await resolveLegacyDriver(sc, payload?.legacy_token);
  if (lg) return { client: sc, driverId: lg.id, teamId: lg.team_id, role: lg.role };
  return null;
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
    const caller = await resolveCaller(req, payload);
    if (!caller) return json({ ok: false, error: 'Auth richiesto' }, 401);
    const supabase = caller.client;

    const raceId = payload?.race_id ? String(payload.race_id) : '';
    if (!raceId) return json({ ok: false, error: 'Campo race_id obbligatorio per la rimozione' }, 400);

    const { data: me, error: meErr } = await supabase
      .from('drivers')
      .select('role')
      .eq('id', caller.driverId)
      .maybeSingle();
    if (meErr) return json({ ok: false, error: meErr.message }, 400);
    if (!me) return json({ ok: false, error: 'Driver non collegato a questo account' }, 404);
    if (me.role !== 'admin') {
      return json({ ok: false, error: 'Permessi insufficienti' }, 403);
    }

    // NOTA: nessun controllo "stint collegati" — endurance_stints non
    // esiste ancora in cloud/ (#259). Vedi commento in testa al file.

    const { data, error } = await supabase
      .from('races')
      .delete()
      .eq('race_id', raceId)
      .eq('team_id', caller.teamId)
      .select()
      .maybeSingle();

    if (error) return json({ ok: false, error: error.message }, 400);
    if (!data) return json({ ok: false, error: 'Gara non trovata: ' + raceId }, 404);

    return json({ ok: true, data: { race_id: raceId, deleted: true } });
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
