# VSD Pitwall Bridge — scheletro

Bridge locale che legge lo **Scoring buffer** di Le Mans Ultimate (shared
memory, 5Hz) e lo trasmette via WebSocket a un client (il futuro modulo
`/pitwall` di vsd-paddock).

## Cosa fa

- Apre `$rFactor2SMMP_Scoring$` in sola lettura (nessuna scrittura verso il gioco).
- Ogni ~200ms legge posizioni, giri, gap dal leader/dalla vettura davanti,
  stato pit, penalita', meteo/temperature pista.
- Fa broadcast di un JSON a tutti i client WebSocket connessi su
  `ws://localhost:8090/ws/`.

## Cosa NON fa (di proposito)

- **Non legge il Telemetry buffer** (50Hz, dati fisici per pilota) — non
  serve per un pit-wall di gestione gara, solo per un futuro modulo coaching.
- **Non calcola il carburante**: vive nel Telemetry buffer (`mFuel`) ed e'
  affidabile solo per la vettura del giocatore locale, non per i compagni di
  squadra in altre postazioni. Se serve, va aggiunto come sorgente separata
  per-macchina, non nel bridge condiviso.
- **Il live feed (WebSocket) resta locale, non scrive mai su Sheets.** A
  fine sessione, però (vedi sotto), il bridge manda SEPARATAMENTE un
  riepilogo — best lap per pilota — al backend, non l'intero flusso live.

## Origine dei dati

I struct in `RF2Scoring.cs` sono copiati direttamente da `rF2Data.cs`, il
file che il plugin ufficiale `TheIronWolfModding/rF2SharedMemoryMapPlugin`
mantiene sincronizzato a mano con l'header C++ reale — la stessa fonte usata
da TinyPedal, RacePulse e altri tool della community.

**Verificato in sessione (build reale + test di marshalling, non solo
lettura manuale):**
- `dotnet build -c Release` compila pulito (0 errori, 1 warning atteso su
  `MemoryMappedFile.OpenExisting` = solo Windows).
- Round-trip byte→struct→byte su `RF2Scoring` (75312 byte, di cui 74752 per
  i 128 veicoli) identico bit per bit — il layout con array annidati di
  struct (`mOri`, `mVehicles`) non genera eccezioni di marshalling.
- `mUnderYellow`/`mCountLapFlag` confermati `byte` semplici (non enum),
  incrociando un port Go indipendente della stessa struct.

**Verificato anche con LMU reale** (Algarve International Circuit, sessione
pratica, 01/09/2026): `trackTemp`/`ambientTemp` coerenti tra loro, nomi
piloti/vetture decodificati senza corruzione anche con caratteri speciali
(niente sforamento nel campo successivo, quindi il layout è corretto), tempo
sessione che scorre normalmente. Unica imprecisione trovata: il commento su
`mPitState` elencava solo i valori 0-4, ma in gioco compare anche il valore
5 — vedi nota nel codice. Nessun impatto funzionale, il bridge non
interpreta quel valore, lo passa solo al client.

Se in futuro LMU aggiorna l'API con nuovi campi, questi finiscono negli array
`mExpansion`/riservati per compatibilita' futura — il bridge continua a
funzionare, semplicemente non li legge finche' non vengono aggiunti
esplicitamente allo struct.

## Registrazione best lap a fine sessione (pitwall.logSession)

Oltre al live feed via WebSocket, il bridge tiene traccia dell'ultimo
snapshot valido dello Scoring buffer. Quando la sessione LMU finisce (il
buffer smette di rispondere), manda al backend Apps Script il miglior giro
di **ogni pilota in griglia** che ne ha fatto uno valido — non solo il
giocatore locale, perché lo Scoring buffer copre tutta la griglia.

Stesso contratto della companion Python (`companion/fuel_bridge.py`): body
JSON `{action, token, payload}` come `text/plain` verso la stessa Web App
Apps Script, azione `pitwall.logSession`. Il token è personale (pulsante
"Genera token companion" nel profilo VSD-Paddock, staff/admin — la
registrazione scrive dati per tutta la griglia, non solo per il titolare
del token) e viene chiesto al primo avvio, poi salvato in
`Documenti\VSD Paddock\pitwall-config.json` (vedi `PitwallConfig.cs`).

**Cosa NON fa**: non scrive nel tab "manuale" di BestLaps dietro al Muro
dei Record — un giro di una sessione qualsiasi non è automaticamente un
record ufficiale. Finisce in un tab separato (`PitwallSessions`, vedi
`apps-script/PitwallSessions.js`), consultabile nella pagina `/pitwall`
sotto "Sessioni registrate". Se un giro merita di diventare un record
ufficiale, resta una scelta editoriale dello staff col flusso manuale già
esistente.

**Setup una tantum lato backend** (Apps Script editor → ▶ Esegui):
`setupPitwallSessionsTab` — crea il tab se non esiste già, idempotente.

## Setup lato LMU

1. Le Mans Ultimate → Settings → Gameplay → **Enable Plugins**: ON.
2. Riavvia il gioco.
3. Avvia il bridge (`dotnet run`, build x64) mentre LMU e' in sessione.
4. Al primo avvio, se non hai già un token: incollalo quando richiesto (dal
   tuo profilo VSD-Paddock, pulsante "Genera token companion").

## Prossimi passi

- ~~Hook React (`useWebSocket`) lato vsd-paddock per il modulo `/pitwall`~~ — fatto.
- ~~Endpoint Apps Script per lo snapshot di fine sessione~~ — fatto
  (`pitwall.logSession`, best lap per pilota — non uno snapshot completo
  di ogni stint/pit stop, quello resta un possibile step successivo).
