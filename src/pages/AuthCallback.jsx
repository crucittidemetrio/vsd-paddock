import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api/client';
import { LABELS } from '../utils/constants';
import './Login.css';

/**
 * Wave 10.2 — Discord OAuth callback handler.
 *
 * Discord redirige qui dopo il consenso utente:
 *   /auth/callback?code=XXX&state=YYY
 *
 * Flow:
 * 1. Legge code+state dalla URL
 * 2. POST auth.discordCallback al backend Apps Script
 * 3. Backend verifica state CSRF, scambia code, classifica → ritorna {token, tier, sims, driver_id}
 * 4. Salva sessione in AuthContext + localStorage via setDiscordSession()
 * 5. Redirige a / (Mission Control, oppure Guest Home dopo Wave 10.5)
 */

// Mapping codici errore backend → messaggi utente
const ERROR_MESSAGES = {
  missing_code: 'Discord non ha fornito il codice di autorizzazione.',
  missing_state: 'Stato OAuth mancante. Riprova dal login.',
  invalid_state: 'Sessione OAuth scaduta o non valida. Riprova dal login.',
  server_misconfigured: 'Configurazione server incompleta. Contatta lo staff.',
  discord_token_exchange: 'Discord ha rifiutato lo scambio token. Riprova.',
  discord_no_access_token: 'Risposta Discord incompleta. Riprova.',
  discord_unreachable: 'Discord non raggiungibile. Riprova tra poco.',
  discord_user_fetch: 'Impossibile leggere i tuoi dati Discord.',
};

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setDiscordSession, isAuthenticated } = useAuth();

  // Letti in modo sincrono al render (non in un useEffect): il caso
  // "parametri mancanti" viene deciso subito nel valore iniziale di
  // error/processing, evitando un setState sincrono dentro l'effect
  // (react-hooks/set-state-in-effect) per un ramo che non ha comunque
  // nulla di asincrono da aspettare.
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const missingParams = !code || !state;

  const [error, setError] = useState(missingParams ? 'Parametri OAuth mancanti nell\'URL.' : null);
  const [processing, setProcessing] = useState(!missingParams);

  // Guard contro double-execution (React StrictMode esegue useEffect 2 volte in dev)
  const calledRef = useRef(false);

  useEffect(() => {
    if (missingParams) return; // già gestito sopra, nessuna chiamata da fare
    if (calledRef.current) return;
    calledRef.current = true;

    api.auth.discordCallback(code, state)
      .then(data => {
        // data = { token, tier, sims, driver_id }
        setDiscordSession(data);
        navigate('/', { replace: true });
      })
      .catch(err => {
        console.error('[AuthCallback] discordCallback failed', err);
        const userMessage = ERROR_MESSAGES[err.message] || err.message || LABELS.auth_callback_error;
        setError(userMessage);
        setProcessing(false);
      });
  }, [missingParams, code, state, setDiscordSession, navigate]);

  // Edge case: già loggato (es. browser back button) → redirect
  useEffect(() => {
    if (isAuthenticated && !processing && !error) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, processing, error, navigate]);

  // ─── UI: processing ───
  if (processing) {
    return (
      <div className="login-screen">
        <div className="login-card racing-accent">
          <h1 className="login-title">{LABELS.auth_callback_processing}</h1>
          <p className="login-sub">Verifica credenziali Discord in corso...</p>
        </div>
      </div>
    );
  }

  // ─── UI: errore ───
  return (
    <div className="login-screen">
      <div className="login-card racing-accent">
        <h1 className="login-title">{LABELS.auth_callback_error}</h1>
        <p className="login-sub login-error">{error}</p>
        <button
          className="login-submit"
          type="button"
          onClick={() => navigate('/login', { replace: true })}
        >
          {LABELS.auth_callback_retry}
        </button>
      </div>
    </div>
  );
}