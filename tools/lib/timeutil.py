# tools/lib/timeutil.py
from __future__ import annotations
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

OSLO = ZoneInfo("Europe/Oslo")

def now_oslo_iso() -> str:
    return datetime.now(tz=OSLO).isoformat(timespec="seconds")

def parse_iso_any(s: str) -> datetime:
    s = s.strip()
    # handle trailing Z
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    # if missing timezone, treat as UTC
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt

def to_oslo_iso_from_iso(s: str) -> str:
    dt = parse_iso_any(s)
    return dt.astimezone(OSLO).isoformat(timespec="seconds")
