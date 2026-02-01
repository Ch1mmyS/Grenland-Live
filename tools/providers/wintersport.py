# tools/providers/wintersport.py
from __future__ import annotations

import hashlib
import json
import re
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


def _parse_ics(ics_text: str, year: int, category: str, tv: str, gender: str) -> list[dict]:
    """
    Minimal ICS parser:
    - DTSTART (YYYYMMDD or YYYYMMDDTHHMMSSZ)
    - SUMMARY
    """
    # Unfold lines (ICS can wrap with leading space)
    raw_lines = ics_text.splitlines()
    lines: list[str] = []
    for ln in raw_lines:
        if ln.startswith((" ", "\t")) and lines:
            lines[-1] += ln.strip()
        else:
            lines.append(ln.strip())

    items: list[dict] = []
    seen: set[str] = set()

    cur: dict[str, str] = {}

    def flush():
        nonlocal cur
        if not cur:
            return
        dt_raw = cur.get("DTSTART", "") or cur.get("DTSTART;VALUE=DATE", "")
        summary = cur.get("SUMMARY", "") or cur.get("SUMMARY;LANGUAGE=en", "") or ""

        dt = _ics_dt_to_iso(dt_raw)
        if not dt:
            cur = {}
            return

        try:
            d = datetime.fromisoformat(dt)
        except Exception:
            cur = {}
            return

        if d.year != year:
            cur = {}
            return

        title = summary.strip() or "Vintersport"
        eid = _stable_id("wintersport", gender, category, dt, title)
        if eid in seen:
            cur = {}
            return
        seen.add(eid)

        items.append(
            {
                "id": eid,
                "sport": "wintersport",
                "category": category,
                "gender": gender,
                "start": d.astimezone(OSLO).isoformat(timespec="seconds"),
                "title": title,
                "tv": tv,
                "where": [],
                "source": "ics",
            }
        )
        cur = {}

    for ln in lines:
        if ln == "BEGIN:VEVENT":
            cur = {}
        elif ln == "END:VEVENT":
            flush()
        else:
            if ":" in ln:
                k, v = ln.split(":", 1)
                # vi beholder parameter-keys også, men prioriterer plain key senere
                cur[k] = v

    items.sort(key=lambda x: x.get("start") or "")
    return items


def _ics_dt_to_iso(dt_raw: str) -> str | None:
    dt_raw = (dt_raw or "").strip()
    if not dt_raw:
        return None

    # DTSTART:20260128T090000Z
    m = re.match(r"^(\d{8})T(\d{6})Z$", dt_raw)
    if m:
        ymd, hms = m.group(1), m.group(2)
        iso = f"{ymd[0:4]}-{ymd[4:6]}-{ymd[6:8]}T{hms[0:2]}:{hms[2:4]}:{hms[4:6]}+00:00"
        return iso

    # DTSTART:20260128T090000  (uten Z)
    m = re.match(r"^(\d{8})T(\d{6})$", dt_raw)
    if m:
        ymd, hms = m.group(1), m.group(2)
        # antar Oslo hvis ikke Z
        iso = f"{ymd[0:4]}-{ymd[4:6]}-{ymd[6:8]}T{hms[0:2]}:{hms[2:4]}:{hms[4:6]}+01:00"
        return iso

    # DTSTART;VALUE=DATE:20260128 (heldag)
    m = re.match(r"^(\d{8})$", dt_raw)
    if m:
        ymd = m.group(1)
        iso = f"{ymd[0:4]}-{ymd[4:6]}-{ymd[6:8]}T12:00:00+01:00"
        return iso

    return None


def _fetch_ics(url: str) -> str:
    r = requests.get(url, timeout=90)
    r.raise_for_status()
    return r.text


def _fetch_json(url: str) -> object:
    r = requests.get(url, timeout=90)
    r.raise_for_status()
    return r.json()


def _normalize_json_items(payload: object, year: int, category: str, tv: str, gender: str) -> list[dict]:
    """
    Hvis du har JSON-feed: støtter list direkte eller {items:[...]}.
    Må minst ha (start/title) eller (date/name).
    """
    if isinstance(payload, dict) and isinstance(payload.get("items"), list):
        raw = payload["items"]
    elif isinstance(payload, list):
        raw = payload
    else:
        raw = []

    items: list[dict] = []
    for x in raw:
        if not isinstance(x, dict):
            continue

        start = x.get("start") or x.get("kickoff") or x.get("date") or x.get("datetime")
        title = x.get("title") or x.get("name") or x.get("event") or "Vintersport"

        try:
            dt = datetime.fromisoformat(start)
        except Exception:
            continue

        if dt.year != year:
            continue

        eid = _stable_id("wintersport", gender, category, start, str(title))
        items.append(
            {
                "id": eid,
                "sport": "wintersport",
                "category": category,
                "gender": gender,
                "start": dt.astimezone(OSLO).isoformat(timespec="seconds"),
                "title": str(title),
                "tv": tv,
                "where": [],
                "source": "json_url",
            }
        )

    items.sort(key=lambda x: x.get("start") or "")
    return items


def fetch_wintersport_items(year: int = 2026) -> tuple[list[dict], list[dict]]:
    src = _read_sources()
    ws = (src.get("sports") or {}).get("wintersport") or {}

    men_feeds = ws.get("men") or []
    women_feeds = ws.get("women") or []

    men_items: list[dict] = []
    women_items: list[dict] = []

    def handle(feed: dict, gender: str) -> list[dict]:
        ftype = (feed.get("type") or "").strip()
        name = (feed.get("name") or "Wintersport").strip()
        tv = (feed.get("channel") or "").strip()
        url = (feed.get("url") or "").strip()

        if not url:
            print(f"[wintersport] {gender}: missing url -> skipping ({name})")
            return []

        if ftype == "ics":
            print(f"[wintersport] {gender}: ics -> {name} :: {url}")
            ics_text = _fetch_ics(url)
            return _parse_ics(ics_text, year=year, category=name, tv=tv, gender=gender)

        if ftype == "json_url":
            print(f"[wintersport] {gender}: json -> {name} :: {url}")
            payload = _fetch_json(url)
            return _normalize_json_items(payload, year=year, category=name, tv=tv, gender=gender)

        print(f"[wintersport] {gender}: unknown type={ftype} -> skipping ({name})")
        return []

    for f in men_feeds:
        if isinstance(f, dict):
            men_items += handle(f, "men")

    for f in women_feeds:
        if isinstance(f, dict):
            women_items += handle(f, "women")

    men_items.sort(key=lambda x: x.get("start") or "")
    women_items.sort(key=lambda x: x.get("start") or "")
    print(f"[wintersport] men={len(men_items)} women={len(women_items)}")
    return men_items, women_items
