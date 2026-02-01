#!/usr/bin/env python3
# tools/fetch_football_2026.py
#
# Grenland Live — Football 2026 builder
# هدف: Sørg for at FRONTEND-filer blir fylt:
#   data/2026/eliteserien.json
#   data/2026/obos.json
#   data/2026/premier_league.json
#   data/2026/champions_league.json
#   data/2026/la_liga.json
#
# Strategi:
#  1) Hvis data/2026/football.json finnes og har kamper -> bruk den som kilde
#  2) Ellers: forsøk å hente fra fixturedownload (valgfritt) hvis URLer settes i env
#  3) Normaliser + filtrer til 2026
#  4) Skriv per liga til filene UI bruker

import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Any, Dict, List, Optional, Tuple
from urllib.request import Request, urlopen

TZ = ZoneInfo("Europe/Oslo")

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA_2026 = os.path.join(ROOT, "data", "2026")

OUT_FILES = {
    "eliteserien": os.path.join(DATA_2026, "eliteserien.json"),
    "obos": os.path.join(DATA_2026, "obos.json"),
    "premier_league": os.path.join(DATA_2026, "premier_league.json"),
    "champions_league": os.path.join(DATA_2026, "champions_league.json"),
    "la_liga": os.path.join(DATA_2026, "la_liga.json"),
}

COMBINED_FILE = os.path.join(DATA_2026, "football.json")

# Mapper ulike liga-tekster til våre faste keys
LEAGUE_MAP = [
    ("eliteserien", ["eliteserien", "tippeligaen"]),
    ("obos", ["obos", "obos-ligaen", "obosligaen", "1. divisjon"]),
    ("premier_league", ["premier league", "epl"]),
    ("champions_league", ["champions league", "uefa champions league", "ucl"]),
    ("la_liga", ["la liga", "laliga", "primera división", "primera division"]),
]

DEFAULT_WHERE = ["Vikinghjørnet", "Gimle Pub"]


@dataclass
class Game:
    league_key: str
    league: str
    home: str
    away: str
    kickoff: str  # ISO string with offset
    channel: str
    where: List[str]


def _safe_mkdir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def _read_json(path: str) -> Optional[Any]:
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"[football] WARN: could not read {path}: {e}")
        return None


def _write_json(path: str, obj: Any) -> None:
    _safe_mkdir(os.path.dirname(path))
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def _uniq_keep_order(items: List[str]) -> List[str]:
    seen = set()
    out = []
    for it in items:
        s = str(it).strip()
        if not s or s in seen:
            continue
        seen.add(s)
        out.append(s)
    return out


def _to_iso_oslo(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=TZ)
    else:
        dt = dt.astimezone(TZ)
    return dt.isoformat()


def _parse_iso_any(s: str) -> Optional[datetime]:
    if not s:
        return None
    s = str(s).strip()
    try:
        # Python can parse ISO with offset, e.g. 2026-01-18T18:00:00+01:00
        return datetime.fromisoformat(s)
    except Exception:
        pass

    # Try common patterns
    fmts = [
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%d.%m.%Y %H:%M",
        "%Y-%m-%dT%H:%M",
        "%Y-%m-%dT%H:%M:%S",
    ]
    for fmt in fmts:
        try:
            dt = datetime.strptime(s, fmt)
            return dt.replace(tzinfo=TZ)
        except Exception:
            continue
    return None


def _league_key_from_text(text: str) -> Optional[str]:
    t = (text or "").lower()
    for key, needles in LEAGUE_MAP:
        for n in needles:
            if n in t:
                return key
    return None


def _extract_list(json_obj: Any) -> List[Dict[str, Any]]:
    """Find a list of games in typical containers."""
    if isinstance(json_obj, list):
        return [x for x in json_obj if isinstance(x, dict)]
    if isinstance(json_obj, dict):
        for k in ("games", "items", "matches", "data"):
            v = json_obj.get(k)
            if isinstance(v, list):
                return [x for x in v if isinstance(x, dict)]
    return []


def _normalize_any(item: Dict[str, Any]) -> Optional[Game]:
    # Find fields with a lot of tolerance
    league = item.get("league") or item.get("competition") or item.get("tournament") or item.get("series") or ""
    home = item.get("home") or item.get("homeTeam") or item.get("team1") or item.get("h") or item.get("localTeam") or ""
    away = item.get("away") or item.get("awayTeam") or item.get("team2") or item.get("a") or item.get("visitorTeam") or ""

    kickoff_raw = (
        item.get("kickoff")
        or item.get("start")
        or item.get("dateTime")
        or item.get("datetime")
        or item.get("date")
        or item.get("time")  # sometimes separate, handled below
        or ""
    )

    # Handle FixtureDownload style: {"date":"2026-01-03","time":"13:30","home":"..","away":"..","competition":"Premier League"}
    if item.get("date") and item.get("time") and not str(item.get("date")).startswith("http"):
        dt = _parse_iso_any(f"{item.get('date')} {item.get('time')}")
    else:
        dt = _parse_iso_any(str(kickoff_raw))

    if not dt:
        return None

    league_key = _league_key_from_text(str(league))
    # If league is missing, attempt based on known labels inside item
    if not league_key:
        league_key = _league_key_from_text(json.dumps(item, ensure_ascii=False))
    if not league_key:
        # Unknown league -> ignore (we only write the 5 leagues here)
        return None

    channel = item.get("channel") or item.get("tv") or item.get("broadcaster") or item.get("kanal") or "Ukjent"

    where = []
    if isinstance(item.get("where"), list):
        where = item["where"]
    elif isinstance(item.get("where"), str):
        where = [item["where"]]
    elif isinstance(item.get("pubs"), list):
        # could be [{name,city}] or strings
        pubs = item["pubs"]
        tmp = []
        for p in pubs:
            if isinstance(p, dict) and p.get("name"):
                tmp.append(p["name"])
            elif isinstance(p, str):
                tmp.append(p)
        where = tmp

    where = _uniq_keep_order(DEFAULT_WHERE + where)

    # Keep original league text for display
    league_label = {
        "eliteserien": "Eliteserien",
        "obos": "OBOS-ligaen",
        "premier_league": "Premier League",
        "champions_league": "Champions League",
        "la_liga": "La Liga",
    }[league_key]

    return Game(
        league_key=league_key,
        league=league_label,
        home=str(home).strip(),
        away=str(away).strip(),
        kickoff=_to_iso_oslo(dt),
        channel=str(channel).strip() if str(channel).strip() else "Ukjent",
        where=where,
    )


def _http_get_json(url: str, timeout: int = 30) -> Any:
    req = Request(url, headers={"User-Agent": "Grenland-Live/1.0"})
    with urlopen(req, timeout=timeout) as r:
        raw = r.read().decode("utf-8", errors="replace")
    return json.loads(raw)


def _maybe_fetch_sources() -> List[Dict[str, Any]]:
    """
    Optional: if you set env vars, we can fetch fresh.
    If not set, we simply skip fetching and use existing football.json.
    """
    sources = []

    # You can set these in GitHub Actions secrets or workflow env:
    # FD_EPL, FD_UCL, FD_LALIGA (FixtureDownload JSON feed urls)
    # Example:
    #   https://fixturedownload.com/feed/json/epl-2025
    # (works for season feeds; we filter to 2026)
    env_map = {
        "FD_EPL": "premier_league",
        "FD_UCL": "champions_league",
        "FD_LALIGA": "la_liga",
    }

    for env_key, league_key in env_map.items():
        url = os.getenv(env_key, "").strip()
        if not url:
            continue
        try:
            print(f"[football] fetching {env_key} -> {url}")
            j = _http_get_json(url)
            items = _extract_list(j)
            for it in items:
                # Ensure league text exists so mapping works
                if "league" not in it and "competition" not in it:
                    it["league"] = league_key.replace("_", " ").title()
                sources.append(it)
        except Exception as e:
            print(f"[football] WARN fetch failed {env_key}: {e}")

    return sources


def _filter_year(games: List[Game], year: int = 2026) -> List[Game]:
    out = []
    for g in games:
        dt = _parse_iso_any(g.kickoff)
        if not dt:
            continue
        dt = dt.astimezone(TZ)
        if dt.year == year:
            out.append(g)
    out.sort(key=lambda x: x.kickoff)
    return out


def main() -> int:
    _safe_mkdir(DATA_2026)

    # 1) load existing combined file if it has content
    combined = _read_json(COMBINED_FILE)
    combined_items = _extract_list(combined) if combined is not None else []
    if combined_items:
        print(f"[football] using existing {COMBINED_FILE} ({len(combined_items)} items)")
        raw_items = combined_items
    else:
        # 2) try fetching optional sources
        fetched = _maybe_fetch_sources()
        if fetched:
            raw_items = fetched
            print(f"[football] fetched {len(raw_items)} items from env sources")
        else:
            raw_items = []
            print("[football] WARN: no input data found. football.json missing/empty and no env sources set.")

    # Normalize
    norm: List[Game] = []
    for it in raw_items:
        g = _normalize_any(it)
        if g:
            norm.append(g)

    # Filter to 2026
    norm_2026 = _filter_year(norm, 2026)

    # Split by league
    by_league: Dict[str, List[Game]] = {k: [] for k in OUT_FILES.keys()}
    for g in norm_2026:
        if g.league_key in by_league:
            by_league[g.league_key].append(g)

    # Write per league files
    for key, path in OUT_FILES.items():
        games_out = [
            {
                "league": gg.league,
                "home": gg.home,
                "away": gg.away,
                "kickoff": gg.kickoff,
                "channel": gg.channel or "Ukjent",
                "where": gg.where or DEFAULT_WHERE,
            }
            for gg in by_league[key]
        ]
        _write_json(path, {"games": games_out})
        print(f"[football] WROTE {os.path.relpath(path, ROOT)}: {len(games_out)} games")

    # Update combined football.json (optional but nice)
    combined_out = {
        "games": [
            {
                "league": gg.league,
                "home": gg.home,
                "away": gg.away,
                "kickoff": gg.kickoff,
                "channel": gg.channel or "Ukjent",
                "where": gg.where or DEFAULT_WHERE,
            }
            for gg in norm_2026
        ]
    }
    _write_json(COMBINED_FILE, combined_out)
    print(f"[football] WROTE {os.path.relpath(COMBINED_FILE, ROOT)}: {len(combined_out['games'])} games")

    # Summary
    total = sum(len(v) for v in by_league.values())
    if total == 0:
        print("[football] ERROR: 0 games written to league files. Source is empty or league mapping failed.")
        return 2

    print("[football] DONE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
