def read_json(path: Path):
  if not path.exists():
    raise FileNotFoundError(f"Missing JSON file: {path}")

  raw = path.read_text(encoding="utf-8", errors="replace").strip()
  if not raw:
    raise ValueError(f"JSON file is empty: {path}")

  # common: accidentally committed HTML error page
  head = raw.lstrip().lower()
  if head.startswith("<!doctype") or head.startswith("<html"):
    raise ValueError(f"JSON file contains HTML (wrong file content): {path}")

  return json.loads(raw)

import os
import re
from datetime import datetime
from pathlib import Path

import requests

YEAR = 2026
ROOT = Path(__file__).resolve().parents[1]
SOURCES_PATH = ROOT / "data" / "_meta" / "sources.json"

OUT_DIR = ROOT / "data" / "2026"
OUT_DIR.mkdir(parents=True, exist_ok=True)

UA = "Grenland-Live/1.0 (+https://grenland-live.no)"

def read_json(path: Path):
  return json.loads(path.read_text(encoding="utf-8"))

def write_json(path: Path, payload):
  path.parent.mkdir(parents=True, exist_ok=True)
  path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

def load_existing_list(path: Path, keys=("games","items")):
  if not path.exists():
    return []
  try:
    data = read_json(path)
    for k in keys:
      if isinstance(data.get(k), list):
        return data[k]
  except Exception:
    return []
  return []

def http_get(url: str) -> str:
  r = requests.get(url, headers={"User-Agent": UA, "Accept": "*/*"}, timeout=30)
  r.raise_for_status()
  return r.text

def extract_ics(text: str) -> str:
  # If endpoint returns JSON wrapping an ICS string, try to extract it.
  t = text.strip()
  if t.startswith("{") and "BEGIN:VCALENDAR" in t:
    # try to find ICS inside JSON values
    m = re.search(r"(BEGIN:VCALENDAR.*END:VCALENDAR)", t, re.S)
    if m:
      return m.group(1)
  if "BEGIN:VCALENDAR" in t and "END:VCALENDAR" in t:
    m = re.search(r"(BEGIN:VCALENDAR.*END:VCALENDAR)", t, re.S)
    if m:
      return m.group(1)
  return ""

def parse_ics_events(ics_text: str):
  # Lightweight ICS parse (no external libs)
  # We only need DTSTART + SUMMARY
  # This handles common NFF calendar output well.
  lines = [ln.rstrip("\n") for ln in ics_text.splitlines()]
  # unfold lines (ICS can continue with leading space)
  unfolded = []
  for ln in lines:
    if ln.startswith(" ") and unfolded:
      unfolded[-1] += ln[1:]
    else:
      unfolded.append(ln)

  events = []
  cur = None
  for ln in unfolded:
    if ln == "BEGIN:VEVENT":
      cur = {}
    elif ln == "END:VEVENT":
      if cur:
        events.append(cur)
      cur = None
    elif cur is not None:
      if ln.startswith("DTSTART"):
        cur["DTSTART"] = ln.split(":",1)[-1].strip()
      elif ln.startswith("SUMMARY:"):
        cur["SUMMARY"] = ln.split(":",1)[-1].strip()
      elif ln.startswith("LOCATION:"):
        cur["LOCATION"] = ln.split(":",1)[-1].strip()
  return events

def dt_to_iso(dt_raw: str) -> str:
  # handles:
  # 20260118T170000Z
  # 20260118T180000
  # 20260118
  dt_raw = dt_raw.strip()
  if dt_raw.endswith("Z"):
    base = dt_raw[:-1]
    dt = datetime.strptime(base, "%Y%m%dT%H%M%S")
    # store as UTC Z
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
  if "T" in dt_raw:
    fmt = "%Y%m%dT%H%M%S" if len(dt_raw) >= 15 else "%Y%m%dT%H%M"
    dt = datetime.strptime(dt_raw, fmt)
    return dt.strftime("%Y-%m-%dT%H:%M:%S+01:00")
  dt = datetime.strptime(dt_raw, "%Y%m%d")
  return dt.strftime("%Y-%m-%dT00:00:00+01:00")

def parse_summary(summary: str):
  # typical: "Odd - Brann"
  s = summary.replace("–","-").strip()
  if " - " in s:
    a,b = s.split(" - ",1)
    return a.strip(), b.strip()
  if "-" in s:
    a,b = s.split("-",1)
    return a.strip(), b.strip()
  return s.strip(), "Ukjent"

def fetch_nff_ics(url: str, league_name: str, default_tv: str):
  text = http_get(url)
  ics = extract_ics(text)
  if not ics:
    # sometimes endpoint is direct ICS already
    if "BEGIN:VCALENDAR" in text and "END:VCALENDAR" in text:
      ics = text
  if not ics:
    raise RuntimeError("No ICS found in response")

  raw_events = parse_ics_events(ics)
  games = []
  for ev in raw_events:
    dt = ev.get("DTSTART")
    summ = ev.get("SUMMARY","")
    if not dt or not summ:
      continue
    iso = dt_to_iso(dt)
    if not iso.startswith(f"{YEAR}-"):
      continue
    home, away = parse_summary(summ)
    games.append({
      "league": league_name,
      "home": home,
      "away": away,
      "kickoff": iso,
      "channel": default_tv or "Ukjent",
      "where": ["Vikinghjørnet","Gimle Pub"],
    })
  return games

def fetch_fixturedownload_json(url: str, league_name: str, default_tv: str):
  # FixtureDownload feed is JSON array objects
  raw = http_get(url)
  data = json.loads(raw)
  games = []

  # data can be list or dict with list inside
  if isinstance(data, dict):
    # try common keys
    for k in ("matches","fixtures","games","data"):
      if isinstance(data.get(k), list):
        data = data[k]
        break

  if not isinstance(data, list):
    raise RuntimeError("Unexpected FixtureDownload JSON shape")

  for m in data:
    # common fields:
    # Date: "2025-08-16", Time: "12:30", HomeTeam, AwayTeam
    date = (m.get("Date") or m.get("date") or "").strip()
    time = (m.get("Time") or m.get("time") or "").strip()
    home = (m.get("HomeTeam") or m.get("home") or m.get("Home") or "Ukjent").strip()
    away = (m.get("AwayTeam") or m.get("away") or m.get("Away") or "Ukjent").strip()

    if not date:
      continue

    # build ISO
    if time:
      iso = f"{date}T{time}:00+01:00"
    else:
      iso = f"{date}T00:00:00+01:00"

    if not iso.startswith(f"{YEAR}-"):
      continue

    games.append({
      "league": league_name,
      "home": home,
      "away": away,
      "kickoff": iso,
      "channel": default_tv or "Ukjent",
      "where": ["Vikinghjørnet","Gimle Pub"],
    })
  return games

def main():
  sources = read_json(SOURCES_PATH)

  football = sources["sports"]["football"]
  summary_all = []

  for comp in football:
    if not comp.get("enabled", True):
      continue

    key = comp["key"]

    # NORMALISER KEY-NAVN (du har "laliga" men fil heter la_liga.json i repo)
    if key == "laliga":
      key = "la_liga"

    out_path = OUT_DIR / f"{key}.json"

    league_name = comp.get("name", key)
    default_tv = comp.get("default_tv", "Ukjent")
    url = comp["url"]
    typ = comp["type"]

    try:
      if typ == "nff_ics":
        games = fetch_nff_ics(url, league_name, default_tv)
      elif typ == "fixturedownload_json":
        games = fetch_fixturedownload_json(url, league_name, default_tv)
      else:
        raise RuntimeError(f"Unknown type: {typ}")

      # IKKE OVERSKRIV MED TOMT
      if len(games) == 0:
        existing = load_existing_list(out_path, keys=("games",))
        if existing:
          print(f"[KEEP] {key}: fetched 0, keeping existing ({len(existing)})")
          continue

      write_json(out_path, {"games": games})
      print(f"[OK] {key}: wrote {len(games)} -> {out_path.as_posix()}")
      summary_all.extend(games)

    except Exception as e:
      # IKKE ØDELEGG FILA
      print(f"[FAIL] {key}: {e}. Keeping existing if any.")
      continue

  # optional aggregate file (ikke nødvendig for UI, men nyttig)
  agg_path = OUT_DIR / "football.json"
  write_json(agg_path, {"games": summary_all})
  print(f"[OK] football aggregate: {len(summary_all)}")

if __name__ == "__main__":
  main()
