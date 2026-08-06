import { useState } from 'react';
import { useCreateCompanionToken } from '../../hooks/useDevices';
import './CompanionTokenPanel.css';

/**
 * CompanionTokenPanel — genera il token per il companion app
 * fuel/energy (script locale che legge la shared memory di Le Mans
 * Ultimate e manda i consumi reali al pannello stint). Visibile SOLO
 * sul proprio profilo (gate fatto dal chiamante, DriverProfile.jsx) —
 * un pilota genera solo il proprio token, mai quello di un altro.
 */
export default function CompanionTokenPanel() {
  const [revealed, setRevealed] = useState(null); // { token, expires_at } | null
  const [copied, setCopied] = useState(false);
  const { mutate: createToken, isPending, error } = useCreateCompanionToken();

  function handleGenerate() {
    setCopied(false);
    createToken(undefined, {
      onSuccess: (data) => setRevealed(data),
    });
  }

  function handleCopy() {
    if (!revealed) return;
    navigator.clipboard.writeText(revealed.token).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const expiresLabel = revealed?.expires_at
    ? new Date(revealed.expires_at).toLocaleDateString('it-IT', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      })
    : null;

  return (
    <div className="ctp-section">
      <div className="ctp-header">
        <h2 className="ctp-title">Companion App — Carburante/Energia</h2>
      </div>
      <p className="ctp-desc">
        Token per lo script locale che legge carburante ed energia virtuale
        da Le Mans Ultimate durante la gara e alimenta il pannello di
        previsione rabbocchi. Valido 180 giorni, rigenerabile in qualsiasi
        momento. Non condividerlo: chi lo ha può inviare campioni consumo a
        tuo nome.
      </p>

      {!revealed && (
        <button
          type="button"
          className="ctp-generate-btn"
          onClick={handleGenerate}
          disabled={isPending}
        >
          {isPending ? 'Generazione…' : '🔑 Genera token companion'}
        </button>
      )}

      {error && (
        <div className="ctp-error">Errore: {error.message}</div>
      )}

      {revealed && (
        <div className="ctp-token-box">
          <div className="ctp-token-value">{revealed.token}</div>
          <div className="ctp-token-actions">
            <button type="button" className="ctp-copy-btn" onClick={handleCopy}>
              {copied ? '✓ Copiato' : 'Copia'}
            </button>
            <button
              type="button"
              className="ctp-regen-btn"
              onClick={handleGenerate}
              disabled={isPending}
            >
              Rigenera
            </button>
          </div>
          <div className="ctp-token-meta">
            Scade il {expiresLabel} — incollalo in <code>config.json</code>{' '}
            nella cartella <code>companion/</code> del repo (vedi{' '}
            <code>companion/README.md</code> per il setup completo).
          </div>
        </div>
      )}
    </div>
  );
}
