#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, List
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"

FIS_URL = "https://www.fis-ski.com/DB/general/calendar-results.html"

UA = {
    "User-Agent": "Mozilla/5.0 (Grenland-Live/1.0; +https://github.com/Ch1mmyS/Grenland-Live)"
}

# For å unngå gigantisk JSON: ta “store” events (WC/WCH/OL). Si ifra hvis du vil ha ALT.
BIG_RE = re.compile(r"(World Cup|\bWC\b|World Championships|\bWCH\b|Olympic|\bOWG\b)", re.IGNORECASE)

DATE_PATTERNS = [
    ("%d %b %Y", re.compile(r"\b(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\b")),
    ("%d %B %Y", re.compile(r"\b(\d{1,2}\s+[A-Za-z]+\s+\d{4})\b")),
    ("%Y-%m-%d", re.compile(r"\b(\d{4}-\d{2}-\d{2})\b")),
]

TIMEZONE_SUFFIX = "+01:00"


def http_get(url: str, timeout: int = 40) -> str:
    r = requests.get(url, headers=UA, timeout=timeout)
    r.raise_for_status()
    return r.text


def parse_any_date(s: str) -> datetime:
    s = " ".join(s.split())
    for fmt, rx in DATE_PATTERNS:
        m = rx.search(s)
        if not m:
            continue
        try:
            return datetime.strptime(m.group(1), fmt)
        except ValueError:
            continue
    raise ValueError("no date")


def to_iso_noon(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT12:00:00") + TIMEZONE_SUFFIX


def write_json(path: Path, name: str, events: List[Dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    out = {
        "meta": {
            "name": name,
            "generated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "count": len(events),
            "year_filter": 2026,
            "source": FIS_URL
        },
        "events": events
    }
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    html = http_get(FIS_URL)
    soup = BeautifulSoup(html, "html.parser")

    rows = []
    for tr in soup.select("tr"):
        cols = [c.get_text(" ", strip=True) for c in tr.select("td")]
        if len(cols) < 4:
            continue
        rows.append(cols)

    men: List[Dict] = []
    women: List[Dict] = []

    fixed_channel = "Viaplay Vinter / TV3 / V Sport / NRK (varierer) – sjekk dagsoversikt"

    seen = set()

    for cols in rows:
        line = " | ".join(cols)

        # Kun store events (kan fjernes hvis du vil ha ALT)
        if not BIG_RE.search(line):
            continue

        try:
            dt = parse_any_date(line)
        except Exception:
            continue

        if dt.year != 2026:
            continue

        # Heuristikk for kjønn
        gender_tag = None
        if re.search(r"\bWomen\b|\bLadies\b|\bW\b", line, re.IGNORECASE):
            gender_tag = "W"
        if re.search(r"\bMen\b|\bM\b", line, re.IGNORECASE):
            gender_tag = "WM" if gender_tag == "W" else "M"

        discipline = cols[0] if cols else "FIS"
        title = cols[1] if len(cols) > 1 else "Vintersport"
        place = cols[2] if len(cols) > 2 else ""
        full_title = f"{discipline}: {title}".strip()

        start_iso = to_iso_noon(dt)
        key = (start_iso, full_title, place)
        if key in seen:
            continue
        seen.add(key)

        ev = {
            "start": start_iso,
            "title": full_title,
            "league": "Vintersport 2026 (FIS)",
            "channel": fixed_channel,
            "venue": place,
            "source": FIS_URL,
            "kind": "wintersport"
        }

        if gender_tag == "W":
            women.append(ev)
        elif gender_tag == "M":
            men.append(ev)
        else:
            men.append(ev)
            women.append(ev)

    men.sort(key=lambda x: x["start"])
    women.sort(key=lambda x: x["start"])

    write_json(DATA_DIR / "vintersport_menn.json", "Vintersport 2026 – Menn", men)
    write_json(DATA_DIR / "vintersport_kvinner.json", "Vintersport 2026 – Kvinner", women)

    print(f"WROTE data/vintersport_menn.json -> {len(men)}")
    print(f"WROTE data/vintersport_kvinner.json -> {len(women)}")


if __name__ == "__main__":
    main()
