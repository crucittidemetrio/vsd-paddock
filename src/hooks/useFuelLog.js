import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * useFuelSummary — consumo medio mobile e autonomia stimata per una
 * vettura su una gara, calcolati backend-side da fuel.summary sui
 * campioni inviati dal companion app (companion/fuel_bridge.py).
 *
 * Polling breve (15s): a differenza del resto dei dati admin, questo
 * è pensato per essere guardato DURANTE la gara mentre i campioni
 * arrivano giro dopo giro.
 *
 * @param {string} raceId
 * @param {string} carNumber
 * @param {number|null} [targetLaps] - se valorizzato (inserito a mano
 *   dal pilota, nessun automatismo legato allo stint), il backend
 *   calcola anche il rabbocco necessario per coprire quel numero di
 *   giri extra (fuel.needed_for_target_l / energy.needed_for_target_pct)
 */
export function useFuelSummary(raceId, carNumber, targetLaps) {
  return useQuery({
    queryKey: ['fuel', 'summary', raceId, carNumber, targetLaps || null],
    queryFn: () => api.fuel.summary(raceId, carNumber, targetLaps ? { target_laps: targetLaps } : {}),
    enabled: !!raceId && !!carNumber,
    refetchInterval: 15 * 1000,
    staleTime: 10 * 1000,
  });
}

/**
 * useMySession — risolve la sessione carburante personale del pilota
 * loggato SENZA nessun ID digitato a mano: il backend riconosce chi sei
 * dal token (fuel.mySession, vedi FuelLog.js) e restituisce l'ultimo
 * race_id/car_number auto-generato dal companion in modalità sessione
 * personale (companion/fuel_bridge.py, config.json con race_id vuoto).
 *
 * Usata SOLO da FuelEnergy.jsx (pagina personale) — AdminRaceStints
 * resta su race_id di calendario + car_number esplicito, invariato.
 *
 * Stesso ritmo di polling di useFuelSummary: pensata per essere
 * guardata mentre la sessione è in corso, non solo in pianificazione.
 */
export function useMySession() {
  return useQuery({
    queryKey: ['fuel', 'mySession'],
    queryFn: () => api.fuel.mySession(),
    refetchInterval: 15 * 1000,
    staleTime: 10 * 1000,
  });
}

/**
 * useFuelStints — stint (sequenza di giri tra due soste ai box) calcolati
 * backend-side da fuel.stints, con l'hotstint (miglior passo medio)
 * evidenziato — vedi FuelLog.js/handleFuelStints per la logica di
 * raggruppamento e i campi restituiti per ogni stint.
 *
 * Stesso ritmo di polling di useFuelSummary: gara in corso, i giri
 * (e quindi gli stint) arrivano man mano che il companion li invia.
 * Richiede companion aggiornato (lap_time_s/in_pits/yellow_flag/ecc. —
 * vedi companion/fuel_bridge.py): con un companion vecchio la risposta
 * arriva comunque ma con stint senza best_lap_s/avg_lap_s valorizzati.
 */
export function useFuelStints(raceId, carNumber) {
  return useQuery({
    queryKey: ['fuel', 'stints', raceId, carNumber],
    queryFn: () => api.fuel.stints(raceId, carNumber),
    enabled: !!raceId && !!carNumber,
    refetchInterval: 15 * 1000,
    staleTime: 10 * 1000,
  });
}
