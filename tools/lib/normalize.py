# tools/lib/normalize.py
from __future__ import annotations

import hashlib
from typing import Any
from tools.lib.timeutil import now_oslo_iso

DEFAULT_WHERE = ["Vikinghjørnet", "Gimle Pub"]

def stable_hash(parts: list[str]) -> str:
    raw = "|".join([p or "" for p in parts])
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:14]

def ensure_list_where(val: Any) -> list[str]:
    if val is None:
        return DEFAULT_WHERE.copy()
    if isinstance(val, list):
        return [str(x) for x in val if str(x).strip()]
    # allow string "A, B, C"
    s = str(val).strip()
    if not s:
        return DEFAULT_WHERE.copy()
    if "," in s:
        return [p.strip() for p in s.split(",") if p.strip()]
    return [s]

def normalize_item(raw: dict, source: dict, target_sport: str) -> dict:
    sport = source.get("sport") or target_sport
    season = source.get("season") or "2026"
    league = source.get("league") or raw.get("league") or raw.get("competition") or "Ukjent"

    # time fields
    start = raw.get("start") or raw.get("kickoff") or raw.get("datetime") or raw.get("date")
    if not start:
        raise ValueError("Missing start/kickoff/datetime/date")

    home = raw.get("home") or raw.get("homeTeam") or raw.get("home_name")
    away = raw.get("away") or raw.get("awayTeam") or raw.get("away_name")
    title = raw.get("title") or raw.get("name")

    channel = raw.get("channel") or raw.get("tv") or raw.get("broadcast") or None
    where = raw.get("where") or raw.get("pubs") or None

    # stable ID
    id_parts = [
        sport,
        league,
        season,
        str(start),
        str(home or title or ""),
        str(away or ""),
        source.get("id", "")
    ]
    item_id = f"{sport}_{stable_hash(id_parts)}"

    item = {
        "id": item_id,
        "sport": sport,
        "league": league,
        "season": season,
        "start": start,
        "home": home,
        "away": away,
        "title": title if (not home and not away) else None,
        "venue": raw.get("venue") or raw.get("location") or None,
        "country": raw.get("country") or None,
        "channel": channel,
        "where": ensure_list_where(where),
        "status": raw.get("status") or "scheduled",
        "source": {
            "id": source.get("id"),
            "provider": source.get("provider"),
            "url": source.get("url"),
        }
    }
    return item

def make_doc(meta: dict, items: list[dict]) -> dict:
    return {"meta": {**meta, "generated_at": now_oslo_iso()}, "items": items}
