import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api/client';
import { LABELS } from '../utils/constants';
import './Login.css';
import Logo from '../components/shared/Logo';

export default function Login() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [discordBusy, setDiscordBusy] = useState(false);
  const { login, isAuthenticated } = useAuth();
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

  // Login legacy access_code
  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const res = await login(code);
    setBusy(false);
    if (!res.ok) {
      setError(res.error || LABELS.auth_error);
      return;
    }
    // navigate gestito da useEffect
  }

  // Login Discord OAuth (Wave 10)
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

        {/* CTA primario: Discord OAuth (Wave 10) */}
        <button
          className="login-submit login-discord"
          type="button"
          onClick={onDiscordClick}
          disabled={discordBusy || busy}
        >
          {discordBusy ? LABELS.auth_discord_loading : LABELS.auth_discord_button}
        </button>

        <div className="login-separator">
          <span>{LABELS.auth_or_separator}</span>
        </div>

        {/* Form legacy access_code (fallback admin/staff) */}
        <form className="login-form-legacy" onSubmit={onSubmit}>
          <p className="login-sub">{LABELS.auth_subtitle}</p>
          <input
            className="login-input"
            type="text"
            placeholder={LABELS.auth_code_placeholder}
            value={code}
            onChange={e => setCode(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />

          {error && <div className="login-error">{error}</div>}

          <button
            className="login-submit"
            type="submit"
            disabled={busy || discordBusy || !code.trim()}
          >
            {busy ? '...' : LABELS.auth_submit}
          </button>
        </form>

        <div className="login-hint">
          <span>Usa Discord oppure il codice di accesso fornito dallo staff.</span>
        </div>
      </div>
    </div>
  );
}