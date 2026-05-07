import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LABELS } from '../utils/constants';
import './Login.css';
import Logo from '../components/shared/Logo';

export default function Login() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect post-login: se l'utente è già autenticato (es. ricarica la pagina
  // di login mentre ha già un token valido in localStorage), lo mandiamo
  // alla destinazione richiesta o alla home.
  // Lo facciamo in useEffect perché navigate() durante il render produce
  // warning React (setState in render).
  useEffect(() => {
    if (isAuthenticated) {
      const dest = location.state?.from?.pathname || '/';
      navigate(dest, { replace: true });
    }
  }, [isAuthenticated, location, navigate]);

  // Mentre il redirect è in volo, evitiamo di flashare la form di login
  if (isAuthenticated) return null;

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
    // Niente navigate qui: lo gestisce l'useEffect quando isAuthenticated cambia
  }

  return (
    <div className="login-screen">
      <form className="login-card racing-accent" onSubmit={onSubmit}>
        <div className="login-logo">
          <Logo size={160} glow />
        </div>
        <h1 className="login-title">{LABELS.auth_title}</h1>
        <p className="login-sub">{LABELS.auth_subtitle}</p>

        <input
          className="login-input"
          type="text"
          placeholder={LABELS.auth_code_placeholder}
          value={code}
          onChange={e => setCode(e.target.value)}
          autoFocus
          autoComplete="off"
          spellCheck={false}
        />

        {error && <div className="login-error">{error}</div>}

        <button className="login-submit" type="submit" disabled={busy || !code.trim()}>
          {busy ? '...' : LABELS.auth_submit}
        </button>

        <div className="login-hint">
          <span>Inserisci il codice di accesso fornito dallo staff.</span>
        </div>
      </form>
    </div>
  );
}