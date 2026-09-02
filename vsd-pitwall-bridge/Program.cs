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

    // ── Diagnostica settori mancanti (temporanea, vedi LogSectorAnomalies) ──
    private static StreamWriter? _diagWriter;
    private static readonly HashSet<int> _diagLoggedIds = new();

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
        using var telemetryReader = new RF2TelemetryReader(); // vedi RF2Telemetry.cs — solo vettura locale
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
                    _diagWriter?.Flush();
                    _diagWriter?.Dispose();
                    _diagWriter = null;
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
                _diagLoggedIds.Clear();
                _diagWriter = OpenDiagWriter(sessionId);
            }
            wasOpen = true;

            var snapshot = reader.ReadOnce();
            if (snapshot is { } scoring)
            {
                lastScoring = scoring;
                LogSectorAnomalies(scoring);

                // Telemetry e' un buffer separato (puo' non esserci ancora, o il
                // plugin puo' non esporlo): un fallimento qui non deve bloccare
                // classifica/gap/settori, che restano sempre disponibili dallo
                // Scoring buffer da solo.
                RF2Telemetry? telemetry = telemetryReader.TryOpen() ? telemetryReader.ReadOnce() : null;

                var payload = BuildPayload(scoring, telemetry);
                await BroadcastAsync(payload);
            }

            await Task.Delay(PollIntervalMs);
        }
    }

    /// <summary>
    /// Trasforma i dati grezzi in un payload pit-wall: gap dal leader (gia'
    /// calcolato dal gioco in mTimeBehindLeader/mLapsBehindLeader), stato
    /// pit/penalita', ordinato per posizione, più "myCar" (carburante e
    /// gomme, SOLO vettura del giocatore locale — vedi RF2Telemetry.cs sul
    /// perché non per tutta la griglia).
    /// </summary>
    private static object BuildPayload(RF2Scoring scoring, RF2Telemetry? telemetry)
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
                // bestLapSector1/2 (float, campi SEPARATI da mBestSector1/2): sono i
                // settori DELLO STESSO giro di mBestLapTime — vedi commento sul campo
                // in RF2Scoring.cs. Il frontend li usa per il viola/verde invece di
                // lastSector1/2: comparare l'ultimo giro completato al record di sessione
                // dava viola solo nell'istante esatto in cui un pilota migliorava (spariva
                // al giro dopo, osservato dal vivo il 02/09 — "non vedo mai viola"). Usando
                // il settore del PROPRIO giro migliore, il colore resta stabile finché il
                // record non viene battuto — stessa convenzione delle schermate F1/WEC.
                bestLapSector1 = v.mBestLapSector1,
                bestLapSector2 = v.mBestLapSector2,
                inPits = v.mInPits != 0,
                // Gialla PER VETTURA — campo già presente in RF2VehicleScoring (mai
                // selezionato prima), letto direttamente dalla memoria condivisa del
                // gioco, non da SimHub. Risolve un limite documentato in
                // VsdLapDataLoggerPlugin.cs: la property SimHub "Flag_Yellow" segnala
                // bandiera gialla in QUALSIASI punto del circuito, non per vettura —
                // durante un incidente restava vera per giri interi anche per chi non
                // era coinvolto. Qui invece è per-vettura, dato diretto del gioco.
                underYellow = v.mUnderYellow != 0,
                pitState = v.mPitState, // grezzo, vedi nota su mPitState in RF2Scoring.cs (valore 5
                                        // osservato in test reale, non nell'enum 0-4 documentato)
                numPitstops = v.mNumPitstops,
                numPenalties = v.mNumPenalties,
                finishStatus = v.mFinishStatus, // 0=none,1=finished,2=dnf,3=dq
            })
            .ToArray();

        // Vettura del giocatore locale nello Scoring buffer (mIsPlayer!=0) —
        // usata solo per trovare l'mID con cui pescare la riga giusta nel
        // Telemetry buffer, che ha un proprio array separato di vetture.
        int? localPlayerId = null;
        foreach (var v in scoring.mVehicles.Take(numVehicles))
        {
            if (v.mIsPlayer != 0) { localPlayerId = v.mID; break; }
        }

        object? myCar = null;
        if (telemetry is { } tel && localPlayerId is { } pid)
        {
            int numTelVehicles = Math.Clamp(tel.mNumVehicles, 0, RFactor2Constants.MAX_MAPPED_VEHICLES);
            foreach (var vt in tel.mVehicles.Take(numTelVehicles))
            {
                if (vt.mID == pid)
                {
                    myCar = BuildMyCarPayload(vt);
                    break;
                }
            }
        }

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
            myCar, // null se non si sta guidando (spettatore) o Telemetry buffer non ancora pronto
            updatedAt = DateTimeOffset.UtcNow,
        };
    }

    // "myCar": carburante + gomme + danni della vettura del giocatore
    // locale. Solo qui il Telemetry buffer e' affidabile (vedi nota in
    // testa a RF2Telemetry.cs) — per questo non e' nell'array vehicles sopra.
    private static object BuildMyCarPayload(RF2VehicleTelemetry vt)
    {
        // Danni: mDentSeverity ha 8 valori "a zone attorno all'auto", ma il
        // commento originale del plugin dice solo "8 locations around the
        // car" — nessuna mappa documentata di quale indice sia quale zona
        // (anteriore/laterale/ecc). Invece di inventare una posizione non
        // verificata, esponiamo un riepilogo (danno massimo + quante zone
        // colpite) più il vettore grezzo, per un domani in cui la mappa
        // venga confermata dal vivo.
        var dents = vt.mDentSeverity.Select(b => (int)b).ToArray();
        int maxDentSeverity = dents.Length > 0 ? dents.Max() : 0;
        int dentedZones = dents.Count(d => d > 0);

        // mLastImpactMagnitude > 0 come sentinel "c'e' stato un urto in
        // questa sessione" — mLastImpactET da solo e' ambiguo (0 potrebbe
        // essere "mai" o "urto proprio all'inizio della sessione").
        bool hasImpact = vt.mLastImpactMagnitude > 0;

        return new
        {
            fuelL = vt.mFuel > 0 ? vt.mFuel : (double?)null,
            fuelCapacityL = vt.mFuelCapacity > 0 ? vt.mFuelCapacity : (double?)null,
            engineWaterTempC = vt.mEngineWaterTemp,
            engineOilTempC = vt.mEngineOilTemp,
            overheating = vt.mOverheating != 0,
            bodyDetached = vt.mDetached != 0, // parti di carrozzeria staccate (non le ruote — vedi tire.detached)
            maxDentSeverity, // 0=nessun danno, 1=poco, 2=tanto
            dentedZones, // quante delle 8 zone hanno un danno > 0
            dentSeverityRaw = dents, // vettore grezzo, posizione esatta non documentata dal gioco
            lastImpactMagnitude = hasImpact ? vt.mLastImpactMagnitude : (double?)null,
            lastImpactSecondsAgo = hasImpact ? Math.Max(0, vt.mElapsedTime - vt.mLastImpactET) : (double?)null,
            tires = new[]
            {
                BuildTirePayload(vt.mWheels[0], "FL"),
                BuildTirePayload(vt.mWheels[1], "FR"),
                BuildTirePayload(vt.mWheels[2], "RL"),
                BuildTirePayload(vt.mWheels[3], "RR"),
            },
        };
    }

    // Temperatura gomme: Kelvin nel buffer nativo, convertita qui in Celsius
    // (non lato frontend). "left/center/right" invece di "inner/mid/outer":
    // vedi nota in testa a RF2Telemetry.cs sul perché non è un mapping
    // affidabile senza verifica dal vivo.
    private static object BuildTirePayload(RF2Wheel w, string pos)
    {
        static double? KtoC(double kelvin) => kelvin > 0 ? kelvin - 273.15 : (double?)null;

        return new
        {
            pos,
            pressureKpa = w.mPressure > 0 ? w.mPressure : (double?)null,
            wearPct = w.mWear >= 0 ? Math.Round(w.mWear * 100, 1) : (double?)null,
            brakeTempC = w.mBrakeTemp > 0 ? w.mBrakeTemp : (double?)null,
            tempLeftC = KtoC(w.mTemperature[0]),
            tempCenterC = KtoC(w.mTemperature[1]),
            tempRightC = KtoC(w.mTemperature[2]),
            flat = w.mFlat != 0,
            detached = w.mDetached != 0,
        };
    }

    private static StreamWriter OpenDiagWriter(string sessionId)
    {
        var folder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
            "VSD Paddock", "PitwallDiagnostics");
        Directory.CreateDirectory(folder);
        var path = Path.Combine(folder, sessionId + ".csv");
        var writer = new StreamWriter(path, append: false) { AutoFlush = true };
        writer.WriteLine("vehicle_id,driver,laps,control,server_scored,is_player,laps_behind_leader,laps_behind_next,best_lap_time,best_lap_sector1,best_lap_sector2,best_sector1_ever,best_sector2_ever,last_sector1,last_sector2");
        Console.WriteLine($"Log diagnostico settori: {path}");
        return writer;
    }

    /// <summary>
    /// Diagnostica temporanea (02/09/2026): capire perché alcune vetture in griglia
    /// non hanno mai i settori popolati pur avendo giri completati — osservato dal
    /// vivo (screenshot pit wall con S1/S2/S3 vuoti solo per certe auto, correlato
    /// con Gap/Intervallo vuoti sulle stesse righe). Logga UNA riga per vettura, alla
    /// prima volta che si osserva "giri > 0 ma settori del giro migliore assenti",
    /// con i campi che potrebbero spiegare la causa (IA/rete/replay, scoring lato
    /// server, distacco in giri). Nessun impatto sul payload live inviato ai client:
    /// scrive solo su file, va tolta una volta capita la causa.
    /// </summary>
    private static void LogSectorAnomalies(RF2Scoring scoring)
    {
        if (_diagWriter == null) return;
        var info = scoring.mScoringInfo;
        int numVehicles = Math.Clamp(info.mNumVehicles, 0, RFactor2Constants.MAX_MAPPED_VEHICLES);

        foreach (var v in scoring.mVehicles.Take(numVehicles))
        {
            if (v.mTotalLaps <= 0) continue; // nessun giro ancora, niente da spiegare
            if (_diagLoggedIds.Contains(v.mID)) continue;

            bool missingSectors = v.mBestLapSector1 <= 0 || v.mBestLapSector2 <= 0;
            if (!missingSectors) continue;

            _diagLoggedIds.Add(v.mID);
            _diagWriter.WriteLine(string.Join(",",
                v.mID,
                CsvField(RF2StringHelper.ToTrimmedString(v.mDriverName)),
                v.mTotalLaps,
                v.mControl,
                v.mServerScored,
                v.mIsPlayer,
                v.mLapsBehindLeader,
                v.mLapsBehindNext,
                v.mBestLapTime.ToString(System.Globalization.CultureInfo.InvariantCulture),
                v.mBestLapSector1.ToString(System.Globalization.CultureInfo.InvariantCulture),
                v.mBestLapSector2.ToString(System.Globalization.CultureInfo.InvariantCulture),
                v.mBestSector1.ToString(System.Globalization.CultureInfo.InvariantCulture),
                v.mBestSector2.ToString(System.Globalization.CultureInfo.InvariantCulture),
                v.mLastSector1.ToString(System.Globalization.CultureInfo.InvariantCulture),
                v.mLastSector2.ToString(System.Globalization.CultureInfo.InvariantCulture)
            ));
        }
    }

    private static string CsvField(string value)
    {
        if (string.IsNullOrEmpty(value)) return "";
        if (value.IndexOfAny(new[] { ',', '"', '\n' }) < 0) return value;
        return "\"" + value.Replace("\"", "\"\"") + "\"";
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
