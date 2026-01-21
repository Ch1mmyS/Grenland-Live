from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Tuple

import requests
from bs4 import BeautifulSoup
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)

OSLO = ZoneInfo("Europe/Oslo")
END_OSLO = datetime(2026, 12, 31, 23, 59, 59, tzinfo=OSLO)

HEADERS = {"User-Agent": "GrenlandLiveBot/2.0 (+github-actions)"}

# Tillat både vanlig bindestrek og "en dash"
FIXTURE_RE = re.compile(
    r"([A-Za-zÆØÅæøå0-9.\-()'’ /]+?)\s*[–-]\s*([A-Za-zÆØÅæøå0-9.\-()'’ /]+?)\s+(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})"
)

def now_oslo() -> datetime:
    return datetime.now(OSLO)

def read_json(path: Path, default_obj: Any) -> Any:
    if not path.exists():
        return default_obj
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default_obj

def write_json(path: Path, obj: Any) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"WROTE {path.name}")

def fetch_text(url: str) -> str:
    r = requests.get(url, headers=HEADERS, timeout=60)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "lxml")
    return soup.get_text(" ", strip=True)

def parse_fixtures(text: str) -> List[Dict[str, Any]]:
    out: Dict[Tuple[str, str, str], Dict[str, Any]] = {}

    for m in FIXTURE_RE.finditer(text):
        home = " ".join(m.group(1).split()).strip()
        away = " ".join(m.group(2).split()).strip()

        dd, mm, yyyy = m.group(3).split(".")
        hh, mins = m.group(4).split(":")

        dt = datetime(int(yyyy), int(mm), int(dd), int(hh), int(mins), tzinfo=OSLO)

        if dt < now_oslo():
            continue
        if dt > END_OSLO:
            continue

        kickoff_iso = dt.isoformat(timespec="seconds")  # inkluderer +01/+02 automatisk

        g = {
            "home": home,
            "away": away,
            "kickoff": kickoff_iso,
            "channel": "",
            "where": []
        }
        out[(home, away, kickoff_iso)] = g

    games = list(out.values())
    games.sort(key=lambda x: x["kickoff"])
    return games

def merge_preserve(new_games: List[Dict[str, Any]], existing_obj: Dict[str, Any]) -> Dict[str, Any]:
    old_games = existing_obj.get("games", []) if isinstance(existing_obj, dict) else []
    old_map: Dict[Tuple[str, str, str], Dict[str, Any]] = {}
    for g in old_games:
        key = (g.get("home",""), g.get("away",""), g.get("kickoff",""))
        old_map[key] = g

    merged = []
    for g in new_games:
        key = (g["home"], g["away"], g["kickoff"])
        old = old_map.get(key)
        if old:
            if old.get("channel") and not g.get("channel"):
                g["channel"] = old["channel"]
            if old.get("where") and (not g.get("where")):
                g["where"] = old["where"]
        merged.append(g)

    return {"games": merged}

def update_league(name: str, url: str, out_file: str) -> None:
    path = DATA / out_file
    existing = read_json(path, {"games": []})

    try:
        text = fetch_text(url)
        games = parse_fixtures(text)
        print(f"{name}: found {len(games)} games")

        # Ikke overskriv med tomt hvis parsing feiler
        if games:
            write_json(path, merge_preserve(games, existing))
        else:
            print(f"WARN {name}: 0 games found - keeping existing")
            write_json(path, existing)
    except Exception as e:
        print(f"WARN {name}: fetch/parse failed: {e}")
        write_json(path, existing)

def ensure_other_files_exist() -> None:
    defaults: Dict[str, Any] = {
        "premier_league.json": {"games": []},
        "champions.json": {"games": []},
        "laliga.json": {"games": []},
        "handball_vm_2026_menn.json": {"games": []},
        "handball_vm_2026_damer.json": {"games": []},
        "vintersport_menn.json": {"events": []},
        "vintersport_kvinner.json": {"events": []},
        "vm2026.json": {"matches": []},
    }
    for fn, default in defaults.items():
        p = DATA / fn
        if not p.exists():
            write_json(p, default)

def main() -> None:
    print("Updating fixtures (Oslo time) -> 31.12.2026")
    update_league("Eliteserien", "https://www.eliteserien.no/terminliste", "eliteserien.json")
    update_league("OBOS-ligaen", "https://www.obos-ligaen.no/terminliste", "obos.json")
    ensure_other_files_exist()
    print("DONE")

if __name__ == "__main__":
    main()
