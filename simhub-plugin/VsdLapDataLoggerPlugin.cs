// ═══════════════════════════════════════════════════════════
// VSD Paddock — SimHub Lap Data Logger (Obiettivo 3: Analisi di Passo)
// ═══════════════════════════════════════════════════════════
// Plugin SimHub minimale, scritto su misura invece di riusare
// github.com/snipem/simhub-data-logger — quel progetto non ha nessun
// file LICENSE nel repo (default "tutti i diritti riservati": non
// redistribuibile ai piloti senza permesso dell'autore), ha 0
// stella/singolo maintainer, e logga OGNI proprietà StatusDataBase
// invece dello schema fisso che serve a noi. Vedi la ricerca completa
// nel thread/PR che accompagna questo file per i dettagli.
//
// Cosa fa: una riga CSV per ogni giro completato, con lo schema fisso
// concordato — NON telemetria a tick, NON un flusso realtime (quello è
// per un'altra fase, vedi ADR-LMU-Integration.md).
//
// Compilato e testato dal vivo su LMU il 01/09/2026 (build SDK-style via
// `dotnet build`, vedi VsdLapDataLogger.csproj e README.md in questa
// cartella). Scritto originariamente in un sandbox Linux senza SimHub —
// da qui l'uso di GetPropertyValue(string) invece di campi tipizzati,
// vedi sotto.
//
// Perché GetPropertyValue(string) invece di data.NewData.XxxYyy
// tipizzato: non avevo modo di verificare qui i nomi esatti dei
// campi sulla classe GameData/NewData del PluginSdk reale (nessun
// SimHub installato in questo ambiente). L'accesso per stringa è
// documentato e usato di routine dagli utenti SimHub (stessa logica
// di $prop() nei formula JS/NCalc — vedi wiki "Javascript Formula
// Engine") ed è più tollerante: se un nome è sbagliato la property
// torna null invece di rompere la compilazione, e la lista di
// PropertyNames sotto è l'UNICO punto da correggere se il debug in
// SimHub mostra path diversi da quelli qui sotto.
//
// Aggiornamento 02/09/2026 — temperature (track_temp_c/air_temp_c erano
// vuote nel test reale del 01/09): la property NeoRed-prefixed era una
// scommessa debole (dedotta solo dal nome del DLL, mai verificata dal
// vivo). Ricerca incrociata (forum SimHub ufficiale + progetti plugin
// terzi pubblici) conferma che RoadTemperature/AirTemperature sono
// proprietà CORE generiche di SimHub — "DataCorePlugin.GameData.NewData.X",
// stesso identico prefisso già confermato per Fuel/Flag_Yellow/
// CompletedLaps nel test reale — non specifiche del plugin NeoRed.
// Quindi ora si prova PRIMA la property core (alta confidenza) e solo
// come fallback quella NeoRed (bassa confidenza, mai confermata): se
// la core esiste per LMU come per gli altri sim supportati, funziona
// al primo test senza bisogno di verifica manuale nell'editor formule.
//
// DriverName resta il punto più debole: la property core è confermata
// VUOTA per LMU dal test reale (limite noto SimHub, non solo LMU). Il
// fallback NeoRed "TeamInfos.Driver" resta un'ipotesi non verificata —
// se il CSV mostra ancora "" dopo il prossimo test, va controllato a
// mano nell'editor formule di SimHub (drag&drop della property per
// vedere la stringa $prop(...) esatta).
// ═══════════════════════════════════════════════════════════

using System;
using System.Globalization;
using System.IO;
using GameReaderCommon; // GameData — confermato leggendo User.PluginSdkDemo.csproj reale (referenzia GameReaderCommon.dll)
using SimHub.Plugins; // dal template User.PluginSdkDemo — vedi README

namespace VsdLapDataLogger
{
    /// <summary>
    /// Path SimHub (formato "Plugin.Oggetto.Campo") delle proprietà lette.
    /// Unico punto da correggere se in SimHub risultano nomi diversi.
    /// </summary>
    internal static class PropertyNames
    {
        // Prefisso plugin NeoRed LMU Data — dedotto dal nome del DLL
        // (NeoRed.lmuDataPlugin.dll), NON confermato dal vivo. Verificare
        // con click destro/copia su una property in SimHub e correggere
        // qui se il path pieno differisce (unico punto da toccare).
        public const string NeoRedPrefix = "NeoRed.lmuDataPlugin.";

        // ── Temperature: provate PRIMA come property core SimHub (alta
        //    confidenza, stesso prefisso già confermato per Fuel/
        //    Flag_Yellow/CompletedLaps), poi come fallback NeoRed (bassa
        //    confidenza, mai confermata dal vivo) — vedi ReadDoubleWithFallback.
        public const string RoadTemperatureCore = "DataCorePlugin.GameData.NewData.RoadTemperature"; // °C
        public const string AirTemperatureCore = "DataCorePlugin.GameData.NewData.AirTemperature";   // °C
        public const string RoadTemperatureNeoRed = NeoRedPrefix + "Weather.Track.Temp";          // fallback, NON confermato
        public const string AirTemperatureNeoRed = NeoRedPrefix + "Weather.Current.AmbientTemp";  // fallback, NON confermato

        public const string IsInPit = NeoRedPrefix + "GameInfos.PitState";                  // sezione Game Infos — tipo esatto (bool/enum/stringa) da verificare, ReadBool gestisce entrambi

        // ── NeoRed non le espone (verificato: sezione Energy = solo consumo/stima,
        //    "flag" = solo FlagRules di sessione) → restano su property core SimHub ──
        public const string Fuel = "DataCorePlugin.GameData.NewData.Fuel";                 // litri — CONFERMATO dal test reale (calo sensato giro dopo giro)

        // Flag_Yellow: nome property confermato corretto (esiste davvero in SimHub,
        // vedi forum ufficiale). MA per LMU è un limite noto e documentato, non un
        // bug nostro: la property segnala "bandiera gialla in QUALSIASI punto del
        // circuito", non solo nel settore del pilota — a differenza di iRacing/ACC
        // che la localizzano. Quindi durante una sessione con traffico/incidenti
        // (anche IA) può restare vera per giri interi senza che sia un errore di
        // lettura. Fonte: simhubdash.com/community-2/simhub-support/
        // yellow-flags-local-sector-only-in-lmu/ — la fix "vera" richiederebbe
        // leggere GameRawData.Data.mSectorFlag01/02/03 per settore, molto più
        // complesso di quanto serva qui: per ora "giro pulito" in Analisi di Passo
        // filtra semplicemente su questo valore, sapendo che può essere
        // sovra-inclusivo (troppi giri esclusi) più che sotto-inclusivo.
        public const string FlagYellow = "DataCorePlugin.GameData.NewData.Flag_Yellow";

        // DriverName: la property generica "DataCorePlugin.GameData.NewData.DriverName"
        // testata dal vivo il 01/09/2026 è risultata sempre vuota (limite noto SimHub
        // per molti giochi, non solo LMU). Nel browser proprietà NeoRed la sezione
        // "Team Infos" espone "Driver" — path dedotto per lo stesso pattern già
        // confermato per Weather (nome sezione senza spazi + nome proprietà). NON
        // ancora verificato dal vivo con un valore reale: se torna ancora vuoto,
        // il path pieno differisce e va corretto qui.
        public const string DriverName = NeoRedPrefix + "TeamInfos.Driver";

        // ── Confermate dal test reale del 01/09/2026 (valori sensati nel CSV) ──
        public const string CompletedLaps = "DataCorePlugin.GameData.NewData.CompletedLaps"; // int
        public const string LastLapTime = "DataCorePlugin.GameData.NewData.LastLapTime";   // TimeSpan

        // "sim" NON viene più letto da una property SimHub (nessun risultato utile
        // cercando "game"/"name" nel browser proprietà, vedi verifica dal vivo del
        // 01/09/2026) — questo plugin è scritto solo per LMU (usa proprietà
        // specifiche NeoRed), quindi il valore è fisso. Un punto di rottura in meno.
        public const string GameNameFixed = "LMU";
    }

    public class VsdLapDataLoggerPlugin : IPlugin, IDataPlugin
    {
        public PluginManager PluginManager { get; set; }

        private StreamWriter _writer;
        private string _sessionId;
        private int? _lastCompletedLaps;
        private bool _lapInPitsAccum;
        private bool _lapYellowAccum;

        // ─── Lifecycle ───

        public void Init(PluginManager pluginManager)
        {
            _sessionId = "LAP-" + DateTime.UtcNow.ToString("yyyyMMdd-HHmmss", CultureInfo.InvariantCulture);
            _lastCompletedLaps = null;
            _lapInPitsAccum = false;
            _lapYellowAccum = false;

            var folder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
                "VSD Paddock", "LapData");
            Directory.CreateDirectory(folder);

            var path = Path.Combine(folder, _sessionId + ".csv");
            _writer = new StreamWriter(path, append: false) { AutoFlush = true };
            _writer.WriteLine("session_id,driver_name,sim,lap_number,lap_time_ms,in_pits,yellow_flag,track_temp_c,air_temp_c,fuel_l,timestamp_iso");
        }

        public void End(PluginManager pluginManager)
        {
            _writer?.Flush();
            _writer?.Dispose();
            _writer = null;
        }

        // ─── Tick — chiamato ad ogni aggiornamento dati SimHub ───
        // Nessuna scrittura per-tick: accumula solo in_pits/yellow_flag
        // (stesso pattern OR-accumulation di companion/fuel_bridge.py —
        // un valore booleano può essere vero solo per un istante tra un
        // poll e l'altro, quindi si accumula con OR invece di leggere lo
        // stato solo al momento del giro completato) e scrive UNA riga
        // quando CompletedLaps incrementa.

        public void DataUpdate(PluginManager pluginManager, ref GameData data)
        {
            if (data == null || !data.GameRunning || _writer == null) return;

            _lapInPitsAccum |= ReadBool(pluginManager, PropertyNames.IsInPit);
            _lapYellowAccum |= ReadBool(pluginManager, PropertyNames.FlagYellow);

            var completedLapsRaw = ReadDouble(pluginManager, PropertyNames.CompletedLaps);
            if (completedLapsRaw == null) return;
            var completedLaps = (int)completedLapsRaw.Value;

            if (_lastCompletedLaps == null)
            {
                _lastCompletedLaps = completedLaps;
                return;
            }

            if (completedLaps <= _lastCompletedLaps.Value) return;

            // Giro appena completato. lap_time_ms=0/null capita in due casi noti
            // e NON è un giro vero da loggare: (1) il "giro 1" fittizio subito
            // dopo l'uscita ai box a inizio sessione (LastLapTime non ancora
            // popolato), (2) un "giro fantasma" quando si rientra ai box/si
            // esce dalla sessione (CompletedLaps scatta ma nessun tempo valido
            // è stato segnato — osservato nel test reale del 01/09: riga con
            // fuel_l in AUMENTO, cioè rifornimento ai box, 10s dopo l'ultimo
            // giro vero). In entrambi i casi saltiamo la scrittura invece di
            // loggare uno zero e delegare il filtro al frontend — il numero
            // di giro può avere "buchi" nella sequenza, riflette la realtà.
            var lapTimeMs = ReadLapTimeMs(pluginManager);
            if (lapTimeMs != null && lapTimeMs.Value > 0)
            {
                WriteLapRow(pluginManager, completedLaps, lapTimeMs.Value);
            }

            _lastCompletedLaps = completedLaps;
            _lapInPitsAccum = false;
            _lapYellowAccum = false;
        }

        private void WriteLapRow(PluginManager pluginManager, int lapNumber, double lapTimeMs)
        {
            var driverName = ReadString(pluginManager, PropertyNames.DriverName);
            var sim = PropertyNames.GameNameFixed;
            var trackTemp = ReadDoubleWithFallback(pluginManager, PropertyNames.RoadTemperatureCore, PropertyNames.RoadTemperatureNeoRed);
            var airTemp = ReadDoubleWithFallback(pluginManager, PropertyNames.AirTemperatureCore, PropertyNames.AirTemperatureNeoRed);
            var fuel = ReadDouble(pluginManager, PropertyNames.Fuel);

            var line = string.Join(",",
                Csv(_sessionId),
                Csv(driverName),
                Csv(sim),
                lapNumber.ToString(CultureInfo.InvariantCulture),
                lapTimeMs.ToString(CultureInfo.InvariantCulture),
                _lapInPitsAccum ? "TRUE" : "FALSE",
                _lapYellowAccum ? "TRUE" : "FALSE",
                trackTemp?.ToString(CultureInfo.InvariantCulture) ?? "",
                airTemp?.ToString(CultureInfo.InvariantCulture) ?? "",
                fuel?.ToString(CultureInfo.InvariantCulture) ?? "",
                DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture)
            );

            _writer.WriteLine(line);
        }

        // ─── Helpers lettura proprietà (tolleranti: null se assente/tipo diverso) ───

        private static double? ReadDouble(PluginManager pm, string propertyName)
        {
            try
            {
                var raw = pm.GetPropertyValue(propertyName);
                if (raw == null) return null;
                return Convert.ToDouble(raw, CultureInfo.InvariantCulture);
            }
            catch
            {
                return null;
            }
        }

        // Prova prima "primary" (alta confidenza), poi "fallback" solo se
        // primary torna null — MAI se primary torna un numero valido ma
        // "sospetto" (es. 0): un 0°C reale è plausibile in alcune condizioni
        // meteo, quindi non lo trattiamo come "assente".
        private static double? ReadDoubleWithFallback(PluginManager pm, string primary, string fallback)
        {
            var value = ReadDouble(pm, primary);
            return value ?? ReadDouble(pm, fallback);
        }

        // Tollerante anche a PitState come stringa/enum (es. "None"/"Pit"),
        // non solo bool — il tipo esatto restituito da NeoRed per PitState
        // non è confermato, quindi copriamo tutti i casi plausibili.
        private static bool ReadBool(PluginManager pm, string propertyName)
        {
            try
            {
                var raw = pm.GetPropertyValue(propertyName);
                if (raw == null) return false;
                if (raw is bool b) return b;
                if (raw is string s)
                {
                    if (string.IsNullOrEmpty(s)) return false;
                    var normalized = s.Trim().ToLowerInvariant();
                    return normalized != "none" && normalized != "false" && normalized != "0" && normalized != "no";
                }
                return Convert.ToDouble(raw, CultureInfo.InvariantCulture) != 0;
            }
            catch
            {
                return false;
            }
        }

        private static string ReadString(PluginManager pm, string propertyName)
        {
            try
            {
                var raw = pm.GetPropertyValue(propertyName);
                return raw?.ToString() ?? "";
            }
            catch
            {
                return "";
            }
        }

        // LastLapTime è tipicamente un TimeSpan lato SimHub — proviamo
        // prima il cast diretto, poi il fallback a double (millisecondi
        // o secondi, dipende dal game reader: verificare in 0.3).
        private static double? ReadLapTimeMs(PluginManager pm)
        {
            try
            {
                var raw = pm.GetPropertyValue(PropertyNames.LastLapTime);
                if (raw == null) return null;
                if (raw is TimeSpan ts) return ts.TotalMilliseconds;
                return Convert.ToDouble(raw, CultureInfo.InvariantCulture);
            }
            catch
            {
                return null;
            }
        }

        private static string Csv(string value)
        {
            if (string.IsNullOrEmpty(value)) return "";
            if (value.IndexOfAny(new[] { ',', '"', '\n' }) < 0) return value;
            return "\"" + value.Replace("\"", "\"\"") + "\"";
        }
    }
}
