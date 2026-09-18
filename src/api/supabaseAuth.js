import { getSupabaseClient } from './supabaseClient';

// ═══════════════════════════════════════════════════════════
// VSD-Paddock — Auth reale Discord OAuth via Supabase (#264/#327)
// ═══════════════════════════════════════════════════════════
// Sostituisce, per i domini via via cutover, il flusso
// auth.discordStart/discordCallback custom verso Apps Script
// (AuthCallback.jsx → api.auth.discordCallback → setDiscordSession
// in AuthContext.jsx) con l'OAuth Discord nativo di Supabase Auth
// (app Discord dedicata già creata in #244, RIUSATA qui — stessa app
// usata dalle pagine di preview #177/#178, nessuna nuova app da
// creare).
//
// Non è ancora collegato ad AuthContext.jsx/AuthCallback.jsx reali:
// è un modulo a sé, validato in isolamento (vedi AdminAuthPreview,
// route /admin/auth-preview) prima che #329 lo colleghi davvero al
// resto del sito.
//
// ─── Mappatura tier (deviazione documentata) ───
// Il vecchio sistema Apps Script classificava ogni sessione in 5 tier
// (TIER_ORDER in utils/constants.js): anonymous → guest → pilot_vsd →
// staff → admin. Lo schema Supabase (001_foundation.sql) ha invece un
// solo campo drivers.role a 3 valori (driver | staff | admin), perché
// multi-tenant: non esiste più un concetto fisso "VSD" da distinguere
// dagli altri. La mappatura usata qui, fedele all'intento originale:
//   nessuna sessione                        → 'anonymous'
//   sessione Discord ma NESSUNA riga drivers → 'guest'   (community
//     non tesserata a nessun team — stesso significato di 'guest' nel
//     sistema originale, dove era chiunque non fosse pilota VSD)
//   riga drivers trovata, role='driver'      → 'pilot_vsd' (pilota
//     del proprio team — il nome storico 'pilot_vsd' resta per non
//     rompere i controlli hasAtLeast('pilot_vsd') sparsi nel frontend,
//     anche se ora è multi-team)
//   role='staff'                             → 'staff'
//   role='admin'                             → 'admin'

/**
 * Avvia il login Discord OAuth via Supabase Auth. Redirect immediato
 * al provider — non c'è nulla da attendere qui, il browser lascia la
 * pagina.
 * @param {string} [redirectTo] URL di ritorno dopo il consenso Discord.
 *   Default: origin + pathname corrente (stesso pattern delle pagine
 *   di preview).
 */
export async function signInWithDiscord(redirectTo) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase non configurato (VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY mancanti)');
  const finalRedirect = redirectTo || (window.location.origin + window.location.pathname);
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'discord',
    options: { redirectTo: finalRedirect },
  });
  if (error) throw error;
}

/** Termina la sessione Supabase corrente (non tocca la sessione Apps Script legacy). */
export async function signOutSupabase() {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await supabase.auth.signOut();
}

/** Ritorna la sessione Supabase corrente (o null), inclusi eventuali code PKCE nell'URL da scambiare. */
export async function getSupabaseSession() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.warn('[supabaseAuth] getSession failed', error);
    return null;
  }
  return data.session;
}

/**
 * Sottoscrive i cambi di stato auth (login/logout/refresh token).
 * @param {(session: object|null) => void} callback
 * @returns {() => void} funzione di unsubscribe
 */
export function onSupabaseAuthStateChange(callback) {
  const supabase = getSupabaseClient();
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return () => data.subscription.unsubscribe();
}

/**
 * Risolve la riga `drivers` collegata all'utente Supabase autenticato
 * e ne deriva il tier. Lettura diretta via client autenticato (non
 * un'Edge Function dedicata): la RLS "drivers: self o staff/admin
 * leggono il dettaglio privato" (002_roster_policies.sql) consente
 * già a un utente di leggere la propria riga via auth_user_id =
 * auth.uid(), quindi non serve inventare un endpoint solo per questo.
 * Nessuna riga trovata → tier 'guest' (Discord loggato, nessun team).
 *
 * @param {object} session sessione Supabase (da getSupabaseSession)
 * @returns {Promise<{ driver: object|null, tier: string }>}
 */
export async function resolveDriverAndTier(session) {
  if (!session?.user?.id) return { driver: null, tier: 'anonymous' };
  const supabase = getSupabaseClient();
  if (!supabase) return { driver: null, tier: 'anonymous' };

  const { data, error } = await supabase
    .from('drivers')
    .select('*')
    .eq('auth_user_id', session.user.id)
    .is('removed_at', null)
    .maybeSingle();

  if (error) {
    console.warn('[supabaseAuth] resolveDriverAndTier failed', error);
    return { driver: null, tier: 'guest' };
  }
  if (!data) return { driver: null, tier: 'guest' };

  const tierByRole = { driver: 'pilot_vsd', staff: 'staff', admin: 'admin' };
  const tier = tierByRole[data.role] || 'pilot_vsd';
  return { driver: data, tier };
}

/**
 * Estrae dati profilo Discord (avatar/username) dai metadata utente
 * Supabase — equivalente a discord_avatar_url/discord_username che
 * il vecchio auth.discordCallback restituiva esplicitamente. Supabase
 * li popola da soli in user_metadata durante l'OAuth (provider
 * Discord), niente da richiedere a parte.
 */
export function extractDiscordProfile(session) {
  const meta = session?.user?.user_metadata || {};
  return {
    discordUsername: meta.full_name || meta.name || meta.custom_claims?.global_name || null,
    discordAvatarUrl: meta.avatar_url || null,
  };
}
