# tools/providers/biathlon_api.py
from __future__ import annotations
import json
from tools.lib.http import get_text
from tools.lib.timeutil import to_oslo_iso_from_iso

def _gender_matches(ev: dict, gender: str) -> bool:
    """
    gender: "men" or "women"
    API is not 100% consistent across years; we do best-effort.
    """
    g = (ev.get("Gender") or ev.get("gender") or ev.get("Sex") or ev.get("sex") or "").strip().lower()
    if not g:
        return True  # if not provided, let it pass (we'll tag by output anyway)
    men_vals = {"m", "men", "male", "mann", "h"}
    women_vals = {"w", "women", "female", "kvinne", "d"}
    if gender == "men":
        return g in men_vals
    return g in women_vals

def fetch(*, base_url: str, season_id: int, level: int, gender: str) -> list[dict]:
    base_url = base_url.rstrip("/")
    url = f"{base_url}/Events?Level={int(level)}&SeasonId={int(season_id)}"
    text = get_text(url)
    data = json.loads(text)

    # the API often returns a list
    if isinstance(data, dict):
        # sometimes wrapped
        for k in ("Events", "events", "Items", "items"):
            if k in data and isinstance(data[k], list):
                data = data[k]
                break

    if not isinstance(data, list):
        raise RuntimeError("Biathlon API: expected list response for Events")

    out: list[dict] = []
    for ev in data:
        if not isinstance(ev, dict):
            continue

        # common fields we try:
        # StartTime, Date, StartDate, EndDate ...
        dt = ev.get("StartTime") or ev.get("startTime") or ev.get("StartDate") or ev.get("Date") or ev.get("date")
        if not dt:
            continue

        if not _gender_matches(ev, gender):
            continue

        start_oslo = to_oslo_iso_from_iso(str(dt))

        # title composition
        venue = ev.get("Location") or ev.get("Venue") or ev.get("Organizer") or None
        comp = ev.get("EventName") or ev.get("Name") or ev.get("ShortDescription") or ev.get("Description") or "Skiskyting"
        out.append({
            "start": start_oslo,
            "title": str(comp),
            "home": None,
            "away": None,
            "venue": venue
        })

    return out
