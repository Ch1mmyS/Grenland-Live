# tools/lib/normalize.py
from __future__ import annotations
import hashlib
from typing import Any
from tools.lib.timeutil import now_oslo_iso

DEFAULT_WHERE = ["Vikinghjørnet", "Gimle Pub"]

def stable_id(*parts: str) -> str:
    raw = "|".join([p or "" for p in parts])
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:14]

def ensure_where(v: Any) -> list[str]:
    if v is None:
        return DEFAULT_WHERE.copy()
    if isinstance(v, list):
        out = [str(x).strip() for x in v if str(x).strip()]
        return out if out else DEFAULT_WHERE.copy()
    s = str(v).strip()
    if not s:
        return DEFAULT_WHERE.copy()
    if "," in s:
        out = [p.strip() for p in s.split(",") if p.strip()]
        return out if out else DEFAULT_WHERE.copy()
    return [s]

def make_doc(*, sport: str, name: str, season: str, source_ids: list[str], items: list[dict]) -> dict:
    return {
        "meta": {
            "season": season,
            "sport": sport,
            "name": name,
            "generated_at": now_oslo_iso(),
            "source_ids": source_ids
        },
        "items": items
    }

def normalize_item(
    *,
    sport: str,
    season: str,
    league: str,
    start: str,
    home: str | None,
    away: str | None,
    title: str | None,
    channel: str | None,
    where: Any,
    venue: str | None,
    country: str | None,
    status: str | None,
    source_id: str,
    source_type: str,
    source_url: str | None
) -> dict:
    item_id = f"{sport}_{stable_id(sport, league, season, start, home or title or '', away or '', source_id)}"
    return {
        "id": item_id,
        "sport": sport,
        "league": league,
        "season": season,
        "start": start,
        "home": home,
        "away": away,
        "title": title if (not home and not away) else None,
        "venue": venue,
        "country": country,
        "channel": channel,
        "where": ensure_where(where),
        "status": status or "scheduled",
        "source": {
            "id": source_id,
            "provider": source_type,
            "url": source_url
        }
    }
