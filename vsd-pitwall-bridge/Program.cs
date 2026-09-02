using System.Collections.Concurrent;
using System.Net;
using System.Net.Http;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace VsdPitwallBridge;

public class Program
{
    private const string WsPrefix = "http://localhost:8090/ws/";
    private const int PollIntervalMs = 200; // ~5Hz, in linea con il refresh dello Scoring buffer

    private static readonly ConcurrentDictionary<Guid, WebSocket> Clients = new();

    public static async Task Main()
    {
        Console.WriteLine("VSD Pitwall Bridge — avvio");
        Console.WriteLine($"WebSocket in ascolto su {WsPrefix}");
        Console.WriteLine("In attesa che Le Mans Ultimate sia avviato e in sessione...");

        var cfg = PitwallConfig.LoadOrCreate();

        var httpTask = RunWebSocketServerAsync();
        var pollTask = RunScoringPollLoopAsync(cfg);

        await Task.WhenAll(httpTask, pollTask);
    }

    // ------------------------------------------------------------------
    // Server WebSocket: accetta connessioni dal front-end React (/pitwall)
    // ------------------------------------------------------------------
    private static async Task RunWebSocketServerAsync()
    {
        var listener = new HttpListener();
        listener.Prefixes.Add(WsPrefix);
        listener.Start();

        while (true)
        {
            var ctx = await listener.GetContextAsync();
            if (!ctx.Request.IsWebSocketRequest)
            {
                ctx.Response.StatusCode = 400;
                ctx.Response.Close();
                continue;
            }

            var wsCtx = await ctx.AcceptWebSocketAsync(null);
            var id = Guid.NewGuid();
            Clients[id] = wsCtx.WebSocket;
            Console.WriteLine($"Client connesso: {id} (totale: {Clients.Count})");

            _ = MonitorClientAsync(id, wsCtx.WebSocket);
        }
    }

    // Rimuove il client quando si disconnette (il front-end non manda nulla,
    // riceve soltanto — questo loop serve solo a rilevare la chiusura).
    private static async Task MonitorClientAsync(Guid id, WebSocket socket)
    {
        var buffer = new byte[1024];
        try
        {
            while (socket.State == WebSocketState.Open)
            {
                var result = await socket.ReceiveAsync(buffer, CancellationToken.None);
                if (result.MessageType == WebSocketMessageType.Close) break;
            }
        }
        catch (WebSocketException)
        {
            // disconnessione anomala: va bene, rimuoviamo comunque sotto
        }
        finally
        {
            Clients.TryRemove(id, out _);
            Console.WriteLine($"Client disconnesso: {id} (totale: {Clients.Count})");
        }
    }

    // ------------------------------------------------------------------
    // Loop di polling: legge lo Scoring buffer, costruisce il payload,
    // lo manda a tutti i client connessi. Tiene anche traccia dell'ultimo
    // snapshot valido per poter registrare il best lap di ogni pilota
    // (griglia intera, non solo il giocatore locale) quando la sessione
    // finisce — vedi PostSessionSummaryAsync più sotto.
    // ------------------------------------------------------------------
    private static async Task RunScoringPollLoopAsync(PitwallConfig cfg)
    {
        using var reader = new RF2ScoringReader();
        using var http = new HttpClient();
        bool wasOpen = false;
        string? sessionId = null;
        RF2Scoring? lastScoring = null;

        while (true)
        {
            if (!reader.TryOpen())
            {
                if (wasOpen)
                {
                    Console.WriteLine("Sessione LMU persa, in attesa di riconnessione...");
                    if (lastScoring is { } finalScoring && sessionId != null)
                    {
                        await PostSessionSummaryAsync(http, cfg, finalScoring, sessionId);
                    }
                }
                wasOpen = false;
                sessionId = null;
                lastScoring = null;
                await Task.Delay(1000);
                continue;
            }

            if (!wasOpen)
            {
                Console.WriteLine("Sessione LMU agganciata.");
                sessionId = "PW-" + DateTime.UtcNow.ToString("yyyyMMdd-HHmmss", System.Globalization.CultureInfo.InvariantCulture);
            }
            wasOpen = true;

            var snapshot = reader.ReadOnce();
            if (snapshot is { } scoring)
            {
                lastScoring = scoring;
                var payload = BuildPayload(scoring);
                await BroadcastAsync(payload);
            }

            await Task.Delay(PollIntervalMs);
        }
    }

    /// <summary>
    /// Trasforma i dati grezzi in un payload pit-wall: gap dal leader (gia'
    /// calcolato dal gioco in mTimeBehindLeader/mLapsBehindLeader), stato
    /// pit/penalita', ordinato per posizione. Il carburante NON e' qui: vive
    /// nel Telemetry buffer (mFuel) ed e' affidabile solo per la vettura del
    /// giocatore locale — va aggiunto come sorgente separata se serve.
    /// </summary>
    private static object BuildPayload(RF2Scoring scoring)
    {
        var info = scoring.mScoringInfo;
        int numVehicles = Math.Clamp(info.mNumVehicles, 0, RFactor2Constants.MAX_MAPPED_VEHICLES);

        var vehicles = scoring.mVehicles
            .Take(numVehicles)
            .OrderBy(v => v.mPlace)
            .Select(v => new
            {
                id = v.mID,
                driver = RF2StringHelper.ToTrimmedString(v.mDriverName),
                vehicle = RF2StringHelper.ToTrimmedString(v.mVehicleName),
                vClass = RF2StringHelper.ToTrimmedString(v.mVehicleClass),
                place = v.mPlace,
                laps = v.mTotalLaps,
                timeBehindLeader = v.mTimeBehindLeader,
                lapsBehindLeader = v.mLapsBehindLeader,
                timeBehindNext = v.mTimeBehindNext,
                lastLapTime = v.mLastLapTime,
                bestLapTime = v.mBestLapTime,
                // Settori — dato già presente nello Scoring buffer (RF2VehicleScoring),
                // semplicemente mai selezionato prima in questo payload. Convenzione
                // rF2/LMU: -1 = "non ancora impostato", stesso sentinel di
                // mBestLapTime/mLastLapTime — il frontend lo tratta allo stesso modo
                // di fmtLapTime(). Nessun campo "settore 3" diretto: si ricava lato
                // frontend come lastLapTime - lastSector1 - lastSector2 (stimato, non
                // riportato a parte dal gioco).
                lastSector1 = v.mLastSector1,
                lastSector2 = v.mLastSector2,
                bestSector1 = v.mBestSector1, // miglior tempo di settore MAI segnato (non per forza dello stesso giro)
                bestSector2 = v.mBestSector2,
                inPits = v.mInPits != 0,
                pitState = v.mPitState, // grezzo, vedi nota su mPitState in RF2Scoring.cs (valore 5
                                        // osservato in test reale, non nell'enum 0-4 documentato)
                numPitstops = v.mNumPitstops,
                numPenalties = v.mNumPenalties,
                finishStatus = v.mFinishStatus, // 0=none,1=finished,2=dnf,3=dq
            })
            .ToArray();

        return new
        {
            track = RF2StringHelper.ToTrimmedString(info.mTrackName),
            session = info.mSession, // 0=test,1-4=practice,5-8=qual,9=warmup,10-13=race
            gamePhase = info.mGamePhase, // 0..9
            yellowFlagState = info.mYellowFlagState,
            sessionTimeElapsed = info.mCurrentET,
            sessionTimeEnd = info.mEndET,
            maxLaps = info.mMaxLaps,
            trackTemp = info.mTrackTemp,
            ambientTemp = info.mAmbientTemp,
            raining = info.mRaining,
            vehicles,
            updatedAt = DateTimeOffset.UtcNow,
        };
    }

    private static async Task BroadcastAsync(object payload)
    {
        var json = JsonSerializer.Serialize(payload);
        var bytes = Encoding.UTF8.GetBytes(json);
        var segment = new ArraySegment<byte>(bytes);

        foreach (var (id, socket) in Clients)
        {
            if (socket.State != WebSocketState.Open)
            {
                Clients.TryRemove(id, out _);
                continue;
            }

            try
            {
                await socket.SendAsync(segment, WebSocketMessageType.Text, true, CancellationToken.None);
            }
            catch (WebSocketException)
            {
                Clients.TryRemove(id, out _);
            }
        }
    }

    // ------------------------------------------------------------------
    // Registrazione fine sessione: best lap di ogni pilota in griglia
    // verso l'endpoint Apps Script pitwall.logSession. Stesso contratto
    // JSON della companion Python (companion/fuel_bridge.py:post_sample):
    // body {action, token, payload} come text/plain, per evitare preflight
    // CORS lato Apps Script. NON scrive nel tab "manuale" di BestLaps —
    // vedi nota in apps-script/PitwallSessions.js sul perché.
    // ------------------------------------------------------------------
    private static async Task PostSessionSummaryAsync(HttpClient http, PitwallConfig cfg, RF2Scoring scoring, string sessionId)
    {
        var info = scoring.mScoringInfo;
        int numVehicles = Math.Clamp(info.mNumVehicles, 0, RFactor2Constants.MAX_MAPPED_VEHICLES);

        var drivers = scoring.mVehicles
            .Take(numVehicles)
            .Where(v => v.mBestLapTime > 0) // -1 = nessun giro valido ancora, niente da registrare
            .Select(v => new
            {
                driver_name = RF2StringHelper.ToTrimmedString(v.mDriverName),
                vehicle_name = RF2StringHelper.ToTrimmedString(v.mVehicleName),
                vehicle_class = RF2StringHelper.ToTrimmedString(v.mVehicleClass),
                best_lap_time_ms = (long)Math.Round(v.mBestLapTime * 1000),
                laps = (int)v.mTotalLaps,
                final_place = (int)v.mPlace,
            })
            .ToArray();

        if (drivers.Length == 0)
        {
            Console.WriteLine("Nessun giro valido in questa sessione, niente da registrare.");
            return;
        }

        var payload = new
        {
            session_id = sessionId,
            track_name = RF2StringHelper.ToTrimmedString(info.mTrackName),
            sim = "LMU",
            session_type = info.mSession,
            captured_at = DateTimeOffset.UtcNow,
            drivers,
        };

        var body = JsonSerializer.Serialize(new
        {
            action = "pitwall.logSession",
            token = cfg.Token,
            payload,
        });

        try
        {
            using var content = new StringContent(body, Encoding.UTF8, "text/plain");
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(25)); // margine ampio, Apps Script a volte è lento
            var response = await http.PostAsync(cfg.ApiUrl, content, cts.Token);
            var responseText = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(responseText);
            if (doc.RootElement.TryGetProperty("ok", out var okProp) && okProp.GetBoolean())
            {
                Console.WriteLine($"Sessione {sessionId} registrata: {drivers.Length} piloti con un giro valido.");
            }
            else
            {
                var error = doc.RootElement.TryGetProperty("error", out var errProp) ? errProp.GetString() : "sconosciuto";
                Console.WriteLine($"Backend ha rifiutato la sessione {sessionId}: {error}");
            }
        }
        catch (Exception ex)
        {
            // Una sessione persa non deve far crashare il bridge: logga e
            // vai avanti, la prossima sessione riprova comunque.
            Console.WriteLine($"Impossibile registrare la sessione {sessionId}: {ex.Message}");
        }
    }
}
