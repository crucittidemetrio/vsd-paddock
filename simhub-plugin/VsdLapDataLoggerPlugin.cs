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
// ⚠️ NON COMPILATO NÉ TESTATO in questa sessione — scritto in un
// sandbox Linux senza SimHub/Visual Studio disponibili. Vedi
// README.md in questa cartella per i passi di build/verifica reali
// (STEP 0.3 dello spike, bloccato lato utente).
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
// Aggiornamento post-spike (browser proprietà NeoRed LMU Data plugin,
// già installato e attivo sulla macchina di gara): temperature e stato
// pit-lane sono confermate DA UI LIVE, non più solo ipotesi:
//   - Weather → "Current.AmbientTemp" e "Track.Temp" (aria/asfalto)
//   - Game Infos → "PitState" (in-pit)
// Il PREFISSO completo di queste property (namespace del plugin NeoRed
// davanti al suffisso mostrato in UI) resta da confermare dal vivo — la
// UI di SimHub mostra path abbreviati per sezione, non la stringa piena
// da passare a GetPropertyValue(). Il prefisso sotto (NeoRedPrefix) è
// dedotto dal nome del DLL (NeoRed.lmuDataPlugin.dll) ma NON verificato:
// prima di buildare, click destro/copia sul nome di una property in
// SimHub (es. "Current.AmbientTemp") e correggi NeoRedPrefix se il path
// copiato è diverso.
// Carburante residuo in litri e bandiera gialla NON sono esposti da
// NeoRed (sezione Energy ha solo consumo/stima, nessun livello grezzo;
// "flag" in NeoRed è solo FlagRules, impostazione di sessione) — restano
// sulle property generiche core di SimHub, ancora da verificare.
//
// PRIMA DI FIDARTI DI QUESTO FILE: apri SimHub con LMU in esecuzione e
// verifica NeoRedPrefix + Fuel + FlagYellow + DriverName + CompletedLaps
// + LastLapTime (vedi lista in PropertyNames sotto) e correggi le
// costanti se differiscono. Questo è esattamente lo STEP 0.3 che tocca
// a te.
// ═══════════════════════════════════════════════════════════

using System;
using System.Globalization;
using System.IO;
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

        // ── Confermate via browser proprietà NeoRed live (screenshot UI) ──
        public const string RoadTemperature = NeoRedPrefix + "Weather.Track.Temp";          // °C — sezione Weather, NON "TrackTemperature"
        public const string AirTemperature = NeoRedPrefix + "Weather.Current.AmbientTemp";  // °C — sezione Weather
        public const string IsInPit = NeoRedPrefix + "GameInfos.PitState";                  // sezione Game Infos — tipo esatto (bool/enum/stringa) da verificare, ReadBool gestisce entrambi

        // ── NeoRed non le espone (verificato: sezione Energy = solo consumo/stima,
        //    "flag" = solo FlagRules di sessione) → restano su property core SimHub,
        //    ancora da confermare dal vivo ──
        public const string Fuel = "DataCorePlugin.GameData.NewData.Fuel";                 // litri
        public const string FlagYellow = "DataCorePlugin.GameData.NewData.Flag_Yellow";    // bool — verificare nome esatto per rF2/LMU

        // ── Non toccate dalla ricerca NeoRed, ancora ipotesi da verificare ──
        public const string DriverName = "DataCorePlugin.GameData.NewData.DriverName";     // string — verificare, potrebbe essere PlayerName
        public const string CompletedLaps = "DataCorePlugin.GameData.NewData.CompletedLaps"; // int
        public const string LastLapTime = "DataCorePlugin.GameData.NewData.LastLapTime";   // TimeSpan
        public const string GameName = "DataCorePlugin.GameData.GameName";                 // string (per popolare "sim")
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

            // Giro appena completato → scrivi la riga.
            WriteLapRow(pluginManager, completedLaps);

            _lastCompletedLaps = completedLaps;
            _lapInPitsAccum = false;
            _lapYellowAccum = false;
        }

        private void WriteLapRow(PluginManager pluginManager, int lapNumber)
        {
            var driverName = ReadString(pluginManager, PropertyNames.DriverName);
            var sim = ReadString(pluginManager, PropertyNames.GameName);
            var lapTimeMs = ReadLapTimeMs(pluginManager);
            var trackTemp = ReadDouble(pluginManager, PropertyNames.RoadTemperature);
            var airTemp = ReadDouble(pluginManager, PropertyNames.AirTemperature);
            var fuel = ReadDouble(pluginManager, PropertyNames.Fuel);

            var line = string.Join(",",
                Csv(_sessionId),
                Csv(driverName),
                Csv(sim),
                lapNumber.ToString(CultureInfo.InvariantCulture),
                lapTimeMs?.ToString(CultureInfo.InvariantCulture) ?? "",
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
