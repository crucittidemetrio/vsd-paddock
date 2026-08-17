// ═══════════════════════════════════════════════════════════
// FIX — rimatch driver_id in RaceResults dopo la correzione di
// matchDriverName_ (bug: un nome esterno completo tipo "Marco Canino"
// veniva troncato in "marco c." e attribuito per errore a un pilota
// VSD con iniziale del cognome coincidente ma persona diversa, es.
// "Marco Calvi" — caso reale riscontrato sulla gara "Eos Evo 4 Fun").
// ═══════════════════════════════════════════════════════════
// Da lanciare UNA TANTUM, manualmente, dall'editor Apps Script (▶ Esegui
// → fixAllMisattributedDriverMatches). Idempotente: rilanciarla non fa
// danni, semplicemente non trova più nulla da correggere.
//
// Cosa fa:
//   1. Rilegge ogni riga di RaceResults e ricalcola driver_id con la
//      logica CORRETTA di matchDriverName_. Se il nuovo match è
//      diverso da quello salvato, corregge driver_id e is_vsd_driver
//      sulla riga.
//   2. Ricontrolla OGNI riga di RaceReports (non solo quelle appena
//      corrette al passo 1): per essere valida, deve esistere ancora
//      una riga RaceResults con lo stesso (race_id, driver_id) e
//      is_vsd_driver=TRUE. Se non esiste più — perché già corretta in
//      passato, o perché il match era sbagliato ma la riga RaceResults
//      di origine è stata nel frattempo sistemata a mano — la riga
//      RaceReports è orfana e va rimossa. Questo secondo passo, oltre
//      al primo, serve a intercettare anche i casi in cui RaceResults
//      risulta OGGI già corretto ma RaceReports è rimasto disallineato
//      (il seed copia i valori una volta sola, non si auto-aggiorna).
//   3. Una riga RaceReports orfana viene rimossa SOLO se ancora vuota
//      (nessun incident_notes/damage_report/strategy_notes/
//      staff_rating/staff_notes compilato a mano): un report con
//      contenuto reale non viene mai toccato, solo segnalato in log
//      per controllo manuale.
// ═══════════════════════════════════════════════════════════

function fixAllMisattributedDriverMatches() {
  const sheet = getSheet(SHEETS.RACE_RESULTS);
  if (!sheet) { Logger.log('❌ Tab RaceResults non trovata.'); return; }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const col = {};
  headers.forEach((h, i) => { col[h] = i; });

  if (col.driver_name_external === undefined || col.driver_id === undefined) {
    Logger.log('❌ Colonne driver_name_external/driver_id non trovate in RaceResults.');
    return;
  }

  const driverNameMap = buildDriverNameMap_();

  // ─── Passo 1: rimatch di ogni riga RaceResults ───
  let fixed = 0;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const externalName = row[col.driver_name_external];
    const currentDriverId = String(row[col.driver_id] || '');
    if (!externalName) continue;

    const rematched = matchDriverName_(externalName, driverNameMap) || '';

    if (rematched !== currentDriverId) {
      Logger.log(`🔧 RaceResults riga ${i + 1}: "${externalName}" — driver_id "${currentDriverId || '(vuoto)'}" → "${rematched || '(vuoto)'}"`);
      sheet.getRange(i + 1, col.driver_id + 1).setValue(rematched);
      if (col.is_vsd_driver !== undefined) {
        sheet.getRange(i + 1, col.is_vsd_driver + 1).setValue(rematched ? 'TRUE' : 'FALSE');
      }
      fixed++;
    }
  }
  Logger.log(`✅ Corrette ${fixed} righe RaceResults.`);

  // ─── Passo 2: valida OGNI riga RaceReports contro RaceResults attuale ───
  // Rilegge RaceResults (post-fix) per costruire il set di coppie
  // (race_id, driver_id) VSD legittime.
  const freshData = sheet.getDataRange().getValues();
  const validPairs = new Set();
  for (let i = 1; i < freshData.length; i++) {
    const row = freshData[i];
    const driverId = String(row[col.driver_id] || '');
    const isVsd = col.is_vsd_driver !== undefined && String(row[col.is_vsd_driver] || '').toUpperCase() === 'TRUE';
    if (driverId && isVsd) {
      validPairs.add(`${row[col.race_id]}__${driverId}`);
    }
  }

  const reportsSheet = getSheet(SHEETS.RACE_REPORTS);
  let removed = 0;
  if (reportsSheet) {
    const rdata = reportsSheet.getDataRange().getValues();
    const rheaders = rdata[0];
    const rCol = {};
    rheaders.forEach((h, i) => { rCol[h] = i; });
    const qualitativeFields = ['incident_notes', 'damage_report', 'strategy_notes', 'staff_rating', 'staff_notes'];

    for (let i = rdata.length - 1; i >= 1; i--) {
      const raceId = rdata[i][rCol.race_id];
      const driverId = String(rdata[i][rCol.driver_id] || '');
      if (!raceId || !driverId) continue;
      if (validPairs.has(`${raceId}__${driverId}`)) continue; // riga legittima

      const hasContent = qualitativeFields.some(f => rCol[f] !== undefined && String(rdata[i][rCol[f]] || '').trim() !== '');
      if (hasContent) {
        Logger.log(`⚠️  RaceReports riga ${i + 1} (driver_id ${driverId}, gara ${raceId}) orfana ma NON rimossa: contiene dati compilati a mano, controlla manualmente.`);
        continue;
      }
      Logger.log(`🗑️  Rimossa riga RaceReports orfana: driver_id ${driverId} su gara ${raceId} (report_id ${rdata[i][rCol.report_id]})`);
      reportsSheet.deleteRow(i + 1);
      removed++;
    }
  }

  Logger.log(`✅ Rimosse ${removed} righe RaceReports orfane.`);
  Logger.log('Fatto. Ricontrolla la pagina della gara interessata.');
  return { fixedResults: fixed, removedReports: removed };
}
