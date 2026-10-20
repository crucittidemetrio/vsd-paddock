// ═══════════════════════════════════════════════════════════
// VSD Paddock — invio automatico dei best lap (20/10/2026)
// ═══════════════════════════════════════════════════════════
// Ogni giro valido (non ai box, non invalidato dal gioco) che migliora il
// miglior tempo della sessione corrente su (pista, auto) viene inviato a
// best-laps-add con il device token del pilota. Il server decide se è un
// personale (best_laps) o solo attività (auto_lap_inbox).
//
// Config: Documenti\VSD Paddock\config.json, scritto a mano dal pilota:
//   { "device_token": "…", "auto_submit_sims": ["ACE"] }
// Il token si genera dal proprio profilo su vsd-paddock.vercel.app.
// Senza token il plugin funziona come prima (solo CSV), nessun errore.
//
// Robustezza: l'invio è asincrono (mai sul thread di DataUpdate). Se la
// rete o il server falliscono, il giro va in pending_laps.jsonl e viene
// ritentato all'avvio successivo e dopo ogni invio riuscito.
// Log leggibile in Documenti\VSD Paddock\LapData\upload.log.
// ═══════════════════════════════════════════════════════════

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace VsdLapDataLogger
{
    internal sealed class LapSubmission
    {
        public string Sim;
        public string Track;      // TrackId (chiave principale)
        public string TrackAlt;   // TrackIdWithConfig
        public string TrackName;  // TrackName + config leggibile
        public string Car;        // CarModel
        public string CarAlt;     // CarId
        public string SessionType;
        public double LapTimeMs;
        public double? Sector1Ms, Sector2Ms, Sector3Ms;
        public double? AirTempC, TrackTempC;

        public string ToJson(string pluginVersion)
        {
            var sb = new StringBuilder();
            sb.Append('{');
            Prop(sb, "sim", Sim); sb.Append(',');
            Prop(sb, "track", Track); sb.Append(',');
            Prop(sb, "track_alt", TrackAlt); sb.Append(',');
            Prop(sb, "track_name", TrackName); sb.Append(',');
            Prop(sb, "car", Car); sb.Append(',');
            Prop(sb, "car_alt", CarAlt); sb.Append(',');
            Prop(sb, "session_type", SessionType); sb.Append(',');
            Num(sb, "lap_time_ms", LapTimeMs); sb.Append(',');
            Num(sb, "sector1_ms", Sector1Ms); sb.Append(',');
            Num(sb, "sector2_ms", Sector2Ms); sb.Append(',');
            Num(sb, "sector3_ms", Sector3Ms); sb.Append(',');
            Num(sb, "air_temp_c", AirTempC); sb.Append(',');
            Num(sb, "track_temp_c", TrackTempC); sb.Append(',');
            Prop(sb, "plugin_version", pluginVersion);
            sb.Append('}');
            return sb.ToString();
        }

        private static void Prop(StringBuilder sb, string k, string v)
        {
            sb.Append('"').Append(k).Append("\":");
            if (v == null) { sb.Append("null"); return; }
            sb.Append('"');
            foreach (var c in v)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                        else sb.Append(c);
                        break;
                }
            }
            sb.Append('"');
        }

        private static void Num(StringBuilder sb, string k, double? v)
        {
            sb.Append('"').Append(k).Append("\":");
            if (v == null || double.IsNaN(v.Value) || double.IsInfinity(v.Value)) sb.Append("null");
            else sb.Append(Math.Round(v.Value, 3).ToString(CultureInfo.InvariantCulture));
        }
    }

    internal sealed class LapUploader : IDisposable
    {
        public const string PluginVersion = "2.0.0";
        private const string Endpoint = "https://cjbwhrrtxhckbkyxfdgm.supabase.co/functions/v1/best-laps-add";

        private readonly string _folder;
        private readonly string _pendingPath;
        private readonly string _logPath;
        private readonly HttpClient _http;
        private readonly SemaphoreSlim _lock = new SemaphoreSlim(1, 1);
        private readonly object _fileLock = new object();

        public string DeviceToken { get; private set; }
        public HashSet<string> EnabledSims { get; private set; }
        public bool IsConfigured => !string.IsNullOrWhiteSpace(DeviceToken);

        public LapUploader(string vsdFolder)
        {
            _folder = vsdFolder;
            var lapFolder = Path.Combine(vsdFolder, "LapData");
            Directory.CreateDirectory(lapFolder);
            _pendingPath = Path.Combine(lapFolder, "pending_laps.jsonl");
            _logPath = Path.Combine(lapFolder, "upload.log");

            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            _http = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };

            LoadConfig();
        }

        private void LoadConfig()
        {
            EnabledSims = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "ACE" };
            var path = Path.Combine(_folder, "config.json");
            try
            {
                if (!File.Exists(path))
                {
                    File.WriteAllText(path,
                        "{\r\n  \"device_token\": \"\",\r\n  \"auto_submit_sims\": [\"ACE\"]\r\n}\r\n");
                    Log("config.json creato: incolla il device token dal tuo profilo VSD Paddock e riavvia SimHub");
                    return;
                }
                var text = File.ReadAllText(path);
                var tok = Regex.Match(text, "\"device_token\"\\s*:\\s*\"([^\"]*)\"");
                DeviceToken = tok.Success ? tok.Groups[1].Value.Trim() : null;
                var sims = Regex.Match(text, "\"auto_submit_sims\"\\s*:\\s*\\[([^\\]]*)\\]");
                if (sims.Success)
                {
                    EnabledSims.Clear();
                    foreach (Match m in Regex.Matches(sims.Groups[1].Value, "\"([^\"]+)\""))
                        EnabledSims.Add(m.Groups[1].Value.Trim());
                }
                Log(IsConfigured
                    ? "Invio automatico attivo per: " + string.Join(", ", EnabledSims)
                    : "Nessun device token in config.json: invio automatico disattivato (solo CSV)");
            }
            catch (Exception e)
            {
                Log("Errore lettura config.json: " + e.Message);
            }
        }

        public void Submit(LapSubmission lap)
        {
            if (!IsConfigured || lap == null || !EnabledSims.Contains(lap.Sim)) return;
            var json = lap.ToJson(PluginVersion);
            Task.Run(async () =>
            {
                var ok = await SendAsync(json).ConfigureAwait(false);
                if (ok) await FlushPendingAsync().ConfigureAwait(false);
                else AppendPending(json);
            });
        }

        public void FlushPendingInBackground()
        {
            if (!IsConfigured) return;
            Task.Run(() => FlushPendingAsync());
        }

        private async Task<bool> SendAsync(string json)
        {
            await _lock.WaitAsync().ConfigureAwait(false);
            try
            {
                using (var req = new HttpRequestMessage(HttpMethod.Post, Endpoint))
                {
                    req.Headers.TryAddWithoutValidation("Authorization", "Bearer " + DeviceToken);
                    req.Content = new StringContent(json, Encoding.UTF8, "application/json");
                    using (var res = await _http.SendAsync(req).ConfigureAwait(false))
                    {
                        var body = await res.Content.ReadAsStringAsync().ConfigureAwait(false);
                        var code = (int)res.StatusCode;
                        if (code >= 200 && code < 300)
                        {
                            Log("OK " + Short(body));
                            return true;
                        }
                        Log("HTTP " + code + " " + Short(body));
                        // 4xx (token scaduto, dati rifiutati): inutile ritentare lo stesso giro
                        return code >= 400 && code < 500 && code != 408 && code != 429;
                    }
                }
            }
            catch (Exception e)
            {
                Log("Rete non disponibile, giro messo in coda: " + e.Message);
                return false;
            }
            finally
            {
                _lock.Release();
            }
        }

        private void AppendPending(string json)
        {
            try { lock (_fileLock) File.AppendAllText(_pendingPath, json + Environment.NewLine); }
            catch (Exception e) { Log("Impossibile salvare il giro in coda: " + e.Message); }
        }

        private async Task FlushPendingAsync()
        {
            string[] lines;
            lock (_fileLock)
            {
                if (!File.Exists(_pendingPath)) return;
                lines = File.ReadAllLines(_pendingPath);
                File.Delete(_pendingPath);
            }
            var failed = new List<string>();
            foreach (var line in lines)
            {
                if (string.IsNullOrWhiteSpace(line)) continue;
                if (!await SendAsync(line).ConfigureAwait(false)) failed.Add(line);
            }
            if (failed.Count > 0)
            {
                lock (_fileLock) File.AppendAllLines(_pendingPath, failed);
            }
        }

        private static string Short(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            s = s.Replace("\r", " ").Replace("\n", " ");
            return s.Length > 300 ? s.Substring(0, 300) + "…" : s;
        }

        private void Log(string msg)
        {
            try
            {
                lock (_fileLock)
                    File.AppendAllText(_logPath, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture) + "  " + msg + Environment.NewLine);
            }
            catch { /* il log non deve mai bloccare il plugin */ }
        }

        public void Dispose()
        {
            _http?.Dispose();
            _lock?.Dispose();
        }
    }
}
