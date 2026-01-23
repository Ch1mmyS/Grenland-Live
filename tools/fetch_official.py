#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import os
import re
from dataclasses import dataclass
from datetime import datetime, date, time as dtime
from typing import Any, Dict, List, Optional, Tuple

import pytz
import requests
from dateutil import parser as dtparser
from icalendar import Calendar

TZ_OSLO = pytz.timezone("Europe/Oslo")


@dataclass
class Source:
    key: str
    name: str
    type: str
    url: str
    out_file: str
    default_tv: str


def http_get_text(url: str, timeout: int = 40) -> str:
    r = requests.get(url, timeout=timeout, headers={"User-Agent": "GrenlandLive/fixtures-pipeline"})
    r.raise_for_status()
    return r.text


def http_get_json(url: str, timeout: int = 40) -> Any:
    r = requests.get(url, timeout=timeout, headers={"User-Agent": "GrenlandLive/fixtures-pipeline"})
    r.raise_for_status()
    return r.json()


def load_sources(path: str = "data/ics_sources.json") -> List[Source]:
    if not os.path.exists(path):
        raise FileNotFoundError(f"Mangler {path}")

    with open(path, "r", encoding="utf-8") as f:
        raw = json.load(f)

    sources: List[Source] = []
    for item in raw:
        sources.append(
            Source(
                key=str(item["key"]).strip(),
                name=str(item["name"]).strip(),
                type=str(item["type"]).strip(),
                url=str(item["url"]).strip(),
                out_file=str(item["out_file"]).strip(),
                default_tv=str(item.get("default_tv", "")).strip(),
            )
        )
    return sources


def to_oslo_dt(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        # Antar at naive tider er UTC (sikrere enn å anta Oslo)
        dt = pytz.utc.localize(dt)
    return dt.astimezone(TZ_OSLO)


def to_oslo_iso(dt: datetime) -> str:
    return to_oslo_dt(dt).isoformat(timespec="seconds")


MATCH_HOME_AWAY = re.compile(r"^\s*(?P<home>.+?)\s*-\s*(?P<away>.+?)\s*$")


def parse_match_teams(text: str) -> Optional[Tuple[str, str]]:
    t = (text or "").strip()
    t = re.sub(r"\s*\(.*?\)\s*", " ", t).strip()
    t = re.sub(r"\s+", " ", t)

    m = MATCH_HOME_AWAY.match(t)
    if m:
        home = m.group("home").strip()
        away = m.group("away").strip()
        if home and away:
            return home, away
    return None


def normalize_game(
    league_name: str,
    home: str,
    away: str,
    kickoff_dt: datetime,
    default_tv: str,
    time_missing: bool = False,
) -> Dict[str, Any]:
    iso = to_oslo_iso(kickoff_dt)

    # Skriv BOTH navn – så frontend alltid finner det den leter etter
    game = {
        "league": league_name,
        "home": home,
        "away": away,
        "kickoff": iso,
        "start": iso,                 # alias
        "tv": default_tv,             # primær
        "channel": default_tv,        # alias
    }
    if time_missing:
        game["time_missing"] = True
    return game


def fetch_nff_ics(source: Source) -> List[Dict[str, Any]]:
    ics_text = http_get_text(source.url)
    cal = Calendar.from_ical(ics_text)

    games: List[Dict[str, Any]] = []
    for comp in cal.walk():
        if comp.name != "VEVENT":
            continue

        summary = str(comp.get("SUMMARY", "")).strip()
        dtstart = comp.get("DTSTART")
        if not dtstart:
            continue

        teams = parse_match_teams(summary)
        if not teams:
            continue

        home, away = teams

        dtval = dtstart.dt
        time_missing = False

        if isinstance(dtval, datetime):
            kickoff_dt = dtval
        elif isinstance(dtval, date):
            # All-day (kun dato) -> legg 12:00 og flagg
            kickoff_dt = TZ_OSLO.localize(datetime(dtval.year, dtval.month, dtval.day, 12, 0, 0))
            time_missing = True
        else:
            continue

        games.append(normalize_game(source.name, home, away, kickoff_dt, source.default_tv, time_missing=time_missing))

    return sorted(games, key=lambda g: g.get("kickoff", ""))


def parse_fixturedownload_dateutc(date_utc_str: str) -> Optional[datetime]:
    # FixtureDownload gir typisk "YYYY-MM-DD HH:MM:SSZ" eller ISO
    try:
        dt = dtparser.parse(date_utc_str)
        if dt.tzinfo is None:
            dt = pytz.utc.localize(dt)
        return dt
    except Exception:
        return None


def fetch_fixturedownload_json(source: Source) -> List[Dict[str, Any]]:
    data = http_get_json(source.url)

    games: List[Dict[str, Any]] = []
    if not isinstance(data, list):
        return games

    for m in data:
        home = str(m.get("HomeTeam", "")).strip()
        away = str(m.get("AwayTeam", "")).strip()
        date_utc = str(m.get("DateUtc", "")).strip()

        if not (home and away and date_utc):
            continue

        kickoff_utc = parse_fixturedownload_dateutc(date_utc)
        if kickoff_utc is None:
            continue

        games.append(normalize_game(source.name, home, away, kickoff_utc, source.default_tv, time_missing=False))

    return sorted(games, key=lambda g: g.get("kickoff", ""))


def write_json(path: str, payload: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def run() -> None:
    sources = load_sources("data/ics_sources.json")
    now_iso = datetime.now(TZ_OSLO).isoformat(timespec="seconds")

    for s in sources:
        print(f"==> {s.name} ({s.type})")
        if s.type == "nff_ics":
            games = fetch_nff_ics(s)
        elif s.type == "fixturedownload_json":
            games = fetch_fixturedownload_json(s)
        else:
            raise ValueError(f"Ukjent type: {s.type} (key={s.key})")

        # telle manglende tid
        missing_time = sum(1 for g in games if g.get("time_missing") is True)
        print(f"OK: {len(games)} kamper (time_missing: {missing_time})")

        payload = {
            "generated_at": now_iso,
            "timezone": "Europe/Oslo",
            "league": s.name,
            "default_tv": s.default_tv,
            "source": {"key": s.key, "name": s.name, "type": s.type, "url": s.url},
            "games": games,
        }
        write_json(s.out_file, payload)
        print(f"WROTE {s.out_file}\n")

    print("DONE")


if __name__ == "__main__":
    run()
