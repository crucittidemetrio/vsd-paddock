#!/usr/bin/env python3
"""
VSD Paddock — Fuel/Energy Bridge per Le Mans Ultimate
═══════════════════════════════════════════════════════════════════
Legge carburante ed energia virtuale residui dalla shared memory
ufficiale di Le Mans Ultimate (nessun plugin da installare su Windows,
basta il toggle "Enable Plugins" in Impostazioni → Gameplay) e manda
un campione a fuel.logSample sul backend VSD Paddock ad ogni cambio
giro, così l'admin vede consumo medio e autonomia stimata in tempo
reale nel pannello stint.

Setup (pilota, nessuna modifica manuale di file richiesta):
  1. python fuel_bridge.py  (oppure doppio click su vsd-fuel-bridge.exe,
     se qualcuno ha già compilato l'exe — vedi sotto)
  2. Al primo avvio, se non trova config.json, lo script chiede a voce
     token/race_id/car_number direttamente nel terminale e li salva da
     solo in config.json accanto allo script — non serve editare JSON
     a mano. Le volte successive parte diretto, senza richieste.
     L'ID sessione è OPZIONALE: lasciato vuoto, lo script gira in
     "modalità personale" — genera da solo una nuova sessione ogni
     volta che passano 30 minuti senza campioni, e la pagina
     /carburante-energia del sito la trova in automatico (basta essere
     loggati, nessun ID da copiare). Comportamento invariato se invece
     si digita un race_id (gara ufficiale o test con etichetta fissa).
  3. Lancia Le Mans Ultimate, entra in pista — i campioni partono da
     soli ad ogni cambio giro (comprese velocità min/max/media del giro,
     tempo giro/settori, pit/bandiera gialla e traccia/vettura rilevate
     in automatico). Ctrl+C per fermare.

  (config.example.json resta disponibile per chi preferisce compilare
  il file a mano invece di rispondere alle domande.)

Build .exe (facoltativo, per non richiedere Python ai piloti — o vedi
.github/workflows/build-companion.yml, che lo fa automaticamente):
  pip install pyinstaller
  pyinstaller --onefile --name vsd-fuel-bridge --paths vendor --hidden-import lmu_data fuel_bridge.py
  L'exe finito è in dist/vsd-fuel-bridge.exe, già autosufficiente
  (vendor/lmu_data.py incluso dentro — --paths/--hidden-import servono
  perché è importato via sys.path.insert a runtime, che l'analisi
  statica di PyInstaller non vede da sola). config.json si crea da solo
  accanto all'exe al primo avvio, non va copiato a mano.
═══════════════════════════════════════════════════════════════════
"""

import json
import logging
import sys
import threading
import time
from pathlib import Path
from urllib import error as urllib_error
from urllib import request as urllib_request

def _app_dir() -> Path:
    """Cartella dove si trova DAVVERO l'eseguibile (o lo script) sul
    disco, usata per config.json — deve restare la stessa tra un avvio
    e l'altro. In un exe PyInstaller "--onefile", __file__ punta invece
    alla cartella temporanea di estrazione (sys._MEIPASS), che viene
    cancellata alla chiusura: salvarci config.json lì dentro vorrebbe
    dire richiedere di nuovo le 3 domande ad OGNI avvio, non solo al
    primo."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


# vendor/lmu_data.py invece va cercato accanto al sorgente quando si
# esegue "python fuel_bridge.py"; nell'exe compilato è già impacchettato
# come modulo (vedi --paths/--hidden-import nelle istruzioni di build in
# README.md) e questo insert diventa un no-op innocuo.
sys.path.insert(0, str(Path(__file__).resolve().parent / "vendor"))
from lmu_data import SimInfo  # noqa: E402  (vendorizzato, vedi vendor/LICENSE.txt)

CONFIG_PATH = _app_dir() / "config.json"
POLL_INTERVAL_S = 2.0
RECONNECT_INTERVAL_S = 5.0
# Ping "live" indipendente dal cambio giro — solo per il valore
# istantaneo mostrato nel pannello, non entra nel calcolo del consumo
# medio (quello resta legato al campione per-giro, vedi post_sample).
LIVE_PING_INTERVAL_S = 15.0

# Modalità sessione personale (race_id vuoto in config.json): dopo
# questo gap di inattività si apre una nuova sessione locale con un
# nuovo race_id auto-generato. DEVE combaciare con
# FUEL_MY_SESSION_MAX_AGE_MS lato backend (FuelLog.js) — è la soglia
# che fuel.mySession usa per decidere se una sessione è ancora "attiva":
# se le due soglie divergessero, il sito potrebbe considerare chiusa
# una sessione che il companion pensa ancora aperta (o viceversa).
SOLO_SESSION_GAP_S = 30 * 60.0

# URL pubblico del backend Apps Script — lo stesso già usato dal
# frontend (VITE_API_URL), non è un segreto: è l'endpoint a cui il
# browser di ogni pilota manda già richieste normalmente. Tenerlo qui
# come default evita che ogni pilota debba andarselo a cercare.
DEFAULT_API_URL = "https://script.google.com/macros/s/AKfycbyMXxEjZfm5EIsGUnKxpwtBtoeR4hwMG7Pl8ZESF8yG569SS0aIdsWqyu9PdBgR14vLiA/exec"

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("fuel_bridge")


def run_setup_wizard() -> dict:
    """Primo avvio senza config.json: chiede i 3 dati che cambiano da
    pilota a pilota (token/race_id/car_number) direttamente a terminale
    e salva config.json accanto allo script. Pensato per chi non vuole
    (o non sa) editare un file JSON a mano."""
    print()
    print("=== VSD Paddock Fuel Bridge — primo avvio ===")
    print("Non trovo config.json: rispondi a queste 3 domande e lo creo io.")
    print()

    token = input("1) Token (dal tuo profilo VSD-Paddock, pulsante 'Genera token companion'): ").strip()
    while not token:
        token = input("   Il token è obbligatorio, riprova: ").strip()

    race_id = input(
        "2) ID sessione — lascia VUOTO e premi invio per una sessione personale\n"
        "   (il sito la trova da solo, nessun ID da digitare/copiare). Scrivi un\n"
        "   valore solo per il race_id di una gara ufficiale o un'etichetta di\n"
        "   test fissa da condividere con qualcun altro: "
    ).strip()

    if race_id:
        car_number = input("3) Numero della tua vettura in questa sessione (es. 7): ").strip()
        while not car_number:
            car_number = input("   Il numero vettura è obbligatorio, riprova: ").strip()
    else:
        car_number = ""
        print("   → Modalità sessione personale: nessun numero vettura da inserire.")

    cfg = {
        "api_url": DEFAULT_API_URL,
        "token": token,
        "race_id": race_id,
        "car_number": car_number,
    }
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)

    print()
    print(f"Salvato in {CONFIG_PATH.name}. Le prossime volte parte senza fare domande")
    print("(cancella il file se devi cambiare sessione/vettura/token).")
    print()
    return cfg


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        return run_setup_wizard()
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    # race_id/car_number sono opzionali: vuoti/assenti = modalità
    # sessione personale (vedi SOLO_SESSION_GAP_S e current_ids() in
    # main()). Solo api_url/token restano obbligatori.
    required = ["api_url", "token"]
    missing = [k for k in required if not cfg.get(k)]
    if missing:
        log.error("config.json incompleto, mancano: %s", ", ".join(missing))
        sys.exit(1)
    cfg.setdefault("race_id", "")
    cfg.setdefault("car_number", "")
    return cfg


def post_sample(cfg: dict, payload: dict) -> None:
    """Manda un campione a fuel.logSample. Stesso contratto del frontend
    (client.js/realApi.js): body JSON {action, token, payload} come
    text/plain, per evitare complicazioni con i preflight CORS lato
    Apps Script.

    Chiamata SEMPRE tramite post_sample_async (thread separato, vedi
    sotto): Apps Script a volte impiega diversi secondi a rispondere
    (comportamento noto della piattaforma, non un errore) — se questa
    funzione girasse nel loop principale, per tutta la durata della
    richiesta lo script non leggerebbe la telemetria e rischierebbe di
    perdere il cambio giro successivo."""
    body = json.dumps({
        "action": "fuel.logSample",
        "token": cfg["token"],
        "payload": payload,
    }).encode("utf-8")
    req = urllib_request.Request(
        cfg["api_url"],
        data=body,
        headers={"Content-Type": "text/plain;charset=utf-8"},
        method="POST",
    )
    try:
        # 25s: margine ampio sui tempi di risposta occasionalmente lenti
        # di Apps Script. Innocuo per il loop principale dato che gira
        # in un thread a parte (vedi post_sample_async).
        with urllib_request.urlopen(req, timeout=25) as resp:
            result = json.loads(resp.read().decode("utf-8"))
        if not result.get("ok"):
            log.warning("Backend ha rifiutato il campione: %s", result.get("error"))
        else:
            energy_txt = (
                f", energia {payload['virtual_energy_pct']:.0f}%"
                if payload.get("virtual_energy_pct") is not None else ""
            )
            log.info(
                "Giro %s inviato — carburante %.1fL%s",
                payload["lap_number"], payload["fuel_remaining_l"], energy_txt,
            )
    except TimeoutError:
        log.warning(
            "Giro %s: il backend non ha risposto in tempo, campione perso "
            "(capita ogni tanto con Apps Script, riprova al prossimo giro)",
            payload["lap_number"],
        )
    except urllib_error.URLError as e:
        log.warning("Errore di rete inviando il campione (riprovo al prossimo giro): %s", e)
    except Exception:  # noqa: BLE001 — non deve mai far crashare il loop principale
        log.exception("Errore inatteso inviando il campione")


def post_sample_async(cfg: dict, payload: dict) -> None:
    """Manda il campione in un thread separato, cosi' il loop principale
    (lettura shared memory LMU) non si blocca in attesa della risposta
    di rete. Daemon=True: se il programma viene chiuso con un invio
    ancora in corso, non lo tiene in vita ad aspettare."""
    threading.Thread(target=post_sample, args=(cfg, payload), daemon=True).start()


def post_live(cfg: dict, payload: dict) -> None:
    """Manda un ping leggero a fuel.logLive — stesso schema di
    post_sample, ma silenzioso sui successi (altrimenti il terminale
    si riempirebbe di una riga ogni 15s oltre a quella per giro) e
    senza dettagli nel log di errore, dato che la perdita di un ping
    live è innocua (il prossimo arriva tra 15s)."""
    body = json.dumps({
        "action": "fuel.logLive",
        "token": cfg["token"],
        "payload": payload,
    }).encode("utf-8")
    req = urllib_request.Request(
        cfg["api_url"],
        data=body,
        headers={"Content-Type": "text/plain;charset=utf-8"},
        method="POST",
    )
    try:
        with urllib_request.urlopen(req, timeout=25) as resp:
            json.loads(resp.read().decode("utf-8"))
    except Exception:  # noqa: BLE001 — un ping live perso non è mai un problema
        pass


def post_live_async(cfg: dict, payload: dict) -> None:
    threading.Thread(target=post_live, args=(cfg, payload), daemon=True).start()


def _find_player_scoring(scor_data):
    """Trova la riga del player in vehScoringInfo. L'indice NON è detto
    coincida con playerVehicleIdx della telemetria — gli array Scoring e
    Telemetry non hanno garanzia di essere ordinati allo stesso modo
    (Scoring tende a seguire l'ordine di classifica) — quindi si cerca
    sempre per mIsPlayer==True invece di riusare l'indice della
    telemetria."""
    info = scor_data.scoringInfo
    count = min(info.mNumVehicles, len(scor_data.vehScoringInfo))
    for i in range(count):
        veh = scor_data.vehScoringInfo[i]
        if veh.mIsPlayer:
            return veh
    return None


def _session_yellow_active(scoring_info) -> bool:
    """True se in quell'istante è attiva una gialla a tutto campo
    (mYellowFlagState — valori -1=invalid e 0=none esclusi) oppure una
    gialla locale in uno qualsiasi dei 3 settori (mSectorFlag). Sono
    entrambi campi di sessione (non per-vettura): una gialla vale per
    chiunque la stia attraversando, non solo per chi l'ha causata."""
    try:
        state = int.from_bytes(scoring_info.mYellowFlagState, "little", signed=True)
    except Exception:  # noqa: BLE001 — lettura strappata, tratta come "nessuna gialla"
        state = 0
    fcy_active = state not in (-1, 0)
    local_yellow = any(b != 0 for b in scoring_info.mSectorFlag)
    return fcy_active or local_yellow


def _decode_name(raw) -> str:
    """Decodifica un campo char[] della shared memory (mTrackName,
    mVehicleName) in stringa Python pulita. La shared memory riempie il
    buffer fisso con byte nulli di padding dopo la stringa vera — si
    tronca al primo \\x00 prima di decodificare, altrimenti si porta
    dietro padding invisibile che romperebbe confronti/display."""
    if not raw:
        return ""
    try:
        return raw.split(b"\x00", 1)[0].decode("utf-8", errors="replace").strip()
    except Exception:  # noqa: BLE001 — un nome illeggibile non deve mai far crashare il loop
        return ""


def connect() -> SimInfo:
    """Prova ad aprire la shared memory finché non è disponibile.
    Non serve che LMU sia già avviato: se il gioco non ha ancora
    inizializzato la memoria condivisa, i valori letti sono a zero e
    playerHasVehicle resta False — il loop principale aspetta senza
    mandare nulla, quindi qui basta un retry difensivo sugli errori
    veri (permessi, ecc.)."""
    while True:
        try:
            sim = SimInfo()
            log.info("Connesso alla shared memory di Le Mans Ultimate (%s)", "LMU_Data")
            return sim
        except Exception as e:  # noqa: BLE001
            log.info("In attesa di Le Mans Ultimate... (%s)", e)
            time.sleep(RECONNECT_INTERVAL_S)


def main() -> None:
    cfg = load_config()
    solo_mode = not cfg.get("race_id")
    if solo_mode:
        log.info("VSD Paddock Fuel Bridge — modalità sessione personale (nessun ID richiesto)")
    else:
        log.info(
            "VSD Paddock Fuel Bridge — gara %s, vettura #%s",
            cfg["race_id"], cfg["car_number"],
        )

    sim = connect()
    last_sent_lap = None
    last_live_sent_ts = 0.0
    # Velocità (km/h) accumulate ad ogni poll durante il giro in corso,
    # svuotate e ridotte a min/max/media quando il giro cambia — vedi
    # sotto, subito prima di costruire il payload del campione per-giro.
    lap_speed_samples = []
    # in_pits/yellow_flag: booleani accumulati con OR ad OGNI poll (non
    # letti una tantum al cambio giro) perché sono transitori — con un
    # poll ogni 2s, un ingresso ai box o una gialla locale potrebbero
    # già essere rientrati esattamente nell'istante in cui rileviamo il
    # cambio giro, perdendo l'evento. Accumulando lungo tutto il giro
    # invece del singolo istante si cattura in modo affidabile "è
    # successo qualcosa di sporco in questo giro", che è quello che
    # serve al backend per escluderlo da passo/consumo medio.
    lap_in_pits_flag = False
    lap_yellow_flag = False

    # Stato "modalità personale": race_id generato in automatico,
    # rinnovato dopo SOLO_SESSION_GAP_S secondi di inattività — stessa
    # soglia di FUEL_MY_SESSION_MAX_AGE_MS lato backend (fuel.mySession).
    # In modalità normale (race_id già in config.json) questi valori
    # non vengono mai letti.
    solo_race_id = None
    solo_last_active_ts = 0.0

    def current_ids():
        nonlocal solo_race_id, solo_last_active_ts
        if not solo_mode:
            return cfg["race_id"], cfg["car_number"]
        now_ts = time.time()
        if solo_race_id is None or (now_ts - solo_last_active_ts) > SOLO_SESSION_GAP_S:
            solo_race_id = f"SOLO-{int(now_ts)}"
            log.info("Nuova sessione personale: %s", solo_race_id)
        solo_last_active_ts = now_ts
        return solo_race_id, "SOLO"

    while True:
        try:
            tel_data = sim.LMUData.telemetry

            if not tel_data.playerHasVehicle:
                # Non in pista (menu, box, replay) — niente da mandare.
                last_sent_lap = None
                lap_speed_samples = []
                lap_in_pits_flag = False
                lap_yellow_flag = False
                time.sleep(POLL_INTERVAL_S)
                continue

            idx = tel_data.playerVehicleIdx
            car = tel_data.telemInfo[idx]

            lap_number = car.mLapNumber
            fuel_remaining = car.mFuel
            fuel_capacity = car.mFuelCapacity
            virtual_energy_fraction = car.mVirtualEnergy  # 0.0–1.0, solo classi ibride
            track_name = _decode_name(car.mTrackName)
            vehicle_name = _decode_name(car.mVehicleName)

            # La shared memory può restituire una lettura "strappata"
            # mentre il gioco scrive in contemporanea — scarta valori
            # assurdi piuttosto che loggare spazzatura.
            sane = fuel_capacity > 0 and 0 <= fuel_remaining <= fuel_capacity * 1.05

            speed_kmh = None
            if sane:
                vel = car.mLocalVel
                speed_kmh = (vel.x ** 2 + vel.y ** 2 + vel.z ** 2) ** 0.5 * 3.6

            # Buffer Scoring (separato dalla Telemetry sopra): passo/settori/
            # pit/gialle/pilota vivono qui, non nel buffer Telemetry. Trovato
            # per mIsPlayer, non per indice (vedi _find_player_scoring).
            # Letto ad OGNI tick (non solo al cambio giro) perché in_pits e
            # yellow servono accumulati lungo tutto il giro — vedi commento
            # su lap_in_pits_flag/lap_yellow_flag più sopra.
            scor_data = sim.LMUData.scoring
            player_scoring = _find_player_scoring(scor_data)
            if player_scoring is not None:
                lap_in_pits_flag = lap_in_pits_flag or bool(player_scoring.mInPits)
                lap_yellow_flag = lap_yellow_flag or _session_yellow_active(scor_data.scoringInfo)

            if sane and lap_number != last_sent_lap:
                race_id, car_number = current_ids()

                # min/max/media accumulati DURANTE il giro appena
                # concluso (last_sent_lap) — presi PRIMA di azzerare
                # l'accumulatore per il nuovo giro appena iniziato.
                speed_min = speed_max = speed_avg = None
                if lap_speed_samples:
                    speed_min = min(lap_speed_samples)
                    speed_max = max(lap_speed_samples)
                    speed_avg = sum(lap_speed_samples) / len(lap_speed_samples)
                lap_speed_samples = []

                # Idem per in_pits/yellow: il valore accumulato appartiene al
                # giro appena concluso, va letto e azzerato qui — PRIMA che
                # il resto del tick inizi ad accumulare per il nuovo giro
                # (l'accumulo sopra questo blocco, essendo eseguito ogni
                # tick, ha già aggiornato i flag anche per QUESTO tick: se il
                # nuovo giro iniziasse già "sporco" — es. subito dopo essere
                # usciti dai box — verrebbe comunque incluso qui sotto,
                # correttamente, come parte del giro appena concluso).
                lap_was_in_pits = lap_in_pits_flag
                lap_was_yellow = lap_yellow_flag
                lap_in_pits_flag = False
                lap_yellow_flag = False

                payload = {
                    "race_id": race_id,
                    "car_number": car_number,
                    "lap_number": lap_number,
                    "fuel_remaining_l": round(fuel_remaining, 2),
                    "fuel_capacity_l": round(fuel_capacity, 2),
                    "track_name": track_name,
                    "vehicle_name": vehicle_name,
                    "in_pits": lap_was_in_pits,
                    "yellow_flag": lap_was_yellow,
                }
                # Energia virtuale solo se la vettura la usa davvero
                # (classi non ibride restano a 0 — evitiamo rumore).
                if virtual_energy_fraction and virtual_energy_fraction > 0:
                    payload["virtual_energy_pct"] = round(virtual_energy_fraction * 100, 1)
                if speed_avg is not None:
                    payload["speed_min_kmh"] = round(speed_min, 1)
                    payload["speed_max_kmh"] = round(speed_max, 1)
                    payload["speed_avg_kmh"] = round(speed_avg, 1)

                # Passo/settori/pilota dal buffer Scoring — mLastLapTime e
                # affini sono già "il giro appena concluso" secondo il gioco
                # stesso a questo punto (il buffer Scoring si aggiorna a
                # 5Hz, molto più frequente del nostro poll a 2s, quindi ha
                # sempre fatto in tempo ad aggiornarsi). Valori <=0 sono la
                # convenzione rF2/LMU per "non ancora disponibile" (es.
                # primissimo giro dopo la connessione) — omessi anziché
                # inviati come zero, per non falsare le medie lato backend.
                if player_scoring is not None:
                    driver_name = _decode_name(player_scoring.mDriverName)
                    if driver_name:
                        payload["driver_name"] = driver_name
                    payload["num_pitstops"] = int(player_scoring.mNumPitstops)

                    lap_time_s = float(player_scoring.mLastLapTime)
                    sector1_s = float(player_scoring.mLastSector1)
                    sector2_cum_s = float(player_scoring.mLastSector2)  # cumulato: settore1+settore2
                    if lap_time_s > 0:
                        payload["lap_time_s"] = round(lap_time_s, 3)
                    if sector1_s > 0:
                        payload["sector1_s"] = round(sector1_s, 3)
                    if sector1_s > 0 and sector2_cum_s > sector1_s:
                        payload["sector2_s"] = round(sector2_cum_s - sector1_s, 3)
                        if lap_time_s > sector2_cum_s:
                            payload["sector3_s"] = round(lap_time_s - sector2_cum_s, 3)

                post_sample_async(cfg, payload)
                last_sent_lap = lap_number

            # Sempre in coda, dopo l'eventuale invio: la lettura di
            # QUESTO tick appartiene al giro (nuovo o in corso) che
            # last_sent_lap rappresenta adesso, mai a quello appena
            # spedito sopra.
            if sane and speed_kmh is not None:
                lap_speed_samples.append(speed_kmh)

            # Ping live indipendente dal cambio giro — dà l'impressione
            # di un dato quasi in tempo reale nel pannello senza
            # sporcare il calcolo del consumo medio (che resta legato
            # solo ai campioni per-giro sopra).
            now_ts = time.time()
            if sane and (now_ts - last_live_sent_ts) >= LIVE_PING_INTERVAL_S:
                race_id, car_number = current_ids()
                live_payload = {
                    "race_id": race_id,
                    "car_number": car_number,
                    "lap_number": lap_number,
                    "fuel_remaining_l": round(fuel_remaining, 2),
                    "track_name": track_name,
                    "vehicle_name": vehicle_name,
                }
                if virtual_energy_fraction and virtual_energy_fraction > 0:
                    live_payload["virtual_energy_pct"] = round(virtual_energy_fraction * 100, 1)
                if speed_kmh is not None:
                    live_payload["speed_kmh"] = round(speed_kmh, 1)

                post_live_async(cfg, live_payload)
                last_live_sent_ts = now_ts

        except Exception:  # noqa: BLE001 — connessione shared memory persa, riconnetti
            log.exception("Errore nel loop di lettura — riconnessione")
            sim = connect()
            last_sent_lap = None
            lap_speed_samples = []
            lap_in_pits_flag = False
            lap_yellow_flag = False

        time.sleep(POLL_INTERVAL_S)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log.info("Interrotto dall'utente")
