# ═══════════════════════════════════════════════════════════════
# VSD PADDOCK — HANDOFF STATO COMPLETO (per ripartire in nuova chat)
# Aggiornato: sessione 9 luglio 2026
# ═══════════════════════════════════════════════════════════════

## COME USARMI
Incolla questo documento all'inizio della nuova chat. Contiene: chi sei, stato del
progetto, cosa è fatto, cosa è aperto, e le priorità. Il resto (stack, convenzioni,
tono) è già nella memoria persistente di Claude.

## CHI / COSA
Demetrio Crucitti (VSD005, #69), founder e unico dev di VSD Paddock — web app per il
suo team sim racing endurance. Stack: React 19 + Vite + TanStack Query → Vercel; backend
Google Apps Script + Sheets. Repo: crucittidemetrio/vsd-paddock. Locale:
C:\Users\Demetrio\Dev\vsd-paddock. Claude agisce come team principal e-sports + senior dev:
critico, frena lo scope creep, verifica invece di assumere.

## ⚠️ PRIORITÀ NUMERO UNO (con scadenza reale): IMOLA 4h
- La 4h di Imola è tra POCHI GIORNI. Possibile partecipazione con PIÙ EQUIPAGGI.
- È la PRIMA gara reale su cui si usa il paddock live.
- NON è ancora stato deciso NULLA: numero equipaggi, durata stint, notifiche.
- Ogni volta che si prova a pianificarla, la conversazione devia su altri debug.
  Il team principal ha ripetutamente segnalato che questo è il rischio principale.

### Cosa serve da Demetrio per pianificare Imola (BLOCCANTI):
1. Quanti equipaggi (anche stima).
2. Durata prevista stint (min/stint → quanti stint per auto in 4h).
3. Notifiche: opzione 2 (push su 1 equipaggio, timeline web per tutti) — RACCOMANDATA —
   oppure multi-canale (richiede sviluppo, sconsigliato a ridosso gara).

### Strada operativa GIÀ DECISA (zero codice nuovo, sistema collaudato):
- UNA "gara" per equipaggio (nome esplicito con numero auto, es. "Imola 4h - Eq.1 #NN").
- StintPlanner per ciascuna (piloti dell'equipaggio, durata 240 min).
- Giorno gara: ogni gara → status `in_progress` + clearAllCaches() + accendere notifiche
  (Script Property STINT_NOTIFY_ENABLED = 'true'). A fine gara → `completed` + spegnere notifiche.

## ✅ FATTO E OPERATIVO (sessioni recenti)
- Sistema stint completo: StintPlanner, gestione, Swap pilota live (L1), StintTimeline
  pubblica con stato tempo-reale + auto-refresh 30s.
- Fix cache stint (letture sempre fresche via sheetToObjects, no cache).
- Gare in_progress visibili nel Race Hub (tab Programmate, in cima).
- Fix matching standings: matchDriverNameStrict_ (solo match esatto) + chiave real_name
  in buildDriverNameMap_. Distingue omonimi (Paneri VSD vs Ponchiardi esterno). real_name
  di tutti i piloti COMPILATI.
- Notifiche Discord pre-stint: OPERATIVE con interruttore.
  - Funzioni in Notifications.js: checkStintNotifications_ (+ wrapper runStintNotificationsCheck),
    _snLoadInProgressRaces_, _snDriverName_, _snSendStintAlert_.
  - Trigger time-driven ogni 5 min ATTIVO.
  - INTERRUTTORE: Script Property STINT_NOTIFY_ENABLED. Se != 'true' la funzione esce subito
    (~0.8s overhead, zero lavoro). ATTUALMENTE = 'false' (spento). Accendere solo in gara.
  - Notifica ~30 min prima di ogni stint + primo stint = "Via!". Messaggio AL CANALE, no menzione.
  - Anti-spam via Script Properties chiave stint_notified_<stint_id>. Testato OK.

## ⚠️ PROBLEMI APERTI (da monitorare / risolvere post-Imola)

### 404 intermittenti + lentezza navigazione
- Sintomo: 404 intermittenti sulle chiamate Apps Script, pagine lente, dati che
  appaiono/spariscono.
- Diagnosi parziale: le Esecuzioni Apps Script COMPLETANO tutte (no crash, no quota
  esaurita evidente). Ma la Landing fa 11 FETCH al primo load (con duplicati:
  useBestLaps ×2, useReports ×2, useMyRecentRaceResults + useRecentTeamRaceResults),
  ognuno ~2s su Apps Script. Il Race Hub ~24 chiamate. Il trigger notifiche girava
  a vuoto 288×/giorno (ORA SPENTO via interruttore → una fonte di consumo rimossa).
- Sospetto: consumo cumulativo quota UrlFetch/runtime durante la giornata → 404.
- DA VERIFICARE: se col trigger spento i 404 calano. Se persistono → serve ridurre
  le chiamate per pagina.
- FIX STRUTTURALE (post-Imola): endpoint aggregato backend per la Landing (1 chiamata
  invece di 11). staleTime già configurati (default 60s in main.jsx, ok).

### Anomalia lap (RISOLTA — non era un bug)
- LAP142 (VSD011=Ivan Foggia, LMU Spa, Huracan GT3, 2:19.258, session_type=practice,
  note "Test") non compariva nel profilo/best laps.
- CAUSA: DriverProfile.jsx deduplica per (sim__track_id__car_id) tenendo SOLO il lap
  più veloce per combinazione (uniqueLaps, righe 37-50). 2:19 è un giro di test lento;
  se Ivan ha un lap migliore su Spa+Huracan, LAP142 è correttamente scartato.
- NON è un bug. È il sistema che mostra il best per combo. Caso chiuso.
- Nota dati: alcuni created_at nello sheet BestLaps sono malformati (es.
  "2026-07-09T010:42:14.400Z" — zero di troppo nell'ora). Non bloccante, ma da ripulire.

## 📋 BACKLOG POST-IMOLA (in ordine)
1. Performance: endpoint aggregato Landing (11→1 fetch) — fix 404/lentezza strutturale.
2. Ex-VSD: piloti che hanno lasciato devono risultare "ex" ovunque (non solo inactive).
   DECISO: campo `left_date` (data uscita) + helper centralizzato getDriverBadge(driver)
   usato ovunque invece di is_vsd inline (193 occorrenze su 13 file — NON toccare a mano,
   centralizzare). Badge "EX VSD".
3. Notifiche multi-canale Discord (un canale per equipaggio) — se serve dopo Imola.
4. Banner Campione: oggi incorona il vincitore ASSOLUTO del campionato (anche esterno,
   es. Ponchiardi nella Lumh). Valutare se evidenziare il miglior VSD invece.
5. Swap pilota Livello 2 (ricalcolo a valle + ri-quadro + anteprima editabile).
6. Badge "🔴 LIVE" su card gare in_progress nel Race Hub.
7. Pulizia created_at malformati nello sheet BestLaps.

## FUNZIONI TEST USA-E-GETTA DA RIMUOVERE AL FREEZE
- EnduranceStints.js: dumpStintsRACE012, clearStintsCache, wipeStintsRACE012, testEs*
- Races.js: testRacesAddRemove, dumpRacesHeader, dumpRacesEnums
- Standings.js: testStandings*, testImportStandings*
- RaceResultsImport.js: debug_gianlucaMatch
- BestLaps.js: testLapsList, testLapsLeaderboardSpaFerrari

## REMINDER OPERATIVI
- apps-script/ → clasp push + Deploy "Nuova versione" nell'editor (+ retry se primo 404
  transitorio: dopo un deploy la prima scrittura può dare 404 per qualche secondo).
- src/ → solo git push (Vercel auto-deploya).
- clearAllCaches() dopo modifiche MANUALI allo sheet (non innescano invalidazione).
- Funzioni con _ finale NON appaiono nel dropdown Esegui dell'editor → serve wrapper senza _.
- clasp "already up to date" ma editor non vede la funzione → il file locale non era salvato,
  oppure serve F5 sull'editor. Verificare sempre con Select-String che il codice sia nel file.
- Git: git -c gc.auto=0 push origin main (evita prompt cleanup su Windows).
- MAI incollare webhook/token/API key in chat. Se esposti, rigenerarli.

## STATO SESSIONE CORRENTE
Ultimo tema: caccia (chiusa) all'anomalia LAP142 — risolta, non era un bug (dedup).
Prima ancora: spento il trigger notifiche a vuoto (interruttore STINT_NOTIFY_ENABLED=false).
Il team principal ha ripetutamente richiesto di tornare a IMOLA. Demetrio ha chiesto di
preparare questo handoff prima di procedere. PROSSIMO PASSO NELLA NUOVA CHAT: decidere
Imola (numero equipaggi → piano stint → checklist gara).
