import subprocess
import sys

SCRIPTS = [
    ("Handball menn (PDF)", "tools/fetch_handball_menn_ehf_pdf.py"),
    ("Handball damer (EHF EURO Cup)", "tools/fetch_handball_damer_ehf_eurocup.py"),
    ("Vintersport (IBU)", "tools/fetch_vintersport_biathlon.py"),
]

def run_one(label: str, path: str) -> None:
    print(f"\n=== {label} ===")
    r = subprocess.run([sys.executable, path], check=False)
    if r.returncode != 0:
        raise SystemExit(f"Script feilet: {path}")

def main() -> None:
    for label, path in SCRIPTS:
        run_one(label, path)

if __name__ == "__main__":
    main()
