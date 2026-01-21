# tools/fetch_official.py
# Grenland Live – Official fixtures updater (ICS)
# - Reads ICS URLs from data/ics_sources.json
# - Writes UTF-8 JSON to data/eliteserien.json and data/obos.json
# - Never hard-fails in CI: keeps existing files if fetch/parse fails

import json
import re
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo

import requests
from ics import Calendar

TZ = ZoneInfo("Europe/Oslo")

BASE = Path(__file__).resolve().parents[1]
DATA_DIR = BASE / "data"
CFG_FILE = DATA_DIR / "ics_sources.json"

OUT_FILES = {
    "eliteserien": DATA_DIR / "eliteserien.json",
    "obos": DATA_DIR / "obos.json",
}

def read_json(path: Path, default):
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        pass
    return default

def write_json(path: Path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")

def safe_get_text(url: str, timeout=30) -> str:
    # Robust ICS download (force UTF-8 if server lies)
    r = requests.get(url, timeout=timeout, headers={"User-Agent": "Grenland-Live-Bot/1.0"})
    r.raise_for_status()

    # Try to respect server encoding, but fallback to utf-8
    if not r.encoding:
        r.encoding = "utf-8"

    text = r.text

    # Some ICS feeds may include BOM or oddities
    text = text.lstrip("\ufeff")
    return text

def parse_match_from_summary(summary: str):
    """
    Try to parse 'Home - Away' from ICS SUMMARY.
    Returns (home, away) or ("", "") if unknown.
    """
    if not summary:
        return "", ""
    s = summary.strip()

    # Common: "Team A - Team B"
    if " - " in s:
        parts = s.split(" - ", 1)
        return parts[0].strip(), parts[1].strip()

    # Common: "Team A – Team B" (en-dash)
    if " – " in s:
        parts = s.split(" – ", 1)
        return parts[0].strip(), parts[1].strip()

    return s, ""

def detect_channel(text: str) -> str:
    """
    Best-effort: pulls known broadcaster names if present in DESCRIPTION.
    """
    if not text:
        return ""

    t = text.lower()

    # Simple keyword detection
    candidates = [
        "tv 2", "tv2", "tv 2 play", "viaplay", "v sport",
        "nrk", "discovery", "eurosport", "max", "vg+",
    ]

    found = []
    for c in candidates:
        if c in t:
            found.append(c)

    if not found:
        return ""

    # Pretty formatting
    pretty_map = {
        "tv2": "TV 2",
        "tv 2": "TV 2",
        "tv 2 play": "TV 2 Play",
        "v sport": "V Sport",
        "nrk": "NRK",
        "eurosport": "Eurosport",
        "viaplay": "Viaplay",
        "max": "Max",
        "discovery": "Discovery",
        "vg+": "VG+",
    }

    # Keep order and unique
    uniq = []
    for f in found:
        if f not in uniq:
            uniq.append(f)

    return " / ".join(pretty_map.get(x, x) for x in uniq)

def ics_to_games(ics_text: str, league_label: str):
    cal = Calendar(ics_text)

    games = []
    for ev in sorted(cal.events, key=lambda e: e.begin):
        # Begin time
        try:
            dt = ev.begin.datetime
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=TZ)
            else:
                dt = dt.astimezone(TZ)
        except Exception:
            dt = None

        kickoff = dt.isoformat() if dt else ""

        home, away = parse_match_from_summary(getattr(ev, "name", "") or getattr(ev, "summary", "") or "")

        # Description might contain channel or extra info
        desc = getattr(ev, "description", "") or ""
        channel = detect_channel(desc)

        games.append({
            "league": league_label,
            "home": home,
            "away": away,
            "kickoff": kickoff,
            "channel": channel,
            "where": []  # pubs can be injected later
        })

    return games

def main():
    print("Updating fixtures (ICS) ->", datetime.now(TZ).strftime("%d.%m.%Y %H:%M:%S"))

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    cfg = read_json(CFG_FILE, default={})
    sources = cfg.get("sources", [])

    # If no config, do NOT fail Actions. Keep existing files.
    if not sources:
        print(f"WARN: Missing or empty {CFG_FILE}. Keeping existing JSON files.")
        for key, out_path in OUT_FILES.items():
            if not out_path.exists():
                # ensure file exists (empty)
                write_json(out_path, {"games": []})
                print("WROTE (empty)", out_path.name)
        return

    # Map config sources by key
    src_by_key = { (s.get("key") or "").strip(): s for s in sources if isinstance(s, dict) }

    for key, out_path in OUT_FILES.items():
        src = src_by_key.get(key)
        if not src:
            print(f"WARN: No source with key='{key}' in {CFG_FILE} – keeping {out_path.name}")
            continue

        url = (src.get("url") or "").strip()
        league_label = (src.get("league") or key).strip()

        if not url:
            print(f"WARN: Missing url for key='{key}' – keeping {out_path.name}")
            continue

        try:
            ics_text = safe_get_text(url)
            games = ics_to_games(ics_text, league_label)

            if not games:
                print(f"WARN {key}: 0 games parsed – keeping existing {out_path.name}")
                continue

            write_json(out_path, {"games": games})
            print(f"WROTE {out_path.name} ({len(games)} games)")

        except Exception as e:
            print(f"WARN {key}: {e} – keeping existing {out_path.name}")

if __name__ == "__main__":
    main()
