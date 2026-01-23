#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Grenland Live – Handball + Vintersport pipeline
- Handball: parse EHF schedule PDF -> JSON matches (best effort)
- Vintersport (Skiskyting): biathlonresults sportapi -> JSON matches, split men/women

Output format (per file):
{
  "generated_at": "ISO",
  "source": "...",
  "games": [
    {
      "league": "...",
      "home": "...",
      "away": "...",
      "kickoff": "2026-01-15T18:00:00+01:00",
      "channel": "...",
      "where": []
    }
  ]
}
"""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests

# Optional dependency for PDF parsing
try:
    import pdfplumber  # type: ignore
except Exception:
    pdfplumber = None


# ----------------------------
# Helpers
# ----------------------------

TZ_OSLO = "Europe/Oslo"

def iso_now_utc() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()

def ensure_parent(path: str) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)

def write_json(path: str, payload: Dict[str, Any]) -> None:
    ensure_parent(path)
    Path(path).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

def load_config(path: str) -> Dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))

def to_oslo_iso(zulu_iso: str) -> str:
    """
    Convert '2026-01-22T17:15:00Z' -> ISO with +01:00 (Oslo winter).
    We avoid pytz to keep deps minimal and rely on stdlib zoneinfo (py>=3.9).
    """
    from zoneinfo import ZoneInfo  # py3.9+

    dt = datetime.fromisoformat(zulu_iso.replace("Z", "+00:00"))
    dt_oslo = dt.astimezone(ZoneInfo(TZ_OSLO))
    return dt_oslo.replace(microsecond=0).isoformat()

def clean_spaces(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()

def safe_get(d: Dict[str, Any], *keys: str, default=None):
    cur: Any = d
    for k in keys:
        if not isinstance(cur, dict) or k not in cur:
            return default
        cur = cur[k]
    return cur


# ----------------------------
# Handball PDF parser (best effort)
# ----------------------------

@dataclass
class HandballGame:
    league: str
    home: str
    away: str
    kickoff: str
    channel: str

def fetch_bytes(url: str, timeout: int = 30) -> bytes:
    r = requests.get(url, timeout=timeout)
    r.raise_for_status()
    return r.content

def parse_handball_pdf(pdf_url: str, league_name: str, channel: str) -> List[HandballGame]:
    """
    Parses a schedule PDF.
    This is "best effort": PDFs vary, so we do robust regex extraction.

    We look for patterns like:
      15.01.2026 18:00 ... TEAM A - TEAM B
    or
      15 Jan 2026 18:00 ... TEAM A vs TEAM B

    If PDF format changes, you still get partial results rather than empty file.
    """
    if not pdf_url:
        return []

    if pdfplumber is None:
        raise RuntimeError("pdfplumber mangler. Legg til 'pdfplumber' i tools/requirements-tools.txt")

    pdf_data = fetch_bytes(pdf_url)
    games: List[HandballGame] = []

    # Regex patterns
    # date: 15.01.2026 or 15 Jan 2026
    re_date1 = r"(?P<d>\d{1,2})\.(?P<m>\d{1,2})\.(?P<y>\d{4})"
    re_date2 = r"(?P<d2>\d{1,2})\s+(?P<mon>[A-Za-z]{3,9})\s+(?P<y2>\d{4})"
    re_time = r"(?P<h>\d{1,2}):(?P<min>\d{2})"
    # teams: "A - B" or "A vs B"
    re_teams = r"(?P<t1>[A-ZÆØÅa-zæøå\.\-\'\s]{2,})\s+(?:-|vs)\s+(?P<t2>[A-ZÆØÅa-zæøå\.\-\'\s]{2,})"

    month_map = {
        "jan": 1, "january": 1,
        "feb": 2, "february": 2,
        "mar": 3, "march": 3,
        "apr": 4, "april": 4,
        "may": 5,
        "jun": 6, "june": 6,
        "jul": 7, "july": 7,
        "aug": 8, "august": 8,
        "sep": 9, "sept": 9, "september": 9,
        "oct": 10, "october": 10,
        "nov": 11, "november": 11,
        "dec": 12, "december": 12
    }

    from zoneinfo import ZoneInfo
    oslo = ZoneInfo(TZ_OSLO)

    def make_iso(y: int, m: int, d: int, hh: int, mm: int) -> str:
        dt = datetime(y, m, d, hh, mm, tzinfo=oslo)
        return dt.replace(microsecond=0).isoformat()

    with pdfplumber.open(io.BytesIO(pdf_data)) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            text = text.replace("\u00ad", "")  # soft hyphen
            lines = [clean_spaces(x) for x in text.splitlines() if clean_spaces(x)]
            for ln in lines:
                # First try dd.mm.yyyy
                m1 = re.search(rf"{re_date1}\s+{re_time}.*?{re_teams}", ln)
                if m1:
                    d = int(m1.group("d")); mo = int(m1.group("m")); y = int(m1.group("y"))
                    hh = int(m1.group("h")); mm = int(m1.group("min"))
                    t1 = clean_spaces(m1.group("t1"))
                    t2 = clean_spaces(m1.group("t2"))
                    games.append(HandballGame(league=league_name, home=t1, away=t2, kickoff=make_iso(y, mo, d, hh, mm), channel=channel))
                    continue

                # Then try "15 Jan 2026"
                m2 = re.search(rf"{re_date2}\s+{re_time}.*?{re_teams}", ln, flags=re.IGNORECASE)
                if m2:
                    d = int(m2.group("d2")); y = int(m2.group("y2"))
                    mon = m2.group("mon").lower()[:3]
                    mo = month_map.get(mon, 0)
                    if mo == 0:
                        continue
                    hh = int(m2.group("h")); mm = int(m2.group("min"))
                    t1 = clean_spaces(m2.group("t1"))
                    t2 = clean_spaces(m2.group("t2"))
                    games.append(HandballGame(league=league_name, home=t1, away=t2, kickoff=make_iso(y, mo, d, hh, mm), channel=channel))
                    continue

    # De-dup
    uniq: Dict[Tuple[str, str, str], HandballGame] = {}
    for g in games:
        key = (g.home.lower(), g.away.lower(), g.kickoff)
        uniq[key] = g

    return list(uniq.values())


# ----------------------------
# Biathlon (IBU) API
# ----------------------------

@dataclass
class Race:
    league: str
    home: str
    away: str
    kickoff: str
    channel: str
    gender: str  # "men" | "women" | "mixed"

BIATHLON_ROOT = "https://api.biathlonresults.com/modules/sportapi/api/"

def biathlon_events(season_id: int, level: int) -> List[Dict[str, Any]]:
    url = f"{BIATHLON_ROOT}Events"
    r = requests.get(url, params={"SeasonId": season_id, "Level": level}, timeout=30)
    r.raise_for_status()
    # API returns XML by default, but many endpoints also return JSON depending headers.
    # Safer: accept xml and parse minimal with regex.
    txt = r.text
    # Extract EventId blocks
    event_ids = re.findall(r"<EventId>([^<]+)</EventId>", txt)
    # Also keep Start/End and ShortDescription and Place (Organizer)
    # We'll do a coarse parse per <Event>...</Event> if present
    events: List[Dict[str, Any]] = []
    for block in re.findall(r"<Event>(.*?)</Event>", txt, flags=re.DOTALL):
        ev = {
            "EventId": (re.search(r"<EventId>([^<]+)</EventId>", block) or [None]).group(1) if re.search(r"<EventId>([^<]+)</EventId>", block) else None,
            "ShortDescription": (re.search(r"<ShortDescription>([^<]+)</ShortDescription>", block) or [None]).group(1) if re.search(r"<ShortDescription>([^<]+)</ShortDescription>", block) else None,
            "StartDate": (re.search(r"<StartDate>([^<]+)</StartDate>", block) or [None]).group(1) if re.search(r"<StartDate>([^<]+)</StartDate>", block) else None,
            "EndDate": (re.search(r"<EndDate>([^<]+)</EndDate>", block) or [None]).group(1) if re.search(r"<EndDate>([^<]+)</EndDate>", block) else None,
        }
        if ev["EventId"]:
            events.append(ev)
    # Fallback: if no <Event> blocks found, at least return ids
    if not events and event_ids:
        events = [{"EventId": eid} for eid in event_ids]
    return events

def biathlon_competitions(event_id: str) -> List[Dict[str, Any]]:
    url = f"{BIATHLON_ROOT}Competitions"
    r = requests.get(url, params={"EventId": event_id}, timeout=30)
    r.raise_for_status()
    txt = r.text
    comps: List[Dict[str, Any]] = []
    for block in re.findall(r"<Competition>(.*?)</Competition>", txt, flags=re.DOTALL):
        comp = {
            "RaceId": (re.search(r"<RaceId>([^<]+)</RaceId>", block) or [None]).group(1) if re.search(r"<RaceId>([^<]+)</RaceId>", block) else None,
            "ShortDescription": (re.search(r"<ShortDescription>([^<]+)</ShortDescription>", block) or [None]).group(1) if re.search(r"<ShortDescription>([^<]+)</ShortDescription>", block) else None,
            "StartTime": (re.search(r"<StartTime>([^<]+)</StartTime>", block) or [None]).group(1) if re.search(r"<StartTime>([^<]+)</StartTime>", block) else None,
            "catId": (re.search(r"<catId>([^<]+)</catId>", block) or [None]).group(1) if re.search(r"<catId>([^<]+)</catId>", block) else None,
            "DisciplineId": (re.search(r"<DisciplineId>([^<]+)</DisciplineId>", block) or [None]).group(1) if re.search(r"<DisciplineId>([^<]+)</DisciplineId>", block) else None,
        }
        if comp["RaceId"] and comp["StartTime"]:
            comps.append(comp)
    return comps

def normalize_biathlon_races(season_id: int, level: int, channel: str) -> List[Race]:
    # Level=3 is commonly World Cup tiers in examples; config controls this.
    events = biathlon_events(season_id, level)
    races: List[Race] = []
    for ev in events:
        eid = ev.get("EventId")
        if not eid:
            continue
        comps = biathlon_competitions(eid)
        for c in comps:
            start = c.get("StartTime")
            if not start:
                continue

            oslo_iso = to_oslo_iso(start)
            cat = (c.get("catId") or "").upper()

            # catId: "M" men, "W" women, "MX" mixed (common)
            if cat == "M":
                gender = "men"
            elif cat == "W":
                gender = "women"
            else:
                gender = "mixed"

            # We map this into your "match" structure:
            # home/away: use discipline text as "home vs away" for UI compatibility.
            desc = clean_spaces(c.get("ShortDescription") or "Skiskyting")
            home = desc
            away = ""  # not a team-vs-team sport

            races.append(Race(
                league="Skiskyting (IBU)",
                home=home,
                away=away,
                kickoff=oslo_iso,
                channel=channel,
                gender=gender
            ))

    # De-dup
    uniq: Dict[Tuple[str, str], Race] = {}
    for r in races:
        key = (r.kickoff, r.home)
        uniq[key] = r
    return sorted(list(uniq.values()), key=lambda x: x.kickoff)


# ----------------------------
# Main
# ----------------------------

def build_payload(source_name: str, games: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "generated_at": iso_now_utc(),
        "source": source_name,
        "games": games
    }

def handball_to_dict(g: HandballGame) -> Dict[str, Any]:
    return {
        "league": g.league,
        "home": g.home,
        "away": g.away,
        "kickoff": g.kickoff,
        "channel": g.channel,
        "where": []
    }

def race_to_dict(r: Race) -> Dict[str, Any]:
    return {
        "league": r.league,
        "home": r.home,
        "away": r.away,
        "kickoff": r.kickoff,
        "channel": r.channel,
        "where": []
    }

def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    cfg_path = repo_root / "data" / "multi_sources.json"
    if not cfg_path.exists():
        print(f"ERROR: Mangler {cfg_path}", file=sys.stderr)
        return 1

    cfg = load_config(str(cfg_path))
    outputs = cfg.get("outputs", {})
    feeds = cfg.get("feeds", [])

    handball_menn: List[Dict[str, Any]] = []
    handball_kvinner: List[Dict[str, Any]] = []
    vintersport_menn: List[Dict[str, Any]] = []
    vintersport_kvinner: List[Dict[str, Any]] = []

    for f in feeds:
        ftype = f.get("type")
        name = f.get("name", f.get("key", "feed"))
        channel = f.get("channel", "")

        if ftype == "handball_pdf":
            pdf_url = f.get("pdf_url", "")
            try:
                parsed = parse_handball_pdf(pdf_url=pdf_url, league_name=name, channel=channel)
            except Exception as e:
                print(f"WARN: Handball PDF parse feilet for {name}: {e}", file=sys.stderr)
                parsed = []

            as_dicts = [handball_to_dict(x) for x in sorted(parsed, key=lambda x: x.kickoff)]
            # Route to correct output by key
            key = f.get("key", "")
            if "kvinner" in key or "women" in key:
                handball_kvinner.extend(as_dicts)
            else:
                handball_menn.extend(as_dicts)

        elif ftype == "biathlon_api":
            season_id = int(f.get("season_id"))
            level = int(f.get("level", 3))
            try:
                races = normalize_biathlon_races(season_id=season_id, level=level, channel=channel)
            except Exception as e:
                print(f"WARN: Biathlon API feilet: {e}", file=sys.stderr)
                races = []

            men = [race_to_dict(r) for r in races if r.gender == "men"]
            women = [race_to_dict(r) for r in races if r.gender == "women"]

            vintersport_menn.extend(men)
            vintersport_kvinner.extend(women)

        else:
            print(f"WARN: Ukjent feed type: {ftype} ({name})", file=sys.stderr)

    # De-dup per file
    def dedup(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        seen = set()
        out = []
        for it in items:
            key = (it.get("league",""), it.get("home",""), it.get("away",""), it.get("kickoff",""))
            if key in seen:
                continue
            seen.add(key)
            out.append(it)
        return out

    handball_menn = dedup(sorted(handball_menn, key=lambda x: x["kickoff"]))
    handball_kvinner = dedup(sorted(handball_kvinner, key=lambda x: x["kickoff"]))
    vintersport_menn = dedup(sorted(vintersport_menn, key=lambda x: x["kickoff"]))
    vintersport_kvinner = dedup(sorted(vintersport_kvinner, key=lambda x: x["kickoff"]))

    # Write outputs
    if outputs.get("handball_menn"):
        write_json(outputs["handball_menn"], build_payload("Grenland Live pipeline (handball men)", handball_menn))
        print(f"WROTE {outputs['handball_menn']} ({len(handball_menn)} items)")
    if outputs.get("handball_kvinner"):
        write_json(outputs["handball_kvinner"], build_payload("Grenland Live pipeline (handball women)", handball_kvinner))
        print(f"WROTE {outputs['handball_kvinner']} ({len(handball_kvinner)} items)")
    if outputs.get("vintersport_menn"):
        write_json(outputs["vintersport_menn"], build_payload("Grenland Live pipeline (vintersport men)", vintersport_menn))
        print(f"WROTE {outputs['vintersport_menn']} ({len(vintersport_menn)} items)")
    if outputs.get("vintersport_kvinner"):
        write_json(outputs["vintersport_kvinner"], build_payload("Grenland Live pipeline (vintersport women)", vintersport_kvinner))
        print(f"WROTE {outputs['vintersport_kvinner']} ({len(vintersport_kvinner)} items)")

    return 0

if __name__ == "__main__":
    import io  # needed for pdfplumber.open on bytes
    raise SystemExit(main())
