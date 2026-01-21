from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)

OSLO = ZoneInfo("Europe/Oslo")
END_OSLO = datetime(2026, 12, 31, 23, 59, 59, tzinfo=OSLO)

HEADERS = {"User-Agent": "GrenlandLiveBot/3.0 (+github-actions)"}

# NFF offisiell kalender-API (ICS)
ELITESERIEN_ICS = "https://www.fotball.no/footballapi/Calendar/GetCalendar?tournamentId=206092"
OBOS_ICS       = "https://www.fotball.no/footballapi/Calendar/GetCalendar?tournamentId=206093"


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


def fetch_ics(url: str) -> str:
    r = requests.get(url, headers=HEADERS, timeout=60)
    r.raise_for_status()
    return r.text


def _unfold_ics_lines(ics_text: str) -> List[str]:
    """
    ICS kan ha "folded lines" (linjer som fortsetter på neste linje med leading space).
    Vi folder dem ut igjen.
    """
    lines = ics_text.splitlines()
    out: List[str] = []
    for ln in lines:
        if not ln:
            out.append(ln)
            continue
        if ln.startswith(" ") or ln.startswith("\t"):
            if out:
                out[-1] += ln[1:]
            else:
                out.append(ln.lstrip())
        else:
            out.append(ln)
    return out


def _get_prop(lines: List[str], key: str) -> Optional[str]:
    """
    Hent første linje som starter med f.eks. "DTSTART" eller "SUMMARY".
    Kan være DTSTART;TZID=...: eller DTSTART:...
    """
    for ln in lines:
        if ln.startswith(key):
            # split på første ":" (etter evt. ;param=...)
            parts = ln.split(":", 1)
            if len(parts) == 2:
                return parts[1].strip()
    return None


def _parse_dt(dt_str: str) -> Optional[datetime]:
    """
    Støtter:
    - 20260405T160000Z (UTC)
    - 20260405T160000 (tolkes som lokal Oslo)
    """
    try:
        if dt_str.endswith("Z"):
            # UTC
            base = dt_str[:-1]
            dt = datetime.strptime(base, "%Y%m%dT%H%M%S").replace(tzinfo=ZoneInfo("UTC"))
            return dt.astimezone(OSLO)
        # lokal (antar Oslo)
        dt = datetime.strptime(dt_str, "%Y%m%dT%H%M%S").replace(tzinfo=OSLO)
        return dt
    except Exception:
        return None


def _split_home_away(summary: str) -> Optional[Tuple[str, str]]:
    # Vanligst: "Lag A - Lag B"
    s = summary.strip()
    # fjern evt. prefiks
    s = re.sub(r"^\s*(Eliteserien|OBOS-ligaen)\s*:\s*", "", s, flags=re.I)
    # split på dash/en-dash
    if " - " in s:
        a, b = s.split(" - ", 1)
        return a.strip(), b.strip()
    if " – " in s:
        a, b = s.split(" – ", 1)
        return a.strip(), b.strip()
    return None


def parse_ics_games(ics_text: str) -> List[Dict[str, Any]]:
    lines = _unfold_ics_lines(ics_text)

    # del opp i VEVENT-blokker
    events: List[List[str]] = []
    cur: List[str] = []
    inside = False

    for ln in lines:
        if ln.strip() == "BEGIN:VEVENT":
            inside = True
            cur = []
            continue
        if ln.strip() == "END:VEVENT":
            if inside:
                events.append(cur)
            inside = False
            cur = []
            continue
        if inside:
            cur.append(ln)

    games: Dict[Tuple[str, str, str], Dict[str, Any]] = {}

    for ev in events:
        dt_raw = _get_prop(ev, "DTSTART")
        summary = _get_prop(ev, "SUMMARY")
        if not dt_raw or not summary:
            continue

        dt = _parse_dt(dt_raw)
        if not dt:
            continue

        # filter: i dag -> 31.12.2026
        if dt < now_oslo() or dt > END_OSLO:
            continue

        ha = _split_home_away(summary)
        if not ha:
            continue
        home, away = ha

        kickoff_iso = dt.isoformat(timespec="seconds")  # inkluderer +01/+02 automatisk

        g = {
            "home": home,
            "away": away,
            "kickoff": kickoff_iso,
            "channel": "",
            "where": []
        }
        games[(home, away, kickoff_iso)] = g

    out = list(games.values())
    out.sort(key=lambda x: x["kickoff"])
    return out


def merge_preserve(new_games: List[Dict[str, Any]], existing_obj: Dict[str, Any]) -> Dict[str, Any]:
    old_games = existing_obj.get("games", []) if isinstance(existing_obj, dict) else []
    old_map: Dict[Tuple[str, str, str], Dict[str, Any]] = {}
    for g in old_games:
        key = (g.get("home", ""), g.get("away", ""), g.get("kickoff", ""))
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


def update_from_ics(name: str, url: str, out_file: str) -> None:
    path = DATA / out_file
    existing = read_json(path, {"games": []})

    try:
        ics = fetch_ics(url)
        games = parse_ics_games(ics)
        print(f"{name}: found {len(games)} games")
        if games:
            write_json(path, merge_preserve(games, existing))
        else:
            print(f"WARN {name}: 0 games found - keeping existing")
            write_json(path, existing)
    except Exception as e:
        print(f"WARN {name}: failed: {e}")
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
    print("Updating (ICS via fotball.no) -> 31.12.2026")
    update_from_ics("Eliteserien", ELITESERIEN_ICS, "eliteserien.json")
    update_from_ics("OBOS-ligaen", OBOS_ICS, "obos.json")
    ensure_other_files_exist()
    print("DONE")


if __name__ == "__main__":
    main()
