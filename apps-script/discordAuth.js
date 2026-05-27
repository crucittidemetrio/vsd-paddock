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

// =====================================================================
// WAVE 10.1 — DISCORD OAUTH FLOW (callback + start + token)
// =====================================================================

const OAUTH_STATE_TTL_SEC = 600;                       // 10 minuti
const DISCORD_API_BASE = 'https://discord.com/api/v10';

/**
 * POST auth.discordStart → genera URL OAuth Discord con CSRF state.
 * Frontend chiama questo endpoint per ottenere l'URL a cui redirigere
 * l'utente per il consenso Discord.
 *
 * @returns {{ok: boolean, data?: {url: string}, error?: string}}
 */
function handleDiscordAuthStart_(payload) {
  const props = PropertiesService.getScriptProperties();
  const clientId = props.getProperty('DISCORD_CLIENT_ID');
  const redirectUri = props.getProperty('DISCORD_REDIRECT_URI');

  if (!clientId || !redirectUri) {
    return { ok: false, error: 'Discord OAuth non configurato sul server' };
  }

  // CSRF state random (UUID v4 = CSPRNG)
  const state = Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('oauth_state_' + state, '1', OAUTH_STATE_TTL_SEC);

  const url = 'https://discord.com/oauth2/authorize' +
    '?client_id=' + encodeURIComponent(clientId) +
    '&redirect_uri=' + encodeURIComponent(redirectUri) +
    '&response_type=code' +
    '&scope=' + encodeURIComponent('identify guilds.members.read') +
    '&state=' + state;

  return { ok: true, data: { url: url } };
}

/**
 * POST auth.discordCallback handler.
 * Frontend Vercel /auth/discord-callback riceve ?code=XXX&state=YYY da Discord,
 * poi POSTa qui per scambiare il code con il token sessione.
 *
 * @param {{code: string, state: string}} payload
 * @param {Object} ctx - non usato (chiamata pre-auth)
 * @returns {{ok: boolean, data?: {token, tier, sims, driver_id}, error?: string}}
 */
function handleDiscordCallback(payload, ctx) {
  const code = (payload && payload.code) || '';
  const state = (payload && payload.state) || '';

  if (!code) {
    Logger.log('handleDiscordCallback: code mancante');
    return fail('missing_code');
  }
  if (!state) {
    Logger.log('handleDiscordCallback: state mancante (possibile CSRF)');
    return fail('missing_state');
  }

  // 1. Verifica CSRF state (one-shot)
  const cache = CacheService.getScriptCache();
  const cacheKey = 'oauth_state_' + state;
  if (!cache.get(cacheKey)) {
    Logger.log('handleDiscordCallback: state non valido o scaduto: ' + state);
    return fail('invalid_state');
  }
  cache.remove(cacheKey);

  // 2. Script Properties
  const props = PropertiesService.getScriptProperties();
  const clientId = props.getProperty('DISCORD_CLIENT_ID');
  const clientSecret = props.getProperty('DISCORD_CLIENT_SECRET');
  const redirectUri = props.getProperty('DISCORD_REDIRECT_URI');
  const guildId = props.getProperty('DISCORD_GUILD_ID');

  if (!clientId || !clientSecret || !redirectUri || !guildId) {
    Logger.log('handleDiscordCallback: Script Properties Discord incomplete');
    return fail('server_misconfigured');
  }

  // 3. Exchange code → access_token
  let accessToken;
  try {
    const tokenRes = UrlFetchApp.fetch(DISCORD_API_BASE + '/oauth2/token', {
      method: 'post',
      contentType: 'application/x-www-form-urlencoded',
      payload: {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
      },
      muteHttpExceptions: true,
    });

    if (tokenRes.getResponseCode() !== 200) {
      Logger.log(
        'Discord token exchange failed: HTTP ' + tokenRes.getResponseCode() +
        ' body: ' + tokenRes.getContentText()
      );
      return fail('discord_token_exchange');
    }

    accessToken = JSON.parse(tokenRes.getContentText()).access_token;
    if (!accessToken) {
      Logger.log('Discord token response missing access_token');
      return fail('discord_no_access_token');
    }
  } catch (e) {
    Logger.log('Discord token exchange exception: ' + e.message);
    return fail('discord_unreachable');
  }

  // 4. Fetch user info
  let user;
  try {
    const userRes = UrlFetchApp.fetch(DISCORD_API_BASE + '/users/@me', {
      headers: { 'Authorization': 'Bearer ' + accessToken },
      muteHttpExceptions: true,
    });

    if (userRes.getResponseCode() !== 200) {
      Logger.log('Discord /users/@me failed: HTTP ' + userRes.getResponseCode());
      return fail('discord_user_fetch');
    }

    user = JSON.parse(userRes.getContentText());
  } catch (e) {
    Logger.log('Discord /users/@me exception: ' + e.message);
    return fail('discord_unreachable');
  }

  // 5. Guild membership + roles
  let memberRoles = [];
  let isMember = false;
  try {
    const memberRes = UrlFetchApp.fetch(
      DISCORD_API_BASE + '/users/@me/guilds/' + guildId + '/member',
      {
        headers: { 'Authorization': 'Bearer ' + accessToken },
        muteHttpExceptions: true,
      }
    );

    const memberStatus = memberRes.getResponseCode();
    if (memberStatus === 200) {
      const member = JSON.parse(memberRes.getContentText());
      memberRoles = member.roles || [];
      isMember = true;
    } else if (memberStatus === 404) {
      isMember = false;
    } else {
      Logger.log(
        'Discord guild member fetch unexpected: HTTP ' + memberStatus +
        ' body: ' + memberRes.getContentText() + ' (treating as non-member)'
      );
      isMember = false;
    }
  } catch (e) {
    Logger.log('Discord guild member exception (treating as non-member): ' + e.message);
    isMember = false;
  }

  // 6. Classify
  const classification = classifyDiscordUser_(user.id, memberRoles, isMember);
  Logger.log(
    'Discord auth complete: discord_user=' + user.id +
    ', tier=' + classification.tier +
    ', driver_id=' + classification.driver_id +
    ', sims=[' + classification.sims.join(',') + ']'
  );

  // 7. Token
  const token = generateTokenWithClassification_(classification);

  // 8. Return JSON (no more HTML redirect — frontend Vercel handles UX)
  return ok({
    token: token,
    tier: classification.tier,
    sims: classification.sims,
    driver_id: classification.driver_id,
  });
}
/**
 * Genera token HMAC con classification (tier+sims) nel payload firmato.
 * Formato new (5 parti): base64(driver_id|tier|sims_csv|expiresAt|signature)
 *
 * Nota: per tier='guest' driver_id è null → serializzato come stringa 'null',
 * verifyToken la riconverte a null al parse.
 *
 * @param {{tier: string, driver_id: string|null, sims: string[]}} classification
 * @returns {string} token base64WebSafe
 */
function generateTokenWithClassification_(classification) {
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const driverId = classification.driver_id || 'null';
  const tier = classification.tier;
  const simsCsv = (classification.sims || []).join(',');

  const payload = `${driverId}|${tier}|${simsCsv}|${expiresAt}`;
  const signature = signHmac(payload, getAuthSecret());
  return Utilities.base64EncodeWebSafe(`${payload}|${signature}`);
}

// =====================================================================
// TEST FUNCTIONS (extension)
// =====================================================================

/**
 * Test 4 — HAPPY PATH (era mancante in parte 1).
 * Pilota VSD reale nel sheet con discord_id + ruolo Discord LMU.
 * Atteso: { tier: 'pilot_vsd', driver_id: <target>, sims: ['LMU'] }
 *
 * Cambia targetDriverId con un VSDxxx che sia: (a) attivo, (b) ha discord_id
 * popolato nel sheet, (c) role !== 'admin'/'staff'.
 */
function test_classify_pilot_vsd_lmu() {
  Logger.log('=== test_classify_pilot_vsd_lmu (HAPPY PATH) ===');

  const targetDriverId = 'VSD019';  // ⚠️ cambia se necessario

  // Lookup dinamico (convention da test_classify_me)
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(DRIVERS_SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const driverIdCol = headers.indexOf('driver_id');
  const discordIdCol = headers.indexOf('discord_id');
  const roleCol = headers.indexOf('role');

  let targetDiscordId = null;
  let targetRole = null;
  for (let i = 1; i < data.length; i++) {
    if (data[i][driverIdCol] === targetDriverId) {
      targetDiscordId = String(data[i][discordIdCol]).trim();
      targetRole = data[i][roleCol];
      break;
    }
  }

  if (!targetDiscordId) {
    Logger.log('❌ FAIL: discord_id di ' + targetDriverId + ' vuoto. Aggiorna sheet o cambia targetDriverId.');
    return;
  }
  if (targetRole === 'admin' || targetRole === 'staff') {
    Logger.log('❌ FAIL: ' + targetDriverId + ' è ' + targetRole + '. Serve un pilota normale per testare il path pilot_vsd. Cambia targetDriverId.');
    return;
  }

  const ROLE_LMU = PropertiesService.getScriptProperties().getProperty('DISCORD_ROLE_PILOT_LMU');
  if (!ROLE_LMU) {
    Logger.log('❌ FAIL: DISCORD_ROLE_PILOT_LMU mancante nelle Script Properties');
    return;
  }

  Logger.log('Input: discordId=' + targetDiscordId + ', roles=[LMU], isMember=true');
  const result = classifyDiscordUser_(targetDiscordId, [ROLE_LMU], true);
  Logger.log('Output: ' + JSON.stringify(result));

  const ok =
    result.tier === 'pilot_vsd' &&
    result.driver_id === targetDriverId &&
    result.sims.length === 1 &&
    result.sims[0] === 'LMU';

  if (ok) {
    Logger.log('✅ PASS — tier=pilot_vsd, driver_id=' + targetDriverId + ', sims=[LMU]');
  } else {
    Logger.log('❌ FAIL — atteso tier=pilot_vsd, driver_id=' + targetDriverId + ', sims=[LMU]');
  }
}