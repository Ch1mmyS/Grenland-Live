#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(cmd: list[str], label: str) -> None:
    print(f"\n==> {label}")
    print("   ", " ".join(cmd))
    r = subprocess.run(cmd, cwd=ROOT)
    if r.returncode != 0:
        raise SystemExit(r.returncode)


def main() -> None:
    # 1) Football (din eksisterende pipeline)
    run([sys.executable, "tools/fetch_official.py"], "Football (existing pipeline)")

    # 2) Handball (menn/kvinner)
    run([sys.executable, "tools/fetch_handball_2026.py"], "Handball 2026 (menn/kvinner)")

    # 3) Wintersport (menn/kvinner)
    run([sys.executable, "tools/fetch_wintersport_2026.py"], "Wintersport 2026 (menn/kvinner)")

    # 4) Filter alt til kun år 2026
    run([sys.executable, "tools/filter_year_2026.py"], "Filter all data to year 2026 only")


if __name__ == "__main__":
    main()
