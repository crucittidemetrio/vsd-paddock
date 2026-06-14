# Gestione Stint Endurance — Guida Admin

> Riferimento operativo per lo staff. Pianificazione e gestione stint nelle gare endurance (6h, 12h, 24h).
> Accesso riservato a tier `staff` / `admin`.

---

## Quando si usa

Solo per gare con formato **endurance**. Sulle gare sprint il sistema stint non compare.

Il piano stint è il programma dei turni di guida: chi guida, da quando a quando, con che gomme, con o senza pit a fine turno. Serve a coordinare il team prima e durante la gara, e a dare a ogni pilota visibilità sul proprio turno.

Due viste:
- **Pubblica** (pagina della gara, sezione "Piano Stint"): tutti i piloti loggati vedono il piano in sola lettura. Ogni pilota vede evidenziato il proprio stint con il tag "TU".
- **Admin** (`/admin/race/:raceId/stints`): solo staff. Qui si crea, modifica, elimina.

---

## Accesso alla pagina admin

Dalla pagina della gara endurance, bottone arancione **"🛠 Gestisci stint"** in alto (visibile solo a staff). Porta alla pagina di gestione.

---

## Creare uno stint

Click su **"+ Aggiungi stint"** (in alto a destra della tabella). Il bottone diventa "× Annulla" e compare un form sopra la tabella. Campi:

| Campo | Obbligatorio | Note |
|---|---|---|
| Pilota | sì | menu a tendina, solo piloti attivi/trial |
| Ordine stint | sì | numero progressivo, precompilato col successivo libero. Determina la sequenza |
| Inizio pianificato | consigliato | selettore data+ora |
| Fine pianificata | consigliato | selettore data+ora |
| Durata pianificata (min) | consigliato | in minuti |
| Gomme | opzionale | soft / medium / hard / wet / intermediate |
| Pit stop a fine stint | opzionale | spunta la casella se il turno termina con sosta |
| Carburante (L) | opzionale | litri caricati |
| Stato | sì | Pianificato / In corso / Completato / Abortito |
| Note | opzionale | testo libero (meteo, strategia, eventi) |

Conferma con **"Crea stint"**. In fase di creazione i campi sui **risultati effettivi** (orari/giri/best lap reali) non ci sono: si compilano dopo, in modifica (vedi sotto).

L'**ordine** segue il campo "Ordine stint" che imposti tu, non gli orari. Puoi forzare una sequenza diversa da quella cronologica. Il sistema rinumera in automatico gli altri stint quando ne aggiungi, sposti o elimini uno.

**Coerenza orari**: il sistema NON controlla sovrapposizioni o buchi tra stint. Sei tu a verificare che fine di uno stint e inizio del successivo combacino. Un errore di orario non genera alert, viene mostrato così com'è.

---

## Modificare uno stint

Nella riga dello stint, icona **✎** (Modifica) nell'ultima colonna. Si apre una finestra con i campi precompilati. Qui, oltre ai campi di pianificazione, compare la sezione **"Risultati effettivi (post-gara)"**: inizio/fine effettivi, durata effettiva, giri effettivi, best lap (in millisecondi). Conferma con **"Salva modifiche"**. Se cambi l'ordine, la rinumerazione è automatica.

## Eliminare uno stint

Nella riga, icona **×** (Elimina). Compare una conferma che avvisa del re-numbering automatico degli stint successivi. **Hard delete**: confermando, lo stint è rimosso definitivamente dal foglio, non c'è cestino. Prima di confermare, assicurati che sia quello giusto.

---

## Swap pilota in corso di gara

Non esiste un'azione "sostituisci pilota" dedicata (la pagina admin lo ricorda in fondo). Il cambio si fa in due passi:

1. **Chiudi lo stint in corso**: apri lo stint del pilota che esce (✎), imposta lo Stato su **Completato** (turno concluso regolarmente) o **Abortito** (interrotto, es. problema vettura) e compila gli orari effettivi nella sezione post-gara.
2. **Crea il nuovo stint** per il pilota che subentra: "+ Aggiungi stint", ordine successivo, inizio = momento del cambio, Stato **In corso**.

Così la cronologia resta tracciata: vedi sia il turno chiuso sia quello nuovo, con orari reali. **Non sovrascrivere mai il pilota su uno stint esistente** per fare lo swap — perderesti il dato di chi ha guidato prima.

---

## Note pre/post gara

**Prima della gara**:
- Crea tutti gli stint pianificati con orari, gomme e durata previsti, Stato **Pianificato**.
- Verifica a occhio che gli orari siano consecutivi e coprano l'intera durata gara.
- Avvisa i piloti che il piano è visibile sulla pagina gara (vedranno il loro turno evidenziato col tag "TU").

**Durante la gara**:
- Aggiorna gli Stato man mano: lo stint corrente su **In corso**, quelli conclusi su **Completato**.
- Per swap o imprevisti, segui il workflow sopra.

**Dopo la gara**:
- Porta tutti gli stint a **Completato** (o **Abortito** dove applicabile).
- In modifica, compila la sezione "Risultati effettivi": orari reali, giri, best lap.
- Aggiungi note rilevanti (problemi, strategia, anomalie) nel campo Note.
- Lo storico resta consultabile sulla pagina gara per l'analisi post-evento.

---

## Cache e visibilità

Se crei una nuova gara endurance e non compare subito nel paddock, è la cache backend (TTL ~15 min sulle gare). Forzare l'aggiornamento dall'editor Apps Script con `clearAllCaches()`. Gli stint hanno cache più breve (~5 min) per reattività in gara.
