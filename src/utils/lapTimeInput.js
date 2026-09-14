// Normalizzazione dell'input "tempo sul giro" digitato a mano — 14 set
// 2026, dopo segnalazione di più piloti (e talvolta staff) con invii
// rifiutati dal form Best Laps. La regex di validazione richiede il
// formato canonico M:SS.mmm, ma due varianti comunissime venivano
// scartate silenziosamente:
//   - virgola come separatore decimale (tastiera IT: "1:30,333")
//   - giro sotto il minuto scritto senza il prefisso minuti
//     ("45.234" invece di "0:45.234") — frequente su tracciati corti
// Stessa logica replicata lato Apps Script in
// apps-script/BestLaps.js (normalizeLapTimeInput_) — mondi diversi
// (frontend vs Apps Script), non importabile da lì, va tenuta in sync
// a mano se il formato cambia di nuovo.
//
// Usata da src/pages/BestLaps.jsx e src/pages/AdminBestLaps.jsx PRIMA
// sia della validazione sia dell'invio al backend, così il valore
// mostrato/inviato è già nel formato canonico.
export function normalizeLapTimeInput(raw) {
  let value = String(raw || '').trim().replace(',', '.');
  if (/^\d{1,2}\.\d{1,3}$/.test(value)) value = '0:' + value;
  return value;
}
