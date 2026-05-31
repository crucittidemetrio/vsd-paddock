// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — BestLaps Auto-fill lap_time_ms
// ═══════════════════════════════════════════════════════════
// Simple onEdit trigger: quando l'admin scrive un tempo in formato
// "M:SS.mmm" nella colonna lap_time_display del tab BestLaps,
// la colonna lap_time_ms viene auto-compilata con il valore in ms.
//
// Formati accettati:
//   "1:30.333"   → 90333
//   "0:51.540"   → 51540
//   "2:22.5"     → 142500  (padding decimali: .5 = .500)
//   "1:14.32"    → 74320   (padding decimali: .32 = .320)
//
// Formati IGNORATI (lasciano il campo ms invariato):
//   "1:30"       (manca decimali)
//   "1.30.5"     (separatore sbagliato)
//   "90333"      (già ms, no ":")
//
// Se la cella display viene SVUOTATA, anche ms viene azzerato.
//
// Nessun trigger installabile richiesto: simple trigger gira sotto
// l'identità dell'utente che edita, sufficiente per setValue nella
// stessa spreadsheet.
// ═══════════════════════════════════════════════════════════

function onEdit(e) {
  if (!e || !e.range) return;

  const sheet = e.range.getSheet();
  if (sheet.getName() !== SHEETS.BEST_LAPS) return;

  const row = e.range.getRow();
  if (row === 1) return; // header

  // Lookup colonne (cached per evitare read ripetuti? no, simple trigger è raro)
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const displayCol = headers.indexOf('lap_time_display') + 1;
  const msCol = headers.indexOf('lap_time_ms') + 1;
  if (displayCol === 0 || msCol === 0) return;

  // Filtra: solo edit della colonna lap_time_display
  if (e.range.getColumn() !== displayCol) return;

  const raw = e.range.getValue();
  const displayValue = String(raw || '').trim();

  // Display svuotato → svuota anche ms
  if (!displayValue) {
    sheet.getRange(row, msCol).setValue('');
    return;
  }

  // Parse "M:SS.mmm"
  const match = displayValue.match(/^(\d+):(\d{1,2})\.(\d{1,3})$/);
  if (!match) return; // formato non standard, lascia stare

  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  // Padding decimali: ".5" intende ".500", ".55" intende ".550"
  const msPart = match[3].padEnd(3, '0').slice(0, 3);
  const ms = parseInt(msPart, 10);

  if (seconds >= 60) return; // valore non valido (es. "1:75.000")

  const totalMs = minutes * 60000 + seconds * 1000 + ms;
  sheet.getRange(row, msCol).setValue(totalMs);
}
