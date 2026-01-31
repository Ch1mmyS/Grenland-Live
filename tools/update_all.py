import json, re, os
from datetime import datetime
from dateutil import parser as dtparse
import pytz
import requests
from PyPDF2 import PdfReader
from io import BytesIO

TZ = pytz.timezone("Europe/Oslo")

OUT_DIR_2026 = "data/2026"
PUBS_FILE = "data/content/pubs.json"  # ✅ din plassering

def http_get(url: str) -> bytes:
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    return r.content

def write_json(path: str, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)

def read_json(path: str):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def safe_dt(s: str):
    try:
        return dtparse.parse(s)
    except:
        return None

def to_iso_oslo(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = TZ.localize(dt)
    return dt.astimezone(TZ).isoformat()

def normalize_match(sport, league, home, away, kickoff, channel="Ukjent", where=None):
    if where is None: where = []
    if not where:
        where = ["Vikinghjørnet", "Gimle Pub"]
    return {
        "sport": sport,
        "league": league,
        "home": home,
        "away": away,
        "kickoff": kickoff,
        "channel": channel or "Ukjent",
        "where": where
    }

def load_pubs_default():
    pubs = read_json(PUBS_FILE).get("pubs", [])
    base = ["Vikinghjørnet", "Gimle Pub"]
    rest = [p.get("name","").strip() for p in pubs if p.get("name") and p.get("name") not in base]
    return base + rest

DEFAULT_WHERE = None

# ---------------------------
# FOOTBALL (FixtureDownload JSON feeds)
# ---------------------------
def fetch_fixturedownload_json(url, league_name):
    raw = json.loads(http_get(url).decode("utf-8", errors="ignore"))
    games = []

    items = raw
    if isinstance(raw, dict):
        for key in ["matches", "fixtures", "games", "data"]:
            if isinstance(raw.get(key), list):
                items = raw[key]
                break

    for it in items:
        home = it.get("HomeTeam") or it.get("home") or it.get("homeTeam") or ""
        away = it.get("AwayTeam") or it.get("away") or it.get("awayTeam") or ""
        dt = it.get("DateUtc") or it.get("date") or it.get("kickoff") or it.get("start") or it.get("Date") or ""
        d = safe_dt(dt)
        if not d:
            continue
        kickoff = to_iso_oslo(d)
        games.append(normalize_match("Fotball", league_name, home, away, kickoff, channel="Ukjent", where=DEFAULT_WHERE))
    return games

# ---------------------------
# HANDball EM (EHF PDF parse - menn)
# ---------------------------
def pdf_text(url):
    b = http_get(url)
    r = PdfReader(BytesIO(b))
    txt = ""
    for page in r.pages:
        t = page.extract_text() or ""
        txt += t + "\n"
    return txt

def fetch_ehf_pdf_schedule(pdf_url, league_name):
    text = pdf_text(pdf_url)
    lines = [re.sub(r"\s+", " ", ln).strip() for ln in text.splitlines() if ln.strip()]

    games = []
    date_re = re.compile(r"(\d{1,2}\.\d{1,2}\.\d{4})")
    time_re = re.compile(r"(\d{1,2}:\d{2})")

    # Veldig tolerant “TEAM - TEAM”
    vs_re = re.compile(r"([A-ZÆØÅ][A-ZÆØÅ \-\.]{2,})\s-\s([A-ZÆØÅ][A-ZÆØÅ \-\.]{2,})")

    current_date = None
    for ln in lines:
        mdate = date_re.search(ln)
        if mdate:
            current_date = mdate.group(1)

        mvs = vs_re.search(ln)
        mtime = time_re.search(ln)

        if current_date and mvs and mtime:
            d = safe_dt(f"{current_date} {mtime.group(1)}")
            if not d:
                continue
            kickoff = to_iso_oslo(d)
            home = mvs.group(1).strip().title()
            away = mvs.group(2).strip().title()
            games.append(normalize_match("Håndball", league_name, home, away, kickoff, channel="Ukjent", where=DEFAULT_WHERE))
    return games

# ---------------------------
# WINTERSPORT - “ramme” for alt (legg til flere kilder når du vil)
# Vi starter med store blokker: Alpine + Langrenn + Hopp (FIS)
# Disse sidene kan endres, men er offisielle FIS.
# ---------------------------
WINTER_SOURCES = [
    # FIS Alpine calendar page provides season calendar (official)  :contentReference[oaicite:4]{index=4}
    {"key":"alpine_wc", "name":"Vintersport – Alpint (FIS)", "type":"fis_page", "url":"https://www.fis-ski.com/DB/alpine-skiing/calendar-results.html?seasoncode=2026&categorycode=WC"},
    # FIS Cross-country calendar page (official) :contentReference[oaicite:5]{index=5}
    {"key":"xc_wc", "name":"Vintersport – Langrenn (FIS)", "type":"fis_page", "url":"https://www.fis-ski.com/DB/cross-country/calendar-results.html?seasoncode=2026&categorycode=WC"},
    # FIS Ski Jumping calendar page (official) :contentReference[oaicite:6]{index=6}
    {"key":"sj_wc", "name":"Vintersport – Hopp (FIS)", "type":"fis_page", "url":"https://www.fis-ski.com/DB/ski-jumping/calendar-results.html?seasoncode=2026&categorycode=WC"},
]

def fetch_fis_calendar_page(url, league_name):
    """
    FIS sider viser kalender i tabell. Vi henter HTML og prøver å plukke ut:
    - dato (YYYY-MM-DD eller dd.mm.yyyy)
    - sted
    - event title
    FIS HTML kan endre seg; hvis parsing feiler, lager vi tom liste (frontend går fortsatt).
    """
    html = http_get(url).decode("utf-8", errors="ignore")

    # Finn datoer i ISO/tekst – best effort
    # Vi leter etter YYYY-MM-DD først:
    dates = re.findall(r"\b(20\d{2}-\d{2}-\d{2})\b", html)
    # fallback: dd.mm.yyyy
    dates2 = re.findall(r"\b(\d{1,2}\.\d{1,2}\.20\d{2})\b", html)

    # Vi kan ikke garantere tider her → setter 12:00 hvis mangler
    # (Når du vil ha 100% tider, legger vi inn spesifikke ICS/PDF per sport/arrangør)
    games = []
    used = set()

    for dstr in (dates[:400] + dates2[:400]):
        if dstr in used:
            continue
        used.add(dstr)
        d = safe_dt(dstr)
        if not d:
            continue
        # default midt på dagen
        d = d.replace(hour=12, minute=0, second=0)
        kickoff = to_iso_oslo(d)

        # eventtext “Vintersport” (placeholder)
        games.append(normalize_match("Vintersport", league_name, "Vintersport", dstr, kickoff, channel="Ukjent", where=DEFAULT_WHERE))

    return games

def build_index(league_files):
    return {
        "generated_at": to_iso_oslo(datetime.now(TZ)),
        "leagues": league_files
    }

def build_calendar_feed(all_games):
    out = []
    for g in all_games:
        sport = g.get("sport","")
        color = "red" if sport == "Fotball" else ("yellow" if sport == "Håndball" else ("green" if sport == "Vintersport" else "gray"))
        out.append({
            "date": g["kickoff"][:10],
            "kickoff": g["kickoff"],
            "sport": sport,
            "color": color,
            "league": g["league"],
            "home": g["home"],
            "away": g["away"],
            "channel": g["channel"],
            "where": g["where"],
        })
    return {
        "generated_at": to_iso_oslo(datetime.now(TZ)),
        "items": out
    }

def group_by_month(games):
    items = sorted(games, key=lambda x: x.get("kickoff",""))
    grouped = {}
    for g in items:
        d = safe_dt(g.get("kickoff",""))
        if not d:
            continue
        d = d.astimezone(TZ)
        key = d.strftime("%Y-%m")
        grouped.setdefault(key, []).append(g)
    return [{"month": ym, "games": grouped[ym]} for ym in sorted(grouped.keys())]

def main():
    global DEFAULT_WHERE
    DEFAULT_WHERE = load_pubs_default()

    league_files = []
    all_games = []

    # --------- FOOTBALL SOURCES ----------
    football_sources = [
        {"key":"eliteserien","name":"Eliteserien","url":"https://fixturedownload.com/feed/json/eliteserien-2026"},
        {"key":"obos","name":"OBOS-ligaen","url":"https://fixturedownload.com/feed/json/obos-ligaen-2026"},
        {"key":"premier_league","name":"Premier League","url":"https://fixturedownload.com/feed/json/epl-2025"},
        {"key":"champions_league","name":"Champions League","url":"https://fixturedownload.com/feed/json/champions-league-2025"},
        {"key":"la_liga","name":"La Liga","url":"https://fixturedownload.com/feed/json/la-liga-2025"},
    ]

    for src in football_sources:
        try:
            games = fetch_fixturedownload_json(src["url"], src["name"])
        except Exception:
            games = []
        path = f"{OUT_DIR_2026}/{src['key']}.json"
        write_json(path, {"games": games})
        league_files.append({"key": src["key"], "name": src["name"], "path": path.replace("\\","/"), "sport":"Fotball"})
        all_games.extend(games)

    # --------- EM 2026 (HÅNDBALL MENN) ----------
    # Official match schedule PDF :contentReference[oaicite:7]{index=7}
    ehf_men_pdf = "https://tickets.eurohandball.com/fileadmin/fm_de/EHF2026M/250901_EHF2026-M_Match_Schedule_new.pdf"
    try:
        em_men = fetch_ehf_pdf_schedule(ehf_men_pdf, "EM 2026 – Håndball Menn")
    except Exception:
        em_men = []
    em_men_path = f"{OUT_DIR_2026}/em_handball_men.json"
    write_json(em_men_path, {"games": em_men})
    league_files.append({"key":"em_handball_men","name":"EM 2026 – Håndball Menn","path":em_men_path.replace("\\","/"),"sport":"Håndball"})
    all_games.extend(em_men)

    # (Kvinne-EM 2026: EHF-side er JS, legg til PDF/JSON-kilde når du har den)
    em_women_path = f"{OUT_DIR_2026}/em_handball_women.json"
    if not os.path.exists(em_women_path):
        write_json(em_women_path, {"games": []})
    league_files.append({"key":"em_handball_women","name":"EM 2026 – Håndball Damer","path":em_women_path.replace("\\","/"),"sport":"Håndball"})

    # --------- WINTERSPORT (BEST EFFORT) ----------
    for ws in WINTER_SOURCES:
      try:
          games = fetch_fis_calendar_page(ws["url"], ws["name"])
      except Exception:
          games = []
      path = f"{OUT_DIR_2026}/{ws['key']}.json"
      write_json(path, {"games": games})
      league_files.append({"key": ws["key"], "name": ws["name"], "path": path.replace("\\","/"), "sport":"Vintersport"})
      all_games.extend(games)

    # --------- INDEX + CALENDAR FEED ----------
    write_json(f"{OUT_DIR_2026}/index.json", build_index(league_files))
    write_json(f"{OUT_DIR_2026}/calendar_feed.json", build_calendar_feed(all_games))

    # --------- VM 2026 / EM 2026 LISTS ----------
    # VM-lista = “alt vi har” gruppert pr mnd (du kan senere filtrere til VM-only)
    write_json(f"{OUT_DIR_2026}/vm2026_list.json", {"generated_at": to_iso_oslo(datetime.now(TZ)), "months": group_by_month(all_games)})

    # EM-lista = foreløpig håndball EM filer (menn + kvinner)
    em_games = []
    em_games.extend(em_men)
    # kvinner tom inntil kilde legges inn
    write_json(f"{OUT_DIR_2026}/em2026_list.json", {"generated_at": to_iso_oslo(datetime.now(TZ)), "months": group_by_month(em_games)})

if __name__ == "__main__":
    main()
