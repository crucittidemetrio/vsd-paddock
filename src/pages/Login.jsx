import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
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

  if (isAuthenticated) {
    const dest = location.state?.from?.pathname || '/';
    navigate(dest, { replace: true });
    return null;
  }

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
    const dest = location.state?.from?.pathname || '/';
    navigate(dest, { replace: true });
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
          <span>Demo:</span>
          <code>STAFF</code>
          <span>→ vista staff ·</span>
          <code>qualsiasi codice</code>
          <span>→ pilota</span>
        </div>
      </form>
    </div>
  );
}