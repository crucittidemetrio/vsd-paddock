// Palette di accento per pista: hash deterministico del track_id su una
// tavolozza curata di colori del brand VSD. Ogni pista ottiene sempre lo
// stesso colore (nessuno storage, nessuna configurazione manuale) — dà a
// ogni RaceDetail un'identità visiva riconoscibile senza dover reperire
// una foto per ciascuna delle decine di piste in calendario.
const TRACK_ACCENT_PALETTE = [
  '#ef3340', // red   (VSD default / kerb classico)
  '#00d4ff', // cyan  (VSD brand primary)
  '#f5a623', // orange (VSD brand secondary)
  '#3b8bff', // blue
  '#a855f7', // purple
];

export function trackAccentColor(trackId) {
  if (!trackId) return TRACK_ACCENT_PALETTE[0];
  const s = String(trackId);
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return TRACK_ACCENT_PALETTE[hash % TRACK_ACCENT_PALETTE.length];
}
