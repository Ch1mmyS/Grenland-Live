# tools/providers/football.py
from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import requests

OSLO = ZoneInfo("Europe/Oslo")


# FixtureDownload har season-spesifikke feed-URLs. Bytt kun URLene her ved behov.
# NB: Disse er 2025-season feeds, men inneholder ofte kamper som spilles i kalenderåret 2026.
FEEDS = [
    {
        "key": "premier_league",
        "category": "Premier League",
        "url": "https://fixturedownload.com/feed/json/epl-2025",
        "default_tv": "Viaplay / V Sport",
    },
    {
        "key": "champions_league",
        "category": "Champions League",
        "url": "https://fixturedownload.com/feed/json/champions-league-2025",
        "default_tv": "TV 2 Play Premium / TV 2 Sport 1",
    },
    {
        "key": "laliga",
        "category": "La Liga",
        "url": "https://fixturedownload.com/feed/json/la-liga-2025",
        "default_tv": "TV 2 / TV 2 Play",
    },
]


def _to_dt_utc(date_utc_str: str) -> datetime | None:
    """
    Input:  '2025-09-16 16:45:00Z'
    Output: datetime(tz=UTC)
    """
    if not date_utc_str:
        return None
    s = str(date_utc_str).strip()
    try:
        return datetime.strptime(s, "%Y-%m-%d %H:%M:%SZ").replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _iso_oslo(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(OSLO).isoformat(timespec="seconds")


def _in_year(dt: datetime, year: int) -> bool:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(OSLO).year == year


def _stable_id(*parts: str) -> str:
    raw = "||".join(p.strip() for p in parts if p is not None)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def fetch_fixture_download_items(year: int = 2026) -> list[dict]:
    """
    Henter fotballkamper fra FixtureDownload og returnerer i felles 'items'-format.

    Item-schema:
      {
        "id": "...",
        "sport": "football",
        "category": "Premier League",
        "start": "2026-01-17T13:30:00+01:00",
        "title": "Manchester United – Manchester City",
        "tv": "Viaplay / V Sport",
        "where": [],
        "source": "fixturedownload"
      }
    """
    items: list[dict] = []
    seen: set[str] = set()

    for feed in FEEDS:
        category = feed["category"]
        url = feed["url"]
        default_tv = feed.get("default_tv", "")

        print(f"FixtureDownload: {category} -> {url}")
        r = requests.get(url, timeout=30)
        r.raise_for_status()

        rows = r.json()
        if not isinstance(rows, list):
            continue

        for row in rows:
            if not isinstance(row, dict):
                continue

            dt_utc = _to_dt_utc(row.get("DateUtc"))
            home = row.get("HomeTeam")
            away = row.get("AwayTeam")

            if not dt_utc or not home or not away:
                continue

            if not _in_year(dt_utc, year):
                continue

            start = _iso_oslo(dt_utc)
            title = f"{str(home).strip()} – {str(away).strip()}"

            # Stabil id: category + start + home + away
            eid = _stable_id("football", category, start, str(home), str(away))
            if eid in seen:
                continue
            seen.add(eid)

            items.append(
                {
                    "id": eid,
                    "sport": "football",
                    "category": category,
                    "start": start,
                    "title": title,
                    "tv": default_tv,
                    "where": [],
                    "source": "fixturedownload",
                }
            )

    items.sort(key=lambda x: x.get("start") or "")
    return items
