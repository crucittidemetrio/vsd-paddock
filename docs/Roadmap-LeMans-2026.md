# VSD Paddock — Roadmap verso la 24h di Le Mans (24-25 ottobre 2026)

**Obiettivo**: sistema endurance completo e collaudato per la 24h di Le Mans.
**Collaudo intermedio**: 6h pubblica VSD a fine settembre (data/tracciato da definire).
**Vincolo sviluppo**: sessioni brevi quotidiane, budget token Claude limitato → ripartizione Claude/Gemini per ogni attività.
**Regola d'oro**: una cosa alla volta, finita e committata, prima della successiva. Niente rami paralleli.

---

## Principio di allocazione AI

- **Claude** = decisioni ad alto rischio: design dati/API, debugging non ovvio, code review dei pezzi critici, scelte dove sbagliare costa caro. Sessioni brevi e dense.
- **Gemini** = volume a direzione fissata: codice ripetitivo (CRUD, form, boilerplate), prime stesure, refactoring meccanico, test. Su brief chiusi.
- **Handoff**: i brief per Gemini devono essere chiusi (nomi campo, firme, contratti espliciti). Brief vago → Gemini riempie i buchi a modo suo → codice che non combacia → si spende PIÙ Claude a rimettere a posto. Stile di riferimento: il "Gemini Task 001" già in docs/.

---

## Calendario a ritroso

| Periodo | Fase | Esito atteso |
|---|---|---|
| Giugno (sett. 1-2) | Fase 0 — Igiene tecnica | clasp operativo, editor Apps Script pulito |
| Giugno-Agosto | Fase 1 — StintPlanner | planner 24h finito e testato in locale |
| **Fine agosto** | **FREEZE sviluppo** | sistema stabile, niente codice nuovo |
| Settembre | Fase 2 — Collaudo 6h pubblica | sistema usato con dati/piloti veri, bug annotati |
| Ottobre (prima metà) | Fase 3 — Fix + Stint Replay | problemi 6h risolti, replay sui dati reali |
| Ultime 2 settimane | Fase 4 — Freeze finale | solo polish |

---

## Fase 0 — Igiene tecnica (giugno, ~1-2 settimane)

Va per prima: ogni modifica backend successiva ne beneficia. L'episodio del fix roster (1 ora persa su disallineamento Apps Script↔Git) è la prova del perché.

**Attività**:
1. Installare e configurare `clasp` per sincronizzare il progetto Apps Script standalone col repo Git (cartella `apps-script/`).
2. Rimuovere le funzioni di test residue dall'editor Apps Script (`testRosterInactive`, `testRosterHandler`, `testRosterFix`, `testFinale`, `trovaColpevole`).
3. Aggiornare HANDOFF.md allo stato corrente.

**Ripartizione**:
- **Claude**: verifica della configurazione clasp (autenticazione, `.clasp.json`, mapping file), perché un errore qui disallinea il backend di produzione.
- **Gemini / manuale**: esecuzione comandi clasp, pulizia funzioni test.

---

## Fase 1 — StintPlanner (luglio-agosto, il cuore)

Pianificazione stint per una 24h: 12-20 stint su due giorni, rotazione piloti, fasi notturne, finestre pit, validazione copertura e coerenza orari (il debito mai chiuso).

**Spezzare in micro-task da una sessione ciascuno.** Sequenza proposta (ogni riga = una o poche serate, committata):

1. Design schema dati piano stint 24h (estende EnduranceStints o nuova struttura?) — **decisione Claude**
2. Contratto API: endpoint di calcolo/validazione finestre — **decisione Claude**
3. Backend: handler generazione stint da parametri gara (durata, n. piloti, durata stint target) — **brief Claude → codice Gemini**
4. Backend: validazione copertura (nessun gap, nessun overlap, somma = durata gara) — **brief Claude → codice Gemini**
5. Frontend: hook + adapter (pattern passthrough già noto) — **brief Claude → codice Gemini**
6. Frontend: UI planner (griglia stint editabile, drag rotazione piloti) — **brief Claude → codice Gemini, review Claude**
7. Integrazione con StintTimeline esistente (il planner alimenta gli stint che la timeline mostra) — **Claude**
8. Test end-to-end — **Gemini scrive, Claude rivede i casi limite**

**Regola di scope**: se la Fase 1 slitta, NON si aprono altre feature. StintPlanner fatto bene > StintPlanner + widget a metà.

---

## Fase 2 — Collaudo 6h pubblica (settembre)

**Niente codice nuovo.** Il sistema, già finito ad agosto, gira con piloti e pubblico veri. Si raccolgono dati `actual_*` reali e si annota cosa si rompe.

- **Claude / Gemini**: nessuno sviluppo. Eventuale hotfix critico solo se blocca l'evento.
- Output: lista bug/attriti emersi, dati reali di una gara endurance.

---

## Fase 3 — Fix + Stint Replay (ottobre, prima metà)

1. Fix dei problemi emersi alla 6h — **Claude per i bug non ovvi, Gemini per i fix meccanici**
2. Stint Replay grafico: timeline orizzontale per pilota, colori gomma, pit, delta pianificato-vs-effettivo. Gira sui dati `actual_*` della 6h. — **design Claude → codice Gemini → review Claude**

Lo Stint Replay sta qui, non prima: ha bisogno dei dati reali del collaudo.

---

## Fase 4 — Freeze finale (ultime 2 settimane prima del 24 ottobre)

Solo polish, UX, mobile. Nessuna feature nuova. La regola di sempre.

---

## Fuori scope (congelati fino a dopo Le Mans)

- Phase 9.8b lap-by-lap analysis
- Pace consistency / metronomo
- Class gap analysis multiclass
- ACE full setup

Sono moltiplicatori, non fondamenta. Entrano solo se StintPlanner chiude in largo anticipo (improbabile col budget di sessione attuale).
