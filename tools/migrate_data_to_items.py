#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo

OSLO = ZoneInfo("Europe/Oslo")

ROOT = Path(__file__).resolve().parents[1]
DATA_2026 = ROOT / "data" / "2026"

FILES = {
    "football": DATA_2026 / "football.json",
    "handball_men": DATA_2026 / "handball_men.json",
    "handball_women": DATA_2026 / "handball_women.json",
    "wintersport_men": DATA_2026 / "wintersport_men.json",
    "wintersport_women": DATA_2026 / "wintersport_women.json",
}


def _now_oslo_iso() -> str:
    return datetime.now(OSLO).isoformat(timespec="seconds")


def _read_json(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, obj: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def _parse_iso(s: str) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s)
    except Exception:
        return None


def _in_year_2026(dt: datetime) -> bool:
    # dt kan være naive eller aware
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=OSLO)
    dt_oslo = dt.astimezone(OSLO)
    return dt_oslo.year == 2026


def _mk_wrapper(items: list[dict], generated_at: str | None = None) -> dict:
    return {
        "timezone": "Europe/Oslo",
        "seasonYear": 2026,
        "generatedAt": generated_at or _now_oslo_iso(),
        "items": items,
    }


def _football_matches_to_items(src: dict) -> list[dict]:
    matches = src.get("matches") or []
    out: list[dict] = []

    for m in matches:
        if not isinstance(m, dict):
            continue

        start = m.get("iso") or m.get("start")
        dt = _parse_iso(start)
        if not dt or not _in_year_2026(dt):
            continue

        where_val = m.get("watchAt")
        where = []
        if isinstance(where_val, str) and where_val.strip():
            where = [where_val.strip()]
        elif isinstance(where_val, list):
            where = [str(x).strip() for x in where_val if str(x).strip()]

        item = {
            "sport": "football",
            "category": (m.get("competition") or "").strip() or "Football",
            "start": dt.astimezone(OSLO).isoformat(timespec="seconds"),
            "title": (m.get("match") or m.get("title") or "").strip(),
            "where": where,
            "tv": (m.get("tv") or "").strip(),
        }

        note = m.get("note")
        if isinstance(note, str) and note.strip():
            item["note"] = note.strip()

        # Kun ta med hvis title finnes
        if item["title"]:
            out.append(item)

    out.sort(key=lambda x: x.get("start") or "")
    return out


def _generic_to_items(src: dict, sport: str, default_category: str) -> list[dict]:
    """
    Hvis filen har games/events/matches fra før, prøver vi å mappe.
    Hvis tom/ukjent, ender vi med [].
    """
    # Finn først en liste i kjent nøkkel
    lst = None
    for key in ("items", "games", "events", "matches"):
        if isinstance(src.get(key), list):
            lst = src.get(key)
            break
    if lst is None:
        return []

    out: list[dict] = []
    for e in lst:
        if not isinstance(e, dict):
            continue

        start = e.get("start") or e.get("iso") or e.get("kickoff") or e.get("date")
        dt = _parse_iso(start) if isinstance(start, str) else None
        if not dt or not _in_year_2026(dt):
            continue

        title = (e.get("title") or e.get("match") or "").strip()
        category = (e.get("category") or e.get("competition") or e.get("league") or default_category).strip()

        where_val = e.get("where") or e.get("watchAt") or []
        where = []
        if isinstance(where_val, str) and where_val.strip():
            where = [where_val.strip()]
        elif isinstance(where_val, list):
            where = [str(x).strip() for x in where_val if str(x).strip()]

        tv_val = e.get("tv") or e.get("channel") or ""
        tv = tv_val if isinstance(tv_val, str) else ""

        item = {
            "sport": sport,
            "category": category or default_category,
            "start": dt.astimezone(OSLO).isoformat(timespec="seconds"),
            "title": title,
            "where": where,
            "tv": tv.strip(),
        }

        note = e.get("note")
        if isinstance(note, str) and note.strip():
            item["note"] = note.strip()

        if item["title"]:
            out.append(item)

    out.sort(key=lambda x: x.get("start") or "")
    return out


def main() -> None:
    # Football: spesial-konvertering fra matches-formatet ditt
    fb_src = _read_json(FILES["football"])
    fb_items = _football_matches_to_items(fb_src)
    _write_json(FILES["football"], _mk_wrapper(fb_items))

    # Handball + Wintersport: normaliser til samme wrapper
    hb_m_src = _read_json(FILES["handball_men"])
    hb_w_src = _read_json(FILES["handball_women"])
    ws_m_src = _read_json(FILES["wintersport_men"])
    ws_w_src = _read_json(FILES["wintersport_women"])

    hb_m_items = _generic_to_items(hb_m_src, "handball", "Handball")
    hb_w_items = _generic_to_items(hb_w_src, "handball", "Handball")
    ws_m_items = _generic_to_items(ws_m_src, "wintersport", "Wintersport")
    ws_w_items = _generic_to_items(ws_w_src, "wintersport", "Wintersport")

    _write_json(FILES["handball_men"], _mk_wrapper(hb_m_items))
    _write_json(FILES["handball_women"], _mk_wrapper(hb_w_items))
    _write_json(FILES["wintersport_men"], _mk_wrapper(ws_m_items))
    _write_json(FILES["wintersport_women"], _mk_wrapper(ws_w_items))

    print("DONE: normalized data/2026/*.json to {items: [...]}, year=2026")


if __name__ == "__main__":
    main()
