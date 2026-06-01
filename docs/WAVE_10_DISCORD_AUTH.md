# Wave 10 — Discord OAuth + Multi-Tier Auth

**Stato**: spec finalizzato, pronto per branch  
**Owner**: Demetrio (Team Principal VSD)  
**Stima**: 8–11 ore di dev splittate in 7 sub-wave + 1 prerequisito operativo  
**Prerequisito**: Lumh R1 Fuji concluso (priorità sportiva > tecnica)

---

## 1. Executive Summary

Trasformiamo VSD Paddock da app interna chiusa a piattaforma con **3 livelli di accesso pubblico** discriminati dai ruoli Discord. L'obiettivo è duplice:

1. **Sblocco vetrina pubblica**: chiunque (anche senza login) vede una versione ridotta del sito che funziona da landing marketing per il team.
2. **Onboarding piloti via Discord**: il login Discord identifica automaticamente i piloti VSD esistenti e classifica i nuovi visitatori come "guest" con CTA verso l'iscrizione al team.

**Niente reinventare la ruota**: l'auth HMAC esistente (token 7gg) resta, viene solo *alimentata* dal flow OAuth Discord invece che dal login admin manuale.

---

## 2. Modello Auth — 4 Tier

```
┌─────────────────────────────────────────────────────────────────────┐
│ TIER          │ DISCRIMINATOR                  │ SESSION            │
├─────────────────────────────────────────────────────────────────────┤
│ anonymous     │ no login                        │ —                  │
│ guest         │ Discord member, ruolo "Pilota"  │ HMAC 7gg           │
│               │ MA NESSUN ruolo "Pilota VSD *"  │                    │
│ pilot_vsd     │ ≥1 tra: "Pilota VSD LMU",       │ HMAC 7gg + sims    │
│               │ "Pilota VSD IRC",               │ derivati dai ruoli │
│               │ "Pilota VSD ACE"                │                    │
│ admin / staff │ campo `role` in Drivers         │ HMAC 7gg           │
│               │ (sovrascrive Discord)           │                    │
└─────────────────────────────────────────────────────────────────────┘
```

**Regola di precedenza**: `admin/staff` (sheet) vince su `pilot_vsd` (Discord). Cioè se nel sheet hai role=admin ma su Discord hai solo ruolo "Pilota" generico, sei comunque admin. Necessario per Demetrio (admin) e per eventuali staff non piloti.

**Promozione guest → pilot**: avviene quando tu o uno staff assegnate uno dei 3 ruoli VSD su Discord. Al successivo login (o refresh manuale) il sistema rilegge i ruoli e sblocca il tier. **Non c'è sync real-time**: l'utente deve fare logout/login per vedere il cambio. Accettabile per il volume del team.

---

## 3. Visibility Matrix

| Sezione                     | anonymous | guest | pilot_vsd | admin/staff |
|-----------------------------|:---------:|:-----:|:---------:|:-----------:|
| Homepage showcase           |    ✅     |  —    |    —      |     —       |
| Mission Control personale   |    ❌     |  ❌   |    ✅     |     ✅      |
| Calendario gare             |    ✅     |  ✅   |    ✅     |     ✅      |
| Race Hub (gare passate)     |    ✅*    |  ✅   |    ✅     |     ✅      |
| Race detail + risultati     |    ✅*    |  ✅   |    ✅     |     ✅      |
| Roster (lista piloti)       |    ✅*    |  ✅   |    ✅     |     ✅      |
| Driver Profile dettagliato  |    ❌     |  ❌   |    ✅     |     ✅      |
| Best Laps Leaderboard       |    ❌     |  ✅   |    ✅     |     ✅      |
| Best Laps "I miei tempi"    |    ❌     |  ❌   |    ✅     |     ✅      |
| Laps Drilldown + grafico    |    ❌     |  ❌   |    ✅     |     ✅      |
| Classi dominanti (widget)   |    ❌     |  ❌   |    ✅     |     ✅      |
| Importer JSON risultati     |    ❌     |  ❌   |    ❌     |     ✅ (admin)|
| Staff Desk                  |    ❌     |  ❌   |    ❌     |     ✅      |

*Per anonymous: versione "ridotta" — vedi sezione 4.4.

**CTA persistente per anonymous/guest**: banner sticky o card prominente "Entra nel Discord VSD" con link a `discord.gg/gs5rR3DQay`.

---

## 4. Architettura Tecnica

### 4.1 OAuth Flow

```
[User]                       [Frontend]               [Apps Script]       [Discord API]
   │                              │                         │                    │
   │ click "Accedi con Discord"   │                         │                    │
   ├─────────────────────────────▶│                         │                    │
   │                              │ redirect Discord auth   │                    │
   │ ◀────────────────────────────┤                         │                    │
   │ /oauth2/authorize?...&scope=identify%20guilds.members.read                  │
   ├─────────────────────────────────────────────────────────────────────────────▶
   │ ◀───────────────────────────────────────────────────────────────────────────┤
   │ accetta/rifiuta consenso     │                         │                    │
   ├─────────────────────────────────────────────────────────────────────────────▶
   │ ◀──────────── redirect_uri (Apps Script) con ?code=XXX                      │
   │                                                        │                    │
   │                                                        │ POST /oauth2/token │
   │                                                        ├───────────────────▶│
   │                                                        │◀───── access_token │
   │                                                        │                    │
   │                                                        │ GET /users/@me     │
   │                                                        ├───────────────────▶│
   │                                                        │◀───── user info    │
   │                                                        │                    │
   │                                                        │ GET /guilds/{ID}/  │
   │                                                        │     members/@me    │
   │                                                        ├───────────────────▶│
   │                                                        │◀───── roles array  │
   │                                                        │                    │
   │                                                        │ [classify tier]    │
   │                                                        │ [lookup discord_id │
   │                                                        │  → driver_id]      │
   │                                                        │ [generate HMAC]    │
   │                              │                         │                    │
   │ ◀──── redirect frontend?token=XXX&tier=YYY ────────────┤                    │
   │                              │                         │                    │
   │                              │ store token localStorage│                    │
   │                              │ navigate home tier      │                    │
```

**Scope OAuth**: `identify guilds.members.read`

- `identify`: per ottenere snowflake user id (matching con `discord_id` nel sheet)
- `guilds.members.read`: per leggere i ruoli dell'utente nel server VSD specifico

### 4.2 Backend Apps Script — Nuova logica

Nuovi endpoint e funzioni in un nuovo file `discordAuth.gs`:

```javascript
// === Configurazione (Script Properties) ===
//
// DISCORD_CLIENT_ID         = "..." (da Discord Developer Portal)
// DISCORD_CLIENT_SECRET     = "..." (idem)
// DISCORD_GUILD_ID          = "..." (server VSD snowflake)
// DISCORD_REDIRECT_URI      = "https://script.google.com/.../exec?action=discordCallback"
// DISCORD_ROLE_PILOT_LMU    = "..." (role ID snowflake "Pilota VSD LMU")
// DISCORD_ROLE_PILOT_IRC    = "..." (idem IRC)
// DISCORD_ROLE_PILOT_ACE    = "..." (idem ACE)
//
// === Endpoint Web App ===
//
// doGet(e) router gestisce: action=discordCallback (OAuth return)
// doPost(e) router gestisce: action=auth.refresh (rilegge ruoli + rigenera token)

function handleDiscordCallback(code) {
  // 1. Exchange code for access_token
  const tokenResponse = UrlFetchApp.fetch('https://discord.com/api/oauth2/token', {
    method: 'post',
    payload: {
      client_id: PropertiesService.getScriptProperties().getProperty('DISCORD_CLIENT_ID'),
      client_secret: PropertiesService.getScriptProperties().getProperty('DISCORD_CLIENT_SECRET'),
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: PropertiesService.getScriptProperties().getProperty('DISCORD_REDIRECT_URI'),
    },
  });
  const { access_token } = JSON.parse(tokenResponse.getContentText());

  // 2. Get user info
  const userResponse = UrlFetchApp.fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: 'Bearer ' + access_token },
  });
  const user = JSON.parse(userResponse.getContentText());
  // → user.id (snowflake), user.username, user.global_name, user.avatar

  // 3. Get member info nel server VSD (roles incluse)
  const guildId = PropertiesService.getScriptProperties().getProperty('DISCORD_GUILD_ID');
  const memberResponse = UrlFetchApp.fetch(
    `https://discord.com/api/users/@me/guilds/${guildId}/member`,
    { headers: { Authorization: 'Bearer ' + access_token }, muteHttpExceptions: true }
  );
  
  let memberRoles = [];
  let isMember = false;
  if (memberResponse.getResponseCode() === 200) {
    const member = JSON.parse(memberResponse.getContentText());
    memberRoles = member.roles || [];
    isMember = true;
  }

  // 4. Classify tier + lookup driver_id
  const classification = classifyDiscordUser_(user.id, memberRoles, isMember);
  // → { tier, driver_id (null if guest/anon), sims }

  // 5. Generate HMAC token (riusa flow esistente) e ritorna redirect frontend
  const token = generateHmacToken_(classification);
  const frontendUrl = PropertiesService.getScriptProperties().getProperty('FRONTEND_URL');
  return HtmlService.createHtmlOutput(
    `<script>window.location='${frontendUrl}/auth/callback?token=${token}'</script>`
  );
}

function classifyDiscordUser_(discordId, roles, isMember) {
  const ROLES = {
    LMU: PropertiesService.getScriptProperties().getProperty('DISCORD_ROLE_PILOT_LMU'),
    IRC: PropertiesService.getScriptProperties().getProperty('DISCORD_ROLE_PILOT_IRC'),
    ACE: PropertiesService.getScriptProperties().getProperty('DISCORD_ROLE_PILOT_ACE'),
  };
  const sims = [];
  if (roles.includes(ROLES.LMU)) sims.push('LMU');
  if (roles.includes(ROLES.IRC)) sims.push('IRC');
  if (roles.includes(ROLES.ACE)) sims.push('ACE');

  // Lookup nel sheet Drivers via discord_id
  const drivers = getCachedSheetData_(SHEETS.DRIVERS, 600);
  const matched = drivers.find(d => String(d.discord_id || '').trim() === String(discordId));

  // Admin/staff sovrascrive Discord
  if (matched && (matched.role === 'admin' || matched.role === 'staff')) {
    return { tier: matched.role, driver_id: matched.driver_id, sims: sims };
  }

  // Pilota VSD
  if (sims.length > 0) {
    if (!matched) {
      // Ha ruolo VSD su Discord ma driver_id non popolato in sheet → segnala
      Logger.log('⚠️ Discord user ' + discordId + ' ha ruoli VSD ma manca da sheet Drivers');
      return { tier: 'guest', driver_id: null, sims: sims }; // fallback safe
    }
    return { tier: 'pilot_vsd', driver_id: matched.driver_id, sims: sims };
  }

  // Guest (membro Discord senza ruoli VSD)
  if (isMember) {
    return { tier: 'guest', driver_id: null, sims: [] };
  }

  // Login Discord ma non nel server VSD → guest comunque (showcase con CTA forte)
  return { tier: 'guest', driver_id: null, sims: [] };
}
```

### 4.3 Frontend — Auth state esteso

Refactor `useAuth.js` per supportare tier:

```javascript
// Stato attuale
{ driver: {...}, isStaff, isAdmin, login, logout }

// Stato nuovo
{
  driver: { driver_id, display_name, role, ... } | null,
  tier: 'anonymous' | 'guest' | 'pilot_vsd' | 'staff' | 'admin',
  sims: ['LMU', 'IRC'],  // per pilot_vsd, vuoto altrimenti
  
  // Helpers booleani per check rapidi
  isAnonymous: tier === 'anonymous',
  isGuest: tier === 'guest',
  isVsdPilot: tier === 'pilot_vsd' || tier === 'staff' || tier === 'admin',
  isStaff: tier === 'staff' || tier === 'admin',
  isAdmin: tier === 'admin',
  
  // Helper a soglia minima
  hasAtLeast: (t) => { /* anonymous < guest < pilot_vsd < staff < admin */ },
  
  // Actions
  login: () => { /* redirect a Discord OAuth */ },
  loginAdmin: (credentials) => { /* flow attuale, manteniamolo per fallback */ },
  logout: () => { /* clear localStorage + redirect home */ },
}
```

### 4.4 Vista anonymous — Showcase

Quando `tier === 'anonymous'`, la `/` mostra una landing pubblica diversa da Mission Control:

```
┌─────────────────────────────────────────────────┐
│ VSD PADDOCK                                     │
│ Virtual Sim Driver — Team italiano di sim racing│
│                                                 │
│ [Hero: foto/poster grande]                      │
│                                                 │
│ [ Accedi con Discord ]  [ Scopri il team ]      │
└─────────────────────────────────────────────────┘

┌─ PROSSIME GARE ─────────────────────────────────┐
│ Lumh R2 - Algarve - 02 giu 2026                 │
│ Apex Porsche R4 - ...                           │
└─────────────────────────────────────────────────┘

┌─ ULTIMI RISULTATI ──────────────────────────────┐
│ [Card race con podio + locandina]               │
│ [Card race + podio + locandina]                 │
│ [Card race + podio + locandina]                 │
└─────────────────────────────────────────────────┘

┌─ IL TEAM ────────────────────────────────────────┐
│ 22 piloti · 3 simulatori                         │
│ [grid avatar 22 piloti, no nomi clickabili]     │
│                                                 │
│ [ Unisciti al team su Discord → ]               │
└─────────────────────────────────────────────────┘

[footer: link Discord + social]
```

Per **guest**, sostanzialmente la stessa vista MA con accesso ai dettagli race + leaderboard team. Il discriminator visivo guest vs anonymous è: guest ha un piccolo badge "GUEST" in alto a destra accanto al suo nome Discord, anonymous ha solo "Accedi" come azione.

---

## 5. Sheet Schema Changes

### 5.1 Drivers tab — nuovo campo

Aggiungi colonna **`discord_id`** (snowflake string, lunghezza fino a 19 caratteri). Posizione consigliata: subito dopo `driver_id`.

| driver_id | discord_id          | display_name | full_name           | role  | ... |
|-----------|--------------------:|--------------|---------------------|-------|-----|
| VSD005    | 198765432109876543  | Demetrio     | Demetrio Crucitti   | admin | ... |
| VSD019    | 234567890123456789  | Samuele F.   | Samuele Faustini    |       | ... |
| VSD021    | (vuoto)             | Mattia A.    | Mattia Arosio       |       | ... |

**Backfill**: vedi sub-wave 10.0.

### 5.2 Script Properties — nuove chiavi

Su Apps Script (Editor → Project Settings → Script Properties):

```
DISCORD_CLIENT_ID         = "..."
DISCORD_CLIENT_SECRET     = "..."  (NEVER nel codice)
DISCORD_GUILD_ID          = "..."  (snowflake server VSD)
DISCORD_REDIRECT_URI      = "https://script.google.com/macros/s/{DEPLOYMENT_ID}/exec?action=discordCallback"
DISCORD_ROLE_PILOT_LMU    = "..."  (role ID snowflake)
DISCORD_ROLE_PILOT_IRC    = "..."
DISCORD_ROLE_PILOT_ACE    = "..."
FRONTEND_URL              = "https://vsd-paddock.vercel.app"
```

---

## 6. Discord Developer Portal Setup

Da fare una volta sola, prima di 10.1.

1. Vai su https://discord.com/developers/applications
2. **New Application** → nome "VSD Paddock"
3. Vai su tab **OAuth2 → General**:
   - Aggiungi Redirect URI: `https://script.google.com/macros/s/{DEPLOYMENT_ID}/exec?action=discordCallback`
   - Copia **Client ID** e **Client Secret** → metti in Script Properties
4. Tab **OAuth2 → URL Generator** (per testare):
   - Seleziona scopes: `identify`, `guilds.members.read`
   - Verifica che l'URL generato sia quello atteso

### 6.1 Reperire gli snowflake ID

**Server (GUILD_ID)**:
- Discord: Impostazioni utente → Avanzate → attiva "Modalità sviluppatore"
- Click destro sul nome del server VSD nella sidebar → "Copia ID server"

**Role ID** (per ogni ruolo VSD):
- Impostazioni server → Ruoli
- Click destro sul ruolo "Pilota VSD LMU" → "Copia ID ruolo"
- Ripeti per IRC e ACE

**User ID** (per discord_id nel sheet Drivers):
- Click destro sull'username di un pilota nel server → "Copia ID utente"

---

## 7. Sub-wave Plan

### 7.0 — Backfill `discord_id` (prerequisito operativo)

**Tipo**: data entry, no codice.  
**Stima**: 30 minuti (per 22 piloti)  
**Output**: tutti i piloti VSD attivi hanno `discord_id` popolato.

**Step**:
1. Aggiungi colonna `discord_id` al sheet Drivers (B, dopo driver_id).
2. Attiva Modalità sviluppatore su Discord (Impostazioni → Avanzate).
3. Per ogni pilota nel sheet Drivers con status=active:
   - Trova il suo username sul server VSD
   - Click destro → Copia ID utente
   - Incolla nel sheet
4. Verifica: filtra sheet → drivers attivi con `discord_id` vuoto → 0 risultati.

**Accept criteria**:
- Tutti i 22+ piloti attivi hanno snowflake nel campo `discord_id`.
- Nessun typo (gli snowflake sono 17-19 cifre, no caratteri non-numerici).

---

### 7.1 — Discord OAuth flow backend (Apps Script)

**Stima**: 2 ore  
**File toccati**:
- `discordAuth.gs` (nuovo)
- Router doGet/doPost (estendi per action=discordCallback)

**Cosa fare**:
1. Setup Discord app (sezione 6).
2. Popola Script Properties.
3. Implementa `handleDiscordCallback(code)` come da sezione 4.2.
4. Implementa `classifyDiscordUser_(discordId, roles, isMember)`.
5. Modifica router doGet per gestire `action=discordCallback`.
6. Riusa `generateHmacToken_()` esistente, ma estendi il payload del token per includere `tier` e `sims`.
7. Crea nuova **versione** della Web App (Distribuisci → Gestisci distribuzioni → nuova versione).

**Test manuale**:
- Apri `https://script.google.com/.../exec?action=discordCallback&code=test` → deve dare errore "code invalid" (non crash).
- Fai un OAuth completo via URL Generator Discord → verifica nel Logger Apps Script che user info + roles vengano fetchate.
- Verifica che il redirect finale punti a `{FRONTEND_URL}/auth/callback?token=...`.

**Accept criteria**:
- Backend gestisce 3 scenari: utente admin (te), utente guest mock, utente con ruolo VSD ma senza discord_id nel sheet.
- HMAC token generato include `tier` + `sims` correttamente.
- Errori loggati ma non crashano.

---

### 7.2 — Frontend login page + callback handler

**Stima**: 1.5 ore  
**File toccati**:
- `src/pages/Login.jsx` (rewrite)
- `src/pages/AuthCallback.jsx` (nuovo)
- `src/App.jsx` (nuova route /auth/callback)
- `src/hooks/useAuth.js` (login() ora redirect a Discord)

**Cosa fare**:
1. `Login.jsx`: rimuovi il form admin (o spostalo dietro "Login staff" link discreto), aggiungi bottone primario "Accedi con Discord".
2. Click bottone → redirect a `https://discord.com/oauth2/authorize?client_id=...&redirect_uri=...&response_type=code&scope=identify%20guilds.members.read`.
3. `AuthCallback.jsx`: legge `?token=` da query string, salva in localStorage, redirect home appropriata in base al tier.
4. Loading state + error handling (cancel OAuth, server down).

**Test manuale**:
- Apri /login → vedo bottone "Accedi con Discord".
- Click → atterra su Discord → consenso → torno su VSD Paddock.
- Se sono admin/pilot: atterro su Mission Control.
- Se sono guest: atterro su Guest Home (sub-wave 10.6).

**Accept criteria**:
- Login flow end-to-end funzionante.
- Errore graceful se utente nega consenso (back to /login con messaggio).
- Token persistito 7 giorni.

---

### 7.3 — Auth state esteso (`useAuth`)

**Stima**: 1 ora  
**File toccati**:
- `src/hooks/useAuth.js`
- `src/context/AuthContext.jsx`

**Cosa fare**:
1. Estendi token decode per leggere `tier` e `sims`.
2. Aggiungi state `tier` e `sims` al context.
3. Esponi helper `isAnonymous`, `isGuest`, `isVsdPilot`, `isStaff`, `isAdmin`, `hasAtLeast(tier)`.
4. Backward compat: `isStaff`, `isAdmin` continuano a funzionare come oggi.

**Test manuale**:
- Loggato come admin → `isAdmin === true`, `hasAtLeast('pilot_vsd') === true`.
- Loggato come pilot generico (Discord member senza ruoli VSD) → `isGuest === true`.
- Non loggato → `isAnonymous === true`.

**Accept criteria**:
- Tutti i componenti che usano `useAuth` continuano a funzionare senza modifiche.
- Nuovi helper disponibili.

---

### 7.4 — Permission gating UI

**Stima**: 2 ore  
**File toccati**:
- `src/components/auth/RequireTier.jsx` (nuovo)
- `src/App.jsx` (route guards)
- `src/pages/BestLaps.jsx` (nasconde tab "I miei tempi" per guest)
- `src/pages/DriverProfile.jsx` (404 per guest? o solo redirect?)
- `src/pages/Landing.jsx` (intera logica condizionale)
- `src/components/dashboard/MyDominantClassesWidget.jsx` (skip render per guest)

**Cosa fare**:
1. Crea componente `<RequireTier min="pilot_vsd">{children}</RequireTier>` che mostra children solo se tier >= min, altrimenti mostra messaggio + CTA Discord.
2. Wrappa route protette in App.jsx con tier minimo.
3. Per componenti inline (es. Best Laps tab "I miei tempi"), usa check `useAuth().isVsdPilot && ...`.
4. Decidi UX per guest che tenta di accedere a route protetta: redirect a /guest-home con toast "Servono privilegi pilota VSD" — più amichevole di 403.

**Test manuale**:
- Da guest: provo a navigare manualmente a `/roster/VSD005` → redirect.
- Da guest: in /laps NON vedo il tab "I miei tempi".
- Da pilot_vsd: tutto come oggi.

**Accept criteria**:
- Visibility matrix sezione 3 implementata interamente.
- Nessun leak di dati: anche se un guest indovina un URL, la API backend deve rifiutare (gate sia frontend che backend).

---

### 7.5 — Guest landing showcase

**Stima**: 2 ore  
**File toccati**:
- `src/pages/AnonymousHome.jsx` (nuovo) — vetrina pubblica
- `src/pages/GuestHome.jsx` (nuovo) — landing per guest loggati Discord
- `src/components/showcase/HeroSection.jsx` (nuovo)
- `src/components/showcase/UpcomingRacesPublic.jsx` (nuovo)
- `src/components/showcase/RosterTeaser.jsx` (nuovo)
- `src/components/showcase/JoinDiscordCTA.jsx` (nuovo)
- `src/App.jsx` (routing: tier='anonymous' → /, tier='guest' → /, tier='pilot_vsd' → /mission-control)

**Cosa fare**:
1. Anonymous home (sezione 4.4): hero + CTA login + prossime gare + ultime 3 race + grid roster + footer CTA.
2. Guest home: sostanzialmente uguale ma con badge "Bentornato {discord_name}" e accesso a /race/* e /laps (leaderboard) + CTA "Diventa pilota VSD" più prominente.
3. Routing in `App.jsx`: la "/" mostra Anonymous, Guest, o Mission Control in base al tier.

**Design notes**:
- Layout differente da Mission Control: più "marketing", meno "dashboard".
- Colori: stesso design system, ma più "respirato", maggiori white space.
- CTA Discord come bottone grande con icona Discord.
- Per roster anonymous: avatar+nome ma non clickable (l'idea è teaser, non navigazione).

**Accept criteria**:
- Anonymous home renderizza senza chiamate API che richiedono auth.
- CTA "Accedi con Discord" su Anonymous, "Diventa pilota VSD" su Guest.
- Niente errori console / 401 / 403 per anonymous.

---

### 7.6 — Refresh tier on-demand

**Stima**: 30 min  
**File toccati**:
- `src/hooks/useAuth.js`
- Apps Script `authRefresh` endpoint

**Cosa fare**:
1. Endpoint Apps Script `auth.refresh` che, dato un token HMAC valido, rilegge ruoli Discord (riusa access_token Discord salvato? o servirebbe re-OAuth?) e rigenera token con tier aggiornato.
2. Frontend espone `useAuth().refresh()` che chiama l'endpoint.
3. UX: dopo che admin assegna ruolo VSD a un guest, il guest può cliccare "Aggiorna" nel menu utente per vedersi promosso senza fare logout.

**Edge case**: l'access_token Discord scade in ~1h. Per re-fetchare ruoli oltre quel limite, servirebbe il refresh_token Discord (ottenibile salvandolo lato server in Properties o sheet criptato). Implementazione: skip per ora, basta logout/login. Lo annoto come debito di Wave 10.x se diventa annoying.

**Accept criteria**:
- `useAuth().refresh()` esposto.
- Bottone "Aggiorna stato" nel menu utente.

---

### 7.7 — Cleanup + integrazione test

**Stima**: 1 ora  
**File toccati**:
- `src/components/race/RaceResultsSection.jsx` (rimuovi prop `drivers` morta — debito 9.15)
- `src/pages/RaceDetail.jsx` (rimuovi `drivers={drivers}` non più necessario)
- `README.md` (sezione auth aggiornata)

**Cosa fare**:
1. Rimuovi la prop `drivers` dalla chain `RaceDetail → RaceResultsSection → ResultsTable → getDriverName` perché ora il nome viene sempre da `driver_name_external` (decisione Wave 9.15).
2. Aggiorna README con nuovo flow auth.
3. Test end-to-end manuale: anonymous → login Discord → guest → ammin promuove → logout/login → pilot_vsd.

**Accept criteria**:
- Prop morta rimossa.
- README descrive correttamente i 4 tier.
- Test e2e completo passa.

---

## 8. Decisioni di Scope — Cosa NON fare in Wave 10

- ❌ **Discord webhooks per sync real-time ruoli**: troppo complesso per il volume del team. L'utente fa logout/login per vedere il cambio.
- ❌ **Multi-server support**: siamo solo su `gs5rR3DQay`, hardcodiamo.
- ❌ **Login con altri provider** (Google, GitHub): solo Discord.
- ❌ **Profilo editabile dai Discord users**: il roster è gestito da Demetrio nel sheet.
- ❌ **Notifiche Discord da web app**: separato, già esistono (sub-wave precedente).
- ❌ **Refresh token Discord persistito**: il nostro HMAC token basta per il session, no necessità di mantenere il refresh Discord.
- ❌ **Onboarding flow automatico** (form "voglio entrare al team"): per ora la conversion va via DM/canale Discord, non via web.

---

## 9. Rischi e Mitigazioni

| Rischio | Probabilità | Impatto | Mitigazione |
|---------|:-----------:|:-------:|-------------|
| Discord cambia OAuth API | Bassa | Alto | Versioning esplicito API v10 (URL `discord.com/api/v10/...`) |
| Client secret leak su GitHub | Bassa | Critico | Solo in Script Properties, MAI nel codice. Aggiungi pre-commit hook `git diff` check. |
| Snowflake sbagliati nel sheet | Media | Medio | Validazione lato Apps Script (regex `^\d{17,19}$`) prima di salvare |
| User rifiuta consenso OAuth | Alta | Basso | Redirect a /login con messaggio "Hai negato l'accesso" + bottone retry |
| Rate limit Discord API | Bassa | Medio | Cache utente in memoria Apps Script per 5 min (CacheService) |
| Pilota VSD senza discord_id | Media | Medio | Logger.log warning + fallback tier=guest (sezione 4.2) |
| Sheet Drivers concurrent edit | Bassa | Basso | Apps Script lock service durante write |
| Apps Script 6 min timeout | Bassa | Medio | OAuth callback è sync e veloce (~2s), non rischio |

---

## 10. Acceptance Criteria — Wave 10 chiusa quando

1. ✅ Visitatore anonymous vede landing pubblica con prossime gare, ultime race, roster teaser, CTA Discord.
2. ✅ Visitatore clicca "Accedi con Discord" → completa OAuth → atterra sulla home appropriata al suo tier.
3. ✅ Un Discord member senza ruoli VSD diventa `guest`, vede Race Hub e Best Laps Leaderboard ma NON "I miei tempi" né Mission Control.
4. ✅ Un Discord member con ruolo "Pilota VSD LMU" diventa `pilot_vsd` con `sims=['LMU']`.
5. ✅ Demetrio (admin) entra come `admin` regardless of Discord roles (sheet wins).
6. ✅ Promozione da guest a pilot_vsd richiede assegnazione ruolo Discord + logout/login.
7. ✅ Nessun guest può vedere dati riservati (gating frontend + backend).
8. ✅ Sheet Drivers `discord_id` popolato per tutti i piloti attivi.
9. ✅ Discord app configurata in Developer Portal con redirect URI corretto.
10. ✅ Production deploy su Vercel + nuova versione Apps Script attiva.

---

## 11. Branch Strategy

```
main
  └── wave-10-discord-auth  (branch principale Wave 10)
        ├── commits per sub-wave 10.0 (data) — NO commit (è solo sheet)
        ├── commits per 10.1 (Apps Script — se vuoi metterlo nel repo)
        ├── commits per 10.2 (frontend login)
        ├── commits per 10.3 (useAuth)
        ├── commits per 10.4 (gating)
        ├── commits per 10.5 (showcase)
        ├── commits per 10.6 (refresh)
        └── commit per 10.7 (cleanup + README)
```

**Strategia commit**: uno per sub-wave, messaggi tipo:
- `feat(auth): backend Discord OAuth flow (Wave 10.1)`
- `feat(auth): login page + callback handler (Wave 10.2)`
- `feat(auth): extended tier-based auth state (Wave 10.3)`
- `feat(auth): permission gating across UI (Wave 10.4)`
- `feat(home): anonymous + guest landing showcase (Wave 10.5)`
- `feat(auth): on-demand tier refresh (Wave 10.6)`
- `chore(auth): cleanup dead drivers prop + README (Wave 10.7)`

Merge in main solo a fine wave, dopo test e2e completo.

---

## 12. Ordine di esecuzione consigliato

```
[sheet]  10.0 backfill discord_id          ← prerequisito, 30min
[setup]  Discord Developer Portal + props  ← 30min
   ↓
[backend]  10.1 OAuth flow                 ← 2h
   ↓
[frontend] 10.3 useAuth esteso             ← 1h   (prima di 10.2: serve lo stato)
   ↓
[frontend] 10.2 login page + callback      ← 1.5h
   ↓
[frontend] 10.4 permission gating          ← 2h
   ↓
[frontend] 10.5 showcase landing           ← 2h
   ↓
[polish]   10.6 refresh + 10.7 cleanup     ← 1.5h
   ↓
[deploy]   merge + Vercel + Apps Script    ← 30min
```

**Totale netto**: 10–11 ore + setup. Spalmate su 3-4 sessioni di 2-3h ciascuna nei prossimi 7-10 giorni.

---

## 13. Domande aperte / decisioni future

Da risolvere in corso d'opera, non bloccano l'apertura:

- **Notifiche Discord per nuova registrazione**: quando un guest fa primo login, vuoi essere notificato sul canale staff? (Riusiamo l'integrazione Discord notification esistente di Wave 9.13).
- **Onboarding form**: form web "voglio entrare al team" come alternativa al "scrivi su Discord"? Probabile in Wave 10.x successiva.
- **Sim affinity filtering**: usiamo `sims` derivati dai ruoli Discord per filtrare le viste? Es. "Pilota VSD LMU" vede tab LMU di default su Best Laps. Decidiamo in 10.4 quando facciamo gating.
- **Anonymous mode "discreto"**: i visitatori che già hanno il token in localStorage vengono auto-riconosciuti, ma quelli senza vedono solo anonymous. È OK?

---

## 14. Closing notes

Questo spec è il riferimento ufficiale di Wave 10. Salvalo nel repo come `docs/WAVE_10_DISCORD_AUTH.md` e committalo prima di iniziare:

```powershell
git checkout main
git pull origin main
git checkout -b wave-10-discord-auth
mkdir docs -ErrorAction SilentlyContinue
# (copy il file qui dentro)
git add docs/WAVE_10_DISCORD_AUTH.md
git commit -m "docs: Wave 10 Discord OAuth spec"
git push origin wave-10-discord-auth
```

Da qui in poi tutti i commit Wave 10 finiscono in questo branch fino al merge finale.

Quando vuoi aprire — dopo Lumh — diciamo "go" e partiamo dalla sub-wave 10.0 (backfill `discord_id`).
