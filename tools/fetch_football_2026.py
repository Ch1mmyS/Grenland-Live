#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo

from tools.providers.football import fetch_fixturedownload

OSLO = ZoneInfo("Europe/Oslo")
OUT_DIR = Path("data") / "2026"
OUT_FILE = OUT_DIR / "football.json"


def _parse_iso(dt_str: str) -> datetime | None:
    if not dt_str:
        return None
    try:
        # isoformat med offset (fra provider): 2026-..T..+01:00
        return datetime.fromisoformat(dt_str)
    except Exception:
        return None


def _only_year(events: list[dict], year: int) -> list[dict]:
    out = []
    for e in events:
        dt = _parse_iso(e.get("kickoff"))
        if not dt:
            continue
        # kickoff er allerede Oslo-tid fra provider, men vi sikrer tz
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=OSLO)
        if dt.year == year:
            out.append(e)
    out.sort(key=lambda x: x.get("kickoff") or "")
    return out


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    # 1) Hent fra providers (foreløpig bare fixturedownload; official kan legges til senere)
    events = []
    events += fetch_fixturedownload()

    # 2) Filtrer til kun 2026
    events_2026 = _only_year(events, 2026)

    # 3) Skriv
    payload = {
        "timezone": "Europe/Oslo",
        "seasonYear": 2026,
        "generatedAt": datetime.now(OSLO).isoformat(),
        "games": events_2026,
    }
    _write_json(OUT_FILE, payload)
    print(f"WROTE {OUT_FILE}: {len(events_2026)} games")


if __name__ == "__main__":
    main()
