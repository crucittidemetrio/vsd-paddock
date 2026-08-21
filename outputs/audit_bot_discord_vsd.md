# Audit bot Discord VSD — potenzialità non sfruttate (versione free)

Server: **Virtual Sim Driver** (113 membri, boost tier 1). 9 bot attivi oltre a Composio (quello che uso io per operare sul canale). Verificato ruoli, canali, integrazioni e cronologia messaggi reale — non solo la lista bot, per capire cosa è davvero in uso e cosa no.

## Quadro generale

Il server ha una struttura solida (categorie per format: UE144, Clash of Classes, comunicazione, gestione team) ma i bot installati sono in gran parte **sotto-sfruttati**: sono lì, hanno un ruolo assegnato, ma quasi nessuno ha una configurazione attiva che genera valore ogni giorno. Le prove concrete:

- Il canale `🤖comandi-bot` ha **una sola interazione recente** in tutta la cronologia (un comando `/dashboard` di Musibeth, il bot musicale).
- Gli accessi pilota (ruoli `Pilota VSD LMU/IRC/ACE`) vengono assegnati **a mano dallo staff**, messaggio per messaggio, in `accesso-come-pilota-vsd` — nessuna automazione.
- Gli annunci in `eventi-interni` (lancio UE144, Clash of Classes) sono **post manuali dello staff**, non eventi generati da un bot.
- Il contatore "All Members: 113" nella categoria `📊 SERVER STATS` è l'unica cosa visibile che Statbot sta effettivamente facendo.

Non è una critica alla scelta dei bot — la selezione è sensata — è che il setup si è fermato all'installazione.

## Bot per bot

### Apollo — installato, mai usato per una gara VSD
Ruolo: bot calendario/eventi con RSVP, promemoria automatici, fuso orario automatico. Free tier: fino a **5 serie di eventi ricorrenti** attive contemporaneamente — abbastanza per coprire UE144, Clash of Classes e ACI LMGT3 Challenge insieme, con margine.
**Non risulta un solo evento Discord nativo creato per un round di gara.** Ogni lancio (UE144, Clash) è stato un post di testo, non un Evento Discord con RSVP.

*Perché conta:* un Evento Discord dà a te un numero concreto di "chi si presenta" prima della gara — oggi lo scopri solo guardando chi si connette in voice la sera stessa. Per l'ACI in particolare, con le prequalifiche del 17-20 settembre, un evento con RSVP ti direbbe subito quanti tentano davvero, invece di aspettare risposte sparse nel canale.

### Statbot — usato al 5% del suo potenziale
Ruolo: analytics del server. Free tier include contatori canale illimitati, **classifiche di attività reali** (messaggi per membro/canale), e **Statroles** (assegna/rimuove ruoli in automatico in base all'attività).
Oggi fa solo da contatore membri statico.

*Perché conta:* nel Social Manager del sito, i follower/membri Discord si inseriscono **a mano** ogni volta (tab Metriche, `useDiscordStats`). Statbot li terrebbe con storico e grafici gratis, senza inserimento manuale — è esattamente il dato che il Social Manager sta già cercando di tracciare, prodotto automaticamente invece che a mano.

### Carl-bot — multiuso installato, reaction roles mai configurate
Free tier: reaction roles, automod, tag/comandi custom, starboard, autofeed.
Nessuna reaction role visibile da nessuna parte — i ruoli sim (LMU/iRacing/ACE) restano assegnazione manuale staff.

*Perché conta:* un tag custom tipo `!regolamento` che risponde col link diretto (invece di doverlo cercare ogni volta) o `!aci` che linka la pagina ACI è zero manutenzione dopo il setup iniziale. Le reaction role per sim/notifiche tolgono un compito ripetitivo allo staff.

### ChronicleBot — non è un logger, è un sync Google Calendar → Eventi Discord
Correggo un'ipotesi che avevo fatto all'inizio leggendo solo il nome: **non fa logging**, sincronizza un Google Calendar (o feed iCal) con gli Eventi nativi di Discord. Free tier: 1 calendario collegato, eventi generati automaticamente fino a 7 giorni prima, promemoria e riepilogo automatico.
`🗓calendario-gare` oggi è un canale di testo aggiornato a mano.

*Perché conta:* se tieni (o crei) un Google Calendar con le date di tutti i format — anche generato da un export delle date che già hai nel foglio Google Sheets del backend — questo bot lo tiene sincronizzato con Discord da solo. Si sovrappone parzialmente ad Apollo: Apollo gestisce meglio l'RSVP per le gare VSD dirette, ChronicleBot è più adatto a un calendario "vetrina" (inclusi eventuali round esterni tipo ACI). Non serve usarli entrambi per la stessa cosa — vanno assegnati a scopi diversi o ne va scelto uno solo.

### PollBot — perfetto per la call ACI appena scritta, mai testato
Nessuna traccia di utilizzo recente. Nota: **non è verificato** nel Developer Portal Discord (non è un problema di sicurezza grave per un bot già installato con permessi limitati, ma vale la pena saperlo prima di dargli permessi aggiuntivi in futuro).

*Perché conta ora:* il post che abbiamo appena scritto per Discord ("chi tenta le prequalifiche ACI?") chiede una risposta testuale. Con PollBot diventa un sondaggio con conteggio automatico — meno attrito per chi risponde, numero chiaro per te.

### Maki.gg — sovrapposto a Carl-bot, usato solo per il leave-log
Le uniche righe visibili in `nuovi-utenti` sono messaggi "Bye Bye [nome]" quando qualcuno esce — quello è Maki. Non ho trovato benvenuti automatici corrispondenti.
Free tier include un sistema di livelli/XP con leaderboard e ruoli automatici per soglia di attività — utile per premiare la partecipazione nei canali community (`bar-sport`, `chat-pubblica`), cosa distinta dalle performance in pista che già tracciate su Punti Merito/Academy nel sito.

*Nota di attrito:* Carl-bot e Maki.gg coprono entrambi automod/welcome/logging. Non è un problema finché restano inattivi su queste funzioni sovrapposte, ma se in futuro ne attivi una su entrambi rischi doppi messaggi o regole in conflitto — meglio decidere in anticipo chi fa cosa.

### Emoji.gg — marginale
Solo utility di import emoji. Nessuna valutazione strategica necessaria.

### Musibeth — l'unico bot con uso reale confermato
Comando `/dashboard` recente nel canale bot. Coerente con l'uso in `🍷🍔🎧Lobby -❌ No Race`. Nessuna azione richiesta.

## Raccomandazioni, in ordine di impatto/sforzo

1. **Statbot → sostituisce l'inserimento manuale delle metriche Discord nel Social Manager.** Zero configurazione aggiuntiva oltre ad attivare i contatori/classifiche che il bot già offre gratis. Il rapporto costo/beneficio più alto di tutta la lista.
2. **Apollo → un evento ricorrente per round, per ogni format attivo (UE144, Clash, ACI).** Dà RSVP reali invece di scoprire le presenze la sera stessa. Rientra comodo nel limite free di 5 serie.
3. **PollBot → usalo per il post "chi tenta le prequalifiche ACI"** che abbiamo appena scritto, invece delle risposte testuali.
4. **Carl-bot → reaction role per sim + un paio di tag custom** (regolamento, pagina ACI). Basso sforzo, elimina lavoro ripetitivo dello staff.
5. **ChronicleBot vs Apollo → scegliere chi fa cosa** prima di configurare entrambi sullo stesso calendario, per non duplicare eventi.
6. Maki.gg ed Emoji.gg: nessuna azione urgente.
