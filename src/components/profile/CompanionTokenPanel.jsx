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

  // config.json pronto per il plugin SimHub: il pilota lo salva in
  // Documenti\VSD Paddock\ sovrascrivendo quello vuoto creato dal plugin.
  function handleDownloadConfig() {
    if (!revealed) return;
    const body = JSON.stringify({ device_token: revealed.token, auto_submit_sims: ['ACE'] }, null, 2) + '\n';
    const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'config.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  const expiresLabel = revealed?.expires_at
    ? new Date(revealed.expires_at).toLocaleDateString('it-IT', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      })
    : null;

  return (
    <div className="ctp-section">
      <div className="ctp-header">
        <h2 className="ctp-title">Token dispositivo — Plugin SimHub e Companion</h2>
      </div>
      <p className="ctp-desc">
        Serve al plugin SimHub VSD per inviare in automatico i tuoi best lap
        (Assetto Corsa EVO e altri sim) e al companion carburante/energia di
        Le Mans Ultimate. Incollalo in <code>Documenti\VSD Paddock\config.json</code>{' '}
        alla voce <code>device_token</code>, poi riavvia SimHub. Valido 180 giorni,
        rigenerabile in qualsiasi momento. Non condividerlo: chi lo ha può inviare
        giri e consumi a tuo nome.
      </p>

      {!revealed && (
        <button
          type="button"
          className="ctp-generate-btn"
          onClick={handleGenerate}
          disabled={isPending}
        >
          {isPending ? 'Generazione…' : '🔑 Genera token'}
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
            <button type="button" className="ctp-copy-btn" onClick={handleDownloadConfig}>
              ⬇ Scarica config.json
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
            Scade il {expiresLabel}. Plugin SimHub: salva <code>config.json</code> in{' '}
            <code>Documenti\VSD Paddock\</code> e riavvia SimHub. Companion LMU: incollalo
            nel <code>config.json</code> del companion.
          </div>
        </div>
      )}
    </div>
  );
}
