# VSD Paddock — Handoff per nuova chat

**Data**: giugno 2026
**Stato repo**: `main` @ `6406a83`
**Prod**: `https://vsd-paddock.vercel.app`

---

## Contesto strategico (IMPORTANTE — cambio di rotta)

Il team **NON** partecipa più alla 6h del 30 giugno. Nuovo obiettivo: **24h di Le Mans, 24-25 ottobre 2026**, con una **6h pubblica VSD di collaudo a fine settembre** (data/tracciato da definire) come prova generale.

Roadmap completa in `docs/Roadmap-LeMans-2026.md`. Struttura a linea singola: igiene tecnica → StintPlanner → collaudo 6h → fix. Vincolo: budget token Claude limitato → ripartizione Claude (decisioni/debug) / Gemini (volume su brief chiusi).

**Sviluppo deve finire entro fine agosto.** Settembre = collaudo, non costruzione.

---

## Stato lavori chiusi (sessioni precedenti)

**Blocco stint endurance + bugfix — tutto in produzione:**
- TASK 1: UI pubblica StintTimeline read-only in RaceDetail (`ac494c9`)
- TASK 3: guida admin `docs/Guida-Admin-Stint.md` + fix section vuota (`f4fee8e`)
- Bug 1: pilota inactive incluso nel select edit stint (`01f27d5`)
- Bug 3: fallback tier legacy a guest (`6e8260f`)
- Bug roster (VSD010 mostrato invece del nome): risolto su tre layer — backend `Roster.js` (`includeInactive` accetta stringa 'true' + esclude VSD001), adapter `realApi.js` riga 82 (`includeInactive = true` sempre), hook `useRoster.js` ripulito. Commit `b772298`→`4106eca`, più allineamento locale `6406a83`.

**Gara 6h Spa**: creata nel sheet (`lmu-spa-6h-2026-06-30`) con stint di test. Ora NON si corre — resta come dato di test, da rimuovere o ignorare.

---

## Lezioni operative consolidate

1. **Diagnosi: guarda subito la chiamata di rete vera** (Network tab → payload richiesta + risposta) PRIMA di ipotizzare su cache/deploy/codice. Il bug roster è costato 1 ora perché abbiamo diagnosticato alla cieca; la svolta è arrivata leggendo il payload (`includeInactive: false`).
2. **Apps Script NON è sincronizzato col repo Git.** Modifiche a `apps-script/*.js` in locale NON arrivano all'editor web. Vanno riportate a mano + Deploy "Nuova versione" + `clearAllCaches()`. Questo disallineamento è la causa #1 di tempo perso → Fase 0 della roadmap risolve con clasp.
3. **Se `npm run build` fallisce, NON committare.** I comandi incatenati non bloccano il git al fallimento del build. Lanciare build e commit separati.
4. **Adapter roster**: `includeInactive` è calcolato in `realApi.js`, NON passato dall'hook. Modificare l'hook non ha effetto sul parametro inviato al backend.

---

## PROSSIMO PASSO — Fase 0: clasp

1. Installare/configurare `clasp` per sincronizzare il progetto Apps Script standalone col repo (cartella `apps-script/`). Apps Script standalone ID: `1IbLOiw4tiljIN8s8dG8g-RedIyf9QV_wL9JWtzXCJ0-FUCQ5wTu5ryza`.
2. Rimuovere funzioni di test residue dall'editor Apps Script (`testRosterInactive`, `testRosterHandler`, `testRosterFix`, `testFinale`, `trovaColpevole`).
3. Committare `docs/Roadmap-LeMans-2026.md` (creato, non ancora versionato).

Poi Fase 1 — StintPlanner (vedi roadmap per micro-task e ripartizione Claude/Gemini).

---

## Stato tecnico

- Git config `gc.auto=0 + autocrlf=true` (usare `git -c gc.auto=0 push`)
- Apps Script standalone ID: `1IbLOiw4tiljIN8s8dG8g-RedIyf9QV_wL9JWtzXCJ0-FUCQ5wTu5ryza`
- VSD_HUB_DB ID: `1ADUq7CRy0_PtPqbPYS42iCNgpdxZrNlSMY3HX6T8XQA`
- Repo locale: `C:\Users\Demetrio\Dev\vsd-paddock`
- Cache: Races TTL 15 min, roster TTL 600s, stint TTL 5 min → `clearAllCaches()` per propagare
- Nota download: i file dalla chat atterrano in posti variabili → cercarli con `Get-ChildItem -Recurse -Filter` prima di spostare

---

## Memoria contestuale VSD

- 25 piloti attivi pubblici (28 totali nel roster incl. inactive; VSD001 = account sistema, escluso)
- 4 sim (LMU primario)
- Discord OAuth Wave 10 live
- Vetrina pubblica live (Discord + Instagram + Facebook)
- Prossimo evento: 6h pubblica VSD di collaudo, fine settembre 2026

---

## Comandi quick-start

```powershell
cd C:\Users\Demetrio\Dev\vsd-paddock
git log --oneline -8
git status
git ls-remote origin main
# Atteso HEAD: 6406a83 (o successivo)
```
