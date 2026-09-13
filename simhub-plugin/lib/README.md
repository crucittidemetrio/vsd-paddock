# DLL vendorizzate — perché sono qui

`SimHub.Plugins.dll` e `GameReaderCommon.dll` sono le assembly di
**interfaccia/API** che SimHub fornisce agli sviluppatori di plugin di
terze parti (stesse referenziate dal template ufficiale
`User.PluginSdkDemo` incluso in ogni installazione di SimHub, in
`C:\Program Files (x86)\SimHub\PluginSdk\`). Non contengono l'applicazione
SimHub né logica di gioco: solo le classi/interfacce (`IPlugin`,
`IDataPlugin`, `PluginManager`, i tipi di `GameReaderCommon`, ecc.) che un
plugin deve implementare per compilare. Vendorizzarle qui è pratica comune
tra gli sviluppatori di plugin SimHub open source (vedi ad es. i repo di
[zegreatclan](https://github.com/zegreatclan)), proprio per permettere la
build in CI su una macchina che non ha e non può avere SimHub installato
(un runner GitHub Actions).

Se in futuro SimHub cambia versione delle API e il plugin smette di
compilare, sostituisci questi due file con le versioni più recenti prese
da una installazione SimHub aggiornata (`C:\Program Files (x86)\SimHub\`)
e ricompila in locale per verificare la compatibilità prima di pushare.

Non sono necessarie per lo sviluppo/build in locale se hai SimHub
installato: il `.csproj` usa automaticamente le DLL della tua
installazione reale (`SIMHUB_INSTALL_PATH`) quando presente, e cade su
queste solo come fallback (CI, o macchine senza SimHub).
