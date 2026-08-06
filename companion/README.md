# VSD Paddock — Fuel/Energy Bridge (Le Mans Ultimate)

Companion app che legge carburante ed energia virtuale residui direttamente
dal gioco e li manda al backend VSD Paddock ad ogni cambio giro, per il
pannello di previsione consumi/rabbocchi (menu laterale → **Strumenti
Gara → Carburante/Energia**, visibile a ogni pilota VSD).

Solo Windows, solo Le Mans Ultimate (per ora).

---

## Per i piloti — uso rapido

Non serve installare Python: usa l'eseguibile già pronto
`vsd-fuel-bridge.exe` (te lo passa lo staff, di solito nel canale Discord
del team — viene ricompilato automaticamente da GitHub Actions ad ogni
aggiornamento, vedi sezione staff più sotto).

1. **Abilita i plugin in LMU** — Impostazioni → Gameplay → **Enable
   Plugins** → ON. Se lo cambi a gioco già aperto, riavvia LMU. Non
   installa nulla: è una funzione già dentro il gioco.
2. **Genera il tuo token** — dal tuo profilo su vsd-paddock, bottone
   **"Genera token companion"**. Dura 180 giorni, è personale: non
   condividerlo, chi lo ha può mandare dati consumo a tuo nome.
3. **Doppio click su `vsd-fuel-bridge.exe`.** Si apre una finestra nera
   (terminale) che al primo avvio fa 3 domande:
   - il token del passo 2
   - un ID sessione (per una gara ufficiale usa lo stesso race_id del
     calendario; per una prova libera va bene un'etichetta a piacere,
     es. `TEST-monza-06-08` — basta scrivere la STESSA cosa anche nel
     pannello Carburante/Energia della webapp)
   - il numero della tua vettura in quella sessione
4. **Lancia (o passa a) Le Mans Ultimate ed entra in pista.** Ad ogni
   giro completato la finestra mostra una riga di conferma. Lascia
   aperta la finestra per tutta la sessione; `Ctrl+C` (o chiudi la
   finestra) per fermare.
5. Apri il pannello **Carburante/Energia** sulla webapp con lo stesso ID
   sessione e numero vettura: dopo 2-3 giri vedi consumo medio,
   autonomia stimata e il grafico popolarsi.

Le volte successive, `vsd-fuel-bridge.exe` riparte diretto senza fare più
domande (si ricorda i dati). Se cambi vettura o sessione, cancella il file
`config.json` che si trova nella stessa cartella dell'exe: al prossimo
avvio richiede di nuovo i 3 dati.

**Se non vedi nulla nel pannello:** controlla di essere davvero in pista
(non nei menu di LMU), che i plugin siano abilitati, e che token/ID
sessione/numero vettura coincidano esattamente tra companion app e
webapp — un errore di battitura in uno dei due basta a non far comparire
i dati.

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
`companion/`.

Per scaricarlo: repo su GitHub → tab **Actions** → workflow **"Build
companion exe"** → run più recente (spunta verde) → in fondo alla pagina,
sezione **Artifacts** → `vsd-fuel-bridge-exe`. Richiede di essere
loggati su GitHub; l'artifact resta disponibile 90 giorni. Da lì lo
carichi dove preferisci (Discord, drive condiviso) per distribuirlo ai
piloti.

### Compilare a mano (alternativa, se non vuoi usare GitHub Actions)

```
pip install pyinstaller
cd companion
pyinstaller --onefile --name vsd-fuel-bridge fuel_bridge.py
```

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
    LICENSE.txt             ← licenza MIT del file vendorizzato
```

`vendor/lmu_data.py` è preso verbatim da
[TinyPedal/pyLMUSharedMemory](https://github.com/TinyPedal/pyLMUSharedMemory)
(MIT), a sua volta basato sull'header ufficiale S397
`SharedMemoryInterface`. Non modificarlo: la lettura funziona solo se il
layout in memoria combacia byte per byte con quello del gioco — un campo
tolto o riordinato disallinea silenziosamente tutti quelli successivi.
