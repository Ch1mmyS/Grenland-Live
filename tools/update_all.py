# tools/update_all.py
from __future__ import annotations

import sys
from pathlib import Path

# --- IMPORTANT: ensure repo root is on PYTHONPATH ---
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import json

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
    path.write_text(
        json.dumps(obj, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )


def _load_conf() -> dict:
    return json.loads(SOURCES_PATH.read_text(encoding="utf-8"))


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
            raise RuntimeError(f"Unknown football type: {typ}")

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

def _run_handball(conf: dict, gender: str) -> tuple[int, list[str], str | None]:
    year = str(conf["year"])
    out_path = Path(conf["outputs"][f"handball_{gender}"])

    items: list[dict] = []
    source_ids: list[str] = []

    for src in conf["sports"]["handball"][gender]:
        if not src.get("enabled", True):
            return 0, [], f"{src['key']} disabled"

        key = src["key"]
        name = src["name"]
        channel = src.get("channel")
        pdf_url = src.get("pdf_url")

        source_ids.append(key)

        if not pdf_url:
            return 0, source_ids, "pdf_url is empty"

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
    return len(items), source_ids, None


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
        channel = src.get("channel")
        api = src["api"]

        base_url = api["base_url"].rstrip("/")
        season_id = api["season_id"]
        level = api.get("level", 3)

        source_ids.append(key)

        events = fetch_biathlon(
            base_url=base_url,
            season_id=season_id,
            level=level,
            gender=gender
        )

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


# ---------------- MAIN ----------------

def main():
    conf = _load_conf()

    status = {
        "last_run": now_oslo_iso(),
        "targets": {}
    }

    failed = False

    try:
        n, _ = _run_football(conf)
        status["targets"][conf["outputs"]["football"]] = {"ok": True, "items": n}
    except Exception as e:
        failed = True
        status["targets"][conf["outputs"]["football"]] = {"ok": False, "error": str(e)}

    for gender in ("men", "women"):
        out = conf["outputs"][f"handball_{gender}"]
        try:
            n, _, warn = _run_handball(conf, gender)
            if warn:
                status["targets"][out] = {"ok": False, "error": warn}
            else:
                status["targets"][out] = {"ok": True, "items": n}
        except Exception as e:
            failed = True
            status["targets"][out] = {"ok": False, "error": str(e)}

    for gender in ("men", "women"):
        out = conf["outputs"][f"wintersport_{gender}"]
        try:
            n, _ = _run_wintersport(conf, gender)
            status["targets"][out] = {"ok": True, "items": n}
        except Exception as e:
            failed = True
            status["targets"][out] = {"ok": False, "error": str(e)}

    _write_json(STATUS_PATH, status)

    if failed:
        raise SystemExit("Pipeline failed – see pipeline_status.json")

    print("DONE")


if __name__ == "__main__":
    main()
