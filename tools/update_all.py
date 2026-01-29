# tools/update_all.py
from __future__ import annotations

import json
import importlib
from pathlib import Path

from tools.lib.normalize import normalize_item, make_doc
from tools.lib.schema import validate_doc
from tools.lib.timeutil import now_oslo_iso

SOURCES_PATH = Path("data/_meta/sources.json")
STATUS_PATH  = Path("data/_meta/pipeline_status.json")

def load_sources() -> dict:
    return json.loads(SOURCES_PATH.read_text(encoding="utf-8"))

def load_provider(provider_name: str):
    mod = importlib.import_module(f"tools.providers.{provider_name}")
    if not hasattr(mod, "fetch"):
        raise RuntimeError(f"Provider tools.providers.{provider_name} missing fetch(source)")
    return mod.fetch

def write_json(path: Path, obj: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")

def run_target(target: dict) -> tuple[bool, int, str | None, list[str]]:
    out_path = Path(target["out"])
    sport = target.get("sport") or "unknown"
    name = target.get("name") or out_path.name

    items: list[dict] = []
    used_sources: list[str] = []

    for src in target.get("sources", []):
        if not src.get("enabled", True):
            continue

        used_sources.append(src.get("id", "unknown_source"))
        fetch = load_provider(src["provider"])

        raw_list = fetch(src) or []
        for raw in raw_list:
            item = normalize_item(raw, src, sport)
            items.append(item)

    # sort
    items.sort(key=lambda x: x.get("start") or "")

    doc = make_doc(
        meta={
            "season": "2026",
            "sport": sport,
            "name": name,
            "source_ids": used_sources
        },
        items=items
    )

    validate_doc(doc)
    write_json(out_path, doc)
    return True, len(items), None, used_sources

def main():
    conf = load_sources()
    targets = conf.get("targets", [])
    if not targets:
        raise RuntimeError("No targets found in data/_meta/sources.json")

    status = {
        "last_run": now_oslo_iso(),
        "targets": {}
    }

    any_failed = False

    for t in targets:
        out = t.get("out", "unknown")
        try:
            ok, n, err, used = run_target(t)
            status["targets"][out] = {"ok": ok, "items": n, "sources": used}
            print(f"WROTE {out} ({n} items)")
        except Exception as e:
            any_failed = True
            status["targets"][out] = {"ok": False, "items": 0, "error": str(e)}
            print(f"FAILED {out}: {e}")

    write_json(STATUS_PATH, status)

    if any_failed:
        raise SystemExit("One or more targets failed. See data/_meta/pipeline_status.json")

    print("DONE")

if __name__ == "__main__":
    main()
