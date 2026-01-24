# tools/providers/football.py
import requests
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

OSLO = ZoneInfo("Europe/Oslo")

# FixtureDownload har season-spesifikke feed-URLs. Bytt kun URLene her ved behov.
FEEDS = [
    {
        "league": "Champions League",
        "url": "https://fixturedownload.com/feed/json/champions-league-2025",
    },
    {
        "league": "La Liga",
        "url": "https://fixturedownload.com/feed/json/la-liga-2025",
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


def fetch_fixturedownload() -> list[dict]:
    """
    Henter kamper fra FixtureDownload og returnerer en felles liste med events.
    kickoff blir konvertert til Europe/Oslo ISO-format.
    """
    events: list[dict] = []

    for item in FEEDS:
        league = item["league"]
        feed_url = item["url"]

        print(f"FixtureDownload: {league} -> {feed_url}")
        r = requests.get(feed_url, timeout=30)
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

            dt_oslo = dt_utc.astimezone(OSLO)

            events.append(
                {
                    "league": league,
                    "home": str(home).strip(),
                    "away": str(away).strip(),
                    "kickoff": dt_oslo.isoformat(),  # Oslo-tid
                    "location": (row.get("Location") or "").strip(),
                    "round": row.get("RoundNumber"),
                    "homeScore": row.get("HomeTeamScore"),
                    "awayScore": row.get("AwayTeamScore"),
                    "source": "fixturedownload",
                }
            )

    events.sort(key=lambda g: g.get("kickoff") or "")
    return events
