# tools/providers/wintersport.py
from __future__ import annotations

import json
import hashlib
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

from providers.fis_ical import fetch_fis_ical_events

OSLO = ZoneInfo("Europe/Oslo")


def _stable_id(*parts: str) -> str:
    raw = "||".join((p or "").strip() for p in parts)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def _read_sources() -> dict:
    path = Path("data") / "_meta" / "sources.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _biathlon_api(season_id: int, level: int) -> list[dict]:
    """
    BiathlonResults SportAPI (enkelt – du har allerede base_url/season_id/level i sources).
    Vi henter EVENTS (races) og mapper til items med start/title.
    """
    base = "https://biathlonresults.com/modules/sportapi/api"
    # Denne endpointruta fungerer typisk:
    # /Events?SeasonId=2526&Level=3
    url = f"{base}/Events"
    r = requests.get(url, params={"SeasonId": season_id, "Level": level}, timeout=60)
    r.raise_for_status()
    data = r.json()

    out: list[dict] = []
    for ev in data or []:
        # Typisk felter: StartTime, Description, ShortDescription, etc.
        start = ev.get("StartTime") or ev.get("startTime") or ev.get("StartDate") or ""
        title = ev.get("Description") or ev.get("ShortDescription") or ev.get("Name") or "Biathlon"
        gender = (ev.get("Gender") or ev.get("gender") or "").lower()  # "m"/"w"/"mixed" etc
        venue = ev.get("Venue") or ev.get("Location") or ""
        if not start:
            continue

        out.append(
            {
                "sport": "wintersport",
                "start": start,
                "title": str(title),
                "venue": str(venue),
                "where": [],
                "source": "biathlon_api",
                "gender": "women" if gender in ("w", "women", "female") else ("men" if gender in ("m", "men", "male") else None),
            }
        )

    out.sort(key=lambda x: x.get("start") or "")
    return out


def fetch_wintersport_items(year: int = 2026) -> tuple[list[dict], list[dict]]:
    """
    Returnerer (men_items, women_items) med MASSE events:
      - Skiskyting: BiathlonResults SportAPI
      - Langrenn/hopp/alpint/kombinert: FIS iCalendar
    """
    src = _read_sources()
    ws = (src.get("sports") or {}).get("wintersport") or {}

    men_items: list[dict] = []
    women_items: list[dict] = []

    def add(item: dict):
        # Normaliser id + felt for frontend (din app.js leser start/title)
        start = str(item.get("start") or "")
        title = str(item.get("title") or "")
        if not start or not title:
            return

        gender = item.get("gender")  # "men"/"women"/None
        eid = _stable_id("wintersport", str(year), start, title)
        out = {
            "id": eid,
            "sport": "wintersport",
            "start": start,
            "title": title,
            "tv": item.get("tv") or "",
            "where": item.get("where") or [],
            "venue": item.get("venue") or "",
            "source": item.get("source") or "unknown",
        }
        if gender == "women":
            women_items.append(out)
        elif gender == "men":
            men_items.append(out)
        else:
            # hvis ukjent kjønn: legg i begge (bedre enn “0”)
            men_items.append(out)
            women_items.append(out)

    # --- FIS feeds (CC/JP/AL/NK) ---
    # sources.json -> wintersport.men/women[] kan inneholde type:"fis_ical"
    for feed in (ws.get("men") or []):
        if not isinstance(feed, dict) or not feed.get("enabled"):
            continue
        if feed.get("type") == "fis_ical":
            sector = (feed.get("sectorcode") or "").strip()
            cat = (feed.get("categorycode") or "WC").strip()
            tv = (feed.get("channel") or "").strip()
            items = fetch_fis_ical_events(seasoncode=year, sectorcode=sector, categorycode=cat)
            for it in items:
                it["tv"] = tv
                it["gender"] = "men"  # feed er “men”
                add(it)
        if feed.get("type") == "biathlon_api":
            api = feed.get("api") or {}
            tv = (feed.get("channel") or "").strip()
            season_id = int(api.get("season_id"))
            level = int(api.get("level", 3))
            items = _biathlon_api(season_id, level)
            for it in items:
                it["tv"] = tv
                # biathlon kan inneholde kjønn – men feed er “men”
                if it.get("gender") is None:
                    it["gender"] = "men"
                add(it)

    for feed in (ws.get("women") or []):
        if not isinstance(feed, dict) or not feed.get("enabled"):
            continue
        if feed.get("type") == "fis_ical":
            sector = (feed.get("sectorcode") or "").strip()
            cat = (feed.get("categorycode") or "WC").strip()
            tv = (feed.get("channel") or "").strip()
            items = fetch_fis_ical_events(seasoncode=year, sectorcode=sector, categorycode=cat)
            for it in items:
                it["tv"] = tv
                it["gender"] = "women"
                add(it)
        if feed.get("type") == "biathlon_api":
            api = feed.get("api") or {}
            tv = (feed.get("channel") or "").strip()
            season_id = int(api.get("season_id"))
            level = int(api.get("level", 3))
            items = _biathlon_api(season_id, level)
            for it in items:
                it["tv"] = tv
                if it.get("gender") is None:
                    it["gender"] = "women"
                add(it)

    men_items.sort(key=lambda x: x.get("start") or "")
    women_items.sort(key=lambda x: x.get("start") or "")
    return men_items, women_items
