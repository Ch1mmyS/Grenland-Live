# tools/providers/handball.py
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path
import json

import requests
from pypdf import PdfReader

OSLO = ZoneInfo("Europe/Oslo")


def _stable_id(*parts: str) -> str:
    raw = "||".join(p.strip() for p in parts if p is not None)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def _read_sources() -> dict:
    path = Path("data") / "_meta" / "sources.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _extract_text_from_pdf(pdf_bytes: bytes) -> str:
    reader = PdfReader(io_bytes := pdf_bytes)  # type: ignore
    # pypdf can read from bytes directly in recent versions
    # But compatibility varies; safe approach: use BytesIO
    # We'll implement safe fallback below.
    return ""


def _pdf_text(pdf_bytes: bytes) -> str:
    # Safe pypdf read
    from io import BytesIO
    reader = PdfReader(BytesIO(pdf_bytes))
    texts = []
    for page in reader.pages:
        t = page.extract_text() or ""
        texts.append(t)
    return "\n".join(texts)


@dataclass
class ParsedMatch:
    start: str
    title: str
    category: str
    tv: str


def _parse_ehf_pdf_text(text: str, category: str, tv: str) -> list[ParsedMatch]:
    """
    EHF PDF-er varierer. Vi bruker en robust regex-basert heuristikk:
    - Finn dato/tid (dd.mm.yyyy hh:mm) eller (dd.mm.yyyy) + (hh:mm)
    - Finn lag vs lag på samme/tilstøtende linje
    Dette er ikke perfekt, men gir data i det minste.
    """
    # Normaliser whitespace
    text = re.sub(r"[ \t]+", " ", text)
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

    # Regex for dato og tid (typisk i Europa-format)
    dt_re = re.compile(r"(?P<d>\d{2}\.\d{2}\.\d{4})\s+(?P<t>\d{2}:\d{2})")
    vs_re = re.compile(r"(.+?)\s+[-–]\s+(.+?)$")

    matches: list[ParsedMatch] = []

    for ln in lines:
        m = dt_re.search(ln)
        if not m:
            continue

        date_str = m.group("d")  # dd.mm.yyyy
        time_str = m.group("t")  # hh:mm

        # Prøv å finne “Team – Team” i samme linje etter dato/tid
        tail = ln[m.end():].strip(" -–|")
        vsm = vs_re.search(tail)
        if not vsm:
            continue

        home = vsm.group(1).strip()
        away = vsm.group(2).strip()

        # Bygg ISO (Oslo)
        try:
            dt = datetime.strptime(f"{date_str} {time_str}", "%d.%m.%Y %H:%M").replace(tzinfo=OSLO)
        except Exception:
            continue

        # Filter 2026 (kun kalenderår)
        if dt.year != 2026:
            continue

        start_iso = dt.isoformat(timespec="seconds")
        title = f"{home} – {away}"

        matches.append(ParsedMatch(start=start_iso, title=title, category=category, tv=tv))

    return matches


def fetch_handball_items(year: int = 2026) -> tuple[list[dict], list[dict]]:
    """
    Returnerer (men_items, women_items) i standard schema.
    """
    src = _read_sources()
    hb = (src.get("sports") or {}).get("handball") or {}
    men_feeds = hb.get("men") or []
    women_feeds = hb.get("women") or []

    men_items: list[dict] = []
    women_items: list[dict] = []
    seen: set[str] = set()

    def handle_feed(feed: dict, gender: str):
        nonlocal men_items, women_items, seen

        pdf_url = (feed.get("pdf_url") or "").strip()
        if not pdf_url:
            print(f"[handball] {gender}: missing pdf_url -> skipping")
            return

        category = (feed.get("name") or "Handball").strip()
        tv = (feed.get("channel") or "").strip()

        print(f"[handball] {gender}: downloading pdf -> {pdf_url}")
        r = requests.get(pdf_url, timeout=60)
        r.raise_for_status()

        text = _pdf_text(r.content)
        parsed = _parse_ehf_pdf_text(text, category=category, tv=tv)

        for pm in parsed:
            if not pm.start.startswith(str(year)):
                # safe guard
                continue

            eid = _stable_id("handball", gender, pm.category, pm.start, pm.title)
            if eid in seen:
                continue
            seen.add(eid)

            item = {
                "id": eid,
                "sport": "handball",
                "category": pm.category,
                "start": pm.start,
                "title": pm.title,
                "tv": pm.tv,
                "where": [],
                "source": "ehf_pdf",
            }

            if gender == "men":
                men_items.append(item)
            else:
                women_items.append(item)

    for f in men_feeds:
        if isinstance(f, dict) and f.get("type") == "handball_pdf":
            handle_feed(f, "men")

    for f in women_feeds:
        if isinstance(f, dict) and f.get("type") == "handball_pdf":
            handle_feed(f, "women")

    men_items.sort(key=lambda x: x.get("start") or "")
    women_items.sort(key=lambda x: x.get("start") or "")
    print(f"[handball] men={len(men_items)} women={len(women_items)}")
    return men_items, women_items
