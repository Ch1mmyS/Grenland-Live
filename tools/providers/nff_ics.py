# tools/providers/nff_ics.py
from __future__ import annotations
import re
from datetime import datetime, timezone
from tools.lib.http import get_text
from tools.lib.timeutil import to_oslo_iso_from_iso

def _parse_dt(v: str) -> str:
    # NFF ICS usually provides DTSTART like 20260321T180000Z
    v = v.strip()
    if v.endswith("Z"):
        dt = datetime.strptime(v, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
        return dt.isoformat(timespec="seconds")
    if "T" in v:
        dt = datetime.strptime(v, "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc)
        return dt.isoformat(timespec="seconds")
    dt = datetime.strptime(v, "%Y%m%d").replace(tzinfo=timezone.utc)
    return dt.isoformat(timespec="seconds")

def fetch(url: str) -> list[dict]:
    text = get_text(url)
    if "BEGIN:VCALENDAR" not in text or "BEGIN:VEVENT" not in text:
        raise RuntimeError("NFF ICS: not an ICS calendar response")

    events: list[dict] = []
    blocks = re.split(r"BEGIN:VEVENT", text)
    for b in blocks[1:]:
        b = b.split("END:VEVENT")[0]
        lines = [ln.rstrip() for ln in b.splitlines() if ln.strip()]
        kv = {}
        for ln in lines:
            if ":" not in ln:
                continue
            k, val = ln.split(":", 1)
            k = k.split(";", 1)[0].upper().strip()
            kv[k] = val.strip()

        if "DTSTART" not in kv:
            continue

        start_utc_iso = _parse_dt(kv["DTSTART"])
        start_oslo = to_oslo_iso_from_iso(start_utc_iso)

        summary = kv.get("SUMMARY", "")
        # common formats: "Odd - Brann" etc.
        home = away = None
        title = summary.strip() or None
        if " - " in summary:
            parts = [p.strip() for p in summary.split(" - ", 1)]
            if len(parts) == 2:
                home, away = parts[0], parts[1]

        events.append({
            "start": start_oslo,
            "home": home,
            "away": away,
            "title": title,
            "venue": kv.get("LOCATION")
        })
    return events
