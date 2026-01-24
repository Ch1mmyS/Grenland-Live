#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import re
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

YEAR = 2026
DATA_DIR = Path("data")
DATE_FIELDS = ["kickoff", "start", "datetime", "dateTime", "date", "utc", "time", "DateUtc"]


def _read_json(path: Path) -> Optional[Dict[str, Any]]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _write_json(path: Path, obj: Dict[str, Any]) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def _parse_year(value: Any) -> Optional[int]:
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None

    m = re.match(r"^(\d{4})[-/]", s)
    if m:
        try:
            return int(m.group(1))
        except Exception:
            pass

    try:
        iso = s.replace("Z", "+00:00")
        dt = datetime.fromisoformat(iso)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.year
    except Exception:
        pass

    try:
        if s.endswith("Z") and " " in s:
            dt = datetime.strptime(s, "%Y-%m-%d %H:%M:%SZ").replace(tzinfo=timezone.utc)
            return dt.year
    except Exception:
        pass

    try:
        if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
            dt = datetime.strptime(s, "%Y-%m-%d")
            return dt.year
    except Exception:
        pass

    return None


def _get_item_year(item: Dict[str, Any]) -> Optional[int]:
    for f in DATE_FIELDS:
        if f in item and item[f]:
            y = _parse_year(item[f])
            if y is not None:
                return y

    for _, v in item.items():
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

    changed = 0
    total = 0

    for path in sorted(DATA_DIR.glob("*.json")):
        obj = _read_json(path)
        if not isinstance(obj, dict):
            continue

        total += 1
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

    print(f"DONE: filtrerte {changed}/{total} filer")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
