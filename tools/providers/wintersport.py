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

HEADERS = {
    "User-Agent": "GrenlandLiveBot/1.0 (+https://github.com/Ch1mmyS/Grenland-Live)",
    "Accept": "application/xml,text/xml;q=0.9,*/*;q=0.8",
}


def _stable_id(*parts: str) -> str:
    raw = "||".join((p or "").strip() for p in parts)
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
    if not s:
        return None
    s = s.strip()
    try:
        if s.endswith("Z"):
            return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
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


def _safe_xml_root(content: bytes, label: str) -> ET.Element | None:
    # Sjekk først at det faktisk ser ut som XML
    if not content:
        print(f"[wintersport] WARN {label}: empty response body")
        return None

    # Trim whitespace og sjekk første tegn
    head = content.lstrip()[:60]
    if not head.startswith(b"<"):
        # Ikke XML – logg snippet
        try:
            snippet = content[:300].decode("utf-8", errors="replace")
        except Exception:
            snippet = str(content[:300])
        print(f"[wintersport] WARN {label}: response is not XML. Snippet:\n{snippet}")
        return None

    try:
        return ET.fromstring(content)
    except ET.ParseError as e:
        try:
            snippet = content[:300].decode("utf-8", errors="replace")
        except Exception:
            snippet = str(content[:300])
        print(f"[wintersport] WARN {label}: XML parse error: {e}. Snippet:\n{snippet}")
        return None


def _fetch_events(base_url: str, season_id: int, level: int) -> list[dict]:
    url = f"{base_url.rstrip('/')}/Events"
    params = {"SeasonId": str(season_id), "Level": str(level)}
    r = requests.get(url, params=params, headers=HEADERS, timeout=60)
    r.raise_for_status()

    root = _safe_xml_root(r.content, label="Events")
    if root is None:
        return []

    out: list[dict] = []
    for ev in root.findall(".//Event"):
        event_id = _get_text(ev, "EventId")
        short = _get_text(ev, "ShortDescription")
        start = _get_text(ev, "StartDate")
        end = _get_text(ev, "EndDate")
        if event_id:
            out.append({"EventId": event_id, "ShortDescription": short, "StartDate": start, "EndDate": end})
    return out


def _fetch_competitions(base_url: str, event_id: str) -> list[dict]:
    url = f"{base_url.rstrip('/')}/Competitions"
    params = {"EventId": event_id}
    r = requests.get(url, params=params, headers=HEADERS, timeout=60)
    r.raise_for_status()

    root = _safe_xml_root(r.content, label=f"Competitions(EventId={event_id})")
    if root is None:
        return []

    comps: list[dict] = []
    for c in root.findall(".//Competition"):
        race_id = _get_text(c, "RaceId")
        desc = _get_text(c, "ShortDescription")
        start = _get_text(c, "StartTime")
        cat = _get_text(c, "catId")
        if race_id and start:
            comps.append({"RaceId": race_id, "desc": desc, "StartTime": start, "catId": cat})
    return comps


def _gender_from_comp(comp: dict) -> str:
    cat = (comp.get("catId") or "").upper()
    desc = (comp.get("desc") or "").lower()

    if "women" in desc or "female" in desc:
        return "women"
    if "men" in desc or "male" in desc:
        return "men"
    if "mixed" in desc:
        return "mixed"

    if cat.startswith(("SW", "JW", "YW", "GW")):
        return "women"
    if cat.startswith(("SM", "JM", "YM", "BM")):
        return "men"

    return "unknown"


def fetch_wintersport_items(year: int = 2026) -> tuple[list[dict], list[dict]]:
    src = _read_sources()
    ws = (src.get("sports") or {}).get("wintersport") or {}
    men_feeds = ws.get("men") or []
    women_feeds = ws.get("women") or []

    men_items: list[dict] = []
    women_items: list[dict] = []
    seen: set[str] = set()

    def handle_biathlon_feed(feed: dict):
        nonlocal men_items, women_items, seen

        api = feed.get("api") or {}
        base_url = (api.get("base_url") or "https://api.biathlonresults.com/modules/sportapi/api").strip()
        season_id = int(api.get("season_id") or 2526)
        level = int(api.get("level") or 3)

        tv = (feed.get("channel") or "").strip()
        category = "Biathlon"

        print(f"[wintersport] Events season={season_id} level={level}")
        events = _fetch_events(base_url, season_id=season_id, level=level)
        if not events:
            print("[wintersport] WARN: No events returned (API blocked/changed or season mismatch).")
            return

        for ev in events:
            event_id = ev.get("EventId")
            if not event_id:
                continue

            comps = _fetch_competitions(base_url, event_id=event_id)
            for c in comps:
                dt_utc = _parse_utc_iso(c.get("StartTime") or "")
                if not dt_utc:
                    continue
                if not _in_year(dt_utc, year):
                    continue

                start = _iso_oslo(dt_utc)
                desc = (c.get("desc") or "").strip()
                race_id = (c.get("RaceId") or "").strip()
                g = _gender_from_comp(c)

                title = desc or f"Biathlon ({race_id})"
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
                    "meta": {"eventId": event_id, "raceId": race_id, "genderGuess": g},
                }

                # Mixed/unknown -> i begge, ellers i riktig
                if g in ("men", "mixed", "unknown"):
                    men_items.append(item)
                if g in ("women", "mixed", "unknown"):
                    women_items.append(item)

    # Kjør feedene (du har samme i begge; dedupe tar resten)
    for f in men_feeds:
        if isinstance(f, dict) and f.get("type") == "biathlon_api":
            handle_biathlon_feed(f)

    for f in women_feeds:
        if isinstance(f, dict) and f.get("type") == "biathlon_api":
            handle_biathlon_feed(f)

    men_items.sort(key=lambda x: x.get("start") or "")
    women_items.sort(key=lambda x: x.get("start") or "")
    print(f"[wintersport] men={len(men_items)} women={len(women_items)}")
    return men_items, women_items
