import json
from datetime import datetime, timezone
from pathlib import Path

import requests

DATA = Path("data")

# NOTE:
# FixtureDownload har season-spesifikke feed-URLs. Hvis disse endrer seg,
# bytt kun URL-ene her – resten fungerer.
FEEDS = [
    {
        "league": "Champions League",
        "url": "https://fixturedownload.com/feed/json/champions-league-2025",
        "out": "champions.json",
    },
    {
        "league": "La Liga",
        "url": "https://fixturedownload.com/feed/json/la-liga-2025",
        "out": "laliga.json",
    },
]

def to_iso_utc(date_utc_str: str) -> str | None:
    """
    Input:  '2025-09-16 16:45:00Z'
    Output: '2025-09-16T16:45:00+00:00'
    """
    if not date_utc_str:
        return None
    s = str(date_utc_str).strip()
    try:
        dt = datetime.strptime(s, "%Y-%m-%d %H:%M:%SZ").replace(tzinfo=timezone.utc)
        return dt.isoformat()
    except Exception:
        return None

def write_games(filename: str, games: list[dict]):
    DATA.mkdir(parents=True, exist_ok=True)
    out_path = DATA / filename
    with out_path.open("w", encoding="utf-8") as f:
        json.dump({"games": games}, f, ensure_ascii=False, indent=2)

def main():
    for item in FEEDS:
        league = item["league"]
        feed_url = item["url"]
        out_file = item["out"]

        print(f"Fetching {league} -> {feed_url}")
        r = requests.get(feed_url, timeout=30)
        r.raise_for_status()

        rows = r.json()
        games: list[dict] = []

        for row in rows:
            if not isinstance(row, dict):
                continue

            kickoff = to_iso_utc(row.get("DateUtc"))
            home = row.get("HomeTeam")
            away = row.get("AwayTeam")

            if not kickoff or not home or not away:
                continue

            games.append({
                "league": league,
                "home": home,
                "away": away,
                "kickoff": kickoff,
                "location": row.get("Location") or "",
                "round": row.get("RoundNumber"),
                "homeScore": row.get("HomeTeamScore"),
                "awayScore": row.get("AwayTeamScore"),
            })

        games.sort(key=lambda g: g.get("kickoff") or "")
        write_games(out_file, games)
        print(f"WROTE {out_file}: {len(games)} games")

if __name__ == "__main__":
    main()
