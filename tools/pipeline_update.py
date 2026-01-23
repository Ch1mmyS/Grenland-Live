#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime, date, time, timezone
from typing import Any, Dict, List, Optional, Tuple

import requests
from icalendar import Calendar
from dateutil import tz
from dateutil.parser import isoparse


DEFAULT_CONFIG_PATH = os.path.join("data", "ics_sources.json")


@dataclass
class LeagueConfig:
    key: str
    name: str
    ics_url: str
    out_path: str
    default_tv: str


def _die(msg: str, code: int = 1) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)


def _load_config(path: str) -> Tuple[str, List[LeagueConfig]]:
    if not os.path.exists(path):
        _die(f"Mangler config: {path}. Lag {DEFAULT_CONFIG_PATH} som i eksempelet jeg sendte.")

    with open(path, "r", encoding="utf-8") as f:
        raw = json.load(f)

    tz_name = raw.get("timezone") or "Europe/Oslo"
    leagues_raw = raw.get("leagues")
    if not isinstance(leagues_raw, list) or not leagues_raw:
        _die("Config må ha 'leagues' som en liste med minst én liga.")

    leagues: List[LeagueConfig] = []
    for i, item in enumerate(leagues_raw):
        for field in ("key", "name", "ics_url", "out_path", "default_tv"):
            if field not in item or not str(item[field]).strip():
                _die(f"Config leagues[{i}] mangler feltet '{field}' eller det er tomt.")
        leagues.append(
            LeagueConfig(
                key=str(item["key"]).strip(),
                name=str(item["name"]).strip(),
                ics_url=str(item["ics_url"]).strip(),
                out_path=str(item["out_path"]).strip(),
                default_tv=str(item["default_tv"]).strip(),
            )
        )

    return tz_name, leagues


def _fetch_ics(url: str, timeout: int = 30) -> bytes:
    if url.startswith("PUTT_INN_"):
        _die(f"Du har ikke fylt inn ICS-URL: {url}")

    headers = {
        "User-Agent": "GrenlandLivePipeline/1.0 (+https://github.com/)",
        "Accept": "text/calendar, text/plain, */*",
    }
    r = requests.get(url, headers=headers, timeout=timeout)
    r.raise_for_status()
    return r.content


def _as_datetime_oslo(value: Any, tz_oslo) -> Optional[datetime]:
    """
    ICS DTSTART kan være:
    - datetime (ofte tz-aware)
    - date (all-day)
    - str
    """
    if value is None:
        return None

    # icalendar types kan gi .dt
    dt = getattr(value, "dt", value)

    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            # Noen kilder sender "naive" -> tolk som UTC (konservativt) og konverter
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(tz_oslo)

    if isinstance(dt, date):
        # All-day event -> ingen klokkeslett. Sett 12:00 som fallback (men PL skal normalt ha time!)
        noon = datetime.combine(dt, time(12, 0))
        return noon.replace(tzinfo=tz_oslo)

    if isinstance(dt, str):
        try:
            parsed = isoparse(dt)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(tz_oslo)
        except Exception:
            return None

    return None


_MATCH_HOME_AWAY = re.compile(
    r"^\s*(?P<home>.+?)\s*(?:-|\sv\s|\svs\.?\s|\sV\s|\sVs\s|\sv\.\s)\s*(?P<away>.+?)\s*$",
    re.IGNORECASE,
)


def _parse_home_away(summary: str, description: str = "") -> Optional[Tuple[str, str]]:
    """
    Prøver å finne "Home vs Away" fra SUMMARY først, ellers DESCRIPTION/LOCATION.
    """
    cand = (summary or "").strip()
    if cand:
        m = _MATCH_HOME_AWAY.match(cand)
        if m:
            return m.group("home").strip(), m.group("away").strip()

    cand2 = (description or "").strip()
    if cand2:
        # Finn første linje som matcher mønsteret
        for line in cand2.splitlines():
            m = _MATCH_HOME_AWAY.match(line.strip())
            if m:
                return m.group("home").strip(), m.group("away").strip()

    return None


def _safe_text(v: Any) -> str:
    if v is None:
        return ""
    return str(v).strip()


def _parse_ics_events(ics_bytes: bytes, league_name: str, tz_oslo) -> List[Dict[str, Any]]:
    cal = Calendar.from_ical(ics_bytes)
    games: List[Dict[str, Any]] = []

    for comp in cal.walk():
        if comp.name != "VEVENT":
            continue

        summary = _safe_text(comp.get("SUMMARY"))
        desc = _safe_text(comp.get("DESCRIPTION"))
        loc = _safe_text(comp.get("LOCATION"))

        dtstart = _as_datetime_oslo(comp.get("DTSTART"), tz_oslo)
        if dtstart is None:
            # hopp over hvis vi ikke får tid
            continue

        parsed = _parse_home_away(summary, desc) or _parse_home_away(summary, loc)
        if not parsed:
            # Fallback: hvis det står noe som "Team A - Team B" inne i summary med ekstra tekst
            # Prøv å lete i summary etter et segment
            parts = re.split(r"[|•·]", summary)
            found = None
            for p in parts:
                m = _MATCH_HOME_AWAY.match(p.strip())
                if m:
                    found = (m.group("home").strip(), m.group("away").strip())
                    break
            if not found:
                continue
            home, away = found
        else:
            home, away = parsed

        game = {
            "league": league_name,
            "home": home,
            "away": away,
            "kickoff": dtstart.isoformat(),
        }
        games.append(game)

    # Stabil sortering
    games.sort(key=lambda g: g.get("kickoff", ""))
    return games


def _load_existing_json(path: str) -> Optional[Dict[str, Any]]:
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _merge_tv(games: List[Dict[str, Any]], default_tv: str) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for g in games:
        g2 = dict(g)
        # Støtt både "tv" og "channel" hvis noe gammelt ligger igjen
        tv = g2.get("tv") or g2.get("channel") or ""
        tv = str(tv).strip()
        if not tv:
            g2["tv"] = default_tv
        else:
            g2["tv"] = tv
        # Rydd bort "channel" hvis finnes
        if "channel" in g2:
            del g2["channel"]
        out.append(g2)
    return out


def _write_json(path: str, payload: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def run_pipeline(config_path: str) -> None:
    tz_name, leagues = _load_config(config_path)
    tz_oslo = tz.gettz(tz_name)
    if tz_oslo is None:
        _die(f"Ugyldig timezone i config: {tz_name}")

    now_iso = datetime.now(tz_oslo).isoformat(timespec="seconds")

    print(f"Pipeline timezone: {tz_name}")
    print(f"Updated timestamp: {now_iso}")
    print("-" * 60)

    for league in leagues:
        print(f"-> {league.name} ({league.key})")
        print(f"   ICS: {league.ics_url}")
        print(f"   OUT: {league.out_path}")
        print(f"   TV : {league.default_tv}")

        try:
            ics_bytes = _fetch_ics(league.ics_url)
        except requests.RequestException as e:
            _die(f"Kunne ikke hente ICS for {league.key}: {e}")

        games = _parse_ics_events(ics_bytes, league.name, tz_oslo)

        # Hvis ICS gir 0 games: behold eksisterende (så du ikke nuler ut filene)
        if not games:
            existing = _load_existing_json(league.out_path)
            if existing and isinstance(existing.get("games"), list) and existing["games"]:
                print(f"   WARN: 0 games fra ICS -> beholder eksisterende JSON ({len(existing['games'])} kamper).")
                games = existing["games"]
            else:
                print("   WARN: 0 games fra ICS og ingen eksisterende å beholde.")

        # TV per liga inn i JSON
        games = _merge_tv(games, league.default_tv)

        payload = {
            "updated": now_iso,
            "timezone": tz_name,
            "league": league.name,
            "games": games,
        }
        _write_json(league.out_path, payload)
        print(f"   WROTE {league.out_path} ({len(games)} games)")
        print()

    print("DONE")


if __name__ == "__main__":
    # Bruk: python tools/pipeline_update.py [path_to_config]
    cfg = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CONFIG_PATH
    run_pipeline(cfg)
