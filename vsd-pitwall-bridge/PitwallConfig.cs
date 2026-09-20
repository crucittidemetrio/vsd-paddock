using System.Text.Json;

namespace VsdPitwallBridge;

/// <summary>
/// Config locale per la registrazione delle sessioni sul backend
/// (pitwall.logSession) — stesso pattern della companion Python
/// (companion/fuel_bridge.py: run_setup_wizard/load_config), stesso file
/// di destinazione conceptuale ma nome/percorso distinti perché sono due
/// processi separati che non condividono config. Primo avvio senza file:
/// chiede il token a terminale e lo salva, le volte successive parte
/// senza fare domande.
/// </summary>
public sealed class PitwallConfig
{
    // Stessa Web App di companion/fuel_bridge.py — un solo backend, due
    // client diversi che ci parlano con lo stesso contratto {action, token, payload}.
    private const string DefaultApiUrl = "https://script.google.com/macros/s/AKfycbyMXxEjZfm5EIsGUnKxpwtBtoeR4hwMG7Pl8ZESF8yG569SS0aIdsWqyu9PdBgR14vLiA/exec";

    // #340 — endpoint Supabase per il relay Realtime (pitwall.broadcastLive,
    // #263), dispatcher consolidato "social-manager" sotto lo slug riusato
    // endurance-auditions-get (stesso principio di #259/#331/#338: tetto di
    // 100 Edge Function sul piano free). NON configurabile dall'utente (a
    // differenza di ApiUrl/Token, che restano l'unica cosa chiesta al primo
    // avvio): è un endpoint di piattaforma, non qualcosa che cambia da
    // installazione a installazione. Il gateway Supabase richiede SEMPRE un
    // JWT valido in Authorization anche per un'azione poi risolta via
    // legacy_token (stesso fix #329 già documentato in supabaseApi.js) — la
    // anon key qui sotto è pubblica per design (va nel bundle JS del sito),
    // non un segreto da proteggere.
    private const string SupabaseFunctionsUrl = "https://cjbwhrrtxhckbkyxfdgm.supabase.co/functions/v1/endurance-auditions-get";
    private const string SupabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqYndocnJ0eGhja2JreXhmZGdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMzQwODAsImV4cCI6MjA5MTgxMDA4MH0.FTSyp1cdsndqZ20hyZqdcaTIx8NrYskEJeeY1ft25sA";

    public string ApiUrl { get; init; } = DefaultApiUrl;
    public string Token { get; init; } = "";
    public string SupabaseUrl { get; init; } = SupabaseFunctionsUrl;
    public string SupabaseKey { get; init; } = SupabaseAnonKey;

    private static string ConfigPath()
    {
        var folder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
            "VSD Paddock");
        Directory.CreateDirectory(folder);
        return Path.Combine(folder, "pitwall-config.json");
    }

    public static PitwallConfig LoadOrCreate()
    {
        var path = ConfigPath();
        if (File.Exists(path))
        {
            try
            {
                var json = File.ReadAllText(path);
                var cfg = JsonSerializer.Deserialize<PitwallConfig>(json);
                if (cfg != null && !string.IsNullOrWhiteSpace(cfg.Token))
                {
                    return cfg;
                }
                Console.WriteLine("pitwall-config.json presente ma senza token valido, richiedo di nuovo.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"pitwall-config.json illeggibile ({ex.Message}), richiedo di nuovo.");
            }
        }

        return RunSetupWizard(path);
    }

    private static PitwallConfig RunSetupWizard(string path)
    {
        Console.WriteLine();
        Console.WriteLine("=== VSD Pitwall Bridge — registrazione sessioni: primo avvio ===");
        Console.WriteLine("Non trovo un token valido: serve per registrare a fine sessione il");
        Console.WriteLine("miglior giro di ogni pilota in griglia sul sito (pagina Pit Wall).");
        Console.WriteLine();

        string token;
        do
        {
            Console.Write("Token (dal tuo profilo VSD-Paddock, pulsante 'Genera token companion'): ");
            token = (Console.ReadLine() ?? "").Trim();
        } while (string.IsNullOrEmpty(token));

        var cfg = new PitwallConfig { Token = token };

        try
        {
            var json = JsonSerializer.Serialize(cfg, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(path, json);
            Console.WriteLine($"Salvato in {path}. Le prossime volte parte senza fare domande");
            Console.WriteLine("(cancella il file se devi cambiare token).");
        }
        catch (Exception ex)
        {
            // Non bloccante: il bridge funziona comunque per la parte live
            // (WebSocket), semplicemente non riuscirà a registrare le
            // sessioni finché il file non è scrivibile.
            Console.WriteLine($"Impossibile salvare pitwall-config.json ({ex.Message}) — te lo richiederò ogni volta.");
        }

        Console.WriteLine();
        return cfg;
    }
}
