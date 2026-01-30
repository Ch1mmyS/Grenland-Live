# tools/update_all.py
from __future__ import annotations

import json
from pathlib import Path

from tools.lib.normalize import make_doc, normalize_item
from tools.lib.schema import validate_doc
from tools.lib.timeutil import now_oslo_iso

from tools.providers.nff_ics import fetch as fetch_nff_ics
from tools.providers.fixturedownload_json import fetch as fetch_fd_json
from tools.providers.biathlon_api import fetch as fetch_biathlon
from tools.providers.handball_pdf import fetch as fetch_handball_pdf

SOURCES_PATH = Path("data/_meta/sources.json")
STATUS_PATH = Path("data/_meta/pipeline_status.json")

def _write_json(path: Path, obj: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")

def _load_conf() -> dict:
    return json.loads(SOURCES_PATH.read_text(encoding="utf-8"))

def _run_football(conf: dict) -> tuple[dict, int]:
    year = str(conf.get("year", 2026))
    out_path = Path(conf["outputs"]["football"])

    items: list[dict] = []
    source_ids: list[str] = []

    for src in conf["sports"]["football"]:
        key = src["key"]
        name = src.get("name", key)
        typ = src["type"]
        url = src.get("url")
        default_tv = src.get("default_tv")

        source_ids.append(key)

        if typ == "nff_ics":
            events = fetch_nff_ics(url)
        elif typ == "fixturedownload_json":
            events = fetch_fd_json(url)
        else:
            raise RuntimeError(f"Unknown football type: {typ} ({key})")

        for ev in events:
            start = ev["start"]
            home = ev.get("home")
            away = ev.get("away")
            title = ev.get("title")
            venue = ev.get("venue")

            items.append(normalize_item(
                sport="football",
                season=year,
                league=name,
                start=start,
                home=home,
                away=away,
                title=title,
                channel=default_tv,
                where=None,
                venue=venue,
                country=None,
                status="scheduled",
                source_id=key,
                source_type=typ,
                source_url=url
            ))

    items.sort(key=lambda x: x.get("start") or "")
    doc = make_doc(sport="football", name="Football 2026", season=year, source_ids=source_ids, items=items)
    validate_doc(doc)
    _write_json(out_path, doc)
    return doc, len(items)

def _run_handball(conf: dict, gender: str) -> tuple[dict | None, int, str | None]:
    year = str(conf.get("year", 2026))
    out_key = f"handball_{gender}"
    out_path = Path(conf["outputs"][out_key])

    sources = conf["sports"]["handball"][gender]
    items: list[dict] = []
    source_ids: list[str] = []

    for src in sources:
        key = src["key"]
        name = src.get("name", key)
        typ = src["type"]
        channel = src.get("channel")
        pdf_url = src.get("pdf_url")

        source_ids.append(key)

        if typ != "handball_pdf":
            raise RuntimeError(f"Unknown handball type: {typ} ({key})")

        if not pdf_url:
            return None, 0, f"{key}: pdf_url is empty"

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
                source_type=typ,
                source_url=pdf_url
            ))

    items.sort(key=lambda x: x.get("start") or "")
    doc = make_doc(sport="handball", name=f"Handball {gender.capitalize()} 2026", season=year, source_ids=source_ids, items=items)
    validate_doc(doc)
    _write_json(out_path, doc)
    return doc, len(items), None

def _run_wintersport(conf: dict, gender: str) -> tuple[dict, int]:
    year = str(conf.get("year", 2026))
    out_key = f"wintersport_{gender}"
    out_path = Path(conf["outputs"][out_key])

    sources = conf["sports"]["wintersport"][gender]
    items: list[dict] = []
    source_ids: list[str] = []

    for src in sources:
        key = src["key"]
        name = src.get("name", key)
        typ = src["type"]
        channel = src.get("channel")

        source_ids.append(key)

        if typ != "biathlon_api":
            raise RuntimeError(f"Unknown wintersport type: {typ} ({key})")

        api = src["api"]
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
                source_type=typ,
                source_url=f"{base_url}/Events?Level={level}&SeasonId={season_id}"
            ))

    items.sort(key=lambda x: x.get("start") or "")
    doc = make_doc(sport="wintersport", name=f"Wintersport {gender.capitalize()} 2026", season=year, source_ids=source_ids, items=items)
    validate_doc(doc)
    _write_json(out_path, doc)
    return doc, len(items)

def main():
    conf = _load_conf()

    status = {
        "last_run": now_oslo_iso(),
        "targets": {}
    }

    failed_any = False

    # Football
    try:
        _, n = _run_football(conf)
        status["targets"][conf["outputs"]["football"]] = {"ok": True, "items": n}
    except Exception as e:
        failed_any = True
        status["targets"][conf["outputs"]["football"]] = {"ok": False, "items": 0, "error": str(e)}

    # Handball men/women
    for gender in ("men", "women"):
        out_key = f"handball_{gender}"
        out_path = conf["outputs"][out_key]
        try:
            doc, n, warn = _run_handball(conf, gender)
            if warn:
                status["targets"][out_path] = {"ok": False, "items": 0, "error": warn}
            else:
                status["targets"][out_path] = {"ok": True, "items": n}
        except Exception as e:
            failed_any = True
            status["targets"][out_path] = {"ok": False, "items": 0, "error": str(e)}

    # Wintersport men/women
    for gender in ("men", "women"):
        out_key = f"wintersport_{gender}"
        out_path = conf["outputs"][out_key]
        try:
            _, n = _run_wintersport(conf, gender)
            status["targets"][out_path] = {"ok": True, "items": n}
        except Exception as e:
            failed_any = True
            status["targets"][out_path] = {"ok": False, "items": 0, "error": str(e)}

    _write_json(STATUS_PATH, status)

    # If anything failed hard, fail the action (so you notice)
    # Note: women's handball with empty pdf_url is treated as ok=false but not "hard fail"
    # If you want it to hard fail too, set failed_any=True when warn happens.
    if failed_any:
        raise SystemExit("One or more targets failed. See data/_meta/pipeline_status.json")

    print("DONE")

if __name__ == "__main__":
    main()
