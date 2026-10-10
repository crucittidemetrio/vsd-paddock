// Posizioni in classifica round per round, calcolate dai punti cumulativi
// di standings-progression (tutto lo schieramento della classe).
// Usato per le frecce ▲▼ nella tabella e per il grafico "Posizioni".

export function seriesKey(s) {
  return s?.driver_id || s?.display_name || s?.driver_name_external || '';
}

/**
 * @returns {{ completed: number[], positions: Record<string, number[]> }}
 *   completed: indici dei round già disputati (almeno un punto assegnato)
 *   positions[key][j]: posizione dopo il j-esimo round disputato
 */
export function computeRoundPositions(series = [], rounds = []) {
  const completed = [];
  rounds.forEach((_, i) => {
    const moved = series.some(s => {
      const prev = i > 0 ? (s.points?.[i - 1] || 0) : 0;
      return (s.points?.[i] || 0) !== prev;
    });
    if (moved) completed.push(i);
  });

  const positions = {};
  completed.forEach((roundIdx) => {
    const order = [...series]
      .map(s => ({ key: seriesKey(s), pts: s.points?.[roundIdx] || 0 }))
      .sort((a, b) => b.pts - a.pts);
    order.forEach((o, pos) => {
      if (!positions[o.key]) positions[o.key] = [];
      positions[o.key].push(pos + 1);
    });
  });
  return { completed, positions };
}

/**
 * Variazione dopo l'ultimo round disputato, coerente con la classifica
 * MOSTRATA (che include scarti/aggiustamenti): posizione precedente =
 * classifica ricalcolata togliendo a ciascuno i punti presi nell'ultimo
 * round (da standings-progression). >0 = posizioni guadagnate.
 * standings: [{ position, total_points, ...key }], keyOf(row) → chiave serie.
 */
export function lastRoundDeltas(series, rounds, standings = [], keyOf = seriesKey) {
  const { completed } = computeRoundPositions(series, rounds);
  const out = {};
  if (completed.length < 2 || !standings.length) return out;
  const last = completed[completed.length - 1];
  const prev = completed[completed.length - 2];
  const gained = {};
  series.forEach(s => { gained[seriesKey(s)] = (s.points?.[last] || 0) - (s.points?.[prev] || 0); });
  const prevOrder = standings
    .map(r => ({ key: keyOf(r), pts: (Number(r.total_points) || 0) - (gained[keyOf(r)] || 0), pos: r.position }))
    .sort((a, b) => b.pts - a.pts || a.pos - b.pos);
  prevOrder.forEach((r, i) => {
    const cur = standings.find(x => keyOf(x) === r.key)?.position;
    if (cur) out[r.key] = (i + 1) - cur;
  });
  return out;
}
