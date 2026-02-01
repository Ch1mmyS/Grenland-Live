# tools/providers/fis_ical.py
from __future__ import annotations

import re
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Iterable
import requests

OSLO = ZoneInfo("Europe/Oslo")

FIS_ICAL_BASE = "https://data.fis-ski.com/services/public/icalendar-feed-fis-events.html"


def _fold_ics_lines(raw: str) -> list[str]:
    """
    iCalendar kan ha 'folded lines' (linjer som fortsetter med mellomrom).
    Vi folder ut til hele linjer.
    """
    lines = raw.splitlines()
    out: list[str] = []
    for ln in lines:
        if not ln:
            out.append("")
            continue
        if ln.startswith(" ") or ln.startswith("\t"):
            if out:
                out[-1] += ln[1:]
            else:
                out.append(ln.lstrip())
        else:
            out.append(ln)
    return out


def _parse_dt(value: str) -> str | None:
    """
    Støtter:
      - 20260117T134500Z
      - 20260117T134500
      - 20260117
    Returnerer ISO med Europe/Oslo tz hvis mulig.
    """
    v = (value or "").strip()
    if not v:
        return None

    # DATE-TIME
    m = re.match(r"^(\d{8})T(\d{6})(Z)?$", v)
    if m:
        ymd = m.group(1)
        hms = m.group(2)
        z = m.group(3)

        dt = datetime.strptime(ymd + hms, "%Y%m%d%H%M%S")
        if z == "Z":
            dt = dt.replace(tzinfo=ZoneInfo("UTC")).astimezone(OSLO)
        else:
            dt = dt.replace(tzinfo=OSLO)
        return dt.isoformat(timespec="seconds")

    # DATE only
    m = re.match(r"^(\d{8})$", v)
    if m:
        dt = datetime.strptime(m.group(1), "%Y%m%d").replace(tzinfo=OSLO)
        return dt.isoformat(timespec="seconds")

    return None


def _guess_gender(summary: str) -> str | None:
    s = (summary or "").lower()
    # Enkle heuristikker – FIS skriver ofte "Men"/"Women"/"Ladies"
    if any(x in s for x in [" women", " ladies", " women’s", " women's", " damer", " kvinner"]):
        return "women"
    if any(x in s for x in [" men", " men's", " herrer", " menn"]):
        return "men"
    return None


def fetch_fis_ical_events(
    seasoncode: int,
    sectorcode: str,
    categorycode: str = "WC",
    extra_params: dict | None = None,
) -> list[dict]:
    """
    Henter FIS iCalendar feed og returnerer events som items:
      { sport:"wintersport", start, title, where, tv, source }
    """
    params = {
        "seasoncode": str(seasoncode),
        "sectorcode": sectorcode,
        "categorycode": categorycode,
    }
    if extra_params:
        params.update({k: str(v) for k, v in extra_params.items()})

    r = requests.get(FIS_ICAL_BASE, params=params, timeout=60)
    r.raise_for_status()

    raw = r.text
    lines = _fold_ics_lines(raw)

    items: list[dict] = []
    cur: dict[str, str] | None = None

    def flush(e: dict[str, str] | None):
        if not e:
            return
        dt = e.get("DTSTART") or ""
        start = _parse_dt(dt)
        if not start:
            return
        title = (e.get("SUMMARY") or "").strip()
        loc = (e.get("LOCATION") or "").strip()
        if not title:
            return
        items.append(
            {
                "sport": "wintersport",
                "start": start,
                "title": title,
                "where": [],
                "venue": loc,
                "source": "fis_ical",
                # gender setter vi senere (heuristikk)
                "gender": _guess_gender(title),
            }
        )

    for ln in lines:
        if ln == "BEGIN:VEVENT":
            cur = {}
            continue
        if ln == "END:VEVENT":
            flush(cur)
            cur = None
            continue
        if cur is None:
            continue
        if ":" not in ln:
            continue
        k, v = ln.split(":", 1)
        k = k.split(";", 1)[0].strip().upper()
        v = v.strip()
        if k in ("DTSTART", "SUMMARY", "LOCATION"):
            cur[k] = v

    items.sort(key=lambda x: x.get("start") or "")
    return items
