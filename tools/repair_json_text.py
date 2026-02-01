#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import json
import unicodedata
from pathlib import Path

ROOT = Path(".")


REPLACEMENTS = {
    # vanlige mojibake
    "Ã¸": "ø",
    "Ã¥": "å",
    "Ã¦": "æ",
    "Ã˜": "Ø",
    "Ã…": "Å",
    "Ã†": "Æ",
    "â€“": "–",
    "â€”": "—",
    "â€˜": "‘",
    "â€™": "’",
    "â€œ": "“",
    "â€�": "”",
    "â€¦": "…",
    "Â ": " ",
    "Â": "",
    "\u00a0": " ",  # NBSP
}


def fix_text(s: str) -> str:
    if not s:
        return s
    for bad, good in REPLACEMENTS.items():
        s = s.replace(bad, good)
    s = unicodedata.normalize("NFC", s)
    return s


def fix_obj(obj):
    if isinstance(obj, str):
        return fix_text(obj)
    if isinstance(obj, list):
        return [fix_obj(x) for x in obj]
    if isinstance(obj, dict):
        return {fix_text(str(k)): fix_obj(v) for k, v in obj.items()}
    return obj


def iter_json_files() -> list[Path]:
    # du kan utvide/endre her om du vil
    targets = []
    for p in ROOT.rglob("*.json"):
        # hopp over node_modules osv
        if any(part in ("node_modules", ".git") for part in p.parts):
            continue
        targets.append(p)
    return targets


def main():
    files = iter_json_files()
    changed = 0

    for p in files:
        try:
            raw = p.read_text(encoding="utf-8")
        except Exception:
            continue

        try:
            data = json.loads(raw)
        except Exception:
            # ikke gyldig json -> hopp over
            continue

        fixed = fix_obj(data)
        out = json.dumps(fixed, ensure_ascii=False, indent=2)

        if out != raw:
            p.write_text(out, encoding="utf-8")
            changed += 1

    print(f"[repair_json_text] done. changed_files={changed} total_scanned={len(files)}")


if __name__ == "__main__":
    main()
