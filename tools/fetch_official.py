import json
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)

END = datetime(2026, 12, 31, 23, 59, 59, tzinfo=timezone.utc)

FILES = {
    "eliteserien.json": {"games": []},
    "obos.json": {"games": []},
    "premier_league.json": {"games": []},
    "champions.json": {"games": []},
    "laliga.json": {"games": []},
    "handball_vm_2026_menn.json": {"games": []},
    "handball_vm_2026_damer.json": {"games": []},
    "vintersport_menn.json": {"events": []},
    "vintersport_kvinner.json": {"events": []},
    "vm2026.json": {"matches": []},
}

def main():
    print("Oppdaterer /data")
    print("Periode: nå ->", END.date())

    for filename, empty in FILES.items():
        path = DATA / filename
        if path.exists():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                data = empty
        else:
            data = empty

        path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )
        print("OK:", filename)

    print("FERDIG.")

if __name__ == "__main__":
    main()
