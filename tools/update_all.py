#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Grenland Live – main pipeline runner (GitHub Actions entrypoint)
Runs:
- Football (2026 only)
- Handball 2026
- Wintersport 2026
"""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(cmd: list[str], name: str) -> None:
    print(f"\n==> {name}")
    print("   ", " ".join(cmd))
    r = subprocess.run(cmd, cwd=ROOT, capture_output=False)
    if r.returncode != 0:
        raise SystemExit(r.returncode)


def main() -> None:
    run([sys.executable, "tools/fetch_football_2026.py"], "Football (2026)")
    run([sys.executable, "tools/fetch_handball_2026.py"], "Handball (2026)")
    run([sys.executable, "tools/fetch_wintersport_2026.py"], "Wintersport (2026)")


if __name__ == "__main__":
    main()
