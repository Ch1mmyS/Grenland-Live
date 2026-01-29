#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import json
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo

# Ensure /tools is on sys.path so we can import providers/*
TOOLS_DIR = Path(__file__).resolve().parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

from providers.football import fetch_fixture_download_items  # noqa: E402

OSLO = ZoneInfo("Europe/Oslo")

OUT_DIR = Path("data") / "2026"
OUT_FILE = OUT_DIR / "football.json"


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def main() -> None:
    items = fetch_fixture_download_items(year=2026)

    payload = {
        "timezone": "Europe/Oslo",
        "seasonYear": 2026,
        "generatedAt": datetime.now(OSLO).isoformat(timespec="seconds"),
        "items": items,
    }

    _write_json(OUT_FILE, payload)
    print(f"WROTE {OUT_FILE}: {len(items)} items")


if __name__ == "__main__":
    main()
