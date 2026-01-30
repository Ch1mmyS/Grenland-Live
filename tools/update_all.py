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

# --- Legacy/compat outputs expected by current frontend (GitHub Pages) ---
LEGACY_FOOTBALL_FILES = {
    "Eliteserien": "data/eliteserien.json",
    "OBOS-ligaen": "data/obos.json",
    "Premier League": "data/premier_league.json",
    "Champions League": "data/champions.json",
    "La Liga": "data/laliga.json",
}
LEGACY_ALIASES = {
    # handball old names
    "data/handball_vm_2026_menn.json": "data/2026/handball_men.json",
    "data/handball_vm_2026_damer.json": "data/2026/handball_women.json",
    # wintersport old names (vintersport + kjønn)
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

# ---------------- FOOTBALL ----------------
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

# ---------------- HANDBALL ----------------
def _run_handball(conf: dict, gender: str) -> tuple[int, list[str]]:
    """
    Uses PDF feed if enabled.
    If pypdf missing or pdf_url empty, throws and will be caught per-target.
    """
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

# ---------------- WINTERSPORT ----------------
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

        # hard-fix if someone used the wrong host
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

# ---------------- LEGACY COMPAT WRITES ----------------
def _write_legacy_from_football_2026(football_2026_path: Path) -> dict[str, int]:
    """
    Create old per-league files in data/*.json so frontend stops 404.
    Reads data/2026/football.json (items-format) and filters by league.
    """
    if not football_2026_path.exists():
        return {k: 0 for k in LEGACY_FOOTBALL_FILES.values()}

    doc = _read_json(football_2026_path)
    items = doc.get("items", [])
    meta = doc.get("meta", {})
    season = str(meta.get("season", "2026"))

    counts: dict[str, int] = {}

    for league_name, out_file in LEGACY_FOOTBALL_FILES.items():
        out_path = Path(out_file)
        league_items = [it for it in items if it.get("league") == league_name]
        league_items.sort(key=lambda x: x.get("start") or "")

        out_doc = {
            "meta": {
                "season": season,
                "sport": "football",
                "name": league_name,
                "generated_at": meta.get("generated_at"),
                "source_ids": meta.get("source_ids", [])
            },
            "items": league_items
        }
        validate_doc(out_doc)
        _write_json(out_path, out_doc)
        counts[out_file] = len(league_items)

    return counts

def _write_alias_copies() -> dict[str, str]:
    """
    Create old filenames as copies of current 2026 outputs.
    """
    results: dict[str, str] = {}
    for legacy_path, src_path in LEGACY_ALIASES.items():
        src = Path(src_path)
        dst = Path(legacy_path)
        if not src.exists():
            results[legacy_path] = f"missing source: {src_path}"
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
        results[legacy_path] = f"copied from {src_path}"
    return results

def main():
    conf = _load_conf()

    status = {
        "last_run": now_oslo_iso(),
        "targets": {},
        "legacy": {}
    }

    # Run 2026 targets
    # Football
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

    # Write legacy/compat files so frontend stops 404
    try:
        football_2026_path = Path(conf["outputs"]["football"])
        legacy_counts = _write_legacy_from_football_2026(football_2026_path)
        status["legacy"]["football_per_league"] = {"ok": True, "counts": legacy_counts}
    except Exception as e:
        status["legacy"]["football_per_league"] = {"ok": False, "error": str(e), "traceback": traceback.format_exc()}

    try:
        alias_results = _write_alias_copies()
        status["legacy"]["aliases"] = {"ok": True, "results": alias_results}
    except Exception as e:
        status["legacy"]["aliases"] = {"ok": False, "error": str(e), "traceback": traceback.format_exc()}

    _write_json(STATUS_PATH, status)

    # Always green; inspect pipeline_status.json for failures
    print("---- pipeline_status.json ----")
    print(json.dumps(status, ensure_ascii=False, indent=2))
    print("---- end ----")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
