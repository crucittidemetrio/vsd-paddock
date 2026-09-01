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

    public string ApiUrl { get; init; } = DefaultApiUrl;
    public string Token { get; init; } = "";

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
