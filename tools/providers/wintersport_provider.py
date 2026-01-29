# tools/providers/wintersport_provider.py
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from tools.lib.http import get_text

def _parse_ics_datetime(v: str) -> str:
    v = v.strip()
    if v.endswith("Z"):
        dt = datetime.strptime(v, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
        return dt.isoformat(timespec="seconds")
    if "T" in v:
        dt = datetime.strptime(v, "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc)
        return dt.isoformat(timespec="seconds")
    dt = datetime.strptime(v, "%Y%m%d").replace(tzinfo=timezone.utc)
    return dt.isoformat(timespec="seconds")

def _ics_events(text: str) -> list[dict]:
    events = []
    blocks = re.split(r"BEGIN:VEVENT", text)
    for b in blocks[1:]:
        b = b.split("END:VEVENT")[0]
        lines = [ln.strip() for ln in b.splitlines() if ln.strip()]
        kv = {}
        for ln in lines:
            if ":" not in ln:
                continue
            k, val = ln.split(":", 1)
            k = k.split(";", 1)[0].upper()
            kv[k] = val.strip()
        if "DTSTART" in kv:
            title = kv.get("SUMMARY") or "Wintersport"
            start = _parse_ics_datetime(kv["DTSTART"])
            loc = kv.get("LOCATION")
            events.append({
                "start": start,
                "title": title,
                "venue": loc
            })
    return events

def fetch(source: dict) -> list[dict]:
    url = source.get("url")
    if not url:
        raise ValueError(f"Source {source.get('id')} missing url")

    text = get_text(url)

    if "BEGIN:VCALENDAR" in text and "BEGIN:VEVENT" in text:
        return _ics_events(text)

    data = json.loads(text)

    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("items", "events", "races", "competitions"):
            if key in data and isinstance(data[key], list):
                return data[key]
    return []
