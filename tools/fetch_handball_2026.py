#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import json
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo

TOOLS_DIR = Path(__file__).resolve().parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

from providers.handball import fetch_handball_items  # noqa: E402

OSLO = ZoneInfo("Europe/Oslo")

OUT_MEN = Path("data") / "2026" / "handball_men.json"
OUT_WOMEN = Path("data") / "2026" / "handball_women.json"


def _write(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def main() -> None:
    men_items, women_items = fetch_handball_items(year=2026)

    base = {
        "timezone": "Europe/Oslo",
        "seasonYear": 2026,
        "generatedAt": datetime.now(OSLO).isoformat(timespec="seconds"),
    }

    _write(OUT_MEN, {**base, "items": men_items})
    _write(OUT_WOMEN, {**base, "items": women_items})

    print(f"WROTE {OUT_MEN}: {len(men_items)} items")
    print(f"WROTE {OUT_WOMEN}: {len(women_items)} items")


if __name__ == "__main__":
    main()
