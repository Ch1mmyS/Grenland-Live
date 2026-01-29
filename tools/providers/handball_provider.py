# tools/providers/handball_provider.py
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from tools.lib.http import get_text

def _parse_ics_datetime(v: str) -> str:
    """
    Supports:
    - 20260118T180000Z
    - 20260118T180000
    - 20260118
    """
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
    # split VEVENT blocks
    events = []
    blocks = re.split(r"BEGIN:VEVENT", text)
    for b in blocks[1:]:
        b = b.split("END:VEVENT")[0]
        lines = [ln.strip() for ln in b.splitlines() if ln.strip() and not ln.startswith("END:")]
        kv = {}
        for ln in lines:
            # handle folded lines (simple best-effort)
            if ln.startswith(" "):
                continue
            if ":" not in ln:
                continue
            k, val = ln.split(":", 1)
            k = k.split(";", 1)[0].upper()
            kv[k] = val.strip()
        if "DTSTART" in kv:
            title = kv.get("SUMMARY") or kv.get("DESCRIPTION") or "Handball"
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

    # If it's ICS
    if "BEGIN:VCALENDAR" in text and "BEGIN:VEVENT" in text:
        return _ics_events(text)

    # Else try JSON
    data = json.loads(text)

    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("items", "events", "games", "matches"):
            if key in data and isinstance(data[key], list):
                return data[key]
    return []
