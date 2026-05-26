// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Security Rotation (one-shot utility)
// ═══════════════════════════════════════════════════════════
// Funzione manuale per ruotare access_code di tutti i piloti
// e generare un AUTH_SECRET candidato.
//
// USO:
// 1. Esegui rotateSecurityCredentials() dall'editor (▶).
// 2. Apri il pannello Esecuzioni e leggi il Logger.
// 3. Copia AUTH_SECRET → Script Properties; salva la mappatura
//    driver_id → access_code in posto sicuro.
// 4. Distribuisci → Gestisci → Modifica → Nuova versione.
// 5. Logout app + login con il nuovo admin code.
// 6. Discord DM ai piloti con il loro codice personale.
//
// ⚠️ DESTRUTTIVA: sovrascrive la colonna access_code nello sheet.
// Google Sheets ha version history se serve recovery (File → Cronologia).
// ═══════════════════════════════════════════════════════════

function rotateSecurityCredentials() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Drivers');
  if (!sheet) throw new Error('Tab "Drivers" non trovata.');

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('Sheet Drivers vuoto.');

  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  const codeColIdx = headers.indexOf('access_code');
  const idColIdx = headers.indexOf('driver_id');
  const nameColIdx = headers.indexOf('display_name');

  if (codeColIdx === -1) throw new Error('Colonna "access_code" non trovata.');
  if (idColIdx === -1) throw new Error('Colonna "driver_id" non trovata.');
  if (nameColIdx === -1) throw new Error('Colonna "display_name" non trovata.');

  // Leggi tutti i piloti
  const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  // Genera nuovi codici univoci
  const usedCodes = new Set();
  const mapping = [];

  data.forEach((row, idx) => {
    const driverId = row[idColIdx];
    const displayName = row[nameColIdx];

    let newCode;
    let attempts = 0;
    do {
      newCode = generateAccessCode(displayName);
      attempts++;
      if (attempts > 50) throw new Error(`Impossibile generare codice univoco per ${displayName}`);
    } while (usedCodes.has(newCode));

    usedCodes.add(newCode);

    mapping.push({
      rowIdx: idx + 2,
      driver_id: driverId,
      display_name: displayName,
      new_code: newCode,
    });
  });

  // Scrivi i nuovi codici nello Sheet
  mapping.forEach(m => {
    sheet.getRange(m.rowIdx, codeColIdx + 1).setValue(m.new_code);
  });
  SpreadsheetApp.flush();

  // Genera nuovo AUTH_SECRET candidato (UUID v4 di Google = CSPRNG)
  const newSecret = Utilities.getUuid().replace(/-/g, '');

  // Output
  Logger.log('═══════════════════════════════════════════════════════════');
  Logger.log('🔒 NUOVO AUTH_SECRET (copialo in Script Properties):');
  Logger.log('───────────────────────────────────────────────────────────');
  Logger.log(newSecret);
  Logger.log('═══════════════════════════════════════════════════════════');
  Logger.log('');
  Logger.log('🔑 MAPPATURA driver_id | display_name | nuovo access_code:');
  Logger.log('───────────────────────────────────────────────────────────');
  mapping.forEach(m => {
    Logger.log(`${m.driver_id} | ${m.display_name} | ${m.new_code}`);
  });
  Logger.log('═══════════════════════════════════════════════════════════');
  Logger.log(`✅ Sheet Drivers aggiornato: ${mapping.length} righe.`);
  Logger.log('');
  Logger.log('PROSSIMI STEP MANUALI:');
  Logger.log('1. Copia AUTH_SECRET sopra → Project Settings → Script Properties → AUTH_SECRET → Save.');
  Logger.log('2. Esporta la mappatura in posto sicuro (1Password, file criptato).');
  Logger.log('3. Distribuisci → Gestisci → Modifica → Nuova versione.');
  Logger.log('4. Logout dall\'app, riloga con il tuo nuovo admin code.');
  Logger.log('5. Discord DM ai piloti con il loro codice personale.');
}

function generateAccessCode(displayName) {
  // Format: SURNAME-NNNN (4 cifre)
  const parts = String(displayName || '').trim().split(/\s+/);
  let surname = (parts[parts.length - 1] || 'PILOT').toUpperCase().replace(/[^A-Z]/g, '');
  if (surname.length < 3) surname = 'PILOT';
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${surname}-${num}`;
}
/**
 * Stampa nel Logger 22 messaggi DM Discord pronti da copia-incollare,
 * uno per pilota, con il loro display_name e access_code attuali.
 *
 * Da eseguire SOLO dopo aver completato la rotazione in Phase 2 e 3.
 * Il messaggio template è personalizzabile modificando la costante TEMPLATE.
 */
function generateDiscordDMs() {
  const TEMPLATE = `🏎 VSD PADDOCK — Nuovo Access Code

Ciao {FIRST_NAME},

Abbiamo rilasciato la prima versione ufficiale del paddock VSD:
https://vsd-paddock.vercel.app

Il tuo codice di accesso personale:
{ACCESS_CODE}

⚠️ Codice riservato — non condividerlo con altri piloti né su canali pubblici.

Cosa puoi fare nel paddock:
- Mission Control → riepilogo personale e prossima gara
- Best Laps → database tempi del team
- Race Hub → calendario gare programmate e storico

Se trovi bug o hai feedback scrivimi qui in DM.

GLHF 🏁`;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Drivers');
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  const idColIdx = headers.indexOf('driver_id');
  const nameColIdx = headers.indexOf('display_name');
  const codeColIdx = headers.indexOf('access_code');
  const statusColIdx = headers.indexOf('status');

  const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  data.forEach(row => {
    const driverId = row[idColIdx];
    const displayName = String(row[nameColIdx] || '').trim();
    const accessCode = row[codeColIdx];
    const status = row[statusColIdx];
    const firstName = displayName.split(/\s+/)[0] || 'pilota';

    const message = TEMPLATE
      .replace('{FIRST_NAME}', firstName)
      .replace('{ACCESS_CODE}', accessCode);

    Logger.log('═══════════════════════════════════════════════════════════');
    Logger.log(`📨 ${driverId} | ${displayName} | status: ${status}`);
    Logger.log('───────────────────────────────────────────────────────────');
    Logger.log(message);
    Logger.log('');
  });

  Logger.log('═══════════════════════════════════════════════════════════');
  Logger.log(`✅ ${data.length} messaggi generati. Copia uno alla volta in Discord DM.`);
}