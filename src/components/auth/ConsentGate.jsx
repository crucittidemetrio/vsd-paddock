import { useAuth } from '../../hooks/useAuth';
import { useConsentStatus } from '../../hooks/useConsent';
import ConsentForm from '../../pages/ConsentForm';

/**
 * Blocca l'accesso al contenuto (non alla sidebar/topbar, così resta
 * possibile fare logout) finché un pilota reale (pilot_vsd/staff/admin)
 * non ha registrato le proprie scelte per la versione corrente del
 * documento di consenso. Guest e anonimi non sono mai bloccati: non
 * hanno un driver_id, quindi non c'è nulla da pubblicare a loro nome.
 *
 * Fail-open sugli stati di caricamento/errore: se lo stato del
 * consenso non si riesce a determinare (rete lenta, endpoint giù), non
 * blocchiamo l'app — meglio un pilota che passa un giorno senza
 * ri-accettare che un'app inutilizzabile per un problema di rete.
 */
export default function ConsentGate({ children }) {
  const { loading, isVsdPilot } = useAuth();
  const statusQuery = useConsentStatus();

  if (loading || !isVsdPilot) return children;
  if (statusQuery.isLoading || statusQuery.isError) return children;
  if (statusQuery.data?.has_current) return children;

  return (
    <div style={{ maxWidth: 780, margin: '0 auto' }}>
      <ConsentForm embedded />
    </div>
  );
}
