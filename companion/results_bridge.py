#!/usr/bin/env python3
"""
VSD Paddock — Results Bridge (LMU)
═══════════════════════════════════════════════════════════════════
VSD non gestisce server propri: le gare girano sui server ufficiali
di Le Mans Ultimate. Quando VSD organizza una sessione, LMU permette
di scaricare un file JSON dei risultati (stesso formato che oggi si
incolla a mano in "Admin · Importa risultati gara" — array di
{carClass, result: [...]}). Per le gare organizzate da altri (leghe
esterne), il file va comunque richiesto agli organizzatori: questo
script non "inventa" un collegamento che non esiste, si limita a
togliere il passaggio manuale di copia-incolla una volta che il file
JSON è sul disco.

Cosa fa:
  1. Tiene d'occhio una cartella (di default quella dello script, o
     una a scelta — es. la cartella Download del browser) per nuovi
     file .json che assomigliano a un export risultati LMU.
  2. Quando ne trova uno, chiede a terminale a quale gara del
     calendario VSD Paddock vada abbinato (lista presa dal backend).
  3. Lo importa con la stessa action del pulsante "Importa risultati"
     (raceResults.import) — stesse notifiche Discord, stesso
     matching piloti, nessuna differenza per il backend tra questo
     script e l'admin che incolla a mano.
  4. Segna il file come già processato, cosi' non lo re-importa al
     giro successivo.

Setup:
  1. python results_bridge.py
  2. Al primo avvio chiede token (da profilo → "Genera token
     companion", serve un account staff/admin: raceResults.import
     è un'azione riservata) e la cartella da sorvegliare.
  3. Lascia lo script aperto, o rilancialo con un file specifico:
       python results_bridge.py "C:\\Downloads\\risultati_gara.json"
     per importare un singolo file senza aprire il watch-loop.

Limite noto: LMU non ha un'API ufficiale (vedi ricerca companion/
README.md) — questo script NON scarica nulla da solo, si limita a
reagire a un file che è già arrivato sul disco in qualche modo
(download manuale, allegato ricevuto dall'organizzatore, ecc.).
═══════════════════════════════════════════════════════════════════
"""

import json
import sys
import time
from pathlib import Path
from typing import Optional
from urllib import request as urllib_request


def _app_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


CONFIG_PATH = _app_dir() / "results_config.json"
STATE_PATH = _app_dir() / "results_bridge_state.json"
POLL_INTERVAL_S = 5.0

DEFAULT_API_URL = "https://script.google.com/macros/s/AKfycbyMXxEjZfm5EIsGUnKxpwtBtoeR4hwMG7Pl8ZESF8yG569SS0aIdsWqyu9PdBgR14vLiA/exec"


def run_setup_wizard() -> dict:
    print()
    print("=== VSD Paddock Results Bridge — primo avvio ===")
    print("Non trovo results_config.json: rispondi a queste domande e lo creo io.")
    print()

    token = input(
        "1) Token (dal TUO profilo VSD-Paddock, pulsante 'Genera token companion' "
        "— serve un account staff/admin): "
    ).strip()
    while not token:
        token = input("   Il token è obbligatorio, riprova: ").strip()

    default_folder = str(_app_dir())
    folder = input(
        f"2) Cartella da sorvegliare per i JSON risultati [{default_folder}]: "
    ).strip() or default_folder

    cfg = {
        "api_url": DEFAULT_API_URL,
        "token": token,
        "watch_folder": folder,
    }
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)

    print()
    print(f"Salvato in {CONFIG_PATH.name}. Le prossime volte parte senza fare domande")
    print("(cancella il file se devi cambiare token o cartella).")
    print()
    return cfg


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        return run_setup_wizard()
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    required = ["api_url", "token", "watch_folder"]
    missing = [k for k in required if not cfg.get(k)]
    if missing:
        print(f"⚠️  results_config.json incompleto, mancano: {', '.join(missing)}")
        sys.exit(1)
    return cfg


def load_state() -> dict:
    if not STATE_PATH.exists():
        return {"processed": {}}
    with open(STATE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_state(state: dict) -> None:
    with open(STATE_PATH, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)


def call_backend(cfg: dict, action: str, payload: dict) -> dict:
    body = json.dumps({"action": action, "token": cfg["token"], "payload": payload}).encode("utf-8")
    req = urllib_request.Request(
        cfg["api_url"],
        data=body,
        headers={"Content-Type": "text/plain;charset=utf-8"},
        method="POST",
    )
    with urllib_request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def detect_format(data) -> Optional[str]:
    """Stesso identico contratto di detectFormat() in
    src/pages/AdminImportResults.jsx — un file che passa qui è
    garantito passare anche l'import lato backend."""
    if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict) and "carClass" in data[0]:
        return "lmu"
    if isinstance(data, dict) and data.get("type") == "event_result" and isinstance(
        (data.get("data") or {}).get("session_results"), list
    ):
        return "iracing"
    return None


def summarize_lmu(data: list) -> str:
    classes = [(g.get("carClass", "?"), len(g.get("result", []))) for g in data]
    total = sum(c for _, c in classes)
    has_position = any(r.get("position") is not None for g in data for r in g.get("result", []))
    session = "race" if has_position else "qualifying"
    classes_txt = ", ".join(f"{name} ({count})" for name, count in classes)
    return f"sessione={session} · {total} piloti · classi: {classes_txt}"


def file_fingerprint(path: Path) -> str:
    stat = path.stat()
    return f"{stat.st_size}:{int(stat.st_mtime)}"


def pick_race(cfg: dict) -> Optional[str]:
    """Chiede races.list al backend e mostra un picker numerato.
    Ritorna il race_id scelto, o None se l'operatore annulla."""
    try:
        result = call_backend(cfg, "races.list", {})
    except Exception as e:  # noqa: BLE001
        print(f"⚠️  Impossibile scaricare la lista gare: {e}")
        return None
    if not result.get("ok"):
        print(f"⚠️  Backend: {result.get('error')}")
        return None

    races = result["data"]["races"]
    # Gare non ancora completate prima, così le più probabili sono in alto.
    races = sorted(races, key=lambda r: r.get("status") == "completed")

    print()
    print("Gare disponibili:")
    for i, r in enumerate(races, start=1):
        champ = f" · 🏆 {r['championship_name']}" if r.get("championship_name") else ""
        print(f"  {i:2d}) [{r.get('status')}] {r.get('race_id')} — {r.get('race_name')}{champ}")
    print("   0) Annulla (non importare questo file)")
    print()

    choice = input("Scegli il numero della gara: ").strip()
    if choice == "0" or not choice:
        return None
    try:
        idx = int(choice) - 1
        if idx < 0 or idx >= len(races):
            raise ValueError
    except ValueError:
        print("Scelta non valida, file saltato.")
        return None
    return races[idx]["race_id"]


def import_file(cfg: dict, path: Path) -> None:
    try:
        with open(path, "r", encoding="utf-8") as f:
            raw = f.read()
        data = json.loads(raw)
    except Exception as e:  # noqa: BLE001
        print(f"⚠️  {path.name}: JSON non leggibile ({e}), ignorato.")
        return

    fmt = detect_format(data)
    if not fmt:
        # Non è un export risultati riconoscibile — probabilmente un
        # altro file JSON nella stessa cartella, non è un errore.
        return

    print()
    print(f"📄 Nuovo file risultati rilevato: {path.name}")
    if fmt == "lmu":
        print(f"   Formato LMU — {summarize_lmu(data)}")
    else:
        print("   Formato iRacing event_result")

    race_id = pick_race(cfg)
    if not race_id:
        print(f"   Saltato: {path.name}")
        return

    print(f"   Importazione su {race_id} in corso…")
    try:
        result = call_backend(cfg, "raceResults.import", {"race_id": race_id, "json_data": raw})
    except Exception as e:  # noqa: BLE001
        print(f"   ❌ Errore di rete: {e}")
        return

    if not result.get("ok"):
        print(f"   ❌ Backend ha rifiutato l'import: {result.get('error')}")
        return

    stats = result["data"]
    print(
        f"   ✅ Importati {stats.get('imported', '?')} risultati — "
        f"VSD: {stats.get('vsd_matched', '?')}, esterni: {stats.get('external', '?')}, "
        f"DNF: {stats.get('dnf', '?')}, DNS: {stats.get('dns', '?')}"
    )


def watch_loop(cfg: dict) -> None:
    folder = Path(cfg["watch_folder"])
    if not folder.is_dir():
        print(f"⚠️  Cartella non trovata: {folder}")
        sys.exit(1)

    state = load_state()
    print(f"👀 Sorveglio {folder} per nuovi file JSON risultati… (Ctrl+C per fermare)")

    while True:
        try:
            for path in sorted(folder.glob("*.json")):
                fp = file_fingerprint(path)
                key = path.name
                if state["processed"].get(key) == fp:
                    continue
                import_file(cfg, path)
                state["processed"][key] = fp
                save_state(state)
        except Exception:  # noqa: BLE001 — non deve mai crashare il loop
            import traceback
            traceback.print_exc()
        time.sleep(POLL_INTERVAL_S)


def main() -> None:
    cfg = load_config()

    # Modalità one-shot: python results_bridge.py path/al/file.json
    if len(sys.argv) > 1:
        target = Path(sys.argv[1])
        if not target.is_file():
            print(f"File non trovato: {target}")
            sys.exit(1)
        import_file(cfg, target)
        return

    watch_loop(cfg)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrotto dall'utente")
