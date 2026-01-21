(
echo import json
echo from pathlib import Path
echo from datetime import datetime
echo from dateutil import parser as dtparser
echo import feedparser
echo.
echo BASE = Path(__file__).resolve().parents[1]
echo DATA = BASE / "data"
echo SOURCES_FILE = DATA / "event_sources.json"
echo OUT_FILE = DATA / "events.json"
echo.
echo def load_sources():
echo ^    if not SOURCES_FILE.exists():
echo ^        return []
echo ^    obj = json.loads(SOURCES_FILE.read_text(encoding="utf-8"))
echo ^    return obj.get("sources", []) or obj.get("places", []) or []
echo.
echo def iso(dt: datetime):
echo ^    return dt.isoformat()
echo.
echo def normalize_date(entry):
echo ^    for key in ["published", "updated", "created"]:
echo ^        val = entry.get(key)
echo ^        if val:
echo ^            try:
echo ^                return dtparser.parse(val)
echo ^            except Exception:
echo ^                pass
echo ^    return None
echo.
echo def main():
echo ^    events = []
echo ^    sources = load_sources()
echo ^    for src in sources:
echo ^        stype = (src.get("type") or "rss").lower().strip()
echo ^        url = (src.get("url") or src.get("link") or "").strip()
echo ^        name = (src.get("name") or "").strip()
echo ^        if not url:
echo ^            continue
echo ^        if stype == "rss":
echo ^            feed = feedparser.parse(url)
echo ^            for e in feed.entries[:200]:
echo ^                dt = normalize_date(e)
echo ^                if not dt:
echo ^                    continue
echo ^                title = (e.get("title") or "").strip()
echo ^                link = (e.get("link") or "").strip()
echo ^                events.append({
echo ^                    "title": title or f"Arrangement ({name})",
echo ^                    "venue": name,
echo ^                    "city": "",
echo ^                    "start": iso(dt),
echo ^                    "category": "Event",
echo ^                    "url": link
echo ^                })
echo.
echo ^    if OUT_FILE.exists():
echo ^        try:
echo ^            old = json.loads(OUT_FILE.read_text(encoding="utf-8")).get("events", [])
echo ^            seen = set((x.get("title",""), x.get("start","")) for x in events)
echo ^            for o in old:
echo ^                key = (o.get("title",""), o.get("start",""))
echo ^                if key not in seen:
echo ^                    events.append(o)
echo ^        except Exception:
echo ^            pass
echo.
echo ^    def sort_key(x):
echo ^        try:
echo ^            return dtparser.parse(x.get("start",""))
echo ^        except Exception:
echo ^            return datetime(2100,1,1)
echo ^    events.sort(key=sort_key)
echo.
echo ^    DATA.mkdir(parents=True, exist_ok=True)
echo ^    OUT_FILE.write_text(json.dumps({"events": events}, ensure_ascii=False, indent=2), encoding="utf-8")
echo ^    print(f"WROTE {OUT_FILE} ({len(events)} events)")
echo.
echo if __name__ == "__main__":
echo ^    main()
) > tools\fetch_events.py
