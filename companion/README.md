# VSD Paddock — Fuel/Energy Bridge (Le Mans Ultimate)

Companion app che legge carburante ed energia virtuale residui direttamente
dal gioco e li manda al backend VSD Paddock ad ogni cambio giro, per il
pannello di previsione consumi/rabbocchi in Admin → Gestione stint.

Solo Windows, solo Le Mans Ultimate (per ora). Nessuna dipendenza esterna a
runtime — solo Python 3.9+ e la standard library.

## Come funziona

Le Mans Ultimate scrive i propri dati in tempo reale in una shared memory
ufficiale (interfaccia documentata da Studio 397, non un plugin di terze
parti). Lo script `fuel_bridge.py` la legge, individua la tua vettura
(`playerVehicleIdx`) ed estrae: giro corrente, litri di carburante residui,
capacità serbatoio, energia virtuale residua (solo classi ibride
LMDh/Hypercar). Ad ogni cambio giro manda un campione a `fuel.logSample`.

Il backend calcola da solo consumo medio mobile e autonomia stimata
(`fuel.summary`) — questo script si limita a raccogliere e inviare i dati
grezzi.

## Setup

### 1. Abilita i plugin in LMU

Impostazioni → Gameplay → **Enable Plugins** → ON. Serve un riavvio del
gioco se lo cambi mentre è aperto. Non serve installare nessun file: è
built-in.

### 2. Genera il tuo token

Dal tuo profilo su vsd-paddock, bottone **"Genera token companion"**.
Il token è valido 180 giorni ed è legato alla tua identità — non
condividerlo, chi lo ha può scrivere campioni consumo a tuo nome (stesso
livello di rischio di un token di sessione normale, solo con validità più
lunga).

### 3. Esegui

```
python fuel_bridge.py
```

**Non serve editare nessun file a mano.** Al primo avvio, se non trova
`config.json`, lo script fa 3 domande direttamente nel terminale — token,
ID sessione, numero vettura — e si salva tutto da solo. Le volte
successive parte diretto, senza richieste (cancella `config.json` per
ricominciare, es. se cambi vettura o sessione).

**`race_id`/ID sessione non deve per forza essere una gara ufficiale.** È
solo un'etichetta che raggruppa i campioni: per una gara VSD in calendario
usa lo stesso race_id (i dati compaiono anche in Admin → Gestione stint),
per una sessione di prova va bene qualsiasi etichetta a piacere (es.
`TEST-monza-06-08`) — basta che sia IDENTICA a quella che scrivi nel
pannello **Carburante/Energia** della webapp (menu laterale, visibile a
ogni pilota VSD, non solo staff).

Lancia (o passa a) Le Mans Ultimate ed entra in pista. I log mostrano un
campione inviato ad ogni giro completato. `Ctrl+C` per fermare.

Se non vedi nulla: controlla di essere davvero in pista (non nei menu),
che i plugin siano abilitati, e che il token sia corretto e non scaduto —
un token sbagliato fa fallire silenziosamente ogni invio (log `WARNING`,
non crash).

Chi preferisce compilare un file invece di rispondere alle domande può
ancora copiare `config.example.json` in `config.json` e editarlo a mano
prima di lanciare lo script.

## Distribuire un .exe ai piloti senza Python (consigliato)

La maggior parte dei piloti non ha Python installato. Una persona sola
(chi ha già Python, es. da questo setup) compila **una volta** un
eseguibile Windows e lo distribuisce a tutti — ogni pilota deve solo
scaricarlo e fare doppio click, il wizard di configurazione (passo 3
sopra) parte comunque al primo avvio:

```
pip install pyinstaller
cd companion
pyinstaller --onefile --name vsd-fuel-bridge fuel_bridge.py
```

L'eseguibile finito è in `dist/vsd-fuel-bridge.exe` — è un file singolo,
autosufficiente, non serve più portarsi dietro `config.json`: ogni pilota
lo doppio-clicca, risponde alle 3 domande la prima volta (token/sessione/
vettura) e da lì in poi parte da solo. Il file va ricompilato solo se
cambia il codice dello script, non ad ogni gara.

## Struttura

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
