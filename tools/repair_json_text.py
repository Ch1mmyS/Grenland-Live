#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import json
from pathlib import Path

ROOTS = [
    Path("data"),
]

def looks_mojibake(s: str) -> bool:
    # typiske tegn når UTF-8 er lest som latin-1
    return "Ã" in s or "Â" in s or "â" in s

def fix_mojibake(s: str) -> str:
    """
    Prøver å gjøre om 'LillestrÃ¸m' -> 'Lillestrøm'
    """
    if not looks_mojibake(s):
        return s
    try:
        fixed = s.encode("latin1", errors="strict").decode("utf-8", errors="strict")
        return fixed
    except Exception:
        return s

def walk_fix(obj):
    if isinstance(obj, str):
        return fix_mojibake(obj)
    if isinstance(obj, list):
        return [walk_fix(x) for x in obj]
    if isinstance(obj, dict):
        return {walk_fix(k): walk_fix(v) for k, v in obj.items()}
    return obj

def repair_file(path: Path) -> bool:
    try:
        raw = path.read_text(encoding="utf-8")
        data = json.loads(raw)
    except Exception:
        return False

    fixed = walk_fix(data)

    out = json.dumps(fixed, ensure_ascii=False, indent=2) + "\n"
    if out != raw:
        path.write_text(out, encoding="utf-8")
        return True
    return False

def main() -> None:
    changed = 0
    scanned = 0
    for root in ROOTS:
        if not root.exists():
            continue
        for p in root.rglob("*.json"):
            scanned += 1
            if repair_file(p):
                changed += 1

    print(f"[repair_json_text] scanned={scanned} changed={changed}")

if __name__ == "__main__":
    main()
