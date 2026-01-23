#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import re
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

YEAR = 2026

# Hvilke felter kan inneholde tidspunkt hos deg:
DATE_FIELDS = ["kickoff", "start", "datetime", "dateTime", "date", "utc", "time", "DateUtc"]

DATA_DIR = Path("data")


def _read_json(path: Path) -> Optional[Dict[str, Any]]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _write_json(path: Path, obj: Dict[str, Any]) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def _parse_year(value: Any) -> Optional[int]:
    """
    Returnerer år hvis vi kan lese et år ut fra ulike datoformater.
    Støtter:
      - ISO: 2026-01-15T18:00:00+01:00
      - ISO/Z: 2026-01-15T17:00:00Z
      - "YYYY-MM-DD HH:MM:SSZ" (FixtureDownload)
      - "YYYY-MM-DD" (date)
    """
    if value is None:
        return None

    s = str(value).strip()
    if not s:
        return None

    # 1) Raskt: plukk år fra starten hvis det ser sånn ut
    m = re.match(r"^(\d{4})[-/]", s)
    if m:
        try:
            return int(m.group(1))
        except Exception:
            pass

    # 2) ISO parsing
    # Normaliser Z
    try:
        iso = s.replace("Z", "+00:00")
        dt = datetime.fromisoformat(iso)
        if dt.tzinfo is None:
            # Antar UTC hvis timezone mangler
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.year
    except Exception:
        pass

    # 3) FixtureDownload-format: "2025-08-15 19:00:00Z"
    try:
        if s.endswith("Z") and " " in s:
            dt = datetime.strptime(s, "%Y-%m-%d %H:%M:%SZ").replace(tzinfo=timezone.utc)
            return dt.year
    except Exception:
        pass

    # 4) Bare dato: "2026-01-15"
    try:
        if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
            dt = datetime.strptime(s, "%Y-%m-%d")
            return dt.year
    except Exception:
        pass

    return None


def _get_item_year(item: Dict[str, Any]) -> Optional[int]:
    # Prøv felter i prioritert rekkefølge
    for f in DATE_FIELDS:
        if f in item and item[f]:
            y = _parse_year(item[f])
            if y is not None:
                return y

    # Noen feeds kan ha nested felt
    # (bare et fallback – just in case)
    for k, v in item.items():
        if isinstance(v, str):
            y = _parse_year(v)
            if y is not None:
                return y

    return None


def _filter_list(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for it in items:
        if not isinstance(it, dict):
            continue
        y = _get_item_year(it)
        if y == YEAR:
            out.append(it)
    return out


def main() -> int:
    if not DATA_DIR.exists():
        print("ERROR: data/ finnes ikke")
        return 1

    # Filtrér alle json i data/ unntatt sources/metadata om du vil (vi filtrerer kun hvis games/events finnes)
    changed = 0
    total_files = 0

    for path in sorted(DATA_DIR.glob("*.json")):
        obj = _read_json(path)
        if not isinstance(obj, dict):
            continue

        total_files += 1
        before = json.dumps(obj, ensure_ascii=False, sort_keys=True)

        if isinstance(obj.get("games"), list):
            obj["games"] = _filter_list(obj["games"])

        if isinstance(obj.get("events"), list):
            obj["events"] = _filter_list(obj["events"])

        after = json.dumps(obj, ensure_ascii=False, sort_keys=True)

        if after != before:
            _write_json(path, obj)
            changed += 1
            print(f"FILTERED -> {path} (kun {YEAR})")

    print(f"DONE: filtrerte {changed}/{total_files} filer")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
