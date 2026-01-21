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
        # fallback: tom liste
        return []
    obj = json.loads(SOURCES_FILE.read_text(encoding="utf-8"))
    # forventer: { "sources": [ { "name": "", "type": "rss", "url": "" } ] }
    return obj.get("sources", [])

def iso(dt: datetime):
    # lag ISO med offset hvis mulig
    return dt.isoformat()

def normalize_date(entry):
    # prøv å finne dato i RSS
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
        stype = (src.get("type") or "").lower().strip()
        url = (src.get("url") or "").strip()
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
                    "city": "",  # sett manuelt hvis du vil
                    "start": iso(dt),
                    "category": "Event",
                    "url": link
                })

    # behold eksisterende hvis du har lagt inn manuelt
    if OUT_FILE.exists():
        try:
            old = json.loads(OUT_FILE.read_text(encoding="utf-8")).get("events", [])
            # legg til gamle som ikke finnes fra før (basert på title+start)
            seen = set((x.get("title",""), x.get("start","")) for x in events)
            for o in old:
                key = (o.get("title",""), o.get("start",""))
                if key not in seen:
                    events.append(o)
        except Exception:
            pass

    # sorter
    def sort_key(x):
        try:
            return dtparser.parse(x.get("start",""))
        except Exception:
            return datetime(2100,1,1)
    events.sort(key=sort_key)

    OUT_FILE.write_text(json.dumps({"events": events}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"WROTE {OUT_FILE} ({len(events)} events)")

if __name__ == "__main__":
    main()
