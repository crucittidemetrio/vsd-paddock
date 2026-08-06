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

### 3. Configura

```
cd companion
cp config.example.json config.json
```

Apri `config.json` e compila:

| Campo | Cosa metterci |
|---|---|
| `api_url` | Lo stesso URL Apps Script usato dal frontend (`VITE_API_URL` in `.env.local`) |
| `token` | Il token generato al passo 2 |
| `race_id` | ID sessione — vedi sotto |
| `car_number` | Il numero della TUA vettura in quella sessione |

**`race_id` non deve per forza essere una gara ufficiale.** È solo
un'etichetta che raggruppa i campioni: per una gara VSD in calendario usa
lo stesso race_id (i dati compaiono anche in Admin → Gestione stint), per
una sessione di prova va bene qualsiasi etichetta a piacere (es.
`TEST-monza-06-08`) — basta che sia IDENTICA a quella che scrivi nel
pannello **Carburante/Energia** della webapp (menu laterale, visibile a
ogni pilota VSD, non solo staff).

`car_number` non viene indovinato automaticamente — se guidi più eventi
nello stesso weekend, ricontrolla di aver messo il numero giusto prima di
lanciare lo script.

### 4. Esegui

```
python fuel_bridge.py
```

Lancia (o passa a) Le Mans Ultimate ed entra in pista. I log mostrano un
campione inviato ad ogni giro completato. `Ctrl+C` per fermare.

Se non vedi nulla: controlla di essere davvero in pista (non nei menu),
che i plugin siano abilitati, e che `api_url`/`token` siano corretti — un
token scaduto o sbagliato fa fallire silenziosamente ogni invio (log
`WARNING`, non crash).

## Build .exe (facoltativo)

Per non richiedere Python installato ai piloti:

```
pip install pyinstaller
pyinstaller --onefile --name vsd-fuel-bridge fuel_bridge.py
```

L'eseguibile finito è in `dist/vsd-fuel-bridge.exe`. Va distribuito
**insieme** a `config.json` nella stessa cartella (non è incluso nell'exe,
resta modificabile senza ricompilare — ogni pilota lo compila una volta
sola con i propri dati).

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
