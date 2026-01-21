from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)

TZ_OSLO = "+01:00"  # vi lagrer ISO med offset; (DST kan avvike, men appen viser i Europe/Oslo)
END = datetime(2026, 12, 31, 23, 59, 59, tzinfo=timezone.utc)

HEADERS = {"User-Agent": "GrenlandLiveBot/1.0 (+github-actions)"}


@dataclass(frozen=True)
class Game:
    home: str
    away: str
    kickoff: str  # ISO string
    venue: str = ""


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _within_window(iso: str) -> bool:
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except Exception:
        return False
    return _now_utc() <= dt <= END


def _read_json(path: Path, default_obj: Any) -> Any:
    if not path.exists():
        return default_obj
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default_obj


def _write_json(path: Path, obj: Any) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")
    print("WROTE", path.name)


def _merge_preserve_fields(new_games: List[Dict[str, Any]], existing_obj: Dict[str, Any]) -> Dict[str, Any]:
    """
    Behold channel/where fra eksisterende hvis match på (home, away, kickoff).
    """
    existing_games = existing_obj.get("games", []) if isinstance(existing_obj, dict) else []
    keep: Dict[Tuple[str, str, str], Dict[str, Any]] = {}
    for g in existing_games:
        try:
            key = (g.get("home", ""), g.get("away", ""), g.get("kickoff", ""))
            keep[key] = g
        except Exception:
            pass

    merged = []
    for g in new_games:
        key = (g.get("home", ""), g.get("away", ""), g.get("kickoff", ""))
        old = keep.get(key)
        if old:
            # behold kanal/puber hvis du har lagt inn manuelt
            if old.get("channel") and not g.get("channel"):
                g["channel"] = old["channel"]
            if old.get("where") and (not g.get("where")):
                g["where"] = old["where"]
        merged.append(g)

    return {"games": merged}


def _parse_fixture_text(text: str) -> List[Game]:
    """
    Robust regex-parser for sider som inneholder mønsteret:
    "Lag A - Lag B 10.05.2026 17:00"
    """
    # NB: bruker " - " (dash) som obos-ligaen.no typisk viser
    pat = re.compile(
        r"([A-Za-zÆØÅæøå0-9.\-()'’ ]+?)\s*-\s*([A-Za-zÆØÅæøå0-9.\-()'’ ]+?)\s+(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})"
    )
    out: List[Game] = []
    for m in pat.finditer(text):
        home = " ".join(m.group(1).split()).strip()
        away = " ".join(m.group(2).split()).strip()
        dmy = m.group(3)
        hm = m.group(4)

        dd, mm, yyyy = dmy.split(".")
        kickoff = f"{yyyy}-{mm}-{dd}T{hm}:00{TZ_OSLO}"

        if _within_window(kickoff):
            out.append(Game(home=home, away=away, kickoff=kickoff))

    # dedupe
    uniq: Dict[Tuple[str, str, str], Game] = {}
    for g in out:
        uniq[(g.home, g.away, g.kickoff)] = g
    return list(uniq.values())


def _fetch_page_text(url: str) -> str:
    r = requests.get(url, headers=HEADERS, timeout=45)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "lxml")
    return soup.get_text(" ", strip=True)


def update_eliteserien() -> None:
    url = "https://www.eliteserien.no/terminliste"
    path = DATA / "eliteserien.json"
    existing = _read_json(path, {"games": []})

    try:
        text = _fetch_page_text(url)
        games = _parse_fixture_text(text)
        games.sort(key=lambda g: g.kickoff)

        new_games = [
            {"home": g.home, "away": g.away, "kickoff": g.kickoff, "channel": "", "where": []}
            for g in games
        ]
        obj = _merge_preserve_fields(new_games, existing)
        _write_json(path, obj)
    except Exception as e:
        print("WARN eliteserien update failed:", e)
        # skriv eksisterende på nytt (ryddig)
        _write_json(path, existing)


def update_obos() -> None:
    url = "https://www.obos-ligaen.no/terminliste"
    path = DATA / "obos.json"
    existing = _read_json(path, {"games": []})

    try:
        text = _fetch_page_text(url)
        games = _parse_fixture_text(text)
        games.sort(key=lambda g: g.kickoff)

        new_games = [
            {"home": g.home, "away": g.away, "kickoff": g.kickoff, "channel": "", "where": []}
            for g in games
        ]
        obj = _merge_preserve_fields(new_games, existing)
        _write_json(path, obj)
    except Exception as e:
        print("WARN obos update failed:", e)
        _write_json(path, existing)


def ensure_other_files_exist() -> None:
    defaults: Dict[str, Any] = {
        "premier_league.json": {"games": []},
        "champions.json": {"games": []},
        "laliga.json": {"games": []},
        "handball_vm_2026_menn.json": {"games": []},
        "handball_vm_2026_damer.json": {"games": []},
        "vintersport_menn.json": {"events": []},
        "vintersport_kvinner.json": {"events": []},
        "vm2026.json": {"matches": []},
    }
    for fn, default in defaults.items():
        p = DATA / fn
        obj = _read_json(p, default)
        _write_json(p, obj)


def main() -> None:
    print("Updating data now -> 31.12.2026")
    update_eliteserien()
    update_obos()
    ensure_other_files_exist()
    print("DONE")


if __name__ == "__main__":
    main()
