#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Fetch handball fixtures for 2026 and write:
- data/handball_vm_2026_menn.json
- data/handball_vm_2026_damer.json

Source approach:
- Uses eurohandball.com competition pages to discover match links
- Parses match detail pages from history.eurohandball.com (stable HTML)
- Filters strictly to year == 2026
- Adds fixed Norway TV channel text (can be adjusted)
"""

import json
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"

# Discover match links here (HTML contains links to history.eurohandball.com match pages)
EHF_SOURCES = {
    "menn": {
        "discover_url": "https://www.eurohandball.com/en/competitions/national-team-competitions/men/ehf-euro-cup-2026/",
        "out_file": DATA_DIR / "handball_vm_2026_menn.json",
        "league_name": "Håndball EM 2026 – Menn (EHF EURO)",
        # Norway: Viaplay has full coverage; some matches on TV3 / V sport. Source: Viaplay guide/news.
        "fixed_channel": "Viaplay (alle kamper) / TV3 (Norge-kamper) / V sport (utvalgte)",
    },
    "damer": {
        "discover_url": "https://www.eurohandball.com/en/competitions/national-team-competitions/women/ehf-euro-cup-2026/",
        "out_file": DATA_DIR / "handball_vm_2026_damer.json",
        "league_name": "Håndball EM 2026 – Kvinner (EHF EURO)",
        "fixed_channel": "Viaplay (alle kamper) / TV3 (utvalgte) / V sport (utvalgte)",
    },
}

TIMEZONE_SUFFIX = "+01:00"  # Oslo vintertid. (Sommerkamper kan være +02, men EHF-tider i CET på disse sidene.)

UA = {
    "User-Agent": "Mozilla/5.0 (Grenland-Live/1.0; +https://github.com/Ch1mmyS/Grenland-Live)"
}

MATCH_LINK_RE = re.compile(r"^https?://history\.eurohandball\.com/.*?/match/.*", re.IGNORECASE)
DT_RE = re.compile(r"(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})")
VS_RE = re.compile(r"\bVS\b", re.IGNORECASE)


@dataclass
class Event:
    start: str
    title: str
    league: str
    channel: str
    venue: str
    source_url: str

    def to_json(self) -> Dict:
        return {
            "start": self.start,
            "title": self.title,
            "league": self.league,
            "channel": self.channel,
            "venue": self.venue,
            "source": self.source_url,
        }


def http_get(url: str, timeout: int = 30) -> str:
    r = requests.get(url, headers=UA, timeout=timeout)
    r.raise_for_status()
    return r.text


def discover_history_match_links(discover_url: str) -> List[str]:
    html = http_get(discover_url)
    soup = BeautifulSoup(html, "html.parser")

    links = set()
    for a in soup.select("a[href]"):
        href = a.get("href", "").strip()
        if not href:
            continue

        # Some pages contain relative links, some absolute; normalize.
        if href.startswith("//"):
            href = "https:" + href
        elif href.startswith("/"):
            href = "https://www.eurohandball.com" + href

        # We want history.eurohandball.com match pages
        if "history.eurohandball.com" in href and "/match/" in href:
            if MATCH_LINK_RE.search(href):
                links.add(href)

    return sorted(links)


def parse_match_page_for_event(match_url: str) -> Optional[Tuple[datetime, str, str]]:
    """
    Returns (dt, title, venue) if parse succeeds, else None.

    history match pages often include lines like:
    15.10.2025 20:00 Denmark VS Czechia ...
    and a VENUE block like:
    VENUE
      Nykobing F.(DEN), Spar Nord BOXEN
    """
    html = http_get(match_url)
    text = " ".join(BeautifulSoup(html, "html.parser").get_text(" ", strip=True).split())

    # Find the first dd.mm.yyyy hh:mm on the page (this match page focuses on one match)
    m = DT_RE.search(text)
    if not m:
        return None

    date_s, time_s = m.group(1), m.group(2)
    try:
        dt = datetime.strptime(f"{date_s} {time_s}", "%d.%m.%Y %H:%M")
    except ValueError:
        return None

    # Try to extract "Home VS Away" around the first occurrence near the datetime
    # We'll take a window around the datetime match.
    start_i = max(0, m.start() - 120)
    end_i = min(len(text), m.end() + 220)
    window = text[start_i:end_i]

    # Extract tokens around "VS"
    # Example window contains "... 05.03.2026 18:00 Hungary VS Denmark ..."
    vs_pos = window.upper().find("VS")
    title = "Kamp"
    if vs_pos != -1:
        left = window[:vs_pos].strip()
        right = window[vs_pos + 2 :].strip()

        # left ends with "... 05.03.2026 18:00 Hungary"
        # right begins with "Denmark ..."
        # We'll remove the datetime from left and keep the last word chunk as home team.
        left_clean = DT_RE.sub("", left).strip()
        # Keep last 4 words as a safe team name slice
        home = " ".join(left_clean.split()[-4:]).strip(" ,")
        away = " ".join(right.split()[:4]).strip(" ,")

        if home and away:
            title = f"{home} – {away}"

    # Venue: look for "VENUE" and grab next chunk
    venue = ""
    vpos = text.upper().find("VENUE")
    if vpos != -1:
        vwin = text[vpos : vpos + 220]
        # Often: "VENUE Nykobing F.(DEN), Spar Nord BOXEN SPECTATORS ..."
        vwin = re.sub(r"\s+", " ", vwin).strip()
        vwin = vwin.replace("VENUE", "").strip()

        # Cut at SPECTATORS / REFEREES / MATCHREPORT etc
        for cut in ["SPECTATORS", "REFEREES", "MATCHREPORT", "EHF-Delegate", "live"]:
            cpos = vwin.upper().find(cut.upper())
            if cpos != -1:
                vwin = vwin[:cpos].strip()
        venue = vwin.strip(" ,")

    return dt, title, venue


def dt_to_iso_oslo(dt: datetime) -> str:
    # We keep +01:00 as requested. If du senere vil støtte +02 (sommer), sier du ifra.
    return dt.strftime("%Y-%m-%dT%H:%M:%S") + TIMEZONE_SUFFIX


def write_events(path: Path, league_name: str, channel: str, events: List[Event]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    out = {
        "meta": {
            "name": league_name,
            "generated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "count": len(events),
            "year_filter": 2026,
        },
        "events": [e.to_json() for e in sorted(events, key=lambda x: x.start)],
    }

    path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    for k, cfg in EHF_SOURCES.items():
        print(f"[handball] Discovering match links for {k} …")
        links = discover_history_match_links(cfg["discover_url"])
        print(f"[handball] Found {len(links)} candidate match links")

        events: List[Event] = []
        seen = set()

        for url in links:
            parsed = parse_match_page_for_event(url)
            if not parsed:
                continue
            dt, title, venue = parsed

            if dt.year != 2026:
                continue

            start_iso = dt_to_iso_oslo(dt)
            key = (start_iso, title)
            if key in seen:
                continue
            seen.add(key)

            events.append(
                Event(
                    start=start_iso,
                    title=title,
                    league=cfg["league_name"],
                    channel=cfg["fixed_channel"],
                    venue=venue,
                    source_url=url,
                )
            )

        print(f"[handball] {k}: writing {len(events)} events -> {cfg['out_file'].as_posix()}")
        write_events(cfg["out_file"], cfg["league_name"], cfg["fixed_channel"], events)


if __name__ == "__main__":
    main()
