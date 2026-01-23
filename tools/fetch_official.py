#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import re
from dataclasses import dataclass
from datetime import datetime
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
    default_channel: str


def http_get_text(url: str, timeout: int = 30) -> str:
    r = requests.get(url, timeout=timeout, headers={"User-Agent": "GrenlandLive/1.0"})
    r.raise_for_status()
    return r.text


def http_get_json(url: str, timeout: int = 30) -> Any:
    r = requests.get(url, timeout=timeout, headers={"User-Agent": "GrenlandLive/1.0"})
    r.raise_for_status()
    return r.json()


def load_sources(path: str = "data/ics_sources.json") -> List[Source]:
    with open(path, "r", encoding="utf-8") as f:
        raw = json.load(f)

    sources: List[Source] = []
    for item in raw:
        sources.append(
            Source(
                key=item["key"],
                name=item["name"],
                type=item["type"],
                url=item["url"],
                out_file=item["out_file"],
                default_channel=item.get("default_channel", "").strip(),
            )
        )
    return sources


def to_oslo_iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = TZ_OSLO.localize(dt)
    else:
        dt = dt.astimezone(TZ_OSLO)
    return dt.isoformat(timespec="seconds")


def parse_match_teams(text: str) -> Optional[Tuple[str, str]]:
    """
    Prøver å hente "Hjem - Borte" fra typiske titler.
    """
    t = (text or "").strip()

    # Fjern ekstra info i parentes o.l.
    t = re.sub(r"\s*\(.*?\)\s*", " ", t).strip()
    t = re.sub(r"\s+", " ", t)

    # Vanlig fotballformat: "Team A - Team B"
    if " - " in t:
        parts = t.split(" - ", 1)
        home = parts[0].strip()
        away = parts[1].strip()
        if home and away:
            return home, away

    return None


def fetch_nff_ics(source: Source) -> List[Dict[str, Any]]:
    ics_text = http_get_text(source.url)
    cal = Calendar.from_ical(ics_text)

    games: List[Dict[str, Any]] = []
    for component in cal.walk():
        if component.name != "VEVENT":
            continue

        summary = str(component.get("SUMMARY", "")).strip()
        dtstart = component.get("DTSTART")
        if not dtstart:
            continue

        # icalendar gir enten date eller datetime
        dtval = dtstart.dt
        if isinstance(dtval, datetime):
            kickoff_dt = dtval
        else:
            # Hvis eventen er "all-day" (date), sett 12:00 Oslo (fallback)
            kickoff_dt = TZ_OSLO.localize(datetime(dtval.year, dtval.month, dtval.day, 12, 0, 0))

        teams = parse_match_teams(summary)
        if not teams:
            # Hvis NFF endrer summary-format, hopp heller enn å skrive tull
            continue

        home, away = teams
        games.append(
            {
                "league": source.name,
                "home": home,
                "away": away,
                "kickoff": to_oslo_iso(kickoff_dt),
                "channel": source.default_channel,
            }
        )

    return games


def parse_fixturedownload_dateutc(date_utc_str: str) -> datetime:
    """
    FixtureDownload: "YYYY-MM-DD HH:MM:SSZ"
    """
    # dateutil takler dette fint
    dt = dtparser.parse(date_utc_str)
    if dt.tzinfo is None:
        dt = pytz.utc.localize(dt)
    else:
        dt = dt.astimezone(pytz.utc)
    return dt


def fetch_fixturedownload_json(source: Source) -> List[Dict[str, Any]]:
    data = http_get_json(source.url)

    games: List[Dict[str, Any]] = []
    if not isinstance(data, list):
        return games

    for m in data:
        try:
            home = str(m.get("HomeTeam", "")).strip()
            away = str(m.get("AwayTeam", "")).strip()
            date_utc = str(m.get("DateUtc", "")).strip()
            if not (home and away and date_utc):
                continue

            kickoff_utc = parse_fixturedownload_dateutc(date_utc)
            games.append(
                {
                    "league": source.name,
                    "home": home,
                    "away": away,
                    "kickoff": to_oslo_iso(kickoff_utc),
                    "channel": source.default_channel,
                }
            )
        except Exception:
            continue

    return games


def write_json(path: str, payload: Dict[str, Any]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def run() -> None:
    sources = load_sources("data/ics_sources.json")

    for s in sources:
        print(f"==> {s.name} ({s.type})")

        if s.type == "nff_ics":
            games = fetch_nff_ics(s)
        elif s.type == "fixturedownload_json":
            games = fetch_fixturedownload_json(s)
        else:
            raise ValueError(f"Ukjent source.type: {s.type} (key={s.key})")

        games = sorted(games, key=lambda x: x.get("kickoff", ""))

        if not games:
            print(f"WARN: 0 kamper funnet for {s.key} - skriver likevel (tom liste)")
        else:
            print(f"OK: {len(games)} kamper")

        write_json(
            s.out_file,
            {
                "generated_at": to_oslo_iso(datetime.now(TZ_OSLO)),
                "source": {"key": s.key, "name": s.name, "url": s.url, "type": s.type},
                "default_channel": s.default_channel,
                "games": games,
            },
        )
        print(f"WROTE {s.out_file}")

    print("DONE")


if __name__ == "__main__":
    run()
