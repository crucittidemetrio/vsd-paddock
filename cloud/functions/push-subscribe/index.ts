// ═══════════════════════════════════════════════════════════
// VSD-Paddock Cloud — push-subscribe (dispatcher: push.subscribe +
// push.unsubscribe, porting fedele di apps-script/Push.js)
// ═══════════════════════════════════════════════════════════
// #391 (24/09/2026): consolidato con push-unsubscribe in UNA sola
// funzione per liberare uno slot Edge Function (quota piano piena,
// niente upgrade — vedi notifications-cron). push-unsubscribe è stata
// eliminata dal dashboard Supabase: il codice qui sotto ne assorbe
// interamente la logica, invariata. Dispatch su body.action
// ('subscribe' default per retrocompatibilità con eventuali chiamate
// dirette storiche, 'unsubscribe' esplicito).
//
// FIX (24/09/2026, stesso giorno — bug reale scoperto testando con
// Demetrio: "ho attivato le notifiche push" ma push_subscriptions
// restava a 0 righe e zero invocazioni della funzione nei log).
// Causa: né push-subscribe né push-unsubscribe hanno MAI avuto il
// fallback legacy_token (resolveLegacyDriver) che tutto il resto del
// dominio ha — stesso identico pattern/causa radice di #358/#359/#370/
// #375/#376/#378/#385. Verificato in browser reale (Chrome, sessione
// di Demetrio): pushManager.subscribe() lato browser riesce sempre
// (crea una subscription locale valida), ma la successiva chiamata
// api.push.subscribe() falliva con 401 "Auth richiesto" perché anche
// l'admin reale opera SOLO col token legacy Discord OAuth via Apps
// Script, mai con una sessione Supabase vera — esattamente la premessa
// corretta da #376. Il fallimento era silenzioso in UI:
// usePushSubscription.js mostra l'errore, ma lo stato "✓ Attive su
// questo dispositivo" deriva SOLO dalla subscription locale del browser
// (pushManager.getSubscription()), mai riverificato contro il backend —
// quindi un utente può vedere "Attive" anche senza che la riga esista
// mai su Supabase.
// Fix: stesso resolveLegacyDriver di race-results-import/best-laps-*/
// ecc., aggiunto qui identico. Aggiunto anche 'push.subscribe'/
// 'push.unsubscribe' a LEGACY_TOKEN_FALLBACK_ACTIONS in supabaseApi.js.
//
// Auth: login richiesto (qualsiasi pilota) per entrambe le azioni.
// ═══════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Fallback token legacy — stesso identico pattern di resolveLegacyDriver
// in race-results-import/index.ts (vedi nota lì per il contesto completo).
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
          .select('id, team_id')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        me = meRow || null;
      }
    }

    // Fallback token legacy — vedi nota in testa al file. Se risolto,
    // `supabase` passa a service-role (RLS bypassata, come nelle altre
    // 20+ Edge Function con lo stesso fallback).
    if (!me) {
      const legacyServiceClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const legacyMe = await resolveLegacyDriver(legacyServiceClient, payload?.legacy_token);
      if (legacyMe) {
        me = legacyMe;
        supabase = legacyServiceClient;
      }
    }

    if (!me) return json({ ok: false, error: 'Auth richiesto' }, 401);

    const action = String(payload?.action || 'subscribe');
    if (action === 'unsubscribe') return handleUnsubscribe(supabase, me, payload);
    return handleSubscribe(supabase, me, payload);
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});

async function handleSubscribe(supabase: any, me: any, payload: any) {
  const endpoint = String(payload?.endpoint || '').trim();
  const p256dh = payload?.keys?.p256dh;
  const authKey = payload?.keys?.auth;
  if (!endpoint || !p256dh || !authKey) {
    return json({ ok: false, error: 'endpoint e keys.p256dh/keys.auth sono obbligatori' }, 400);
  }

  const { data: existing } = await supabase
    .from('push_subscriptions')
    .select('id')
    .eq('driver_id', me.id)
    .eq('endpoint', endpoint)
    .maybeSingle();
  if (existing) return json({ ok: true, data: { subscribed: true, already_existed: true } });

  const { error } = await supabase
    .from('push_subscriptions')
    .insert({
      team_id: me.team_id,
      driver_id: me.id,
      endpoint,
      p256dh,
      auth_key: authKey,
      user_agent: String(payload?.user_agent || '') || null,
    });
  if (error) return json({ ok: false, error: error.message }, 400);

  return json({ ok: true, data: { subscribed: true, already_existed: false } });
}

async function handleUnsubscribe(supabase: any, me: any, payload: any) {
  const endpoint = String(payload?.endpoint || '').trim();
  if (!endpoint) return json({ ok: false, error: 'endpoint obbligatorio' }, 400);

  const { data, error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('driver_id', me.id)
    .eq('endpoint', endpoint)
    .select();
  if (error) return json({ ok: false, error: error.message }, 400);

  if (!data || data.length === 0) {
    return json({ ok: true, data: { unsubscribed: true, note: 'nessuna subscription trovata (già rimossa?)' } });
  }
  return json({ ok: true, data: { unsubscribed: true } });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
