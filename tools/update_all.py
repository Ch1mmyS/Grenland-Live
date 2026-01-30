# tools/update_all.py
from __future__ import annotations

import sys
import json
import traceback
from pathlib import Path

# --- ensure repo root is on PYTHONPATH ---
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.lib.normalize import make_doc, normalize_item
from tools.lib.schema import validate_doc
from tools.lib.timeutil import now_oslo_iso

from tools.providers.nff_ics import fetch as fetch_nff_ics
from tools.providers.fixturedownload_json import fetch as fetch_fd_json
from tools.providers.biathlon_api import fetch as fetch_biathlon

SOURCES_PATH = Path("data/_meta/sources.json")
STATUS_PATH  = Path("data/_meta/pipeline_status.json")

# Files your FRONTEND expects (legacy paths)
LEGACY_FOOTBALL_FILES = {
    "Eliteserien": "data/eliteserien.json",
    "OBOS-ligaen": "data/obos.json",
    "Premier League": "data/premier_league.json",
    "Champions League": "data/champions.json",
    "La Liga": "data/laliga.json",
}

LEGACY_ALIAS_FILES = {
    "data/handball_vm_2026_menn.json": "data/2026/handball_men.json",
    "data/handball_vm_2026_damer.json": "data/2026/handball_women.json",
    "data/vintersport_menn.json": "data/2026/wintersport_men.json",
    "data/vintersport_kvinner.json": "data/2026/wintersport_women.json",
}

def _write_json(path: Path, obj: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")

def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))

def _load_conf() -> dict:
    return json.loads(SOURCES_PATH.read_text(encoding="utf-8"))

def _record_error(status: dict, out_path: str, exc: Exception) -> None:
    status["targets"][out_path] = {
        "ok": False,
        "items": 0,
        "error": str(exc),
        "traceback": traceback.format_exc()
    }

def _empty_doc(*, sport: str, name: str, season: str, source_ids: list[str]) -> dict:
    doc = {
        "meta": {
            "season": season,
            "sport": sport,
            "name": name,
            "generated_at": now_oslo_iso(),
            "source_ids": source_ids
        },
        "items": []
    }
    validate_doc(doc)
    return doc

# ---------------- FOOTBALL (2026 aggregate) ----------------
def _run_football(conf: dict) -> tuple[int, list[str]]:
    year = str(conf["year"])
    out_path = Path(conf["outputs"]["football"])

    items: list[dict] = []
    source_ids: list[str] = []

    for src in conf["sports"]["football"]:
        if not src.get("enabled", True):
            continue

        key = src["key"]
        name = src["name"]
        typ = src["type"]
        url = src["url"]
        default_tv = src.get("default_tv")

        source_ids.append(key)

        if typ == "nff_ics":
            events = fetch_nff_ics(url)
        elif typ == "fixturedownload_json":
            events = fetch_fd_json(url)
        else:
            raise RuntimeError(f"Unknown football type: {typ} ({key})")

        for ev in events:
            items.append(normalize_item(
                sport="football",
                season=year,
                league=name,
                start=ev["start"],
                home=ev.get("home"),
                away=ev.get("away"),
                title=ev.get("title"),
                channel=default_tv,
                where=None,
                venue=ev.get("venue"),
                country=None,
                status="scheduled",
                source_id=key,
                source_type=typ,
                source_url=url
            ))

    items.sort(key=lambda x: x["start"])

    doc = make_doc(
        sport="football",
        name="Football 2026",
        season=year,
        source_ids=source_ids,
        items=items
    )
    validate_doc(doc)
    _write_json(out_path, doc)
    return len(items), source_ids

# ---------------- HANDBALL (2026 men/women) ----------------
def _run_handball(conf: dict, gender: str) -> tuple[int, list[str]]:
    year = str(conf["year"])
    out_path = Path(conf["outputs"][f"handball_{gender}"])

    items: list[dict] = []
    source_ids: list[str] = []

    from tools.providers.handball_pdf import fetch as fetch_handball_pdf

    for src in conf["sports"]["handball"][gender]:
        if not src.get("enabled", True):
            continue

        key = src["key"]
        name = src["name"]
        typ = src["type"]
        channel = src.get("channel")
        pdf_url = src.get("pdf_url")

        source_ids.append(key)

        if typ != "handball_pdf":
            raise RuntimeError(f"Unknown handball type: {typ} ({key})")
        if not pdf_url:
            raise RuntimeError(f"{key}: pdf_url is empty")

        events = fetch_handball_pdf(pdf_url)

        for ev in events:
            items.append(normalize_item(
                sport="handball",
                season=year,
                league=name,
                start=ev["start"],
                home=ev.get("home"),
                away=ev.get("away"),
                title=ev.get("title"),
                channel=channel,
                where=None,
                venue=ev.get("venue"),
                country=None,
                status="scheduled",
                source_id=key,
                source_type="handball_pdf",
                source_url=pdf_url
            ))

    items.sort(key=lambda x: x["start"])

    doc = make_doc(
        sport="handball",
        name=f"Handball {gender.capitalize()} 2026",
        season=year,
        source_ids=source_ids,
        items=items
    )
    validate_doc(doc)
    _write_json(out_path, doc)
    return len(items), source_ids

# ---------------- WINTERSPORT (2026 men/women) ----------------
def _run_wintersport(conf: dict, gender: str) -> tuple[int, list[str]]:
    year = str(conf["year"])
    out_path = Path(conf["outputs"][f"wintersport_{gender}"])

    items: list[dict] = []
    source_ids: list[str] = []

    for src in conf["sports"]["wintersport"][gender]:
        if not src.get("enabled", True):
            continue

        key = src["key"]
        name = src["name"]
        typ = src["type"]
        channel = src.get("channel")
        api = src["api"]

        source_ids.append(key)

        if typ != "biathlon_api":
            raise RuntimeError(f"Unknown wintersport type: {typ} ({key})")

        base_url = api["base_url"].replace("https://api.biathlonresults.com", "https://biathlonresults.com").rstrip("/")
        season_id = int(api["season_id"])
        level = int(api.get("level", 3))

        events = fetch_biathlon(base_url=base_url, season_id=season_id, level=level, gender=gender)

        for ev in events:
            items.append(normalize_item(
                sport="wintersport",
                season=year,
                league=name,
                start=ev["start"],
                home=None,
                away=None,
                title=ev.get("title"),
                channel=channel,
                where=None,
                venue=ev.get("venue"),
                country=None,
                status="scheduled",
                source_id=key,
                source_type="biathlon_api",
                source_url=f"{base_url}/Events?SeasonId={season_id}&Level={level}"
            ))

    items.sort(key=lambda x: x["start"])

    doc = make_doc(
        sport="wintersport",
        name=f"Wintersport {gender.capitalize()} 2026",
        season=year,
        source_ids=source_ids,
        items=items
    )
    validate_doc(doc)
    _write_json(out_path, doc)
    return len(items), source_ids

# ---------------- LEGACY WRITERS (always create files to stop 404) ----------------
def _write_legacy_football_per_league(conf: dict) -> dict[str, int]:
    """
    Always writes:
      data/eliteserien.json, data/obos.json, data/premier_league.json, data/champions.json, data/laliga.json
    If data/2026/football.json exists -> filter by league.
    Else -> write empty docs (still prevents 404).
    """
    year = str(conf["year"])
    src_path = Path(conf["outputs"]["football"])

    if src_path.exists():
        src_doc = _read_json(src_path)
        src_items = src_doc.get("items", [])
        generated_at = (src_doc.get("meta") or {}).get("generated_at", now_oslo_iso())
        source_ids = (src_doc.get("meta") or {}).get("source_ids", [])
    else:
        src_items = []
        generated_at = now_oslo_iso()
        source_ids = []

    counts: dict[str, int] = {}

    for league_name, out_file in LEGACY_FOOTBALL_FILES.items():
        out_path = Path(out_file)
        league_items = [it for it in src_items if it.get("league") == league_name]
        league_items.sort(key=lambda x: x.get("start") or "")

        out_doc = {
            "meta": {
                "season": year,
                "sport": "football",
                "name": league_name,
                "generated_at": generated_at,
                "source_ids": source_ids
            },
            "items": league_items
        }
        validate_doc(out_doc)
        _write_json(out_path, out_doc)
        counts[out_file] = len(league_items)

    return counts

def _write_legacy_alias_copies(conf: dict) -> dict[str, str]:
    """
    Always writes:
      data/handball_vm_2026_menn.json
      data/handball_vm_2026_damer.json
      data/vintersport_menn.json
      data/vintersport_kvinner.json
    If source exists -> copy.
    Else -> write empty docs (still prevents 404).
    """
    year = str(conf["year"])
    results: dict[str, str] = {}

    for legacy_path, src_path in LEGACY_ALIAS_FILES.items():
        dst = Path(legacy_path)
        src = Path(src_path)

        if src.exists():
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
            results[legacy_path] = f"copied from {src_path}"
        else:
            # write empty doc as safe fallback
            if "handball" in legacy_path:
                doc = _empty_doc(sport="handball", name=dst.stem, season=year, source_ids=[])
            else:
                doc = _empty_doc(sport="wintersport", name=dst.stem, season=year, source_ids=[])
            _write_json(dst, doc)
            results[legacy_path] = f"wrote empty (missing {src_path})"

    return results

def main():
    conf = _load_conf()

    status = {
        "last_run": now_oslo_iso(),
        "targets": {},
        "legacy": {}
    }

    # 2026 targets (these may fail, but we still write legacy fallbacks)
    # Football aggregate
    out = conf["outputs"]["football"]
    try:
        n, srcs = _run_football(conf)
        status["targets"][out] = {"ok": True, "items": n, "sources": srcs}
    except Exception as e:
        _record_error(status, out, e)

    # Handball men/women
    for gender in ("men", "women"):
        out = conf["outputs"][f"handball_{gender}"]
        try:
            n, srcs = _run_handball(conf, gender)
            status["targets"][out] = {"ok": True, "items": n, "sources": srcs}
        except Exception as e:
            _record_error(status, out, e)

    # Wintersport men/women
    for gender in ("men", "women"):
        out = conf["outputs"][f"wintersport_{gender}"]
        try:
            n, srcs = _run_wintersport(conf, gender)
            status["targets"][out] = {"ok": True, "items": n, "sources": srcs}
        except Exception as e:
            _record_error(status, out, e)

    # Legacy outputs (always create files to stop frontend 404)
    try:
        counts = _write_legacy_football_per_league(conf)
        status["legacy"]["football_per_league"] = {"ok": True, "counts": counts}
    except Exception as e:
        status["legacy"]["football_per_league"] = {"ok": False, "error": str(e), "traceback": traceback.format_exc()}

    try:
        results = _write_legacy_alias_copies(conf)
        status["legacy"]["aliases"] = {"ok": True, "results": results}
    except Exception as e:
        status["legacy"]["aliases"] = {"ok": False, "error": str(e), "traceback": traceback.format_exc()}

    _write_json(STATUS_PATH, status)

    print("---- pipeline_status.json ----")
    print(json.dumps(status, ensure_ascii=False, indent=2))
    print("---- end ----")

    # Always exit 0 so Pages keeps updating (status.json shows failures)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
