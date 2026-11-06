/**
 * Preposizione "a" con articolo contratto, per frasi tipo
 * "Per accedere {…} effettua il login".
 *
 *   "il Pit Wall"        → "al Pit Wall"
 *   "la Panoramica"      → "alla Panoramica"
 *   "l'Analisi di Passo" → "all'Analisi di Passo"
 *   "i report di gara"   → "ai report di gara"
 *   "questa sezione"     → "a questa sezione"   (nessun articolo: solo "a")
 *
 * @param {string} phrase - sintagma nominale, con o senza articolo
 * @returns {string}
 */
const CONTRACTIONS = [
  [/^il\s+/i, 'al '],
  [/^lo\s+/i, 'allo '],
  [/^la\s+/i, 'alla '],
  [/^gli\s+/i, 'agli '],
  [/^le\s+/i, 'alle '],
  [/^i\s+/i, 'ai '],
  [/^l'/i, "all'"],
];

export function withPrepositionA(phrase) {
  const text = String(phrase ?? '').trim();
  if (!text) return 'a';
  for (const [pattern, replacement] of CONTRACTIONS) {
    if (pattern.test(text)) return text.replace(pattern, replacement);
  }
  return `a ${text}`;
}
