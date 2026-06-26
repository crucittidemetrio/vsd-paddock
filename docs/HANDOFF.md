# VSD Paddock — Handoff per nuova chat

**Data**: giugno 2026
**Stato repo**: `main` @ `f64a1db`
**Prod**: `https://vsd-paddock.vercel.app`

---

## Contesto strategico

Il team NON corre più la 6h del 30 giugno. Obiettivo: **24h di Le Mans, 24-25 ottobre 2026**, con **6h pubblica VSD di collaudo a fine settembre** (data/tracciato da definire) come prova generale.

Roadmap in `docs/Roadmap-LeMans-2026.md`. Linea singola: igiene tecnica → StintPlanner → collaudo 6h → fix. **Sviluppo finisce fine agosto; settembre = collaudo, non costruzione.**

Vincolo budget token Claude → ripartizione: **Claude** = design/debug/review; **Gemini** = volume su brief chiusi. Il modello ha funzionato sul primo task (design Claude → codice Gemini → review Claude che ha pescato 2 bug → clasp push → test → commit).

---

## FASE 0 — chiusa ✓

clasp operativo. Flusso backend ora: modifica `apps-script/` in locale → `clasp push` (allinea web ← locale) → Deploy "Nuova versione" dall'editor → `clearAllCaches()`.
- 28 file sincronizzati, formato `.js` uniforme (eliminato misto .gs/.js)
- funzioni di test rimosse dal web
- token clasp in `.gitignore` (`.clasprc.json` mai committare; vive in `$env:USERPROFILE`)
- `.clasp.json` in root con `scriptExtensions: [".js"]`
- snapshot di sicurezza in `C:\Users\Demetrio\Dev\apps-script-web-snapshot` (può essere eliminato)

---

## FASE 1 — StintPlanner — ✅ COMPLETATA E COLLAUDATA (giugno 2026)

**Intero StintPlanner chiuso, integrato e provato end-to-end in PRODUZIONE su gara reale
"Le Mans Default (WEC)".** Ciclo di vita stint collaudato: genera → valida (client-side, live)
→ conferma (scrittura batch) → replace_existing (anti-doppione, verificato: 8→4 senza accumulo)
→ delete dalla UI. Tutti i pezzi lavorano insieme.

File UI: `src/pages/StintPlanner.jsx` + `StintPlanner.module.css`. Route in App.jsx
(`/admin/race/:raceId/stint-planner`, wrapper `<AdminRoute>`, lazy). Bottone accesso
"⚡ Pianifica automaticamente" in AdminRaceStints.jsx. Tutto su main @ f64a1db.

Note di collaudo: il primo "Genera" ha dato "Action sconosciuta: endurance.stints.generate"
perché la web app Apps Script serviva una versione vecchia — risolto con Deploy "Nuova versione"
(ricordare SEMPRE dopo clasp push). Un "Permessi insufficienti" sul delete era solo sessione
diversa (portatile vs PC principale) — risolto con logout/login. Gating funziona correttamente.

Gara di test "Le Mans Default (WEC)" TENUTA come banco di prova permanente (0 stint, pronta
per ritestare il planner in futuro).

### PROSSIMI CANDIDATI (post Fase 1)
1. **AdminRaceForm — creare/cancellare gare dalla UI** (NUOVO, richiesto da Demetrio).
   Oggi le gare si creano/cancellano SOLO a mano nello sheet Races. Serve UI admin per chiudere
   il flusso "crea gara → pianifica stint → corri" tutto nel paddock.
   ⚠ VERIFICATO (Select-String): NON esiste backend races.add/create/remove/update. Va costruito
   il giro COMPLETO da zero:
   - backend: handleRacesAdd / handleRacesRemove (+ Update?) in Races.js, registrati in Codice.js
   - layer API: namespace + adapter passthrough in client.js / realApi.js
   - frontend: form (pattern come AdminEnduranceForm esistente) + route admin + integrazione
   Pezzo sostanzioso ma più semplice degli stint (gara = riga piatta, niente rotazione/validazione).
   Attenzione alle convenzioni: race_id sim-prefissato (es. lmu-monza-gp), format endurance per
   abilitare gli stint, ISO dates, eventuali booleani UPPERCASE. Sessione dedicata.
2. **Bug DST (Opzione B1)** prima di Le Mans — vedi analisi approfondita più sotto. Non blocca
   settembre. Da affrontare in TZ Europe/Rome con tempo (decisione architetturale su formato date).
3. **Limiti piloti nel validatore (v2)**: ore max/pilota, riposo minimo. Rimandato da v1.

---

## FASE 1 — StintPlanner — dettaglio costruzione (storico)

### Decisioni di design v1 (prese)
- **Propone-e-conferma**: generate calcola SENZA scrivere; admin rivede; conferma scrive.
- **Rotazione ciclica** piloti (A,B,C,A,B,C…).
- **Durata fissa**: ogni stint = target, ultimo assorbe il resto (somma esatta).

### Micro-task 1 — Generatore — COMPLETATO ✓
- `handleEnduranceStintsGenerate(payload, ctx)` + helper `_esToNaiveIso_` in `EnduranceStints.js`.
- Registrato in `Codice.js`: `endurance.stints.generate`.
- Input: `{ race_id, race_start_time (ISO naive es. "2026-10-24T15:00:00"), total_duration_min, target_stint_min, driver_ids[] }`.
- Output: `ok({ stints[], count, total_duration_check })`. Stint: `{ stint_order, driver_id, planned_start_time, planned_end_time, planned_duration_min }`.
- Auth: `_esIsStaff_` interno (staff/admin).
- Funzione pura (non scrive sheet). Testato 24h/90min/3 piloti: count 16, durata 1440, rotazione e continuità OK, orari naive senza Z (fix timezone confermato — NON usare `.toISOString()`, shifta in UTC).

### BUG NOTO — DST — ANALISI APPROFONDITA (da gestire PRIMA di Le Mans; NON blocca settembre)

**Sintomo originale**: generando una 24h che parte 24 ott 15:00, l'ultimo stint mostra etichetta "25 ott 14:00" invece di 15:00 (un'ora "sparita"). Causa: la notte del 25 ott 2026 in Europa le lancette tornano 03:00->02:00 (fine ora legale).

**Decisione: Opzione B1** — conta il TEMPO REALE (cronometro). A Le Mans la bandiera cade 24h reali dopo la partenza; l'orologio da muro è solo etichetta. (Confermato regolamentarmente.)

**Cosa abbiamo capito (analisi giugno 2026)**:
- Il generatore avanza in MILLISECONDI ASSOLUTI (`currentStartTimeMs += durationMin*60000`). I ms assoluti SONO tempo reale, non sanno del DST. Quindi durata stint e totale (1440 min reali) sono GIÀ CORRETTI in B1. Il "14:00" era solo l'ETICHETTA locale prodotta da `_esToNaiveIso_` che riflette il salto — comportamento CORRETTO in B1, non un bug di calcolo.
- Quindi in B1 NON c'è bug nel calcolo. Il problema è solo di RAPPRESENTAZIONE + ROUND-TRIP.

**Il vero rischio residuo (round-trip dell'ora ambigua)**:
- La notte del cambio, l'ora 02:00-03:00 locale si RIPETE. Una stringa naive "2026-10-25T02:30:00" è AMBIGUA: prima o seconda occorrenza? Quando viene riparsata con `new Date(iso)` (nel validatore o nella UI), il runtime sceglie UNA delle due → uno stint potrebbe essere collocato 1h prima/dopo → falso overlap/gap.
- Dipende dal TIMEZONE del runtime: Apps Script (TZ Europe/Rome) e browser admin (TZ Italia) hanno il DST → rischio presente. Container di test era UTC → NON riproduce il problema, NON testabile lì.

**Soluzione probabile (decisione ARCHITETTURALE, non patch)**:
- Per disambiguare l'ora ripetuta serve l'OFFSET ESPLICITO negli orari: "02:30+02:00" (CEST, prima) vs "02:30+01:00" (CET, seconda).
- MA tutto il sistema usa ISO NAIVE senza offset (StintTimeline, AdminRaceStints, formato sheet). Introdurre l'offset tocca TUTTO il formato date del paddock. Va deciso e propagato con cura, NON di fretta.

**Come affrontarlo quando si farà**:
1. Riprodurre in un ambiente con TZ Europe/Rome (Apps Script reale, o Node con TZ='Europe/Rome').
2. Decidere: introdurre offset espliciti negli orari endurance (almeno per le gare che attraversano il cambio ora) oppure tenere naive + flag/annotazione sullo stint ambiguo.
3. Il validatore (validatePlanCoverage + backend) va aggiornato di conseguenza per non segnalare falsi gap/overlap sull'ora ripetuta.
4. La UI mostrerà un avviso "cambio ora" sugli stint interessati.

**NON blocca la 6h di settembre** (non attraversa il cambio ora). Morde solo a Le Mans 24-25 ott.

### _SEZIONE DST ORIGINALE (storica)_
La notte del 25 ott 2026 in Europa le lancette tornano indietro di 1h (03:00→02:00). Il generatore lavora in ms assoluti ma `_esToNaiveIso_` legge `getHours()` locale → un'ora "sparisce": somma durate 1440 min ma intervallo orario reale 1380 min.
- **Decisione presa: Opzione B** — il piano riflette la realtà fisica (tempo reale, non etichetta orologio). Lo stint che attraversa il cambio ora dura la sua durata reale; le lancette avanzano diversamente.
- La 6h di settembre NON attraversa il cambio ora → generatore valido per il collaudo. Il bug morde solo a Le Mans.

### Micro-task 2 — Validatore copertura — COMPLETATO ✓
- `handleEnduranceStintsValidateCoverage(payload, ctx)` in `EnduranceStints.js`.
- Registrato in `Codice.js`: `endurance.stints.validateCoverage`.
- v1 valida: gap, overlap, copertura totale (start_mismatch/end_mismatch). Limiti piloti RIMANDATI.
- Validazione basata sugli ORARI (non sulle durate dichiarate): come effetto collaterale intercetta anche il bug DST (un piano che attraversa il cambio ora mostrerebbe end_mismatch).
- Input: `{ race_id, race_start_time (ISO naive), total_duration_min }`.
- Output: `ok({ valid, issues[], stint_count })`. Issue: `{ type, message (it), stint_order?, delta_min? }`. Tipi: no_stints, invalid_times, start_mismatch, end_mismatch, gap, overlap.
- Tolleranza 5s sui confronti (no falsi positivi da rumore al secondo).
- **Testato** sulla 6h di Spa (stint di test incoerenti): valid=false, pescato overlap 19 min stint 1-2 e end_mismatch -180 min. Preciso, nessun falso positivo.
- Funzione di test `testEsValidate` in locale (usa-e-getta).

### Micro-task 3 — Conferma piano — COMPLETATO ✓
- `handleEnduranceStintsConfirmPlan(payload, ctx)` in `EnduranceStints.js`.
- Registrato in `Codice.js`: `endurance.stints.confirmPlan`.
- Scrive in batch gli stint generati. Input: `{ race_id, stints[], replace_existing }`.
- `replace_existing` esplicito (booleano): se true cancella gli stint esistenti della gara e riscrive; se false e ne esistono già → fail. Sicurezza anti-cancellazione accidentale.
- Riusa `_esLoadAll_`, `_esDeleteRowById_`, `_esGenerateStintId_`, `_esAppendRow_`, `_esInvalidateCache_`. Cache invalidata una volta sola alla fine.
- Output: `ok({ written, replaced, race_id })`.
- Review: verificato che `_esDeleteRowById_` legge il foglio diretto (`getDataRange().getValues()`, non cache) → delete in sequenza sicure nonostante shift indici. NON testato in editor (sporcherebbe il foglio; logica verificata per review, si testa col frontend su dati veri).

### BACKEND STINTPLANNER COMPLETO ✓ — genera → valida → conferma

### Micro-task 5 — Motore frontend (validatore client + hook) — COMPLETATO ✓
- `src/utils/stintValidation.js`: funzione PURA `validatePlanCoverage(stints, raceStartTime, totalDurationMin)` → `{ valid, issues }`. Traduzione JS della logica backend (gap/overlap/copertura/mismatch, tolleranza 5s). Istantanea, no rete.
- `src/utils/stintValidation.test.js`: 6 test Vitest (valido/gap/overlap/end_mismatch/vuoto/input-invalido). Suite totale ora 61 test verdi.
- `src/hooks/useStintPlanner.js`: hook orchestratore. Stato `plan` in memoria (con `_localId` per editing), `validation`, flag async, `error`. Funzioni: `generate` (chiama backend, popola plan), `updateStintInPlan` (modifica in RAM, azzera validation), `validate` (CLIENT-SIDE via validatePlanCoverage, sincrono), `confirm` (scrive via confirmPlan, rimuove _localId), `reset`.
- **STRADA 3 confermata**: validazione del piano PROPOSTO lato client (istantanea); il validateCoverage BACKEND resta per i piani PERSISTITI (es. modifiche manuali in AdminRaceStints). Due strumenti, due momenti — tenere logica in sync se cambiano le regole.

### Micro-task 4 — Layer API frontend — COMPLETATO ✓
- `client.js`: namespace `api.endurance.stints` esteso con `generate`, `validateCoverage`, `confirmPlan`.
- `realApi.js`: 3 case nel dispatcher + 3 adapter passthrough (`enduranceStints{Generate,ValidateCoverage,ConfirmPlan}Adapter`).
- Pattern passthrough puro (no unwrap; `call()` fa l'unwrap di `.data`). Nei componenti leggere `response?.stints`, `response?.valid`, ecc.
- Build verde. Cablaggio puro frontend (no backend, no clasp).
- Endpoint ora raggiungibili: `api.endurance.stints.generate(payload)`, `.validateCoverage(payload)`, `.confirmPlan(payload)`.

### PROSSIMI micro-task
1. **UI StintPlanner** (PEZZO GROSSO, sessione dedicata con skill frontend-design): componente React che consuma `useStintPlanner`. Form parametri (race_id, race_start_time, total_duration_min, target_stint_min, driver_ids) → bottone Genera → TABELLA EDITABILE del piano (cambia pilota/orari per stint via updateStintInPlan) → bottone Valida (mostra issues) → bottone Conferma (confirmPlan con replace_existing). Decisione presa: editabile prima della conferma. Validazione live possibile (è client-side, gratis) o on-demand.
2. **Limiti piloti** nel validatore (v2): ore max per pilota, riposo minimo tra stint. Rimandato da v1.
3. **Bug DST (Opzione B)** prima di Le Mans. Il validatore lo intercetta già (end_mismatch).

### STATO FASE 1: backend completo + layer API + motore frontend FATTI. Resta solo la UI.

---

## Lezioni operative consolidate

1. **Diagnosi: guarda subito la chiamata di rete vera** (payload richiesta + risposta) PRIMA di ipotizzare cache/deploy/codice. Il bug roster costò 1 ora di diagnosi alla cieca.
2. **clasp**: fonte di verità = locale. `clasp push` allinea il web; le funzioni di test aggiunte SOLO nel web spariscono al push (ok, sono usa-e-getta — ma se le vuoi tenere, mettile in locale).
3. **Se `npm run build` fallisce, NON committare.** Comandi separati, non incatenati.
4. **Apps Script**: dopo push, serve Deploy "Nuova versione" perché la web app pubblica cambi (i test interni girano sul codice salvato, la web app sulla versione deployata).
5. **Timezone**: nel backend usare ISO naive (senza Z); `.toISOString()` shifta in UTC e rompe gli orari.
6. **Verifica sempre il log riga per riga**: il bug DST è emerso solo controllando che 15:00→14:00 fossero 23h e non 24h.

---

## Stato tecnico

- Git: `gc.auto=0 + autocrlf=true` → usare `git -c gc.auto=0 push`
- Apps Script standalone ID: `1IbLOiw4tiljIN8s8dG8g-RedIyf9QV_wL9JWtzXCJ0-FUCQ5wTu5ryza`
- VSD_HUB_DB ID: `1ADUq7CRy0_PtPqbPYS42iCNgpdxZrNlSMY3HX6T8XQA`
- Repo: `C:\Users\Demetrio\Dev\vsd-paddock`
- Cache: Races 15 min, roster 600s, stint 300s → `clearAllCaches()` per propagare
- Schema `EnduranceStints`: 20 colonne, regge la 24h senza modifiche (confermato). StintPlanner è un LAYER DI LOGICA sopra, non nuovo sheet.
- Download dalla chat atterrano in posti variabili → `Get-ChildItem -Recurse -Filter` prima di spostare

---

## Memoria contestuale VSD

- 25 piloti attivi pubblici (28 totali incl. inactive; VSD001 = account sistema, escluso ovunque)
- 4 sim (LMU primario, simulatore preferito di Demetrio)
- Discord OAuth Wave 10 live; vetrina pubblica live (Discord + IG + FB)
- Prossimo evento: 6h pubblica VSD di collaudo, fine settembre 2026
- Ritmo sviluppo: ~1h/sera, vincolato da budget token

---

## Comandi quick-start

```powershell
cd C:\Users\Demetrio\Dev\vsd-paddock
git log --oneline -8
git status
clasp status
git ls-remote origin main
```

## Apertura raccomandata
> "Fase 1 in corso, generatore stint fatto. Prossimo: validazione copertura inter-stint."
