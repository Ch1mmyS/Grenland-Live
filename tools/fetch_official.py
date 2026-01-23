#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Main pipeline runner for Grenland Live.
Runs:
- Football fixtures (existing logic)
- Handball 2026 (EHF EURO Cup discovery + history pages)
- Wintersport 2026 (FIS calendar)
"""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(cmd: list, name: str) -> None:
    print(f"\n==> {name}")
    print("   ", " ".join(cmd))
    r = subprocess.run(cmd, cwd=ROOT, capture_output=False)
    if r.returncode != 0:
        raise SystemExit(r.returncode)


def main() -> None:
    # 1) Football script you already use (keep as-is).
    # If your football fetcher is in another file name, update it here.
    run([sys.executable, "tools/fetch_football_2026.py"], "Football (2026 filter)")

    # 2) Handball 2026
    run([sys.executable, "tools/fetch_handball_2026.py"], "Handball (menn/kvinner)")

    # 3) Wintersport 2026
    run([sys.executable, "tools/fetch_wintersport_2026.py"], "Wintersport (menn/kvinner)")


if __name__ == "__main__":
    main()
