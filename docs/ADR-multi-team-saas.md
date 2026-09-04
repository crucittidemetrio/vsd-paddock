# ADR-001: VSD-Paddock come prodotto multi-team (SaaS web)

**Stato:** Proposto
**Data:** 2026-09-04
**Decisori:** Demetrio (VSD Virtual Sim Driver)

## Contesto

VSD-Paddock è oggi un tool interno single-tenant: frontend React 19 (Vercel) + backend Google Apps Script su un unico Google Sheet (`VSD_HUB_DB`), autenticazione Discord OAuth con token HMAC che incorporano `driver_id` — nessun concetto di `team_id` esiste in nessuna parte del sistema.

Numeri reali del codebase, misurati oggi (non stimati):

| Metrica | Valore |
|---|---|
| Azioni backend registrate | 132 |
| File Apps Script | 64 (~19.300 righe) |
| Tab del foglio Google | 35 |
| Pagine frontend React | 57 (~31.300 righe) |
| Totale codice | ~50.600 righe |

Il modulo più recente e tecnicamente ambizioso, il Pit Wall live, non passa dall'Apps Script per i dati in tempo reale: il bridge C# locale trasmette via WebSocket a `ws://localhost:8090/ws/`, raggiungibile solo da chi è fisicamente sullo stesso PC del bridge. Non esiste oggi un relay che porti quei dati a un membro del team collegato da remoto — è la stessa decisione di architettura "multi-viewer" discussa e poi esplicitamente rimandata in una sessione precedente (Opzione A: relay via polling Apps Script: Opzione B: server WebSocket dedicato).

Richiesta di Demetrio: valutare se e come rendere VSD-Paddock disponibile ad altri team come applicazione web in abbonamento (non un installer desktop — confermato), indipendentemente dalla validazione di mercato già in corso separatamente.

### Cosa dice davvero il mercato (ricerca reale, non le slide generate in precedenza)

Esistono già concorrenti diretti nella stessa nicchia (gestione squadra + calendario + strategia box), non solo tool di telemetria individuale come ipotizzato inizialmente:

- **Pitwall.live**, dal 2024 parte di **SimGrid** (piattaforma sim-racing con risorse reali): leaderboard live, mappa pista con stato bandiere per settore, gestione stint/pit stop, gap chart, UI a widget configurabile. Sovrappone quasi 1:1 il modulo Pit Wall appena costruito, con più maturità.
- **Calapex** (calapex.de): hub gratuito — calendario con sync WebCal, roster con inviti, stint planner a formule, gestione file setup, copre anche LMU. Gratuito, ancora giovane, UI in tedesco.
- **TeamManager.cc**: "Planning, Pitwall, Relay, Race Engineer per team endurance" — posizionamento quasi identico a VSD-Paddock.
- Concorrenti adiacenti (telemetria/coaching individuale, non gestione squadra): Garage61 (freemium, Pro da ~$7/mese), VRS, Track Titan (ha raccolto un seed di $5M — segnale di interesse reale degli investitori nel software sim-racing, ma per coaching AI individuale, non team ops).

Conclusione di mercato: la nicchia non è vuota come suggerito dal documento precedente, e almeno un concorrente (Pitwall.live) è meglio finanziato di VSD sulla stessa feature. I prezzi reali in questa nicchia restano bassi (gratis-$10/mese), non i €20-50/mese ipotizzati nel documento scartato.

## Decisione da prendere

Se e come cambiare l'architettura di VSD-Paddock per supportare più team paganti, mantenendo operativo senza rischi il sistema che oggi gestisce le gare vere di VSD.

## Opzioni considerate

### Opzione A — Nessun cambio architetturale, cloni manuali per team

Ogni nuovo team pagante riceve una copia dedicata: nuovo Google Sheet clonato da `VSD_HUB_DB`, nuovo deployment Apps Script dallo stesso codice, propria istanza frontend (stesso repo, env var diversa).

| Dimensione | Valutazione |
|---|---|
| Complessità | Bassa — zero righe di codice nuove, solo procedura di provisioning |
| Costo | €0 infrastruttura (piano gratuito Sheets/Apps Script per ogni team) |
| Scalabilità | Bassa oltre 4-5 team: ogni fix/feature va ridistribuito manualmente N volte |
| Rischio per VSD | Nullo — il sistema di produzione VSD non viene toccato |

**Pro:** si può iniziare a "vendere" questa settimana, senza rischiare la stabilità di ciò che gestisce le gare vere di VSD. Valida la domanda con costo di sviluppo prossimo a zero.
**Contro:** non scala operativamente, nessun self-serve signup, lavoro manuale ripetuto a ogni nuovo cliente.

### Opzione B — Multi-tenancy sullo stack attuale (Apps Script + Sheets, con `team_id`)

Aggiungere una colonna `team_id` a tutti i 35 tab e un filtro `team_id` a tutte le 132 azioni registrate, mantenendo Apps Script/Sheets come motore.

| Dimensione | Valutazione |
|---|---|
| Complessità | Alta — 132 handler da audire uno per uno, nessun meccanismo nativo tipo Row-Level-Security: il controllo va scritto a mano ovunque |
| Costo | €0 infrastruttura, ma settimane di sviluppo e test di sicurezza |
| Scalabilità | Il vero limite reale (non inventato) è la quota di esecuzioni simultanee di Apps Script (30 per account consumer) — diventa concreto con più team live in contemporanea durante un weekend di gara |
| Rischio per VSD | Medio-alto: un solo controllo `team_id` dimenticato su 132 = un team paga per vedere i dati di un altro |

**Pro:** riusa tutta la logica esistente, nessun nuovo fornitore da imparare.
**Contro:** rischio di sicurezza concentrato su disciplina manuale, non su un meccanismo di piattaforma; non risolve da solo il problema del Pit Wall via WebSocket locale.

### Opzione C — Migrazione a Supabase/Postgres multi-tenant

Riscrittura completa: le 132 azioni diventano query Postgres con Row Level Security, nuovo layer di autenticazione (Supabase Auth + membership per team), fatturazione integrata.

| Dimensione | Valutazione |
|---|---|
| Complessità | Molto alta — stima realistica 150-400 ore solo per portare le 132 azioni, prima di frontend, auth, billing e test |
| Costo | Supabase gratis in fase iniziale, poi ~$25/mese; serve comunque un layer di calcolo (Vercel functions o simile) al posto di Apps Script |
| Scalabilità | Ottima — rimuove davvero il tetto di concorrenza di Apps Script, e risolve *anche* il problema del relay Pit Wall via Supabase Realtime |
| Rischio per VSD | Alto se affrettato: riscrittura totale di un sistema che oggi gestisce gare reali, senza margine di regressione |

**Pro:** RLS reale invece di controlli manuali, realtime nativo, l'unica opzione davvero pronta per scala seria.
**Contro:** mesi di lavoro, nessun cliente pagante confermato oggi che giustifichi l'investimento.

## Analisi dei trade-off

Il vero collo di bottiglia non è quale database scegliere — è che le 132 azioni servono oggi le operazioni di gara reali di VSD, con margine di regressione pari a zero. Nessuna delle tre opzioni è priva di rischio se affrettata. Senza un cliente pagante confermato (come chiarito in precedenza), il costo dell'Opzione C non è oggi giustificato. L'Opzione B è una via di mezzo ma con un profilo di rischio scomodo (sicurezza affidata a disciplina manuale su 132 punti). L'Opzione A è l'unica che permette di testare la disponibilità a pagare con rischio tecnico quasi nullo sul sistema live di VSD.

## Decisione consigliata (sequenziale, non binaria)

1. **Ora:** Opzione A. Se/quando compare un prospect reale, si clona Sheet + deployment Apps Script per lui (poche ore di lavoro, stessa procedura già usata per le migrazioni interne di VSD). Valida la domanda a rischio quasi zero.
2. **Solo quando ≥3 team pagano/si sono impegnati concretamente** e il costo del cloning manuale diventa il vero collo di bottiglia: si riapre la scelta tra Opzione B e C, questa volta con dati d'uso reali (quanti team concorrenti, che carico) invece che ipotetici.
3. **Indipendente dalla questione multi-team:** il WebSocket del Pit Wall limitato a `localhost` va risolto comunque — anche il solo VSD trarrebbe beneficio da poter far seguire il muretto box a uno stratega da remoto. Il tema era già stato scoperto e rimandato in precedenza (relay via Apps Script vs server WebSocket dedicato); è un progetto legittimo a sé, indipendente dal discorso SaaS.

## Conseguenze

- **Più facile:** si può iniziare a testare il mercato senza toccare il codice di produzione di VSD.
- **Più difficile:** il cloning manuale non scala oltre una manciata di team, e ogni nuovo cliente richiede lavoro manuale su Sheets/Apps Script — costo in ore, non in euro, ma reale.
- **Da rivedere:** una volta noto il numero reale di team paganti, questo ADR va aggiornato con numeri di concorrenza reali al posto di quelli ipotetici.

## Azioni

1. [ ] Nessuna modifica di codice ora — restare su Opzione A come postura di default.
2. [ ] Se/quando arriva un prospect: preparare procedura di provisioning ripetibile (script di clonazione Sheet + deployment, non solo istruzioni manuali).
3. [ ] Valutare separatamente il relay per il Pit Wall (indipendente da questo ADR).
4. [ ] Rivisitare Opzione B vs C solo a soglia di ≥3 team confermati.

## Fonti (ricerca di mercato)

- [Pitwall.live joins SimGrid](https://pits.thesimgrid.com/announcements/pitwall-live-joins-the-simgrid-family/)
- [Calapex](https://calapex.de) — via [SimRacing Hub](https://simracing-hub.com/software.html)
- [TeamManager.cc](https://teammanager.cc/)
- [Garage 61 pricing](https://garage61.net)
- [Track Titan — seed $5M](https://www.motorsport.com/culture/news/ai-sim-racing-coach-track-titan-raises-5m-to-train-the-next-generation-of-drivers/10783978/)
- [Racey — league ops pricing](https://racey.gg)
