# VSD Paddock — SimHub Lap Data Logger

Plugin SimHub minimale: scrive una riga CSV per ogni giro completato in LMU
(tempo sul giro, temperatura aria/asfalto, carburante residuo, flag
in-pit/yellow accumulati durante il giro). Alimenta l'Analisi di Passo in
vsd-paddock — upload manuale del CSV a fine sessione, stesso gesto già in
uso per l'import risultati gara.

**Nessuna parte di questo plugin è stata compilata o testata** — scritto in
un ambiente Linux senza SimHub/Visual Studio disponibili. Prima di fidarti
del codice, segui i passi sotto (sono lo STEP 0.3 dello spike, che tocca a
te completare).

## Perché un plugin su misura e non un progetto community

Abbiamo valutato [snipem/simhub-data-logger](https://github.com/snipem/simhub-data-logger):
logga bene un CSV per giro, ma il repo non ha **nessun file LICENSE**
(copyright di default "tutti i diritti riservati" — non redistribuibile ai
piloti senza permesso esplicito dell'autore), ha 0 stelle/un solo
maintainer, e logga *ogni* proprietà `StatusDataBase` invece dello schema
fisso che ci serve. Un plugin minimale su misura evita entrambi i problemi.

## Requisiti

- Windows con SimHub e Le Mans Ultimate installati
- LMU con `rFactor2SharedMemoryMapPlugin64.dll` copiato nella cartella
  Plugins di LMU (SimHub non legge LMU nativamente, passa da questo plugin
  — copialo da `<installazione rFactor2>\Bin64\Plugins\` a
  `<installazione LMU>\Plugins\`)
- Visual Studio 2022 (o successivo) con supporto WPF/C#

## Build

1. Apri `C:\Program Files (x86)\SimHub\PluginSdk\User.PluginSdkDemo` in
   Visual Studio — è il progetto template ufficiale, già configurato con i
   riferimenti corretti alla versione di SimHub installata (non li ho
   ricreati a mano per non rischiare versioni sbagliate delle DLL SDK).
2. Sostituisci il file `.cs` principale del template con
   `VsdLapDataLoggerPlugin.cs` di questa cartella (o aggiungilo al
   progetto e rimuovi la classe demo).
3. **Prima di buildare**: con LMU in esecuzione e SimHub connesso, apri in
   SimHub il pannello proprietà (es. tab "Additional plugins" → dashboard
   editor → cerca proprietà, oppure Controls → Formulas) e verifica dal
   vivo questi path — sono le uniche cose che potrebbero non compilare o
   restituire sempre vuoto/zero.

   **Già confermate via browser proprietà live del plugin NeoRed LMU Data**
   (già installato sulla macchina di gara, 288 proprietà, basato sulla REST
   API locale di LMU su `localhost:6397` — più affidabile della shared
   memory generica): sezione Weather → `Current.AmbientTemp` (aria) e
   `Track.Temp` (asfalto); sezione Game Infos → `PitState` (in-pit). Manca
   solo il **prefisso completo** con cui SimHub espone queste property nel
   namespace del plugin (`NeoRedPrefix` in cima al file, dedotto dal nome
   del DLL `NeoRed.lmuDataPlugin.dll` ma non verificato) — click destro/copia
   sul nome di una property in SimHub e correggi se il path pieno è diverso.

   NeoRed **non** espone carburante residuo grezzo (sezione Energy ha solo
   consumo/stima per giro, niente livello in litri) né bandiera gialla live
   (solo `FlagRules`, impostazione di sessione) — questi restano su property
   generiche core di SimHub, ancora da verificare:
   - `DataCorePlugin.GameData.NewData.Fuel`
   - `DataCorePlugin.GameData.NewData.Flag_Yellow` (nome incerto per rF2/LMU)

   Anche queste, non toccate dalla ricerca NeoRed:
   - `DataCorePlugin.GameData.NewData.DriverName` (potrebbe essere `PlayerName`)
   - `DataCorePlugin.GameData.NewData.CompletedLaps`
   - `DataCorePlugin.GameData.NewData.LastLapTime`

   Se un path è diverso, correggilo in `PropertyNames` in cima al file —
   è l'unico punto da toccare.
4. Build → copia la DLL risultante in `C:\Program Files (x86)\SimHub\`
   (stesso passo di installazione di qualsiasi plugin SimHub) → riavvia
   SimHub → il plugin compare in *Additional Plugins*.

## Cosa verificare con un giro reale (chiude lo STEP 0.3)

Fai un giro completo in LMU con SimHub + plugin attivi, poi apri il CSV
generato in `Documenti\VSD Paddock\LapData\` e controlla che:
- `lap_time_ms` sia un numero sensato (non 0, non vuoto)
- `track_temp_c`/`air_temp_c` non siano sempre 0 (rischio noto: alcuni
  campi del game-reader rFactor2 su SimHub restituiscono 0 per limiti del
  reader stesso, non del plugin — vedi issue #471 su SHWotever/SimHub)
- `fuel_l` scenda in modo plausibile giro dopo giro
- `in_pits`/`yellow_flag` diventino `TRUE` quando pertinente

Mandami il CSV risultante (anche solo 2-3 giri) e procedo con l'import
backend usando lo schema reale, non quello presunto.

## Schema CSV (fisso, concordato)

```
session_id,driver_name,sim,lap_number,lap_time_ms,in_pits,yellow_flag,track_temp_c,air_temp_c,fuel_l,timestamp_iso
```

Nota sui campi rispetto al brief originale: niente colonna `valid`/`LapStatus`
a 6 stati (valido/invalido/outlap/black flag/inlap/joker) — quella
proprietà appartiene al plugin terzo DahlDesignProperties (iRacing-focused,
non nativa SimHub) e comunque la shared memory nativa LMU non espone
un'invalidazione giro per taglio pista (li abbiamo già mappati byte per
byte in `companion/vendor/lmu_data.py` per l'hotstint: solo `mInPits` e
`mYellowFlagState`/`mSectorFlag`, niente equivalente). Usiamo `in_pits` +
`yellow_flag`, stessa convenzione già in produzione in FuelLog — coerenza
con quanto già esiste invece di un enum che non potremmo popolare
onestamente.
