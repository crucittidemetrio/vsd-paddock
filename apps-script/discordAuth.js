/**
 * Wave 10.1 — Discord OAuth backend (logica di classificazione)
 *
 * NOTA: questo file è ISOLATO. Le funzioni qui non sono ancora
 * collegate al router doGet/doPost. Il collegamento avverrà in
 * una sub-wave successiva, post-Lumh.
 *
 * Per ora il file espone:
 *  - classifyDiscordUser_(discordId, roles, isMember)
 *  - findDriverByDiscordId_(discordId)
 *  - test_*() — eseguibili manualmente dall'editor Apps Script
 */

const DRIVERS_SHEET_NAME = 'Drivers';

/**
 * Classifica un utente Discord in un tier basato su:
 *  - Discord User ID (snowflake string)
 *  - Array di role Discord IDs (snowflakes)
 *  - Flag isMember (utente nel server VSD?)
 *
 * Precedenza:
 *   sheet.role === 'admin' | 'staff'  >  Discord VSD role  >  guest
 *
 * @param {string} discordId
 * @param {string[]} roles
 * @param {boolean} isMember
 * @returns {{tier: string, driver_id: string|null, sims: string[]}}
 */
function classifyDiscordUser_(discordId, roles, isMember) {
  const props = PropertiesService.getScriptProperties();
  const ROLE_LMU = props.getProperty('DISCORD_ROLE_PILOT_LMU');
  const ROLE_IRC = props.getProperty('DISCORD_ROLE_PILOT_IRC');
  const ROLE_ACE = props.getProperty('DISCORD_ROLE_PILOT_ACE');

  // 1. Derive sims from Discord roles
  const sims = [];
  if (roles && roles.indexOf(ROLE_LMU) !== -1) sims.push('LMU');
  if (roles && roles.indexOf(ROLE_IRC) !== -1) sims.push('IRC');
  if (roles && roles.indexOf(ROLE_ACE) !== -1) sims.push('ACE');

  // 2. Lookup driver nel sheet Drivers via discord_id
  const matched = findDriverByDiscordId_(discordId);

  // 3. Apply precedence rules

  // 3a. Admin/staff sovrascrive Discord
  if (matched && (matched.role === 'admin' || matched.role === 'staff')) {
    return { tier: matched.role, driver_id: matched.driver_id, sims: sims };
  }

  // 3b. Pilot VSD (ha ruolo VSD su Discord)
  if (sims.length > 0) {
    if (!matched) {
      // Edge case: ha ruolo VSD su Discord ma manca discord_id nel sheet
      Logger.log(
        '⚠️ Discord user ' + discordId +
        ' ha ruoli VSD ' + sims.join(',') +
        ' ma non è nel sheet Drivers (discord_id mancante o sbagliato)'
      );
      return { tier: 'guest', driver_id: null, sims: sims };
    }
    return { tier: 'pilot_vsd', driver_id: matched.driver_id, sims: sims };
  }

  // 3c. Guest (membro Discord senza ruoli VSD, o sconosciuto)
  return { tier: 'guest', driver_id: null, sims: [] };
}

/**
 * Cerca un pilota nel sheet Drivers tramite il suo discord_id.
 * @param {string} discordId
 * @returns {{driver_id: string, role: string, display_name: string}|null}
 */
function findDriverByDiscordId_(discordId) {
  if (!discordId) return null;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(DRIVERS_SHEET_NAME);
  if (!sheet) {
    Logger.log('findDriverByDiscordId_: sheet "' + DRIVERS_SHEET_NAME + '" non trovato');
    return null;
  }

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return null;

  const headers = data[0];
  const discordIdCol = headers.indexOf('discord_id');
  const driverIdCol = headers.indexOf('driver_id');
  const roleCol = headers.indexOf('role');
  const displayNameCol = headers.indexOf('display_name');

  if (discordIdCol === -1 || driverIdCol === -1 || roleCol === -1) {
    Logger.log('findDriverByDiscordId_: colonne richieste mancanti (driver_id, discord_id, role)');
    return null;
  }

  const target = String(discordId).trim();

  for (let i = 1; i < data.length; i++) {
    const cellValue = String(data[i][discordIdCol]).trim();
    if (cellValue === target) {
      return {
        driver_id: data[i][driverIdCol],
        role: data[i][roleCol],
        display_name: displayNameCol !== -1 ? data[i][displayNameCol] : null,
      };
    }
  }

  return null;
}

// =====================================================================
// TEST FUNCTIONS — esegui dall'editor (dropdown in alto → Esegui ▶)
// =====================================================================

/**
 * Test 1: io stesso (VSD005, admin), nessun ruolo Discord VSD.
 * Atteso: { tier: 'admin', driver_id: 'VSD005', sims: [] }
 */
function test_classify_me() {
  Logger.log('=== test_classify_me ===');

  // Look up il MIO discord_id dal sheet (così non lo hardcoded qui)
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(DRIVERS_SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const driverIdCol = headers.indexOf('driver_id');
  const discordIdCol = headers.indexOf('discord_id');

  let myDiscordId = null;
  for (let i = 1; i < data.length; i++) {
    if (data[i][driverIdCol] === 'VSD005') {
      myDiscordId = String(data[i][discordIdCol]).trim();
      break;
    }
  }

  if (!myDiscordId) {
    Logger.log('❌ FAIL: discord_id di VSD005 non trovato nel sheet');
    return;
  }

  Logger.log('Input: discordId=' + myDiscordId + ', roles=[], isMember=true');
  const result = classifyDiscordUser_(myDiscordId, [], true);
  Logger.log('Output: ' + JSON.stringify(result));

  if (result.tier === 'admin' && result.driver_id === 'VSD005') {
    Logger.log('✅ PASS — tier=admin, driver_id=VSD005');
  } else {
    Logger.log('❌ FAIL — atteso tier=admin, driver_id=VSD005');
  }
}

/**
 * Test 2: utente Discord sconosciuto, membro del server, nessun ruolo VSD.
 * Atteso: { tier: 'guest', driver_id: null, sims: [] }
 */
function test_classify_unknown_member() {
  Logger.log('=== test_classify_unknown_member ===');

  const fakeDiscordId = '000000000000000000';
  Logger.log('Input: discordId=' + fakeDiscordId + ', roles=[], isMember=true');
  const result = classifyDiscordUser_(fakeDiscordId, [], true);
  Logger.log('Output: ' + JSON.stringify(result));

  if (result.tier === 'guest' && result.driver_id === null && result.sims.length === 0) {
    Logger.log('✅ PASS — tier=guest, driver_id=null, sims=[]');
  } else {
    Logger.log('❌ FAIL — atteso tier=guest, driver_id=null, sims=[]');
  }
}

/**
 * Test 3: Discord ha ruolo VSD LMU ma user non è nel sheet.
 * Atteso: { tier: 'guest', driver_id: null, sims: ['LMU'] } + warning loggato
 */
function test_classify_with_lmu_role_unknown_member() {
  Logger.log('=== test_classify_with_lmu_role_unknown_member ===');

  const fakeDiscordId = '000000000000000001';
  const ROLE_LMU = PropertiesService.getScriptProperties().getProperty('DISCORD_ROLE_PILOT_LMU');

  if (!ROLE_LMU) {
    Logger.log('❌ FAIL: DISCORD_ROLE_PILOT_LMU non trovato nelle Script Properties');
    return;
  }

  Logger.log('Input: discordId=' + fakeDiscordId + ', roles=[LMU], isMember=true');
  const result = classifyDiscordUser_(fakeDiscordId, [ROLE_LMU], true);
  Logger.log('Output: ' + JSON.stringify(result));

  const ok =
    result.tier === 'guest' &&
    result.driver_id === null &&
    result.sims.length === 1 &&
    result.sims[0] === 'LMU';

  if (ok) {
    Logger.log('✅ PASS — tier=guest (fallback), sims=[LMU], warning loggato sopra');
  } else {
    Logger.log('❌ FAIL — atteso tier=guest con sims=[LMU]');
  }
}
