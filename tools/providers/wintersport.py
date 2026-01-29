# tools/providers/wintersport.py
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
import xml.etree.ElementTree as ET

import requests

OSLO = ZoneInfo("Europe/Oslo")


def _stable_id(*parts: str) -> str:
    raw = "||".join(p.strip() for p in parts if p is not None)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def _read_sources() -> dict:
    path = Path("data") / "_meta" / "sources.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _get_text(el: ET.Element | None, tag: str, default: str = "") -> str:
    if el is None:
        return default
    child = el.find(tag)
    if child is None or child.text is None:
        return default
    return child.text.strip()


def _parse_utc_iso(s: str) -> datetime | None:
    # API gir typisk "2024-11-30T12:15:00Z"
    if not s:
        return None
    s = s.strip()
    try:
        if s.endswith("Z"):
            return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)
        return datetime.fromisoformat(s)
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


def _xml_root(content: bytes) -> ET.Element:
    return ET.fromstring(content)


def _gender_from_comp(comp: dict) -> str:
    """
    Returner 'men', 'women', 'mixed' eller 'unknown'.
    Heuristikk: catId / ShortDescription.
    """
    cat = (comp.get("catId") or "").upper()
    desc = (comp.get("desc") or "").lower()

    # catId i IBU kan ofte være "SM"/"SW"/"JM"/"JW" osv.
    if re.search(r"\b(women|female)\b", desc):
        return "women"
    if re.search(r"\b(men|male)\b", desc):
        return "men"

    if "mixed" in desc:
        return "mixed"

    if cat.startswith(("SW", "JW", "YW", "GW")):
        return "women"
    if cat.startswith(("SM", "JM", "YM", "BM")):
        return "men"

    return "unknown"


def _fetch_events(base_url: str, season_id: int, level: int) -> list[dict]:
    """
    Events endpoint:
      /Events?SeasonId=xxxx&Level=3
    Returnerer liste med {EventId, ShortDescription, StartDate, EndDate}
    """
    url = f"{base_url.rstrip('/')}/Events"
    params = {"SeasonId": str(season_id), "Level": str(level)}
    r = requests.get(url, params=params, timeout=60)
    r.raise_for_status()

    root = _xml_root(r.content)
    out: list[dict] = []

    # Strukturen varierer litt, men Event-noder har typisk tags: EventId, ShortDescription, StartDate, EndDate
    for ev in root.findall(".//Event"):
        event_id = _get_text(ev, "EventId")
        short = _get_text(ev, "ShortDescription")
        start = _get_text(ev, "StartDate")
        end = _get_text(ev, "EndDate")
        if event_id:
            out.append({"EventId": event_id, "ShortDescription": short, "StartDate": start, "EndDate": end})

    # Noen ganger ligger det ikke som <Event>, men direkte som <EventId> osv. Forsøk fallback:
    if not out:
        # prøv å finne alle EventId-forekomster og bygg minimale event-objekter
        for eid in root.findall(".//EventId"):
            if eid.text and eid.text.strip():
                out.append({"EventId": eid.text.strip(), "ShortDescription": ""})

    return out


def _fetch_competitions(base_url: str, event_id: str) -> list[dict]:
    """
    Competitions endpoint:
      /Competitions?EventId=XXXX
    Returnerer liste med {RaceId, ShortDescription, StartTime, catId}
    """
    url = f"{base_url.rstrip('/')}/Competitions"
    params = {"EventId": event_id}
    r = requests.get(url, params=params, timeout=60)
    r.raise_for_status()

    root = _xml_root(r.content)
    comps: list[dict] = []

    # Typisk <Competition> ... <RaceId> ... <ShortDescription> ... <StartTime> ... <catId> ...
    for c in root.findall(".//Competition"):
        race_id = _get_text(c, "RaceId")
        desc = _get_text(c, "ShortDescription")
        start = _get_text(c, "StartTime")
        cat = _get_text(c, "catId")
        if race_id and start:
            comps.append({"RaceId": race_id, "desc": desc, "StartTime": start, "catId": cat})

    # fallback hvis xml ikke har <Competition>
    if not comps:
        for rid in root.findall(".//RaceId"):
            if rid.text and rid.text.strip():
                comps.append({"RaceId": rid.text.strip(), "desc": "", "StartTime": "", "catId": ""})

    return comps


def fetch_wintersport_items(year: int = 2026) -> tuple[list[dict], list[dict]]:
    """
    Leser sources.json og henter biathlon/IBU schedule.
    Returnerer (men_items, women_items) i standard items-format.
    """
    src = _read_sources()
    ws = (src.get("sports") or {}).get("wintersport") or {}
    men_feeds = ws.get("men") or []
    women_feeds = ws.get("women") or []

    men_items: list[dict] = []
    women_items: list[dict] = []
    seen: set[str] = set()

    def handle_biathlon_feed(feed: dict, gender_target: str):
        nonlocal men_items, women_items, seen

        api = feed.get("api") or {}
        base_url = (api.get("base_url") or "https://api.biathlonresults.com/modules/sportapi/api").strip()
        season_id = int(api.get("season_id") or 2526)
        level = int(api.get("level") or 3)

        category = "Biathlon"
        tv = (feed.get("channel") or "").strip()

        print(f"[wintersport] {gender_target}: Events season={season_id} level={level}")
        events = _fetch_events(base_url, season_id=season_id, level=level)

        for ev in events:
            event_id = ev.get("EventId")
            if not event_id:
                continue

            comps = _fetch_competitions(base_url, event_id=event_id)
            for c in comps:
                start_raw = c.get("StartTime") or ""
                dt_utc = _parse_utc_iso(start_raw)
                if not dt_utc:
                    continue
                if not _in_year(dt_utc, year):
                    continue

                desc = (c.get("desc") or "").strip()
                race_id = (c.get("RaceId") or "").strip()
                g = _gender_from_comp(c)

                # Hvis mixed: legg i begge
                # Hvis unknown: legg i begge (for å ikke miste schedule)
                allow_men = g in ("men", "mixed", "unknown")
                allow_women = g in ("women", "mixed", "unknown")

                start = _iso_oslo(dt_utc)
                title = desc or f"Biathlon ({race_id})"

                # Stabil id
                eid = _stable_id("wintersport", "biathlon", start, race_id, title)
                if eid in seen:
                    continue
                seen.add(eid)

                item = {
                    "id": eid,
                    "sport": "wintersport",
                    "category": category,
                    "start": start,
                    "title": title,
                    "tv": tv,
                    "where": [],
                    "source": "biathlon_api",
                    "meta": {
                        "eventId": event_id,
                        "raceId": race_id,
                    },
                }

                if allow_men:
                    men_items.append(item)
                if allow_women:
                    women_items.append(item)

    # Kjør alle feeds (du har biathlon i begge; det går fint pga dedupe)
    for f in men_feeds:
        if isinstance(f, dict) and f.get("type") == "biathlon_api":
            handle_biathlon_feed(f, "men")

    for f in women_feeds:
        if isinstance(f, dict) and f.get("type") == "biathlon_api":
            handle_biathlon_feed(f, "women")

    men_items.sort(key=lambda x: x.get("start") or "")
    women_items.sort(key=lambda x: x.get("start") or "")
    print(f"[wintersport] men={len(men_items)} women={len(women_items)}")
    return men_items, women_items
