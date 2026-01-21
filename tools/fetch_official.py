import json
import re
from pathlib import Path
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)

HEADERS = {"User-Agent": "GrenlandLiveBot/1.0 (+github-actions)"}

END = datetime(2026, 12, 31, 23, 59, 59, tzinfo=timezone.utc)

def within_window(iso: str) -> bool:
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except Exception:
        return False
    return datetime.now(timezone.utc) <= dt <= END

def fetch_text(url: str) -> str:
    r = requests.get(url, headers=HEADERS, timeout=45)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "lxml")
    return soup.get_text(" ", strip=True)

def parse_games_from_text(text: str, default_offset="+01:00"):
    """
    Parser mønstre som: 'Odd - Moss 16.05.2026 16:00'
    (fungerer på terminliste-tekstinnholdet slik det ofte vises på eliteserien.no/obos-ligaen.no)
    """
    pat = re.compile(
        r"([A-Za-zÆØÅæøå0-9.\-()'’ ]+?)\s*-\s*([A-Za-zÆØÅæøå0-9.\-()'’ ]+?)\s+"
        r"(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})"
    )
    out = []
    for m in pat.finditer(text):
        home = " ".join(m.group(1).split()).strip()
        away = " ".join(m.group(2).split()).strip()
        dd, mm, yyyy = m.group(3).split(".")
        hhmm = m.group(4).strip()
        kickoff = f"{yyyy}-{mm}-{dd}T{hhmm}:00{default_offset}"
        if within_window(kickoff):
            out.append({
                "home": home,
                "away": away,
                "kickoff": kickoff,
                "channel": "",
                "where": []
            })
    # dedupe
    uniq = {}
    for g in out:
        uniq[(g["home"], g["away"], g["kickoff"])] = g
    return list(uniq.values())

def load_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default

def write_json(path: Path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")
    print("WROTE", path.name)

def merge_preserve(old_obj, new_games):
    """
    Beholder channel/where hvis du har fylt dem manuelt, basert på (home,away,kickoff).
    """
    old_games = old_obj.get("games", []) if isinstance(old_obj, dict) else []
    old_map = {(g.get("home",""), g.get("away",""), g.get("kickoff","")): g for g in old_games}

    merged = []
    for g in new_games:
        key = (g["home"], g["away"], g["kickoff"])
        if key in old_map:
            og = old_map[key]
            if og.get("channel"):
                g["channel"] = og["channel"]
            if og.get("where"):
                g["where"] = og["where"]
        merged.append(g)
    merged.sort(key=lambda x: x["kickoff"])
    return {"games": merged}

def update_league(url: str, filename: str):
    path = DATA / filename
    old = load_json(path, {"games": []})
    try:
        text = fetch_text(url)
        games = parse_games_from_text(text)
        if games:
            obj = merge_preserve(old, games)
            write_json(path, obj)
        else:
            # ingen parse -> ikke wipe, behold eksisterende
            print("WARN: no games parsed for", filename, "- keeping existing")
            write_json(path, old)
    except Exception as e:
        print("WARN:", filename, "update failed:", e)
        write_json(path, old)

def ensure_files():
    defaults = {
        "premier_league.json": {"games": []},
        "champions.json": {"games": []},
        "laliga.json": {"games": []},
        "handball_vm_2026_menn.json": {"games": []},
        "handball_vm_2026_damer.json": {"games": []},
        "vintersport_menn.json": {"events": []},
        "vintersport_kvinner.json": {"events": []},
        "vm2026.json": {"matches": []},
    }
    for fn, d in defaults.items():
        p = DATA / fn
        write_json(p, load_json(p, d))

def main():
    print("Updating now -> 31.12.2026")

    # Offisielle terminliste-sider
    update_league("https://www.eliteserien.no/terminliste", "eliteserien.json")  # :contentReference[oaicite:1]{index=1}
    update_league("https://www.obos-ligaen.no/terminliste", "obos.json")        # :contentReference[oaicite:2]{index=2}

    ensure_files()
    print("DONE")

if __name__ == "__main__":
    main()
