# VSD Paddock — Fuel/Energy Bridge (Le Mans Ultimate)

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
| 1 | Scarica `vsd-fuel-bridge.exe` da [questa pagina](https://github.com/crucittidemetrio/vsd-paddock/actions/workflows/build-companion.yml) → clicca la run più in alto → in fondo, sezione **Artifacts** → `vsd-fuel-bridge-exe` (serve un account GitHub loggato) |
| 2 | Fai doppio click sul file scaricato. Si apre una finestra nera |
| 3 | **Solo la prima volta**, ti chiede 3 cose: il tuo token, un nome per la sessione (es. `TEST-monza-06-08` per una prova, oppure il race_id ufficiale per una gara) e il numero della tua vettura |
| 4 | Entra in pista su LMU. Ad ogni giro completato vedi una riga confermare l'invio |
| 5 | Apri il pannello **Carburante/Energia** sul sito (menu laterale → Strumenti Gara), scrivendo lo STESSO nome sessione e numero vettura del passo 3 |

Lascia la finestra nera aperta per tutta la sessione. Per fermare:
`Ctrl+C` o chiudi la finestra.

Le sessioni dopo la prima non richiedono più le 3 domande — si ricorda
tutto da solo. Se cambi vettura o sessione, cancella il file
`config.json` che trovi nella stessa cartella dell'exe: alla prossima
apertura te le richiede di nuovo.

**Non vedi dati nel pannello?** Controlla, in ordine: sei davvero in
pista (non nei menu)? I plugin LMU sono su ON? Nome sessione e numero
vettura sono scritti IDENTICI sia nell'exe che sul sito (attenzione a
maiuscole/spazi)?

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
