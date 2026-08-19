import { useCallback, useState } from 'react';

const STORAGE_KEY = 'vsd_show_ex_drivers';

/**
 * Toggle admin-only per rivelare i tempi/record degli ex piloti VSD in
 * Best Laps e Muro dei Record — per decisione esplicita (i piloti
 * attuali devono confrontarsi tra compagni, non con chi ha lasciato il
 * team), questi confronti nascondono gli ex-VSD di default. I dati
 * NON vengono mai cancellati, solo esclusi dalla vista finché l'admin
 * non li riattiva da qui.
 *
 * Persistito in localStorage così il toggle resta coerente tra
 * /laps, /laps/:sim/:track/:category e /records senza doverlo
 * riattivare pagina per pagina.
 */
export function useShowExDrivers() {
  const [show, setShow] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const toggle = useCallback(() => {
    setShow(prev => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        // localStorage non disponibile — il toggle resta comunque
        // funzionante per la sessione corrente, solo non persiste.
      }
      return next;
    });
  }, []);

  return [show, toggle];
}
