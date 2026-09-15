// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — roster.get (porting di apps-script/Roster.js)
// ═══════════════════════════════════════════════════════════
// Logica di riferimento reale (handleRosterGet in Roster.js):
//   - auth richiesto
//   - livello 'private' se isStaff O isSelf, altrimenti 'public'
//
// Qui il livello non è un if applicativo: si tenta prima la tabella
// base `drivers` (RLS "self o staff/admin leggono il dettaglio
// privato" lascia passare la riga SOLO se il chiamante è self o
// staff/admin dello stesso team — altrimenti zero righe, non un
// errore). Se zero righe, si cade sulla vista drivers_public
// (chiunque nel team la vede). Il "livello" è quindi una
// conseguenza strutturale della RLS, non un ramo di codice separato
// da tenere sincronizzato a mano.
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

    const payload = await req.json().catch(() => ({}));
    const driverCode = String(payload?.driver_id || '').trim();
    if (!driverCode) return json({ ok: false, error: 'driver_id mancante' }, 400);

    const { data: privateRow, error: privateErr } = await supabase
      .from('drivers')
      .select('*')
      .eq('driver_code', driverCode)
      .maybeSingle();

    if (privateErr) return json({ ok: false, error: privateErr.message }, 400);

    if (privateRow) {
      return json({
        ok: true,
        data: { driver: { ...privateRow, is_ex_driver: !!privateRow.removed_at } },
      });
    }

    const { data: publicRow, error: publicErr } = await supabase
      .from('drivers_public')
      .select('*')
      .eq('driver_code', driverCode)
      .maybeSingle();

    if (publicErr) return json({ ok: false, error: publicErr.message }, 400);
    if (!publicRow) return json({ ok: false, error: 'Pilota non trovato: ' + driverCode }, 404);

    return json({ ok: true, data: { driver: publicRow } });
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
