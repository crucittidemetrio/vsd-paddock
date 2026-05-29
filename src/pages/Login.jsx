import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api/client';
import { LABELS } from '../utils/constants';
import './Login.css';
import Logo from '../components/shared/Logo';

export default function Login() {
  const [error, setError] = useState('');
  const [discordBusy, setDiscordBusy] = useState(false);
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect post-login: se già autenticato (es. ricarica pagina con token valido)
  useEffect(() => {
    if (isAuthenticated) {
      const dest = location.state?.from?.pathname || '/';
      navigate(dest, { replace: true });
    }
  }, [isAuthenticated, location, navigate]);

  // Evita flash del form durante il redirect
  if (isAuthenticated) return null;

  // Login Discord OAuth (Wave 10)
  // Wave 10.X: access_code legacy rimosso, Discord OAuth è l'unico metodo di login.
  async function onDiscordClick() {
    setError('');
    setDiscordBusy(true);
    try {
      const { url } = await api.auth.discordStart();
      // Hard redirect a Discord (no client-side routing)
      window.location.href = url;
    } catch (err) {
      console.error('[Login] discordStart failed', err);
      setError(err.message || 'Impossibile avviare il login Discord');
      setDiscordBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card racing-accent">
        <div className="login-logo">
          <Logo size={160} glow />
        </div>
        <h1 className="login-title">{LABELS.auth_title}</h1>

        {/* Unico metodo di login: Discord OAuth (Wave 10.X) */}
        <button
          className="login-submit login-discord"
          type="button"
          onClick={onDiscordClick}
          disabled={discordBusy}
        >
          {discordBusy ? LABELS.auth_discord_loading : LABELS.auth_discord_button}
        </button>

        {error && <div className="login-error">{error}</div>}

        <div className="login-hint">
          <span>Accedi con il tuo account Discord membro del server VSD.</span>
        </div>
      </div>
    </div>
  );
}
