import { useSessionRsvp, useSetSessionRsvp } from '../../hooks/useSessionRsvp';
import EntityRSVP from './EntityRSVP';

/**
 * SessionRSVP — conferma presenza per una sessione team (allenamento,
 * qualifica, riunione). ADR-Team-Scheduler Fase 2. Gemello di RaceRSVP,
 * stessa UI/CSS via EntityRSVP — nessuna duplicazione di markup/stile.
 *
 * @param {string}   sessionId
 * @param {string}   currentDriverId - null se non loggato
 * @param {Array}    drivers         - roster per join id→nome
 * @param {Function} getDriverName   - (driverId, drivers) => string
 */
export default function SessionRSVP({ sessionId, currentDriverId, drivers, getDriverName }) {
  const { data: rsvps = [], isLoading } = useSessionRsvp(sessionId);
  const setRsvp = useSetSessionRsvp();

  return (
    <EntityRSVP
      title="Presenza sessione"
      rsvps={rsvps}
      isLoading={isLoading}
      currentDriverId={currentDriverId}
      drivers={drivers}
      getDriverName={getDriverName}
      isPending={setRsvp.isPending}
      error={setRsvp.isError ? setRsvp.error : null}
      onSetStatus={(status, note) => setRsvp.mutate({ session_id: sessionId, status, note })}
    />
  );
}
