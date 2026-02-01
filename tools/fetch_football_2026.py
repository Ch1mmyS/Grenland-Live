# tools/fetch_football_2026.py
# Grenland Live — Football per league (2026)
# - Writes: data/2026/eliteserien.json, obos.json, premier_league.json, champions_league.json, la_liga.json
# - Supports sources from data/_meta/sources.json (recommended)
# - Safe-write: never overwrites an existing file with an empty list

from __future__ import annotations

import json
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from urllib.request import Request, urlopen

# -----------------------------
# Paths
# -----------------------------
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA_DIR = os.path.join(ROOT, "data")
OUT_DIR_2026 = os.path.join(DATA_DIR, "2026")
META_SOURCES = os.path.join(DATA_DIR, "_meta", "sources.json")

TZ_NAME = "Europe/Oslo"

# -----------------------------
# League definitions (file names)
# -----------------------------
LEAGUES = [
    ("eliteserien", "Eliteserien"),
    ("obos", "OBOS-ligaen"),
    ("premier_league", "Premier League"),
    ("champions_league", "Champions League"),
    ("la_liga", "La Liga"),
]

# Optional default channels (only if source doesn't provide)
DEFAULT_CHANNEL = {
    "Eliteserien": "TV 2 / TV 2 Play",
    "OBOS-ligaen": "TV 2 / TV 2 Play",
    "Premier League": "Viaplay / V Sport",
    "Champions League": "TV 2 / TV 2 Play",
    "La Liga": "Viaplay / V Sport",
}


@dataclass
class SourceSpec:
    kind: str  # "ics" or "json"
    url: str


# -----------------------------
# Utilities
# -----------------------------
def utc_now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def read_json(path: str) -> Optional[dict]:
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def write_json(path: str, obj: dict) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def safe_write_games(path: str, payload: dict, games: List[dict]) -> None:
    """
    Never overwrite an existing file with 0 games.
    If games is empty and file exists, keep existing.
    """
    if len(games) == 0 and os.path.exists(path):
        print(f"WARN: {os.path.relpath(path, ROOT)} would be empty -> keeping existing file.")
        return
    write_json(path, payload)


def http_get_text(url: str, accept: str) -> str:
    req = Request(
        url,
        headers={
            "User-Agent": "GrenlandLiveBot/1.0 (+https://grenland-live.no)",
            "Accept": accept,
        },
        method="GET",
    )
    with urlopen(req, timeout=60) as resp:
        data = resp.read()
    # Try utf-8 first, fallback latin-1
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return data.decode("latin-1", errors="replace")


def http_get_json(url: str) -> Any:
    txt = http_get_text(url, "application/json,text/json,*/*")
    return json.loads(txt)


# -----------------------------
# Time parsing
# -----------------------------
def parse_dt_ics(value: str) -> Optional[str]:
    """
    Returns ISO string with timezone offset if possible.
    Supports:
      - 20260118T180000
      - 20260118T180000Z
    Also strips any trailing parameters handled earlier.
    """
    value = value.strip()
    if not value:
        return None

    # Zulu time
    if value.endswith("Z"):
        try:
            dt = datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
            return dt.astimezone().isoformat(timespec="seconds")
        except Exception:
            return None

    # naive local time; we keep +01/+02 by assuming Europe/Oslo using system local offset at that date is hard without tz lib.
    # We will store as "YYYY-MM-DDTHH:MM:SS+01:00" by using local timezone of runner.
    # GitHub runner is UTC, so we can't rely on local. We'll store without offset if we must.
    try:
        dt = datetime.strptime(value, "%Y%m%dT%H%M%S")
        # store as naive ISO (frontend can treat as Oslo if you do toLocaleString with TZ)
        return dt.strftime("%Y-%m-%dT%H:%M:%S")
    except Exception:
        return None


# -----------------------------
# Parsing: ICS (fotball.no etc.)
# -----------------------------
SUMMARY_SPLIT_RE = re.compile(r"\s+[-–—]\s+")

def parse_match_summary(summary: str) -> Tuple[str, str]:
    """
    Typical SUMMARY: "Odd - Brann"
    Returns (home, away). If can't split, returns ("Ukjent", summary)
    """
    s = (summary or "").strip()
    if not s:
        return ("Ukjent", "Ukjent")
    parts = SUMMARY_SPLIT_RE.split(s, maxsplit=1)
    if len(parts) == 2:
        return (parts[0].strip(), parts[1].strip())
    # Try "home vs away"
    if " vs " in s.lower():
        a, b = re.split(r"(?i)\s+vs\s+", s, maxsplit=1)
        return (a.strip(), b.strip())
    return ("Ukjent", s)


def parse_ics_events(ics_text: str) -> List[dict]:
    """
    Very small ICS parser for VEVENT.
    Extracts DTSTART + SUMMARY + LOCATION (optional).
    """
    # Unfold lines (RFC5545): lines starting with space are continuations
    lines = ics_text.splitlines()
    unfolded = []
    for line in lines:
        if line.startswith((" ", "\t")) and unfolded:
            unfolded[-1] += line.strip()
        else:
            unfolded.append(line.strip())

    events: List[dict] = []
    current: Dict[str, str] = {}
    in_event = False

    for line in unfolded:
        if line == "BEGIN:VEVENT":
            in_event = True
            current = {}
            continue
        if line == "END:VEVENT":
            if in_event:
                dt_raw = None

                # DTSTART can look like:
                # DTSTART:20260118T180000
                # DTSTART;TZID=Europe/Oslo:20260118T180000
                for k, v in current.items():
                    if k.startswith("DTSTART"):
                        dt_raw = v
                        break

                kickoff = parse_dt_ics(dt_raw or "")
                summary = current.get("SUMMARY", "").strip()
                location = current.get("LOCATION", "").strip()

                home, away = parse_match_summary(summary)

                if kickoff and home and away:
                    events.append({
                        "league": "",  # filled by caller
                        "home": home,
                        "away": away,
                        "kickoff": kickoff,
                        "channel": "Ukjent",
                        "where": [],
                        "location": location if location else None,
                    })
            in_event = False
            current = {}
            continue

        if not in_event:
            continue

        if ":" not in line:
            continue

        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip()
        current[key] = value

    return events


# -----------------------------
# Parsing: FixtureDownload JSON
# -----------------------------
def parse_fixturedownload_json(obj: Any) -> List[dict]:
    """
    FixtureDownload typically returns:
      [
        { "date":"2025-08-15", "time":"21:00", "homeTeam":"...", "awayTeam":"...", ... },
        ...
      ]
    or { "data":[...]}
    We'll support both.
    """
    items = obj
    if isinstance(obj, dict):
        for key in ("data", "fixtures", "matches", "games"):
            if key in obj and isinstance(obj[key], list):
                items = obj[key]
                break

    if not isinstance(items, list):
        return []

    out: List[dict] = []
    for it in items:
        if not isinstance(it, dict):
            continue
        home = (it.get("homeTeam") or it.get("home") or it.get("HomeTeam") or "").strip()
        away = (it.get("awayTeam") or it.get("away") or it.get("AwayTeam") or "").strip()

        date = (it.get("date") or it.get("Date") or "").strip()
        time = (it.get("time") or it.get("Time") or "").strip()

        if not date:
            # sometimes "datetime" / "kickoff"
            dt = (it.get("datetime") or it.get("kickoff") or it.get("start") or "").strip()
            if dt:
                kickoff = dt
            else:
                continue
        else:
            # Build ISO-ish; keep naive (frontend uses Europe/Oslo)
            if time:
                kickoff = f"{date}T{time}:00"
            else:
                kickoff = f"{date}T00:00:00"

        if not home or not away:
            continue

        out.append({
            "league": "",  # filled by caller
            "home": home,
            "away": away,
            "kickoff": kickoff,
            "channel": "Ukjent",
            "where": [],
        })

    return out


# -----------------------------
# Sources
# -----------------------------
def load_sources() -> Dict[str, SourceSpec]:
    """
    Reads data/_meta/sources.json if present.
    We accept several formats:
      {
        "football": {
          "eliteserien": {"kind":"ics","url":"..."},
          "obos": {"kind":"ics","url":"..."},
          "premier_league": {"kind":"json","url":"..."},
          ...
        }
      }

    or
      {
        "eliteserien": {"kind":"ics","url":"..."},
        "obos": {"kind":"ics","url":"..."},
        ...
      }
    """
    cfg = read_json(META_SOURCES) or {}
    football = cfg.get("football") if isinstance(cfg, dict) else None
    if isinstance(football, dict):
        cfg2 = football
    elif isinstance(cfg, dict):
        cfg2 = cfg
    else:
        cfg2 = {}

    out: Dict[str, SourceSpec] = {}
    for key, val in cfg2.items():
        if not isinstance(val, dict):
            continue
        url = val.get("url") or val.get("source") or val.get("feed") or ""
        kind = (val.get("kind") or val.get("type") or "").lower()
        if not kind:
            # infer by url
            if isinstance(url, str) and url.lower().endswith(".ics"):
                kind = "ics"
            else:
                kind = "json"
        if isinstance(url, str) and url.strip():
            out[str(key)] = SourceSpec(kind=kind, url=url.strip())

    return out


def get_source_for_league(sources: Dict[str, SourceSpec], league_key: str) -> SourceSpec:
    """
    league_key is "eliteserien", "obos", ...
    """
    if league_key in sources:
        return sources[league_key]

    # Common alternative keys
    aliases = {
        "champions_league": ["cl", "ucl", "championsleague", "champions-league"],
        "premier_league": ["epl", "premierleague", "premier-league"],
        "la_liga": ["laliga", "la-liga"],
    }
    for alt in aliases.get(league_key, []):
        if alt in sources:
            return sources[alt]

    raise RuntimeError(
        f"Mangler kilde for '{league_key}'. Legg inn i data/_meta/sources.json."
    )


# -----------------------------
# Main fetch per league
# -----------------------------
def fetch_league_games(league_key: str, league_name: str, src: SourceSpec) -> List[dict]:
    if src.kind == "ics":
        ics_text = http_get_text(src.url, "text/calendar,*/*")
        games = parse_ics_events(ics_text)
    else:
        obj = http_get_json(src.url)
        games = parse_fixturedownload_json(obj)

    # fill league + defaults
    for g in games:
        g["league"] = league_name
        if not g.get("channel") or g["channel"] == "Ukjent":
            g["channel"] = DEFAULT_CHANNEL.get(league_name, "Ukjent")

    # Filter to year 2026 if kickoff has a year in first 4 chars
    filtered = []
    for g in games:
        ko = (g.get("kickoff") or "")
        if isinstance(ko, str) and len(ko) >= 4 and ko[:4].isdigit():
            year = int(ko[:4])
            if year != 2026:
                continue
        filtered.append(g)

    # Sort by kickoff string (works for ISO-ish)
    filtered.sort(key=lambda x: (x.get("kickoff") or ""))
    return filtered


def main() -> int:
    ensure_dir(OUT_DIR_2026)

    sources = load_sources()
    if not sources:
        print("ERROR: Fant ingen football-kilder. Lag/oppdater data/_meta/sources.json.")
        print("Eksempel:")
        print(json.dumps({
            "football": {
                "eliteserien": {"kind":"ics", "url":"<ICS_URL>"},
                "obos": {"kind":"ics", "url":"<ICS_URL>"},
                "premier_league": {"kind":"json", "url":"https://fixturedownload.com/feed/json/epl-2026"},
                "champions_league": {"kind":"json", "url":"https://fixturedownload.com/feed/json/champions-league-2026"},
                "la_liga": {"kind":"json", "url":"https://fixturedownload.com/feed/json/la-liga-2026"}
            }
        }, ensure_ascii=False, indent=2))
        return 2

    all_games: List[dict] = []
    any_ok = False

    for league_key, league_name in LEAGUES:
        try:
            src = get_source_for_league(sources, league_key)
            games = fetch_league_games(league_key, league_name, src)
        except Exception as e:
            print(f"ERROR {league_key}: {e}")
            games = []

        out_path = os.path.join(OUT_DIR_2026, f"{league_key}.json")
        payload = {
            "generated_at": utc_now_iso(),
            "timezone": TZ_NAME,
            "league": league_name,
            "source": (sources.get(league_key).url if league_key in sources else None),
            "games": games,
        }

        safe_write_games(out_path, payload, games)
        print(f"WROTE {os.path.relpath(out_path, ROOT)}: {len(games)} games")

        if len(games) > 0:
            any_ok = True
            all_games.extend(games)

    # Optional: write combined football.json (useful for calendar/feed building)
    combined_path = os.path.join(OUT_DIR_2026, "football.json")
    combined_payload = {
        "generated_at": utc_now_iso(),
        "timezone": TZ_NAME,
        "games": sorted(all_games, key=lambda x: (x.get("kickoff") or "")),
    }
    safe_write_games(combined_path, combined_payload, all_games)
    print(f"WROTE {os.path.relpath(combined_path, ROOT)}: {len(all_games)} games")

    # If *everything* is zero, fail the action so you notice immediately
    if not any_ok:
        print("ERROR: 0 games for ALL leagues. Pipeline should fail so you don't publish empty data.")
        return 3

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
