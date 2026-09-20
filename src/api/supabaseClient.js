import { createClient } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════
// VSD-Paddock — Client Supabase condiviso (#264/#327)
// ═══════════════════════════════════════════════════════════
// Singolo client supabase-js per tutta l'app, usato sia dal nuovo
// modulo auth (supabaseAuth.js) sia dal futuro transport layer
// (supabaseApi.js, #328). A differenza delle pagine di preview
// (AdminRosterPreview/AdminCalendarPreview, #177/#178), che facevano
// fetch manuale + parsing dell'hash OAuth a mano perché il pacchetto
// @supabase/supabase-js non era ancora una dipendenza del progetto,
// qui si usa l'SDK ufficiale: gestisce da solo refresh token,
// persistenza sessione, PKCE flow per l'OAuth Discord e (in #339) il
// pattern accessToken per Realtime già validato in #263.
//
// NON ancora collegato a nessuna pagina reale del sito (client.js
// continua a usare realApi.js/Apps Script) — costruito "spento" per
// poi essere attivato un dominio alla volta, come da approccio
// staged concordato con l'utente per #264.
//
// Config: stesse env var già in uso nelle pagine di preview
// (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY — quest'ultima è la
// chiave anon/legacy JWT, non la nuova sb_publishable_..., per lo
// stesso motivo documentato in #263: la chiave pubblicabile nuova
// non funziona come apikey per i canali Realtime privati su questo
// progetto).

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// Esportata per supabaseApi.js (#329): le Edge Function di questo
// progetto sono deployate con verify_jwt=true (default piattaforma),
// quindi rifiutano a livello di gateway — PRIMA che il codice della
// funzione giri — qualsiasi richiesta senza un JWT valido in
// Authorization. La sola anon key È comunque un JWT valido (firmato
// col JWT secret del progetto), quindi va sempre inviata come
// fallback quando non c'è una sessione utente reale — altrimenti
// anche le azioni pensate per essere chiamabili anonimamente
// (roster.list/get, showcase.*, ...) verrebbero rifiutate dal
// gateway prima ancora di raggiungere la logica team_slug lato
// funzione.
export const supabaseAnonKey = SUPABASE_ANON_KEY;

let _client = null;

/**
 * Ritorna il client supabase-js condiviso (singleton, creato al primo
 * uso). Ritorna null se le env var non sono configurate, cosa che
 * capita ancora in ambienti dove il progetto Supabase parallelo non è
 * stato configurato — i chiamanti devono gestire questo caso.
 */
export function getSupabaseClient() {
  if (!supabaseConfigured) return null;
  if (_client) return _client;
  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      // Persistenza sessione reale su localStorage (a differenza del
      // sessionStorage usato nelle pagine di preview, pensate come
      // sessioni di test usa-e-getta): un pilota che fa login sul
      // sito reale deve restare loggato tra un tab e l'altro/riavvii
      // browser, esattamente come oggi col token Apps Script.
      persistSession: true,
      autoRefreshToken: true,
      // Discord OAuth via signInWithOAuth usa PKCE per default nelle
      // versioni recenti di supabase-js: il redirect torna con
      // ?code=... invece di #access_token=... nell'hash (quest'ultimo
      // era il formato "implicit" letto a mano nelle pagine di
      // preview). detectSessionInUrl=true (default) fa sì che il
      // client scambi automaticamente il code per una sessione al
      // primo getSession()/onAuthStateChange dopo il redirect, senza
      // bisogno di parsing manuale.
      detectSessionInUrl: true,
    },
    // accessToken (#339): pattern validato in #263 per i canali Realtime
    // privati (pitwall:{team_id}). Un client creato con la sola anon
    // key e poi corretto a parte via realtime.setAuth(token) si
    // disconnette pochi istanti dopo la subscribe — il client tenta un
    // resync interno del token realtime leggendo la sessione dal
    // proprio GoTrueClient, sovrascrivendo quello iniettato a mano.
    // Passare questa funzione a createClient è invece l'API supportata
    // da Supabase per questo caso: viene interrogata ad ogni bisogno
    // (incluso il refresh token realtime), sempre in sync con la
    // sessione vera del client stesso. Riferisce `_client` (assegnato
    // subito sotto, prima che qualunque subscribe reale possa
    // scattare) invece di `supabase`, che qui non esiste ancora.
    accessToken: async () => {
      if (!_client) return null;
      const { data } = await _client.auth.getSession();
      return data.session?.access_token ?? SUPABASE_ANON_KEY;
    },
  });
  return _client;
}
