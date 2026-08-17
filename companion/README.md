# VSD Paddock — Companion apps

Questa cartella contiene due script indipendenti:

- **`fuel_bridge.py`** — telemetria live carburante/energia durante la
  gara (guida sotto, per ogni pilota).
- **`results_bridge.py`** — import automatico dei risultati post-gara
  (guida in fondo al file, solo staff/admin).

---

# Fuel/Energy Bridge (Le Mans Ultimate)

Companion app che legge carburante ed energia virtuale residui direttamente
dal gioco e li manda al backend VSD Paddock ad ogni cambio giro, per il
pannello di previsione consumi/rabbocchi (menu laterale → **Strumenti
Gara → Carburante/Energia**, visibile a ogni pilota VSD).

Solo Windows, solo Le Mans Ultimate (per ora).

---

## Guida rapida per i piloti

Nessuna installazione, nessun Python: un unico file da scaricare e
avviare.

**Cosa ti serve prima di iniziare:**

- LMU con i plugin abilitati (Impostazioni → Gameplay → **Enable
  Plugins** → ON — se lo cambi a gioco aperto, riavvia LMU)
- Il tuo token personale, generato una volta dal tuo profilo su
  vsd-paddock (bottone **"Genera token companion"**). Dura 180 giorni,
  non va condiviso.

**Ad ogni sessione:**

| Passo | Cosa fare |
|---|---|
| 1 | Scarica `vsd-fuel-bridge.exe` da questo link — **nessun account richiesto, funziona anche da telefono per poi trasferirlo**: https://github.com/crucittidemetrio/vsd-paddock/releases/download/companion-latest/vsd-fuel-bridge.exe |
| 2 | Fai doppio click sul file scaricato. **Windows probabilmente mostrerà uno schermo blu "Windows ha protetto il PC"** — è normale, non è un virus (vedi spiegazione sotto): clicca **"Ulteriori informazioni"**, poi **"Esegui comunque"** |
| 3 | Si apre una finestra nera. **Solo la prima volta**, ti chiede 3 cose: il tuo token, un nome per la sessione (es. `TEST-monza-06-08` per una prova, oppure il race_id ufficiale per una gara) e il numero della tua vettura |
| 4 | Entra in pista su LMU. Ad ogni giro completato vedi una riga confermare l'invio |
| 5 | Apri il pannello **Carburante/Energia** sul sito (menu laterale → Strumenti Gara), scrivendo lo STESSO nome sessione e numero vettura del passo 3 |

Lascia la finestra nera aperta per tutta la sessione. Per fermare:
`Ctrl+C` o chiudi la finestra.

Le sessioni dopo la prima non richiedono più le 3 domande — si ricorda
tutto da solo. Se cambi vettura o sessione, cancella il file
`config.json` che trovi nella stessa cartella dell'exe: alla prossima
apertura te le richiede di nuovo.

**⚠️ Perché Windows/l'antivirus si lamentano?** L'exe non ha una firma
digitale (costa e richiede una registrazione aziendale a pagamento, non
ne vale la pena per uno strumento interno di squadra) — Windows tratta
ogni eseguibile non firmato come potenzialmente sospetto per default,
a prescindere da cosa faccia davvero. Non è un giudizio sul contenuto
del file. Se l'antivirus lo mette in quarantena invece di limitarsi ad
avvisare, va ripristinato manualmente dalle impostazioni dell'antivirus
(varia da programma a programma — chiedi allo staff se non trovi
l'opzione).

**Non vedi dati nel pannello?** Controlla, in ordine: sei davvero in
pista (non nei menu)? I plugin LMU sono su ON? Nome sessione e numero
vettura sono scritti IDENTICI sia nell'exe che sul sito (attenzione a
maiuscole/spazi)?

**Vedi ogni tanto "il backend non ha risposto in tempo, campione
perso"?** Non è un errore da segnalare: capita occasionalmente perché
il server a volte risponde più lento del solito. Il giro con quel
warning non viene registrato, ma quello dopo sì — il consumo medio nel
pannello resta corretto lo stesso, si ricalcola sui giri che sono
arrivati. Se lo vedi in continuazione (non ogni tanto) invece controlla
la tua connessione.

---

## Come funziona (per curiosità)

Le Mans Ultimate scrive i propri dati in tempo reale in una shared memory
ufficiale (interfaccia documentata da Studio 397, non un plugin di terze
parti). Lo script legge quella memoria, individua la tua vettura
(`playerVehicleIdx`) ed estrae: giro corrente, litri di carburante
residui, capacità serbatoio, energia virtuale residua (solo classi
ibride LMDh/Hypercar). Ad ogni cambio giro manda un campione a
`fuel.logSample`.

Il backend calcola da solo consumo medio mobile e autonomia stimata
(`fuel.summary`) — questo script si limita a raccogliere e inviare i dati
grezzi.

---

## Per chi compila/distribuisce l'exe (staff)

Serve Python 3.9+ solo a chi compila l'eseguibile — non ai piloti che lo
usano.

### Eseguire da sorgente (sviluppo/test)

```
cd companion
python fuel_bridge.py
```

Stesso comportamento dell'exe: al primo avvio, se non trova
`config.json`, fa le 3 domande a terminale e si salva tutto da solo (vedi
sezione piloti sopra). Chi preferisce compilare un file invece di
rispondere alle domande può copiare `config.example.json` in
`config.json` ed editarlo a mano prima di lanciare lo script.

### Scaricare l'eseguibile già compilato (consigliato)

Non serve compilare nulla a mano: il workflow GitHub Actions
`.github/workflows/build-companion.yml` builda `vsd-fuel-bridge.exe` su
un runner Windows automaticamente ad ogni push su `main` che tocca
`companion/`, e lo pubblica in due posti:

- **Link pubblico stabile, da dare ai piloti** (nessun login richiesto,
  l'URL non cambia mai anche dopo un aggiornamento):
  `https://github.com/crucittidemetrio/vsd-paddock/releases/download/companion-latest/vsd-fuel-bridge.exe`
- **Artifact della run** (repo → tab Actions → run più recente →
  sezione Artifacts) — richiede login GitHub, utile solo per QA interno
  prima di darlo ai piloti, non per la distribuzione vera.

Usa sempre il link pubblico quando condividi l'exe (Discord, ecc.):
essendo stabile, puoi pinnarlo una volta sola in un messaggio Discord
e non serve più aggiornarlo ad ogni build.

### Compilare a mano (alternativa, se non vuoi usare GitHub Actions)

```
pip install pyinstaller
cd companion
pyinstaller --onefile --name vsd-fuel-bridge --paths vendor --hidden-import lmu_data fuel_bridge.py
```

`--paths vendor --hidden-import lmu_data` sono obbligatori: senza,
l'exe compila ma va in crash al primo avvio con
`ModuleNotFoundError: No module named 'lmu_data'` (quel modulo è
importato a runtime via `sys.path.insert`, che l'analisi statica di
PyInstaller non vede da sola).

L'eseguibile finito è in `dist/vsd-fuel-bridge.exe` — file singolo,
autosufficiente, non serve portarci dietro `config.json`: ogni pilota lo
scarica, lo lancia, risponde alle 3 domande al primo avvio e da lì in poi
parte da solo.

### Struttura

```
companion/
  fuel_bridge.py          ← script principale (loop di lettura + invio)
  config.example.json     ← template, copiare in config.json
  requirements.txt        ← solo per il build (pyinstaller)
  vendor/
    lmu_data.py            ← struct ufficiali shared memory LMU (vendorizzato)
    LICENSE.txt            ← licenza MIT del file vendorizzato
```

`vendor/lmu_data.py` è preso verbatim da
[TinyPedal/pyLMUSharedMemory](https://github.com/TinyPedal/pyLMUSharedMemory)
(MIT), a sua volta basato sull'header ufficiale S397
`SharedMemoryInterface`. Non modificarlo: la lettura funziona solo se il
layout in memoria combacia byte per byte con quello del gioco — un campo
tolto o riordinato disallinea silenziosamente tutti quelli successivi.

---

# Results Bridge (import automatico risultati, staff/admin)

VSD non gestisce server propri: le gare girano sui server ufficiali di
Le Mans Ultimate (o di leghe esterne). Non esiste quindi un'API da cui
"tirare giù" i risultati in automatico — questo script si limita a
togliere il passaggio manuale di copia-incolla nella pagina **Admin ·
Importa risultati gara**, una volta che il file JSON dei risultati è
già arrivato sul tuo disco (scaricato da LMU per le sessioni che
organizzate voi, o ricevuto dagli organizzatori per le altre).

**Nota su Assetto Corsa EVO:** ACE non offre al momento nessun modo di
scaricare un export risultati, quindi non è supportato da questo
script né dal backend. Si aggiungerà quando esisterà un formato
affidabile da cui partire (vedi anche la ricerca sulle API ACE/LMU).

## Setup (staff/admin)

Serve un token generato dal **tuo** profilo (bottone "Genera token
companion") con account staff/admin — `raceResults.import` è
un'azione riservata, un token da pilota semplice viene rifiutato dal
backend.

```
cd companion
python results_bridge.py
```

Al primo avvio chiede il token e la cartella da sorvegliare (di
default quella dello script; puoi indicare la tua cartella Download
per zero attrito — salvi il JSON scaricato da LMU e lo script se ne
accorge da solo). Le volte successive parte diretto.

Per importare un singolo file senza aprire il watch-loop:

```
python results_bridge.py "C:\percorso\al\file.json"
```

## Come funziona

1. Ogni ~5s controlla i file `.json` nella cartella sorvegliata,
   ignorando quelli già processati (stato salvato in
   `results_bridge_state.json`, accanto allo script).
2. Se un file combacia col formato risultati LMU (array di
   `{carClass, result: [...]}` — stesso identico contratto della pagina
   di import manuale) o col formato `event_result` di iRacing, chiede a
   terminale a quale gara del calendario VSD Paddock abbinarlo (lista
   presa da `races.list`).
3. Lo importa con `raceResults.import` — stessa action, stesse notifiche
   Discord, stesso matching piloti del pulsante "Importa risultati":
   per il backend non c'è differenza tra questo script e l'admin che
   incolla a mano.

File JSON che non assomigliano a un export risultati (altra roba nella
stessa cartella Download) vengono ignorati silenziosamente, non
generano errori.

## Struttura

```
companion/
  results_bridge.py             ← script principale (watch-loop + import)
  results_config.example.json   ← template, copiare in results_config.json
  results_bridge_state.json     ← generato da solo, traccia i file già importati
```

Nessuna dipendenza esterna (solo standard library) — non serve
compilare un exe, uno script staff può girare direttamente `python
results_bridge.py`.
