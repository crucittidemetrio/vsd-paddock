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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
    const raceId = payload?.race_id ? String(payload.race_id) : '';
    if (!raceId) return json({ ok: false, error: 'Campo race_id obbligatorio per la rimozione' }, 400);

    const { data: me, error: meErr } = await supabase
      .from('drivers')
      .select('role')
      .eq('auth_user_id', user.id)
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
