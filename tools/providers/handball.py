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


def _pdf_text(pdf_bytes: bytes) -> str:
    texts = []
    with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            t = page.extract_text() or ""
            texts.append(t)
    return "\n".join(texts)


def _parse_matches(text: str, year: int, category: str, tv: str) -> list[dict]:
    """
    Heuristikk:
    - Finn dato + tid + "Team – Team" i samme eller nær linje.
    - Støtter dd.mm.yyyy og hh:mm.
    """
    # Normaliser
    text = text.replace("\u2013", "-").replace("\u2014", "-")  # en-dash/em-dash -> '-'
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

    dt_re = re.compile(r"(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})")
    vs_re = re.compile(r"(.+?)\s-\s(.+)$")

    items: list[dict] = []
    seen: set[str] = set()

    # Vi sjekker samme linje og neste linje for matchup
    for i, ln in enumerate(lines):
        m = dt_re.search(ln)
        if not m:
            continue

        date_str, time_str = m.group(1), m.group(2)

        # kandidat-tekst der matchup kan ligge
        candidates = []
        tail = ln[m.end():].strip(" |:-")
        if tail:
            candidates.append(tail)
        if i + 1 < len(lines):
            candidates.append(lines[i + 1])

        home_away = None
        for cand in candidates:
            vsm = vs_re.search(cand)
            if vsm:
                home_away = (vsm.group(1).strip(), vsm.group(2).strip())
                break

        if not home_away:
            continue

        try:
            dt = datetime.strptime(f"{date_str} {time_str}", "%d.%m.%Y %H:%M").replace(tzinfo=OSLO)
        except Exception:
            continue

        if dt.year != year:
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
                "tv": tv,
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

    men_items: list[dict] = []
    women_items: list[dict] = []

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

        text = _pdf_text(r.content)
        items = _parse_matches(text, year=year, category=category, tv=tv)

        if not items:
            # Debug: vis snippet hvis vi ikke klarer å parse
            snippet = (text[:1200] or "").replace("\n", "\\n")
            print(f"[handball] WARN {gender}: parsed 0 items. Text snippet:\n{snippet}")

        return items

    for f in men_feeds:
        if isinstance(f, dict) and f.get("type") == "handball_pdf":
            men_items += handle(f, "men")

    for f in women_feeds:
        if isinstance(f, dict) and f.get("type") == "handball_pdf":
            women_items += handle(f, "women")

    men_items.sort(key=lambda x: x.get("start") or "")
    women_items.sort(key=lambda x: x.get("start") or "")
    print(f"[handball] men={len(men_items)} women={len(women_items)}")
    return men_items, women_items
