import json
import re
from datetime import datetime
from typing import List, Dict, Any, Optional

import pytz
import requests
from bs4 import BeautifulSoup

OSLO = pytz.timezone("Europe/Oslo")

URL = "https://www.eurohandball.com/en/competitions/national-team-competitions/women/ehf-euro-cup-2026/"


MONTHS = {
    "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
    "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12
}


def _now_iso() -> str:
    return datetime.now(OSLO).isoformat()


def _to_dt(day_mon_year: str, hhmm: str) -> Optional[datetime]:
    # "Wed Oct 15, 2025" + "18:15"
    m = re.match(r"^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})$", day_mon_year.strip())
    if not m:
        return None
    mon = MONTHS.get(m.group(2))
    if not mon:
        return None
    day = int(m.group(3))
    year = int(m.group(4))
    hh, mm = hhmm.split(":")
    return OSLO.localize(datetime(year, mon, day, int(hh), int(mm)))


def main() -> None:
    r = requests.get(URL, timeout=60, headers={"User-Agent": "Mozilla/5.0"})
    r.raise_for_status()

    soup = BeautifulSoup(r.text, "html.parser")
    text = soup.get_text("\n")
    lines = [re.sub(r"\s+", " ", x).strip() for x in text.splitlines()]
    lines = [x for x in lines if x]

    # Vi leter etter mønstre som:
    # "Wed Oct 15, 2025 18:15, Larvik (NOR) view game details"
    # og nær samme blokk finner vi teamA / teamB i nærheten.
    match_re = re.compile(
        r"^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+[A-Za-z]{3}\s+\d{1,2},\s*\d{4}\s+(\d{1,2}:\d{2}),\s*(.+?)\s+\(([A-Z]{3})\)\s+view game details",
        re.IGNORECASE
    )

    games: List[Dict[str, Any]] = []

    def find_teams_around(idx: int) -> Optional[List[str]]:
        # vi går litt opp og litt ned for å finne to "rene" teamnavn
        cand = []
        for j in range(max(0, idx - 10), min(len(lines), idx + 10)):
            s = lines[j]
            if s.lower().startswith(("wed ", "thu ", "fri ", "sat ", "sun ", "mon ", "tue ")):
                continue
            if "view game details" in s.lower():
                continue
            if "matches" == s.lower():
                continue
            if any(ch.isdigit() for ch in s):
                continue
            if len(s) < 3:
                continue
            # typiske landnavn: "Norway", "Denmark", "Czechia", etc
            if s[0].isalpha() and s[0].isupper():
                cand.append(s)
            if len(cand) >= 2:
                return cand[:2]
        return None

    for i, ln in enumerate(lines):
        m = match_re.match(ln)
        if not m:
            continue

        # bygg datetime
        # vi trenger hele dato-delen igjen:
        day_part = re.match(r"^((Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+[A-Za-z]{3}\s+\d{1,2},\s*\d{4})", ln)
        if not day_part:
            continue
        day_str = day_part.group(1)
        hhmm = m.group(2)

        dt = _to_dt(day_str, hhmm)
        if not dt:
            continue

        teams = find_teams_around(i)
        if not teams:
            continue

        home, away = teams[0], teams[1]
        games.append({
            "league": "Håndball (Damer) – EHF EURO Cup 2026",
            "home": home,
            "away": away,
            "start": dt.isoformat(),
            "channel": "TV 2 / TV 2 Play",
            "kind": "handball",
            "gender": "women"
        })

    # dedupe
    seen = set()
    out = []
    for g in sorted(games, key=lambda x: x["start"]):
        k = (g["start"], g["home"], g["away"])
        if k in seen:
            continue
        seen.add(k)
        out.append(g)

    with open("data/handball_vm_2026_damer.json", "w", encoding="utf-8") as f:
        json.dump({"games": out, "updatedAt": _now_iso()}, f, ensure_ascii=False, indent=2)

    print(f"WROTE data/handball_vm_2026_damer.json -> {len(out)} games")


if __name__ == "__main__":
    main()
