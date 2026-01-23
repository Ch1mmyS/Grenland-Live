import json
import re
from datetime import datetime
from io import BytesIO
from typing import List, Dict, Any, Optional

import pytz
import requests

try:
    from PyPDF2 import PdfReader
except Exception as e:
    raise SystemExit(
        "PyPDF2 mangler. Legg til i tools/requirements-tools.txt: PyPDF2==3.0.1"
    )

OSLO = pytz.timezone("Europe/Oslo")

PDF_URL = "https://tickets.eurohandball.com/fileadmin/fm_de/EHF2026M/250901_EHF2026-M_Match_Schedule_new.pdf"


def _oslo_iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = OSLO.localize(dt)
    return dt.isoformat()


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip()


def _download_pdf(url: str) -> bytes:
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    return r.content


def _extract_text_from_pdf(pdf_bytes: bytes) -> str:
    reader = PdfReader(BytesIO(pdf_bytes))
    parts = []
    for p in reader.pages:
        t = p.extract_text() or ""
        parts.append(t)
    return "\n".join(parts)


def _parse_matches(text: str) -> List[Dict[str, Any]]:
    """
    PDF-en er en tabell. Tekst-uttrekket varierer litt, men vi kan hente:
    - dato (f.eks. "Thu Jan 15, 2026")
    - tid (f.eks. "18:00")
    - lag vs lag (to landnavn)
    - by/arena står ofte i nærheten, men ikke alltid stabilt -> vi dropper det (kan legges på senere)
    """

    # Eksempel-mønstre som ofte dukker opp i tekstuttrekk:
    # "Thu Jan 15, 2026 18:00" + "Hungary" + "Poland"
    # Vi gjør en robust scanning linje for linje.

    lines = [_clean(x) for x in text.splitlines() if _clean(x)]
    matches: List[Dict[str, Any]] = []

    date_re = re.compile(
        r"^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})$"
    )
    datetime_re = re.compile(
        r"^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})\s+(\d{1,2}:\d{2})$"
    )
    time_re = re.compile(r"^(\d{1,2}:\d{2})$")

    months = {
        "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
        "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12
    }

    # Heuristikk: når vi ser en dato+tid, plukk de neste "team-ish" tokenene som ikke er tall/poeng/gruppe.
    def is_team_token(s: str) -> bool:
        if not s:
            return False
        if any(ch.isdigit() for ch in s):
            return False
        if s.upper() in {"GROUP", "ROUND", "PRELIMINARY", "MAIN", "FINAL", "SEMI-FINALS", "FINALS"}:
            return False
        if len(s) < 3:
            return False
        # land/teamnavn har ofte bokstaver og mellomrom
        return True

    i = 0
    while i < len(lines):
        mdt = datetime_re.match(lines[i])
        if mdt:
            mon = months.get(mdt.group(2))
            day = int(mdt.group(3))
            year = int(mdt.group(4))
            hh, mm = mdt.group(5).split(":")
            dt = OSLO.localize(datetime(year, mon, day, int(hh), int(mm)))

            # finn home/away i de neste ~10 linjene
            cand = []
            for j in range(i + 1, min(i + 15, len(lines))):
                tok = lines[j]
                if is_team_token(tok):
                    cand.append(tok)
                if len(cand) >= 2:
                    break

            if len(cand) >= 2:
                home, away = cand[0], cand[1]
                matches.append({
                    "league": "Håndball EM 2026 (Menn)",
                    "home": home,
                    "away": away,
                    "start": _oslo_iso(dt),
                    "channel": "TV 2 / TV 2 Play",
                    "kind": "handball",
                    "gender": "men"
                })
            i += 1
            continue

        # fallback: dato på egen linje, tid på neste
        mdate = date_re.match(lines[i])
        if mdate and i + 1 < len(lines) and time_re.match(lines[i + 1]):
            mon = months.get(mdate.group(2))
            day = int(mdate.group(3))
            year = int(mdate.group(4))
            hh, mm = lines[i + 1].split(":")
            dt = OSLO.localize(datetime(year, mon, day, int(hh), int(mm)))

            cand = []
            for j in range(i + 2, min(i + 20, len(lines))):
                tok = lines[j]
                if is_team_token(tok):
                    cand.append(tok)
                if len(cand) >= 2:
                    break

            if len(cand) >= 2:
                home, away = cand[0], cand[1]
                matches.append({
                    "league": "Håndball EM 2026 (Menn)",
                    "home": home,
                    "away": away,
                    "start": _oslo_iso(dt),
                    "channel": "TV 2 / TV 2 Play",
                    "kind": "handball",
                    "gender": "men"
                })
            i += 2
            continue

        i += 1

    # dedupe
    seen = set()
    out = []
    for m in matches:
        k = (m["start"], m["home"], m["away"])
        if k in seen:
            continue
        seen.add(k)
        out.append(m)

    out.sort(key=lambda x: x["start"])
    return out


def main() -> None:
    pdf_bytes = _download_pdf(PDF_URL)
    text = _extract_text_from_pdf(pdf_bytes)
    matches = _parse_matches(text)

    payload = {"games": matches, "updatedAt": datetime.now(OSLO).isoformat()}
    with open("data/handball_vm_2026_menn.json", "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"WROTE data/handball_vm_2026_menn.json -> {len(matches)} games")


if __name__ == "__main__":
    main()
