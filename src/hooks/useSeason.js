import { useMemo } from 'react';
import { useChampionships } from './useChampionships';
import { useRaces } from './useRaces';

/**
 * #466 — Stagioni dei format ricorrenti (UE144, Clash of Classes).
 *
 * Ogni stagione è un campionato distinto, legato agli altri dalla colonna
 * `championships.series` (es. 'ue144', 'clash-of-classes'). Le pagine
 * pubbliche non hanno più l'ID di una stagione scritto nel codice: lo
 * ricavano da qui.
 *
 * Stagione selezionata = quella richiesta (es. ?season=ID), altrimenti la
 * prima con status 'active', altrimenti la più recente per start_date.
 * Il calendario è l'elenco delle gare del campionato in ordine
 * cronologico: il numero di round varia liberamente da stagione a stagione.
 *
 * @param {string} series  'ue144' | 'clash-of-classes'
 * @param {string} [requestedId]  championship id esplicito (selettore stagione)
 */
export function useSeason(series, requestedId = '') {
  const champsQuery = useChampionships();
  const racesQuery = useRaces();

  return useMemo(() => {
    const all = Array.isArray(champsQuery.data) ? champsQuery.data : [];
    const seasons = all
      .filter(c => c.series === series && c.status !== 'cancelled')
      .sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')));

    const championship = (requestedId && seasons.find(c => c.id === requestedId))
      || seasons.find(c => c.status === 'active')
      || seasons[0]
      || null;

    const allRaces = Array.isArray(racesQuery.data) ? racesQuery.data : [];
    const races = championship
      ? allRaces
        .filter(r => r.championship_id === championship.id)
        .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
      : [];

    return {
      isLoading: champsQuery.isLoading || racesQuery.isLoading,
      seasons,
      championship,
      races,
      roundsTotal: races.length,
    };
  }, [champsQuery.data, champsQuery.isLoading, racesQuery.data, racesQuery.isLoading, series, requestedId]);
}

/** Nome circuito dalla gara: toglie il prefisso "Round N" se presente. */
export function raceCircuitName(race) {
  const name = String(race?.race_name || '').trim();
  return name.replace(/^round\s*\d+\s*[-—:·]?\s*/i, '') || name;
}

/** details è jsonb: gestisce anche una stringa JSON o null. */
export function raceDetails(race) {
  const d = race?.details;
  if (!d) return {};
  if (typeof d === 'string') {
    try { return JSON.parse(d) || {}; } catch { return {}; }
  }
  return d;
}

export function formatRaceDate(iso, opts) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('it-IT', opts || {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}
