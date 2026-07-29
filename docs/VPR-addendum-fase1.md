# VPR — Addendum a "VSD Pilot Rating System v1.2"

> Note di implementazione Fase 1 e decisioni sui tre punti critici sollevati in review.
> Non sostituisce il documento originale (`Accademia_VSD_rev2.2` → VPR v1.2), lo integra.

## Cosa è stato costruito in Fase 1

`apps-script/Academy.js` — `academy.ranking(sim)`, read-only da `RaceResults`, tre
classifiche indipendenti (LMU/IRC/ACE). Pagina `/academy` (`src/pages/Academy.jsx`)
con tab per simulatore.

**Scope volutamente ridotto rispetto alla formula completa (§3 della spec):**
incluso PM_base per posizione in classe + bonus giro veloce/presenza/pole (quando
disponibile); escluso PP (nessun tab `DriverPenalties` ancora), bonus fair
play/full attendance (bonus di fine stagione, richiedono un confine stagionale non
ancora agganciato), scarto del risultato peggiore, badge. Il dettaglio completo è
commentato in testa a `apps-script/Academy.js`.

La pagina mostra esplicitamente un banner "classifica di anteprima" per non far
leggere questo numero come il VR definitivo.

## I tre punti sollevati in review — decisioni

**1. Trasparenza delle penalità verso il pilota.** Non ancora implementato (`DriverPenalties`
è Fase 2), ma la decisione è presa: quando arriva il tab penalità, va esposta una
lettura filtrata per privacy identica a `RaceReports` (`filterReportsByPrivacy` in
`apps-script/Reports.js` — il pilota vede solo le proprie voci, lo staff le vede
tutte). Nessuna penalità silenziosa: il pilota deve poter vedere motivo e chi l'ha
emessa. Da implementare in Fase 2 come `academy.myPenalties`, stesso pattern di
`reports.list`.

**2. Field size / densità di griglia.** Non affrontato in formula ora — resta un
rischio da tenere d'occhio in Fase 4 quando si calibrano le soglie badge sui dati
reali. Se emerge che i piloti accumulano VR scegliendo sistematicamente classi con
meno concorrenti, la formula andrà rivista (es. peso minimo di partecipanti in
classe perché un piazzamento conti a pieno). Non è un problema da risolvere prima
di avere dati reali su cui misurarlo.

**3. Costo operativo dello staff.** Non è un problema di codice — resta un impegno
reale anche senza Panel Steward. Nessuna azione qui, solo una nota per non
dimenticarlo quando arriva Fase 2 e lo staff inizia davvero a inserire
`DriverPenalties`.

## Nota implementativa applicata

`academy.ranking` è registrata sia in `apps-script/Codice.js` (`ACTIONS`) sia in
`src/api/client.js`/`src/api/realApi.js` (namespace + case + adapter) — la
dimenticanza del secondo pezzo ha già causato un fallimento silenzioso in passato
(`standings.byDriver`), quindi verificato esplicitamente in questo giro.

## Prossimi passi (non iniziati)

Fase 2 (`DriverPenalties` + PP nel VR + lettura filtrata per privacy) parte solo
su richiesta esplicita — stesso principio già applicato al resto dell'Accademia:
niente sviluppo anticipato rispetto a quello che serve davvero.
