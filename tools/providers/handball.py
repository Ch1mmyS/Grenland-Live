# tools/providers/handball.py
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime
from io import BytesIO
from pathlib import Path
from zoneinfo import ZoneInfo

import pdfplumber
import requests

OSLO = ZoneInfo("Europe/Oslo")


def _stable_id(*parts: str) -> str:
    raw = "||".join((p or "").strip() for p in parts)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def _read_sources() -> dict:
    path = Path("data") / "_meta" / "sources.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _extract_pdf_lines(pdf_bytes: bytes) -> list[str]:
    """
    Robust ekstraksjon:
    - både ren tekst (extract_text)
    - og "table-ish" rader (extract_tables)
    Returnerer en flat liste med linjer vi kan regexe på.
    """
    out: list[str] = []

    with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            # 1) vanlig tekst
            t = page.extract_text() or ""
            for ln in t.splitlines():
                ln = (ln or "").strip()
                if ln:
                    out.append(ln)

            # 2) tabeller (mange sports-PDFer er tabell-basert)
            try:
                tables = page.extract_tables(
                    table_settings={
                        "vertical_strategy": "lines",
                        "horizontal_strategy": "lines",
                        "intersection_tolerance": 5,
                        "snap_tolerance": 3,
                        "join_tolerance": 3,
                        "edge_min_length": 3,
                        "min_words_vertical": 1,
                        "min_words_horizontal": 1,
                    }
                ) or []
            except Exception:
                tables = []

            for tbl in tables:
                for row in (tbl or []):
                    cells = []
                    for c in (row or []):
                        c = (c or "").strip()
                        if c:
                            cells.append(c)
                    if cells:
                        out.append(" | ".join(cells))

    # normaliser bindestreker
    out = [ln.replace("\u2013", "-").replace("\u2014", "-") for ln in out]
    return out


# støtt flere datoformater
_DT_PATTERNS = [
    # 16.01.2026 18:00
    (re.compile(r"(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})"), "%d.%m.%Y %H:%M"),
    # 16.01. 18:00  (år mangler)
    (re.compile(r"(\d{2}\.\d{2}\.)\s+(\d{2}:\d{2})"), "%d.%m.%Y %H:%M"),
    # 2026-01-16 18:00
    (re.compile(r"(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})"), "%Y-%m-%d %H:%M"),
]


def _parse_dt(year: int, text: str) -> datetime | None:
    s = (text or "").strip()

    for rx, fmt in _DT_PATTERNS:
        m = rx.search(s)
        if not m:
            continue

        dpart, tpart = m.group(1), m.group(2)

        # hvis formatet er "dd.mm." uten år: legg på år
        if dpart.endswith(".") and len(dpart) == 6:  # "16.01."
            dpart = f"{dpart}{year}"

        try:
            dt = datetime.strptime(f"{dpart} {tpart}", fmt).replace(tzinfo=OSLO)
        except Exception:
            continue

        if dt.year != year:
            return None
        return dt

    return None


def _parse_matchup(text: str) -> tuple[str, str] | None:
    """
    Finn "Team - Team" hvor det er en tydelig separator.
    PDF kan ha mye støy, så vi prøver flere varianter.
    """
    s = (text or "").strip()

    # vanlige varianter
    candidates = [
        r"(.+?)\s-\s(.+)",          # A - B
        r"(.+?)\svs\.?\s(.+)",      # A vs B
        r"(.+?)\sv\s(.+)",          # A v B
    ]
    for pat in candidates:
        m = re.search(pat, s, flags=re.IGNORECASE)
        if m:
            a = m.group(1).strip(" |:-")
            b = m.group(2).strip(" |:-")
            if a and b and a.lower() != "date" and b.lower() != "time":
                return a, b

    return None


def _parse_matches(lines: list[str], year: int, category: str, tv: str) -> list[dict]:
    """
    Heuristikk:
    - finn dato/tid i en linje
    - matchup kan ligge i samme linje, eller i neste 1–2 linjer
    - støtter både tekst og tabell-linjer
    """
    items: list[dict] = []
    seen: set[str] = set()

    for i, ln in enumerate(lines):
        dt = _parse_dt(year, ln)
        if not dt:
            continue

        # prøv matchup i samme linje etter dato
        tail = ln
        # fjern dato/tid fra tail for bedre "A - B" treff
        tail = re.sub(r"\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}", "", tail)
        tail = re.sub(r"\d{2}\.\d{2}\.\s+\d{2}:\d{2}", "", tail)
        tail = re.sub(r"\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}", "", tail)
        tail = tail.strip(" |:-")

        candidates = [tail] if tail else []
        if i + 1 < len(lines):
            candidates.append(lines[i + 1])
        if i + 2 < len(lines):
            candidates.append(lines[i + 2])

        home_away = None
        for cand in candidates:
            home_away = _parse_matchup(cand)
            if home_away:
                break

        if not home_away:
            continue

        home, away = home_away
        title = f"{home} – {away}"
        start = dt.isoformat(timespec="seconds")

        eid = _stable_id("handball", category, start, title)
        if eid in seen:
            continue
        seen.add(eid)

        items.append(
            {
                "id": eid,
                "sport": "handball",
                "category": category,
                "start": start,
                "title": title,
                "tv": tv or "Ukjent",
                "where": [],
                "source": "ehf_pdf",
            }
        )

    items.sort(key=lambda x: x.get("start") or "")
    return items


def fetch_handball_items(year: int = 2026) -> tuple[list[dict], list[dict]]:
    src = _read_sources()
    hb = (src.get("sports") or {}).get("handball") or {}
    men_feeds = hb.get("men") or []
    women_feeds = hb.get("women") or []

    def handle(feed: dict, gender: str) -> list[dict]:
        pdf_url = (feed.get("pdf_url") or "").strip()
        if not pdf_url:
            print(f"[handball] {gender}: missing pdf_url -> skipping")
            return []

        category = (feed.get("name") or "Handball").strip()
        tv = (feed.get("channel") or "").strip()

        print(f"[handball] {gender}: downloading pdf -> {pdf_url}")
        r = requests.get(pdf_url, timeout=90)
        r.raise_for_status()

        lines = _extract_pdf_lines(r.content)
        items = _parse_matches(lines, year=year, category=category, tv=tv)

        if not items:
            # debug: vis litt av linjene for å se hvordan PDF-en faktisk ser ut
            sample = "\n".join(lines[:80])
            print(f"[handball] WARN {gender}: parsed 0 items. Lines sample:\n{sample}")

        return items

    men_items: list[dict] = []
    women_items: list[dict] = []

    for f in men_feeds:
        if isinstance(f, dict) and f.get("type") == "handball_pdf" and f.get("enabled", True):
            men_items += handle(f, "men")

    for f in women_feeds:
        if isinstance(f, dict) and f.get("type") == "handball_pdf" and f.get("enabled", True):
            women_items += handle(f, "women")

    men_items.sort(key=lambda x: x.get("start") or "")
    women_items.sort(key=lambda x: x.get("start") or "")
    print(f"[handball] men={len(men_items)} women={len(women_items)}")
    return men_items, women_items
