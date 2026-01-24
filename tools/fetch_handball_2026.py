#!/usr/bin/env python3
# -*- coding: utf-8 -*-

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

UA = {"User-Agent": "Mozilla/5.0 (Grenland-Live/1.0)"}
YEAR = 2026
TZ_SUFFIX = "+01:00"

EHF = {
    "menn": {
        "discover_url": "https://www.eurohandball.com/en/competitions/national-team-competitions/men/ehf-euro-cup-2026/",
        "out": DATA_DIR / "handball_vm_2026_menn.json",
        "league": "Håndball 2026 – Menn (EHF)",
        "channel": "Viaplay / TV3 / V sport (varierer)",
    },
    "damer": {
        "discover_url": "https://www.eurohandball.com/en/competitions/national-team-competitions/women/ehf-euro-cup-2026/",
        "out": DATA_DIR / "handball_vm_2026_damer.json",
        "league": "Håndball 2026 – Kvinner (EHF)",
        "channel": "Viaplay / TV3 / V sport (varierer)",
    },
}

MATCH_LINK_RE = re.compile(r"https?://history\.eurohandball\.com/.*/match/.*", re.IGNORECASE)
DT_RE = re.compile(r"(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})")


@dataclass
class Event:
    start: str
    title: str
    league: str
    channel: str
    source: str
    venue: str = ""

    def to_json(self) -> Dict:
        return {
            "start": self.start,
            "title": self.title,
            "league": self.league,
            "channel": self.channel,
            "venue": self.venue,
            "source": self.source,
            "kind": "handball",
        }


def get(url: str) -> str:
    r = requests.get(url, headers=UA, timeout=40)
    r.raise_for_status()
    return r.text


def dt_to_iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S") + TZ_SUFFIX


def discover_match_links(discover_url: str) -> List[str]:
    html = get(discover_url)
    soup = BeautifulSoup(html, "html.parser")
    links = set()

    for a in soup.select("a[href]"):
        href = (a.get("href") or "").strip()
        if not href:
            continue
        if href.startswith("//"):
            href = "https:" + href
        if "history.eurohandball.com" in href and "/match/" in href and MATCH_LINK_RE.match(href):
            links.add(href)

    return sorted(links)


def parse_history_match(url: str) -> Optional[Tuple[datetime, str, str]]:
    html = get(url)
    soup = BeautifulSoup(html, "html.parser")
    text = " ".join(soup.get_text(" ", strip=True).split())

    m = DT_RE.search(text)
    if not m:
        return None

    try:
        dt = datetime.strptime(f"{m.group(1)} {m.group(2)}", "%d.%m.%Y %H:%M")
    except ValueError:
        return None

    # Title heuristic around VS
    window = text[max(0, m.start() - 150): min(len(text), m.end() + 250)]
    up = window.upper()
    vs_pos = up.find("VS")
    title = "Kamp"
    if vs_pos != -1:
        left = DT_RE.sub("", window[:vs_pos]).strip()
        right = window[vs_pos + 2:].strip()
        home = " ".join(left.split()[-4:]).strip(" ,")
        away = " ".join(right.split()[:4]).strip(" ,")
        if home and away:
            title = f"{home} – {away}"

    # Venue heuristic
    venue = ""
    vpos = text.upper().find("VENUE")
    if vpos != -1:
        vwin = text[vpos:vpos + 240]
        vwin = vwin.replace("VENUE", "").strip()
        for cut in ["SPECTATORS", "REFEREES", "MATCHREPORT", "EHF-Delegate"]:
            cpos = vwin.upper().find(cut.upper())
            if cpos != -1:
                vwin = vwin[:cpos].strip()
        venue = vwin.strip(" ,")

    return dt, title, venue


def write(out_path: Path, league: str, channel: str, events: List[Event]) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "meta": {
            "name": league,
            "generated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "count": len(events),
            "year_filter": YEAR,
        },
        "events": [e.to_json() for e in sorted(events, key=lambda x: x.start)],
    }
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    for _, cfg in EHF.items():
        links = discover_match_links(cfg["discover_url"])

        events: List[Event] = []
        seen = set()

        for url in links:
            parsed = parse_history_match(url)
            if not parsed:
                continue
            dt, title, venue = parsed
            if dt.year != YEAR:
                continue
            start = dt_to_iso(dt)
            k = (start, title)
            if k in seen:
                continue
            seen.add(k)
            events.append(Event(start=start, title=title, league=cfg["league"], channel=cfg["channel"], source=url, venue=venue))

        write(cfg["out"], cfg["league"], cfg["channel"], events)
        print(f"WROTE {cfg['out']} -> {len(events)}")


if __name__ == "__main__":
    main()
