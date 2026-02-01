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


# -------------------- utils --------------------
def _stable_id(*parts: str) -> str:
    raw = "||".join((p or "").strip() for p in parts)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def _read_sources() -> dict:
    path = Path("data") / "_meta" / "sources.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _norm(s: str) -> str:
    # normaliser dashes + whitespace
    s = (s or "").replace("\u2013", "-").replace("\u2014", "-").replace("\xa0", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s


# måned mapping (norsk + engelsk)
_MONTHS = {
    # norsk
    "jan": 1,
    "januar": 1,
    "feb": 2,
    "februar": 2,
    "mar": 3,
    "mars": 3,
    "apr": 4,
    "april": 4,
    "mai": 5,
    "jun": 6,
    "juni": 6,
    "jul": 7,
    "juli": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "okt": 10,
    "oktober": 10,
    "nov": 11,
    "november": 11,
    "des": 12,
    "desember": 12,
    # engelsk
    "jan.": 1,
    "january": 1,
    "feb.": 2,
    "february": 2,
    "mar.": 3,
    "march": 3,
    "apr.": 4,
    "may": 5,
    "jun.": 6,
    "june": 6,
    "jul.": 7,
    "july": 7,
    "aug.": 8,
    "sep.": 9,
    "sept.": 9,
    "oct": 10,
    "oct.": 10,
    "october": 10,
    "nov.": 11,
    "dec": 12,
    "dec.": 12,
    "december": 12,
}


def _parse_dt(date_part: str, time_part: str, year: int) -> datetime | None:
    """
    Støtter:
      - dd.mm.yyyy
      - dd.mm. (uten år) -> year
      - dd/mm/yyyy
      - yyyy-mm-dd
      - '12 Jan 2026' / '12. januar 2026' (med/uten punktum)
    """
    dp = _norm(date_part).lower().strip(".")
    tp = _norm(time_part)

    # tid
    tm = re.match(r"^(\d{1,2}):(\d{2})$", tp)
    if not tm:
        return None
    hh = int(tm.group(1))
    mm = int(tm.group(2))

    # 1) dd.mm.yyyy
    m = re.match(r"^(\d{1,2})\.(\d{1,2})\.(\d{4})$", dp)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return datetime(y, mo, d, hh, mm, tzinfo=OSLO)

    # 2) dd.mm (uten år)
    m = re.match(r"^(\d{1,2})\.(\d{1,2})$", dp)
    if m:
        d, mo = int(m.group(1)), int(m.group(2))
        return datetime(year, mo, d, hh, mm, tzinfo=OSLO)

    # 3) dd/mm/yyyy
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", dp)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return datetime(y, mo, d, hh, mm, tzinfo=OSLO)

    # 4) yyyy-mm-dd
    m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})$", dp)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return datetime(y, mo, d, hh, mm, tzinfo=OSLO)

    # 5) '12 jan 2026' / '12 januar 2026' / '12 jan' (uten år)
    m = re.match(r"^(\d{1,2})\.?\s+([a-zæøå\.]+)\s*(\d{4})?$", dp)
    if m:
        d = int(m.group(1))
        mon_s = (m.group(2) or "").strip().lower()
        y = int(m.group(3)) if m.group(3) else year
        mo = _MONTHS.get(mon_s)
        if mo:
            return datetime(y, mo, d, hh, mm, tzinfo=OSLO)

    return None


def _mk_item(year: int, category: str, tv: str, dt: datetime, title: str) -> dict:
    start = dt.isoformat(timespec="seconds")
    eid = _stable_id("handball", category, start, title)
    return {
        "id": eid,
        "sport": "handball",
        "category": category,
        "start": start,
        "title": title,
        "tv": tv,
        "where": [],
        "source": "ehf_pdf",
    }


# -------------------- PDF extraction --------------------
def _pdf_text(pdf_bytes: bytes) -> str:
    texts: list[str] = []
    with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            t = page.extract_text() or ""
            texts.append(t)
    return "\n".join(texts)


def _pdf_tables(pdf_bytes: bytes) -> list[list[list[str]]]:
    """
    Returnerer liste av tabeller, der hver tabell er liste av rader,
    og hver rad er liste av celler (strings).
    """
    all_tables: list[list[list[str]]] = []
    with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            # aggressive settings funker ofte bedre på sports-PDFer
            table = page.extract_table(
                {
                    "vertical_strategy": "lines",
                    "horizontal_strategy": "lines",
                    "intersection_tolerance": 5,
                    "snap_tolerance": 3,
                    "join_tolerance": 3,
                    "edge_min_length": 3,
                    "min_words_vertical": 1,
                    "min_words_horizontal": 1,
                }
            )
            if table:
                all_tables.append(table)
    return all_tables


# -------------------- parsing --------------------
_VS_SEP = re.compile(r"\s*(?:-|vs\.?|v\.?)\s*", re.IGNORECASE)


def _split_matchup(s: str) -> tuple[str, str] | None:
    s = _norm(s)
    if not s:
        return None

    # prøv "Home - Away" / "Home vs Away"
    parts = _VS_SEP.split(s, maxsplit=1)
    if len(parts) == 2:
        home = _norm(parts[0])
        away = _norm(parts[1])
        if home and away:
            return (home, away)

    return None


def _parse_from_tables(tables: list[list[list[str]]], year: int, category: str, tv: str) -> list[dict]:
    """
    Heuristikk for tabeller:
    Finn rader som inneholder (dato, tid, home, away) i noen kolonner.
    """
    items: list[dict] = []
    seen: set[str] = set()

    for table in tables:
        for row in table:
            cells = [_norm(c or "") for c in row]
            cells = [c for c in cells if c]  # dropp tomme

            if len(cells) < 3:
                continue

            # finn tid-celle og dato-celle
            time_idx = None
            for i, c in enumerate(cells):
                if re.fullmatch(r"\d{1,2}:\d{2}", c):
                    time_idx = i
                    break
            if time_idx is None:
                continue

            # dato pleier å stå rett før tid, men ikke alltid
            date_candidates = []
            if time_idx - 1 >= 0:
                date_candidates.append((time_idx - 1, cells[time_idx - 1]))
            # fallback: alle celler
            for i, c in enumerate(cells):
                date_candidates.append((i, c))

            dt = None
            date_used_idx = None
            for i, dcell in date_candidates:
                dt = _parse_dt(dcell, cells[time_idx], year=year)
                if dt:
                    date_used_idx = i
                    break
            if not dt:
                continue
            if dt.year != year:
                continue

            # prøv å finne matchup:
            #  - enten i én celle "Team - Team"
            #  - eller i to naboceller etter tid/dato: home | away
            matchup = None

            # 1) scan alle celler for "Team - Team"
            for c in cells:
                matchup = _split_matchup(c)
                if matchup:
                    break

            # 2) hvis ikke, prøv home/away i kolonner rundt tid
            if not matchup:
                # start fra etter max(date_idx, time_idx)
                start_idx = max(date_used_idx or 0, time_idx) + 1
                if start_idx + 1 < len(cells):
                    home = cells[start_idx]
                    away = cells[start_idx + 1]
                    if home and away:
                        matchup = (home, away)

            if not matchup:
                continue

            home, away = matchup
            title = f"{home} – {away}"
            item = _mk_item(year, category, tv, dt, title)
            if item["id"] in seen:
                continue
            seen.add(item["id"])
            items.append(item)

    items.sort(key=lambda x: x.get("start") or "")
    return items


def _parse_from_text(text: str, year: int, category: str, tv: str) -> list[dict]:
    """
    Fallback tekst-parsing:
      - finn dato + tid
      - matchup kan ligge på samme linje eller neste
    """
    text = _norm(text).replace("\\n", "\n")
    # re-splitt mer robust
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

    # dato/tid på samme linje (flere formater for dato)
    dt_re = re.compile(
        r"(?P<date>"
        r"(?:\d{1,2}\.\d{1,2}(?:\.\d{4})?)|"
        r"(?:\d{1,2}/\d{1,2}/\d{4})|"
        r"(?:\d{4}-\d{1,2}-\d{1,2})|"
        r"(?:\d{1,2}\.?\s+[A-Za-zÆØÅæøå\.]+(?:\s+\d{4})?)"
        r")\s+"
        r"(?P<time>\d{1,2}:\d{2})",
        re.IGNORECASE,
    )

    items: list[dict] = []
    seen: set[str] = set()

    for i, ln in enumerate(lines):
        m = dt_re.search(ln)
        if not m:
            continue

        date_str = m.group("date")
        time_str = m.group("time")

        dt = _parse_dt(date_str, time_str, year=year)
        if not dt or dt.year != year:
            continue

        # matchup kandidat på samme linje etter dato/tid
        tail = _norm(ln[m.end() :]).strip(" |:-")
        candidates = []
        if tail:
            candidates.append(tail)
        if i + 1 < len(lines):
            candidates.append(lines[i + 1])

        matchup = None
        for cand in candidates:
            matchup = _split_matchup(cand)
            if matchup:
                break

        # ekstra fallback: "Home" på neste linje og "Away" på linja etter
        if not matchup and i + 2 < len(lines):
            h = _norm(lines[i + 1])
            a = _norm(lines[i + 2])
            if h and a and len(h) < 80 and len(a) < 80:
                matchup = (h, a)

        if not matchup:
            continue

        home, away = matchup
        title = f"{home} – {away}"
        item = _mk_item(year, category, tv, dt, title)
        if item["id"] in seen:
            continue
        seen.add(item["id"])
        items.append(item)

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

        # 1) prøv tabeller først
        try:
            tables = _pdf_tables(r.content)
        except Exception as e:
            tables = []
            print(f"[handball] WARN {gender}: table extract failed: {e}")

        items: list[dict] = []
        if tables:
            items = _parse_from_tables(tables, year=year, category=category, tv=tv)

        # 2) fallback til tekst hvis tabell ga lite/ingenting
        if len(items) < 10:
            text = _pdf_text(r.content)
            text_items = _parse_from_text(text, year=year, category=category, tv=tv)

            # merge (dedupe på id)
            by_id = {x["id"]: x for x in items}
            for x in text_items:
                by_id.setdefault(x["id"], x)
            items = sorted(by_id.values(), key=lambda x: x.get("start") or "")

            if not items:
                snippet = (text[:1400] or "").replace("\n", "\\n")
                print(f"[handball] WARN {gender}: parsed 0 items. Text snippet:\n{snippet}")

        print(f"[handball] {gender}: parsed {len(items)} items")
        return items

    men_items: list[dict] = []
    women_items: list[dict] = []

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
