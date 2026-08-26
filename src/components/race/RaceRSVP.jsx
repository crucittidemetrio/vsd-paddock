import { useRaceRSVP, useSetRSVP } from '../../hooks/useRaceRSVP';
import EntityRSVP from '../shared/EntityRSVP';

/**
 * RaceRSVP — conferma presenza per una gara in programma. Ogni pilota
 * loggato imposta la PROPRIA risposta (confermato/forse/assente) e vede
 * il quadro aggregato di chi ha già risposto — utile per lo Stint
 * Planner e per capire chi manca senza doverlo scoprire su Discord
 * all'ultimo momento.
 *
 * Thin wrapper attorno a EntityRSVP (UI/CSS condivisa con SessionRSVP,
 * introdotta in ADR-Team-Scheduler Fase 2 — stessa UX per "ci sarò alla
 * gara" e "ci sarò all'allenamento" invece di due componenti quasi
 * identici). Comportamento invariato rispetto a prima dell'estrazione.
 *
 * @param {string}   raceId
 * @param {string}   currentDriverId - null se non loggato
 * @param {Array}    drivers         - roster per join id→nome
 * @param {Function} getDriverName   - (driverId, drivers) => string
 */
export default function RaceRSVP({ raceId, currentDriverId, drivers, getDriverName }) {
  const { data: rsvps = [], isLoading } = useRaceRSVP(raceId);
  const setRsvp = useSetRSVP();

  return (
    <EntityRSVP
      title="Conferma presenza"
      rsvps={rsvps}
      isLoading={isLoading}
      currentDriverId={currentDriverId}
      drivers={drivers}
      getDriverName={getDriverName}
      isPending={setRsvp.isPending}
      error={setRsvp.isError ? setRsvp.error : null}
      onSetStatus={(status, note) => setRsvp.mutate({ race_id: raceId, status, note })}
    />
  );
}
