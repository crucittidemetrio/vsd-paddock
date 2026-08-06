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
  3. Lancia Le Mans Ultimate, entra in pista — i campioni partono da
     soli ad ogni cambio giro. Ctrl+C per fermare.

  (config.example.json resta disponibile per chi preferisce compilare
  il file a mano invece di rispondere alle domande.)

Build .exe (facoltativo, per non richiedere Python ai piloti):
  pip install pyinstaller
  pyinstaller --onefile --name vsd-fuel-bridge fuel_bridge.py
  L'exe finito è in dist/vsd-fuel-bridge.exe — copialo insieme a
  config.json (NON incluso nell'exe, resta editabile a parte).
═══════════════════════════════════════════════════════════════════
"""

import json
import logging
import sys
import time
from pathlib import Path
from urllib import error as urllib_error
from urllib import request as urllib_request

sys.path.insert(0, str(Path(__file__).resolve().parent / "vendor"))
from lmu_data import SimInfo  # noqa: E402  (vendorizzato, vedi vendor/LICENSE.txt)

CONFIG_PATH = Path(__file__).resolve().parent / "config.json"
POLL_INTERVAL_S = 2.0
RECONNECT_INTERVAL_S = 5.0

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

    race_id = input("2) ID sessione (es. TEST-monza-06-08, oppure il race_id di una gara ufficiale): ").strip()
    while not race_id:
        race_id = input("   L'ID sessione è obbligatorio, riprova: ").strip()

    car_number = input("3) Numero della tua vettura in questa sessione (es. 7): ").strip()
    while not car_number:
        car_number = input("   Il numero vettura è obbligatorio, riprova: ").strip()

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
    required = ["api_url", "token", "race_id", "car_number"]
    missing = [k for k in required if not cfg.get(k)]
    if missing:
        log.error("config.json incompleto, mancano: %s", ", ".join(missing))
        sys.exit(1)
    return cfg


def post_sample(cfg: dict, payload: dict) -> None:
    """Manda un campione a fuel.logSample. Stesso contratto del frontend
    (client.js/realApi.js): body JSON {action, token, payload} come
    text/plain, per evitare complicazioni con i preflight CORS lato
    Apps Script."""
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
        with urllib_request.urlopen(req, timeout=10) as resp:
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
    except urllib_error.URLError as e:
        log.warning("Errore di rete inviando il campione (riprovo al prossimo giro): %s", e)
    except Exception:  # noqa: BLE001 — non deve mai far crashare il loop principale
        log.exception("Errore inatteso inviando il campione")


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
    log.info(
        "VSD Paddock Fuel Bridge — gara %s, vettura #%s",
        cfg["race_id"], cfg["car_number"],
    )

    sim = connect()
    last_sent_lap = None

    while True:
        try:
            tel_data = sim.LMUData.telemetry

            if not tel_data.playerHasVehicle:
                # Non in pista (menu, box, replay) — niente da mandare.
                last_sent_lap = None
                time.sleep(POLL_INTERVAL_S)
                continue

            idx = tel_data.playerVehicleIdx
            car = tel_data.telemInfo[idx]

            lap_number = car.mLapNumber
            fuel_remaining = car.mFuel
            fuel_capacity = car.mFuelCapacity
            virtual_energy_fraction = car.mVirtualEnergy  # 0.0–1.0, solo classi ibride

            # La shared memory può restituire una lettura "strappata"
            # mentre il gioco scrive in contemporanea — scarta valori
            # assurdi piuttosto che loggare spazzatura.
            sane = fuel_capacity > 0 and 0 <= fuel_remaining <= fuel_capacity * 1.05

            if sane and lap_number != last_sent_lap:
                payload = {
                    "race_id": cfg["race_id"],
                    "car_number": cfg["car_number"],
                    "lap_number": lap_number,
                    "fuel_remaining_l": round(fuel_remaining, 2),
                    "fuel_capacity_l": round(fuel_capacity, 2),
                }
                # Energia virtuale solo se la vettura la usa davvero
                # (classi non ibride restano a 0 — evitiamo rumore).
                if virtual_energy_fraction and virtual_energy_fraction > 0:
                    payload["virtual_energy_pct"] = round(virtual_energy_fraction * 100, 1)

                post_sample(cfg, payload)
                last_sent_lap = lap_number

        except Exception:  # noqa: BLE001 — connessione shared memory persa, riconnetti
            log.exception("Errore nel loop di lettura — riconnessione")
            sim = connect()
            last_sent_lap = None

        time.sleep(POLL_INTERVAL_S)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log.info("Interrotto dall'utente")
