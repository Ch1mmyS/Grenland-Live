# tools/lib/timeutil.py
from __future__ import annotations
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

OSLO = ZoneInfo("Europe/Oslo")

def now_oslo_iso() -> str:
    return datetime.now(tz=OSLO).isoformat(timespec="seconds")

def to_oslo_iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(OSLO).isoformat(timespec="seconds")
