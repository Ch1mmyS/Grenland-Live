import json
from pathlib import Path
from datetime import datetime
from dateutil import parser as dtparser
import feedparser

BASE = Path(__file__).resolve().parents[1]
DATA = BASE / "data"
SOURCES_FILE = DATA / "event_sources.json"
OUT_FILE = DATA / "events.json"

def load_sources():
    if not SOURCES_FILE.exists():
        return []
    obj = json.loads(SOURCES_FILE.read_text(encoding="utf-8"))
    return obj.get("sources", []) or obj.get("places", []) or []

def iso(dt: datetime):
    return dt.isoformat()

def normalize_date(entry):
    for key in ["published", "updated", "created"]:
        val = entry.get(key)
        if val:
            try:
                return dtparser.parse(val)
            except Exception:
                pass
    return None

def main():
    events = []
    sources = load_sources()

    for src in sources:
        stype = (src.get("type") or "rss").lower().strip()
        url = (src.get("url") or src.get("link") or "").strip()
        name = (src.get("name") or "").strip()

        if not url:
            continue

        if stype == "rss":
            feed = feedparser.parse(url)
            for e in feed.entries[:200]:
                dt = normalize_date(e)
                if not dt:
                    continue

                title = (e.get("title") or "").strip()
                link = (e.get("link") or "").strip()

                events.append({
                    "title": title or f"Arrangement ({name})",
                    "venue": name,
                    "city": "",
                    "start": iso(dt),
                    "category": "Event",
                    "url": link
                })

    DATA.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(
        json.dumps({"events": events}, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    print(f"WROTE {OUT_FILE} ({len(events)} events)")

if __name__ == "__main__":
    main()
