# tools/providers/fixturedownload_json.py
from __future__ import annotations
import json
from tools.lib.http import get_text
from tools.lib.timeutil import to_oslo_iso_from_iso

def fetch(url: str) -> list[dict]:
    text = get_text(url)
    data = json.loads(text)
    if not isinstance(data, list):
        raise RuntimeError("FixtureDownload: expected a JSON list")

    out: list[dict] = []
    for m in data:
        if not isinstance(m, dict):
            continue
        dt = m.get("DateUtc") or m.get("dateUtc") or m.get("date")
        if not dt:
            continue
        start_oslo = to_oslo_iso_from_iso(dt)
        out.append({
            "start": start_oslo,
            "home": m.get("HomeTeam") or m.get("homeTeam"),
            "away": m.get("AwayTeam") or m.get("awayTeam"),
            "title": None,
            "venue": m.get("Location") or None
        })
    return out
