import json
import re
from datetime import datetime
from typing import Dict, Any, List, Tuple

import pytz
import requests

OSLO = pytz.timezone("Europe/Oslo")


def _now_iso() -> str:
    return datetime.now(OSLO).isoformat()


def _load_sources() -> Dict[str, Any]:
    with open("data/winter_sources.json", "r", encoding="utf-8") as f:
        return json.load(f)


def _get(url: str) -> str:
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    return r.text


def _infer_gender_and_title(competition_name: str) -> Tuple[str, str]:
    s = (competition_name or "").strip()

    # Typisk: "Sprint Women", "Pursuit Men", "Men 10 km Sprint", osv
    low = s.lower()

    gender = "mixed"
    if "women" in low or re.search(r"\b(w)\b", low) and "women" in low:
        gender = "women"
    if "men" in low:
        gender = "men"
    if "junior" in low:
        # vi beholder junior i samme bucket som kjønn (om det står men/women)
        pass

    title = s
    return gender, title


def _xml_attr(xml: str, tag: str) -> List[str]:
    # superenkel xml-plukk (APIet leverer ofte XML)
    # Vi bruker regex for å slippe xml-parser edgecases i GH Actions
    pattern = re.compile(rf"<{tag}>(.*?)</{tag}>", re.DOTALL)
    return [m.group(1).strip() for m in pattern.finditer(xml)]


def _parse_events_xml(xml: str) -> List[Dict[str, Any]]:
    # Hver <Event> ... </Event>
    events = []
    for block in re.findall(r"<Event\b.*?>.*?</Event>", xml, flags=re.DOTALL):
        def one(tag: str) -> str:
            m = re.search(rf"<{tag}>(.*?)</{tag}>", block, flags=re.DOTALL)
            return (m.group(1).strip() if m else "")

        events.append({
            "EventId": one("EventId"),
            "Description": one("Description"),
            "ShortDescription": one("ShortDescription"),
            "Nat": one("Nat"),
            "StartDate": one("StartDate"),
            "EndDate": one("EndDate"),
            "Level": one("Level"),
        })
    return events


def _parse_competitions_xml(xml: str) -> List[Dict[str, Any]]:
    comps = []
    for block in re.findall(r"<Competition\b.*?>.*?</Competition>", xml, flags=re.DOTALL):
        def one(tag: str) -> str:
            m = re.search(rf"<{tag}>(.*?)</{tag}>", block, flags=re.DOTALL)
            return (m.group(1).strip() if m else "")

        comps.append({
            "RaceId": one("RaceId"),
            "CompetitionName": one("CompetitionName"),
            "StartTime": one("StartTime"),
            "Location": one("Location"),
            "Nat": one("Nat"),
            "Discipline": one("Discipline"),
        })
    return comps


def _to_oslo_iso(utc_or_iso: str) -> str:
    """
    SportAPI StartTime er ofte ISO (UTC). Vi gjør om til Europe/Oslo.
    """
    s = (utc_or_iso or "").strip()
    if not s:
        return ""

    # Prøv flere formater:
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%d %H:%M:%S"):
        try:
            dt = datetime.strptime(s.replace("Z", ""), fmt)
            dt = pytz.utc.localize(dt)
            return dt.astimezone(OSLO).isoformat()
        except Exception:
            pass

    # fallback: la det stå (men det funker ofte i Date(...) i JS uansett)
    return s


def main() -> None:
    cfg = _load_sources()["biathlon"]
    base = cfg["base_url"].rstrip("/")
    season_id = int(cfg["season_id"])
    level = int(cfg.get("level", 3))

    # 1) hent alle events (World Cup/OWG/WCH osv)
    events_url = f"{base}/Events?SeasonId={season_id}&Level={level}"
    events_xml = _get(events_url)
    events = _parse_events_xml(events_xml)

    all_games_m: List[Dict[str, Any]] = []
    all_games_w: List[Dict[str, Any]] = []

    # 2) for hvert event, hent competitions (renn)
    for ev in events:
        event_id = ev.get("EventId")
        if not event_id:
            continue

        comps_url = f"{base}/Competitions?EventId={event_id}"
        try:
            comps_xml = _get(comps_url)
        except Exception:
            continue

        comps = _parse_competitions_xml(comps_xml)

        for c in comps:
            start = _to_oslo_iso(c.get("StartTime", ""))
            if not start:
                continue

            g, title = _infer_gender_and_title(c.get("CompetitionName", ""))

            game = {
                "league": "Skiskyting (IBU)",
                "title": title,
                "start": start,
                "channel": "NRK / TV 2 (varierer)",
                "where": [],
                "kind": "wintersport",
                "gender": ("men" if g == "men" else "women" if g == "women" else "mixed"),
                "meta": {
                    "event": ev.get("ShortDescription") or ev.get("Description"),
                    "nation": ev.get("Nat") or c.get("Nat"),
                    "location": c.get("Location") or ""
                }
            }

            if game["gender"] == "men":
                all_games_m.append(game)
            elif game["gender"] == "women":
                all_games_w.append(game)
            else:
                # mixed -> putt i begge (så du ser det uansett)
                all_games_m.append(game)
                all_games_w.append(game)

    # sort + dedupe
    def dedupe(arr: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        seen = set()
        out = []
        for x in sorted(arr, key=lambda z: z["start"]):
            k = (x["start"], x.get("title"))
            if k in seen:
                continue
            seen.add(k)
            out.append(x)
        return out

    all_games_m = dedupe(all_games_m)
    all_games_w = dedupe(all_games_w)

    with open("data/vintersport_menn.json", "w", encoding="utf-8") as f:
        json.dump({"events": all_games_m, "updatedAt": _now_iso()}, f, ensure_ascii=False, indent=2)

    with open("data/vintersport_kvinner.json", "w", encoding="utf-8") as f:
        json.dump({"events": all_games_w, "updatedAt": _now_iso()}, f, ensure_ascii=False, indent=2)

    print(f"WROTE data/vintersport_menn.json -> {len(all_games_m)} events")
    print(f"WROTE data/vintersport_kvinner.json -> {len(all_games_w)} events")


if __name__ == "__main__":
    main()
