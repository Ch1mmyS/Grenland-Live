# tools/providers/handball_pdf.py
from __future__ import annotations
import re
from datetime import datetime
from pypdf import PdfReader
from tools.lib.http import get_bytes
from tools.lib.timeutil import OSLO

DATE_RE = re.compile(r"\b(\d{2})\.(\d{2})\.(\d{4})\b")
TIME_RE = re.compile(r"\b(\d{1,2}):(\d{2})\b")

def _extract_text(pdf_bytes: bytes) -> str:
    reader = PdfReader(io_bytes := __import__("io").BytesIO(pdf_bytes))
    chunks = []
    for p in reader.pages:
        t = p.extract_text() or ""
        if t.strip():
            chunks.append(t)
    return "\n".join(chunks)

def _parse_lines_to_events(text: str) -> list[dict]:
    events: list[dict] = []
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    for ln in lines:
        # find date and time
        dm = DATE_RE.search(ln)
        tm = TIME_RE.search(ln)
        if not dm or not tm:
            continue

        day, mon, year = int(dm.group(1)), int(dm.group(2)), int(dm.group(3))
        hh, mm = int(tm.group(1)), int(tm.group(2))

        # guess match part: look for separators
        # EHF PDFs often use "-" or "–"
        match_part = ln
        # try split after time
        idx = ln.find(tm.group(0))
        if idx != -1:
            match_part = ln[idx + len(tm.group(0)):].strip()

        home = away = None
        title = match_part.strip()[:180] if match_part.strip() else "Handball"

        # normalize dash
        mp = match_part.replace("–", "-")
        if " - " in mp:
            a, b = mp.split(" - ", 1)
            home, away = a.strip()[:80] or None, b.strip()[:80] or None
        elif "-" in mp:
            a, b = mp.split("-", 1)
            # only accept if both sides look non-empty
            if a.strip() and b.strip():
                home, away = a.strip()[:80], b.strip()[:80]

        # create Oslo time ISO (assume local time in schedule PDFs)
        dt = datetime(year, mon, day, hh, mm, tzinfo=OSLO).isoformat(timespec="seconds")

        events.append({
            "start": dt,
            "home": home,
            "away": away,
            "title": title if (not home and not away) else None,
            "venue": None
        })
    return events

def fetch(pdf_url: str) -> list[dict]:
    if not pdf_url:
        raise ValueError("handball_pdf: pdf_url is empty")
    pdf_bytes = get_bytes(pdf_url)
    text = _extract_text(pdf_bytes)
    return _parse_lines_to_events(text)
