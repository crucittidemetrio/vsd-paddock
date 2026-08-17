import { usePushSubscription } from '../../hooks/usePushSubscription';
import './PushNotificationsPanel.css';

/**
 * PushNotificationsPanel — attiva/disattiva le notifiche push del
 * browser corrente (reminder gara, ecc.). Va sul profilo del pilota
 * loggato, accanto al Companion Token — stesso posto, stesso stile,
 * concetto diverso: qui non c'è nulla da copiare, solo un
 * attiva/disattiva legato al browser/device che si sta usando ORA
 * (per questo si chiama "questo dispositivo": su un altro telefono va
 * ripetuto).
 */
export default function PushNotificationsPanel() {
  const { supported, permission, subscribed, loading, error, subscribe, unsubscribe } =
    usePushSubscription();

  if (!supported) {
    return (
      <div className="pnp-section">
        <div className="pnp-header">
          <h2 className="pnp-title">Notifiche Push</h2>
        </div>
        <p className="pnp-desc">
          Questo browser non supporta le notifiche push (capita su alcune versioni di Safari
          iOS più vecchie, o se il sito non è stato installato come app — vedi la guida
          all'installazione). Prova da Chrome/Edge, o installa l'app da Safari con "Aggiungi a
          Home".
        </p>
      </div>
    );
  }

  return (
    <div className="pnp-section">
      <div className="pnp-header">
        <h2 className="pnp-title">Notifiche Push</h2>
      </div>
      <p className="pnp-desc">
        Ricevi un avviso su questo dispositivo quando una gara sta per iniziare. Attivazione
        legata al browser/device corrente — su un altro telefono o computer va ripetuta.
      </p>

      {loading && <p className="pnp-loading">Controllo stato…</p>}

      {!loading && (
        <>
          {permission === 'denied' && (
            <p className="pnp-denied">
              Le notifiche sono bloccate nelle impostazioni del browser per questo sito —
              vanno riabilitate da lì (icona lucchetto nella barra indirizzi), non da questo
              pulsante.
            </p>
          )}

          {!subscribed && permission !== 'denied' && (
            <button type="button" className="pnp-btn pnp-btn-on" onClick={subscribe}>
              🔔 Attiva notifiche su questo dispositivo
            </button>
          )}

          {subscribed && (
            <div className="pnp-active-row">
              <span className="pnp-active-badge">✓ Attive su questo dispositivo</span>
              <button type="button" className="pnp-btn pnp-btn-off" onClick={unsubscribe}>
                Disattiva
              </button>
            </div>
          )}

          {error && <div className="pnp-error">{error}</div>}
        </>
      )}
    </div>
  );
}
