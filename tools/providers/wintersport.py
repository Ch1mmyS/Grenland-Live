# tools/providers/wintersport.py
from __future__ import annotations

import hashlib
import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

OSLO = ZoneInfo("Europe/Oslo")


def _stable_id(*parts: str) -> str:
    raw = "||".join((p or "").strip() for p in parts)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def _read_sources() -> dict:
    path = Path("data") / "_meta" / "sources.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _unfold_ics_lines(text: str) -> list[str]:
    # iCal: linjer kan "foldes" (fortsetter på neste linje som starter med space/tab)
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    out: list[str] = []
    for ln in lines:
        if not ln:
            out.append("")
            continue
        if ln.startswith((" ", "\t")) and out:
            out[-1] += ln[1:]
        else:
            out.append(ln)
    return out


def _parse_dt(value: str) -> datetime | None:
    """
    Støtter typiske former:
      - DTSTART:20260201T120000Z
      - DTSTART:20260201T120000
      - DTSTART;VALUE=DATE:20260201
      - DTSTART;TZID=Europe/Oslo:20260201T120000
    """
    v = (value or "").strip()
    if not v:
        return None

    # Fjern evt. parametre før kolon (håndteres utenfor)
    # Her forventer vi kun selve verdien.
    try:
        if len(v) == 8 and v.isdigit():
            # YYYYMMDD
            dt = datetime.strptime(v, "%Y%m%d").replace(tzinfo=OSLO)
            return dt
        if v.endswith("Z"):
            dt = datetime.strptime(v, "%Y%m%dT%H%M%SZ").replace(tzinfo=ZoneInfo("UTC"))
            return dt.astimezone(OSLO)
        # YYYYMMDDTHHMMSS eller YYYYMMDDTHHMM
        if len(v) == 15:
            dt = datetime.strptime(v, "%Y%m%dT%H%M%S").replace(tzinfo=OSLO)
            return dt
        if len(v) == 13:
            dt = datetime.strptime(v, "%Y%m%dT%H%M").replace(tzinfo=OSLO)
            return dt
    except Exception:
        return None

    return None


def _parse_ics_events(ics_text: str, year: int) -> list[dict]:
    lines = _unfold_ics_lines(ics_text)

    events: list[dict] = []
    cur: dict[str, str] = {}
    in_event = False

    for ln in lines:
        if ln == "BEGIN:VEVENT":
            in_event = True
            cur = {}
            continue
        if ln == "END:VEVENT":
            in_event = False

            dt_val = cur.get("DTSTART", "")
            dt = _parse_dt(dt_val)
            if not dt or dt.year != year:
                cur = {}
                continue

            title = cur.get("SUMMARY", "").strip() or cur.get("DESCRIPTION", "").strip() or "Wintersport"
            location = cur.get("LOCATION", "").strip()

            start = dt.isoformat(timespec="seconds")
            eid = _stable_id("wintersport", start, title, location)

            events.append(
                {
                    "id": eid,
                    "sport": "wintersport",
                    "start": start,
                    "title": title,
                    "location": location,
                    "where": [],
                    "source": "ics",
                }
            )

            cur = {}
            continue

        if not in_event:
            continue

        if ":" not in ln:
            continue

        left, val = ln.split(":", 1)
        val = val.strip()

        # Normaliser key (fjern parametre)
        key = left.split(";")[0].strip().upper()

        # DTSTART kan komme som DTSTART;TZID=...:....
        if key == "DTSTART":
            cur["DTSTART"] = val
        elif key in ("SUMMARY", "LOCATION", "DESCRIPTION"):
            # Behold første hvis flere
            cur.setdefault(key, val)

    events.sort(key=lambda x: x.get("start") or "")
    return events


def fetch_wintersport_items(year: int = 2026) -> tuple[list[dict], list[dict]]:
    src = _read_sources()
    ws = (src.get("sports") or {}).get("wintersport") or {}

    men_feeds = ws.get("men") or []
    women_feeds = ws.get("women") or []

    men_items: list[dict] = []
    women_items: list[dict] = []

    def handle(feed: dict, gender: str) -> list[dict]:
        if not isinstance(feed, dict) or not feed.get("enabled", True):
            return []

        feed_type = (feed.get("type") or "").strip()
        name = (feed.get("name") or "Wintersport").strip()
        discipline = (feed.get("discipline") or "").strip()

        if feed_type != "ics":
            # Du kan utvide med json/html senere
            print(f"[wintersport] {gender}: unsupported type={feed_type} -> skipping ({name})")
            return []

        ics_url = (feed.get("ics_url") or "").strip()
        if not ics_url:
            print(f"[wintersport] {gender}: missing ics_url -> skipping ({name})")
            return []

        print(f"[wintersport] {gender}: downloading ics -> {ics_url}")
        r = requests.get(ics_url, timeout=60)
        r.raise_for_status()

        events = _parse_ics_events(r.text, year=year)

        # Pynt opp objektene med litt metadata
        out: list[dict] = []
        for ev in events:
            ev["category"] = name
            if discipline:
                ev["discipline"] = discipline
            ev["gender"] = gender
            out.append(ev)

        return out

    for f in men_feeds:
        men_items += handle(f, "men")

    for f in women_feeds:
        women_items += handle(f, "women")

    # Dedupe på id (hvis flere feeds overlapper)
    def dedupe(items: list[dict]) -> list[dict]:
        seen = set()
        out = []
        for it in items:
            i = it.get("id")
            if not i or i in seen:
                continue
            seen.add(i)
            out.append(it)
        out.sort(key=lambda x: x.get("start") or "")
        return out

    men_items = dedupe(men_items)
    women_items = dedupe(women_items)

    print(f"[wintersport] men={len(men_items)} women={len(women_items)}")
    return men_items, women_items
