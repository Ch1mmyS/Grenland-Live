import re
import requests
import pandas as pd
import streamlit as st
from bs4 import BeautifulSoup
from datetime import datetime, timedelta, timezone


# ----------------------------
# PAGE / STYLE
# ----------------------------
st.set_page_config(page_title="Hva skjer i Skien/Porsgrunn + Fotball", layout="wide")

# ✅ HVITT / LYST TEMA
CSS = """
<style>
:root{
  --bg:#f6f8ff;
  --panel:#ffffff;
  --card:#ffffff;
  --text:#0b1220;
  --muted:rgba(11,18,32,0.62);
  --line:rgba(11,18,32,0.10);
  --accent:#19b35a;
  --accent2:#2563eb;
  --warn:#ffb020;
}

/* Base */
html, body, [class*="css"] { color: var(--text) !important; }
.stApp{
  background:
    radial-gradient(900px 600px at 10% 10%, rgba(37,99,235,0.10), transparent 45%),
    radial-gradient(900px 700px at 90% 20%, rgba(25,179,90,0.10), transparent 40%),
    linear-gradient(180deg, var(--bg), #ffffff 70%);
}
.block-container { padding-top: 1.1rem; max-width: 1500px; }

/* Cards */
.card{
  padding: 14px 16px;
  border-radius: 18px;
  border: 1px solid var(--line);
  background: var(--card);
  box-shadow: 0 10px 22px rgba(0,0,0,0.08);
  margin-bottom: 12px;
}
.card-title{ font-size: 18px; font-weight: 900; color: var(--text); }
.small{ font-size: 12px; color: var(--muted); }

/* Pills */
.pill{
  display:inline-block;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: rgba(0,0,0,0.03);
  margin-right: 7px;
  margin-top: 7px;
  font-weight: 800;
  color: var(--text);
}
.good{ border-color: rgba(25,179,90,0.35) !important; background: rgba(25,179,90,0.12) !important; }
.warn{ border-color: rgba(255,176,32,0.35) !important; background: rgba(255,176,32,0.12) !important; }

/* KPI */
.kpi{
  padding: 12px 14px;
  border-radius: 18px;
  border: 1px solid var(--line);
  background: rgba(0,0,0,0.02);
}
.kpi .label{ color: var(--muted); font-size: 12px; }
.kpi .value{ font-weight: 900; font-size: 18px; color: var(--text); }

/* Links */
a{ color: #1d4ed8; text-decoration: none; }
a:hover{ text-decoration: underline; }

/* Sidebar */
[data-testid="stSidebar"]{
  background: rgba(255,255,255,0.92) !important;
  border-right: 1px solid var(--line);
}
</style>
"""
st.markdown(CSS, unsafe_allow_html=True)

# ----------------------------
# CONFIG: STEDER + LENKER + FASTE UKEDAGER
# ----------------------------
VENUES = [
    {
        "name": "Barkaden (Skien)",
        "city": "Skien",
        "type": "Arkadebar",
        "website": "https://www.barkaden.no/arrangementer/",
        "instagram": "https://www.barkaden.no/skien/",
        "facebook": "",
        "scrape": "barkaden_events",
        "fixed_weekly": [
            {"dow": "Tirsdag", "title": "Afterwork / aktiviteter", "time": "Etter jobb"},
            {"dow": "Torsdag", "title": "Musikkbingo / aktivitet", "time": "Kveld"},
        ],
    },
    {
        "name": "The Old Irish Pub (Skien)",
        "city": "Skien",
        "type": "Irsk pub / Nattklubb",
        "website": "https://oldirishpub.no/nb/skien/page/forside",
        "instagram": "https://www.instagram.com/oldirishpub_skien/",
        "facebook": "https://www.facebook.com/p/The-OId-Irish-Pub-Skien-100027965997162/",
        "scrape": None,
        "fixed_weekly": [
            {"dow": "Fredag", "title": "DJ / helgestemning", "time": "Kveld"},
            {"dow": "Lørdag", "title": "DJ / helgestemning", "time": "Kveld"},
        ],
    },
    {
        "name": "Union Bar (Skien)",
        "city": "Skien",
        "type": "Bar (fotball / kultur / spill)",
        "website": "https://unionbar.no/",
        "instagram": "https://www.instagram.com/unionbarskien/?hl=en",
        "facebook": "https://www.facebook.com/p/Union-Bar-61566879467013/",
        "scrape": None,
        "fixed_weekly": [
            {"dow": "Onsdag", "title": "Fotball på skjerm / sosialkveld", "time": "Kveld"},
            {"dow": "Lørdag", "title": "Fotball + barstemning", "time": "Hele dagen"},
        ],
    },
    {
        "name": "Sykkelbryggeriet (Porsgrunn-området)",
        "city": "Porsgrunn",
        "type": "Kulturbar (livemusikk/standup/DJ)",
        "website": "",
        "instagram": "https://www.instagram.com/sykkelbryggeriet/?hl=en",
        "facebook": "https://www.facebook.com/sykkelbryggeriet/?locale=nb_NO",
        "scrape": None,
        "fixed_weekly": [
            {"dow": "Torsdag", "title": "Kulturkveld (f.eks. standup / live)", "time": "Kveld"},
        ],
    },
    {
        "name": "Tollboden Bar (Porsgrunn)",
        "city": "Porsgrunn",
        "type": "Bar / konserter",
        "website": "https://www.tollboden.com/",
        "instagram": "https://www.instagram.com/tollbodenbar/",
        "facebook": "",
        "scrape": "tollboden_events",
        "fixed_weekly": [],
    },
    {
        "name": "Mariannes (Skien)",
        "city": "Skien",
        "type": "Pub / danserestaurant",
        "website": "",
        "instagram": "https://www.instagram.com/mariannes_pub/?hl=en",
        "facebook": "",
        "scrape": None,
        "fixed_weekly": [
            {"dow": "Lørdag", "title": "Uteliv / live/DJ (ofte)", "time": "Kveld"},
        ],
    },
]

EXTRA_PLACES = [
    {"name": "Gimle Pub", "city": "Skien", "type": "Pub", "website": "", "instagram": "", "facebook": "", "scrape": None,
     "fixed_weekly": [{"dow": "Tirsdag", "title": "Quiz (typisk)", "time": "Kveld"}]},
    {"name": "Kafé K", "city": "Skien", "type": "Pub/Kafé", "website": "", "instagram": "", "facebook": "", "scrape": None,
     "fixed_weekly": [{"dow": "Onsdag", "title": "Jam-kveld (typisk)", "time": "Kveld"}]},
    {"name": "Kniven", "city": "Skien", "type": "Rockebar", "website": "", "instagram": "", "facebook": "", "scrape": None,
     "fixed_weekly": [{"dow": "Fredag", "title": "Konsert/rock (varierer)", "time": "Kveld"}]},
    {"name": "Håndverkeren Pub", "city": "Skien", "type": "Brun pub", "website": "", "instagram": "", "facebook": "", "scrape": None,
     "fixed_weekly": []},
    {"name": "Parkbiografen Bar", "city": "Skien", "type": "Kulturbar", "website": "", "instagram": "", "facebook": "", "scrape": None,
     "fixed_weekly": []},
    {"name": "O’Learys Skien", "city": "Skien", "type": "Sportsbar", "website": "", "instagram": "", "facebook": "", "scrape": None,
     "fixed_weekly": [{"dow": "Lørdag", "title": "Kampdag (storskjerm)", "time": "Ettermiddag/kveld"}]},
    {"name": "Lundetangen", "city": "Skien", "type": "Pub", "website": "", "instagram": "", "facebook": "", "scrape": None,
     "fixed_weekly": []},
    {"name": "Damslett", "city": "Skien", "type": "Utested", "website": "", "instagram": "", "facebook": "", "scrape": None,
     "fixed_weekly": []},
]

VENUES = VENUES + EXTRA_PLACES

# ----------------------------
# HELPERS
# ----------------------------
OSLO_TZ = timezone(timedelta(hours=1))


def parse_date_fallback(s: str):
    if not s:
        return None
    s = s.strip()
    for fmt in ("%d.%m.%Y", "%d/%m/%Y", "%Y-%m-%d", "%d.%m.%y"):
        try:
            return datetime.strptime(s, fmt).date()
        except Exception:
            pass
    return None


# ✅ DATOER FOR FASTE UKEDAGER
def dow_to_int(dow: str) -> int:
    mapping = {
        "Mandag": 0, "Tirsdag": 1, "Onsdag": 2, "Torsdag": 3,
        "Fredag": 4, "Lørdag": 5, "Søndag": 6
    }
    return mapping.get(dow, -1)


def dates_for_weekday_in_range(start_date, end_date, weekday_int: int):
    if weekday_int < 0:
        return []
    d = start_date
    delta = (weekday_int - d.weekday()) % 7
    d = d + timedelta(days=delta)
    out = []
    while d <= end_date:
        out.append(d)
        d += timedelta(days=7)
    return out


# ✅ BEDRE KANAL-MATCHING (fotball)
def norm_team(s: str) -> str:
    if not s:
        return ""
    s = s.lower().strip()
    for x in ["fc", "afc", ".", ",", "'", "’"]:
        s = s.replace(x, "")
    s = re.sub(r"\s+", " ", s).strip()

    aliases = {
        "man utd": "manchester united",
        "man united": "manchester united",
        "man city": "manchester city",
        "spurs": "tottenham",
        "wolves": "wolverhampton",
        "newcastle utd": "newcastle united",
        "west brom": "west bromwich albion",
    }
    return aliases.get(s, s)


# ----------------------------
# SCRAPERS (enkle, robuste)
# ----------------------------
@st.cache_data(ttl=60 * 30)
def scrape_barkaden_events() -> pd.DataFrame:
    url = "https://www.barkaden.no/arrangementer/"
    r = requests.get(url, timeout=20, headers={"User-Agent": "Mozilla/5.0"})
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")

    text = soup.get_text("\n")
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    out = []
    date_re = re.compile(r"(\d{1,2}[./]\d{1,2}[./]\d{2,4})")

    for i, ln in enumerate(lines):
        m = date_re.search(ln)
        if m:
            d = parse_date_fallback(m.group(1).replace("/", "."))
            title = ""
            if i + 1 < len(lines):
                title = lines[i + 1][:120]
            out.append({"date": d, "time": "", "title": title or "Arrangement", "source": url})

    df = pd.DataFrame(out)
    if df.empty:
        return pd.DataFrame(columns=["date", "time", "title", "source"])
    df = df.dropna(subset=["date"]).drop_duplicates()
    return df.sort_values("date")


@st.cache_data(ttl=60 * 30)
def scrape_tollboden_events() -> pd.DataFrame:
    urls = [
        "https://www.tollboden.com/sommerkonsert/",
        "https://www.tollboden.com/",
    ]
    out = []

    for url in urls:
        try:
            r = requests.get(url, timeout=20, headers={"User-Agent": "Mozilla/5.0"})
            r.raise_for_status()
            soup = BeautifulSoup(r.text, "html.parser")
            txt = soup.get_text("\n")

            time_m = re.findall(r"kl\.?\s*(\d{1,2}[:.]\d{2})", txt, flags=re.IGNORECASE)
            date_m = re.findall(r"(\d{1,2}\.\s*[A-Za-zæøåÆØÅ]+\s*\d{4})", txt)

            d = None
            if date_m:
                months = {
                    "januar": 1, "februar": 2, "mars": 3, "april": 4, "mai": 5, "juni": 6, "juli": 7,
                    "august": 8, "september": 9, "oktober": 10, "november": 11, "desember": 12
                }
                raw = date_m[0].lower().replace("  ", " ").strip()
                m2 = re.match(r"(\d{1,2})\.\s*([a-zæøå]+)\s*(\d{4})", raw)
                if m2 and m2.group(2) in months:
                    d = datetime(int(m2.group(3)), months[m2.group(2)], int(m2.group(1))).date()

            title = (soup.title.get_text(strip=True) if soup.title else "Tollboden event")[:120]
            if d:
                out.append({"date": d, "time": (time_m[0] if time_m else ""), "title": title, "source": url})
        except Exception:
            continue

    df = pd.DataFrame(out)
    if df.empty:
        return pd.DataFrame(columns=["date", "time", "title", "source"])
    df = df.dropna(subset=["date"]).drop_duplicates()
    return df.sort_values("date")


def get_scraped_events(venue) -> pd.DataFrame:
    if venue.get("scrape") == "barkaden_events":
        return scrape_barkaden_events()
    if venue.get("scrape") == "tollboden_events":
        return scrape_tollboden_events()
    return pd.DataFrame(columns=["date", "time", "title", "source"])


# ----------------------------
# FOOTBALL FIXTURES (football-data.co.uk)
# ----------------------------
@st.cache_data(ttl=60 * 30)
def fetch_footballdata_fixtures() -> pd.DataFrame:
    url = "https://www.football-data.co.uk/fixtures.csv"
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    from io import StringIO
    df = pd.read_csv(StringIO(r.text), encoding="latin1")

    if "Date" in df.columns:
        df["DateParsed"] = pd.to_datetime(df["Date"], dayfirst=True, errors="coerce")
    else:
        df["DateParsed"] = pd.NaT

    if "Time" not in df.columns:
        df["Time"] = ""
    return df


# ----------------------------
# TV CHANNEL LOOKUP (valgfri, kan bryte)
# ----------------------------
@st.cache_data(ttl=60 * 15)
def tvguide_premier_league() -> pd.DataFrame:
    url = "https://www.tvkampen.com/fotball/premier-league"
    r = requests.get(url, timeout=20, headers={"User-Agent": "Mozilla/5.0"})
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")

    text = soup.get_text("\n")
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]

    out = []
    time_re = re.compile(r"^\d{1,2}:\d{2}$")
    matchup_re = re.compile(r"(.+)\s+-\s+(.+)")

    for i, ln in enumerate(lines):
        if time_re.match(ln):
            t = ln
            for j in range(i + 1, min(i + 6, len(lines))):
                mm = matchup_re.match(lines[j])
                if mm:
                    home = mm.group(1).strip()
                    away = mm.group(2).strip()
                    channel = ""
                    for k in range(j + 1, min(j + 6, len(lines))):
                        if any(x in lines[k] for x in ["Viaplay", "V Sport", "TV", "V4", "V5", "V6", "V2"]):
                            channel = lines[k][:60]
                            break
                    out.append({"HomeTeam": home, "AwayTeam": away, "Kickoff": t, "Channel": channel, "source": url})
                    break

    df = pd.DataFrame(out).drop_duplicates()
    return df


# ----------------------------
# SIDEBAR
# ----------------------------
st.title("🍻 Hva skjer i Skien / Porsgrunn + ⚽ Fotball")
st.caption("Oversikt + varsling inne i appen. For push-varsler/appstore trenger vi PWA/wrapper (se nederst).")

with st.sidebar:
    st.header("Filter")
    city = st.selectbox("Område", ["Alle", "Skien", "Porsgrunn"], index=0)
    view = st.radio("Vis", ["I dag", "Helga", "Neste 14 dager"], index=1)

    st.divider()
    st.header("Faste ukedager")
    show_fixed = st.checkbox("Vis faste ukedager", value=True)

    st.divider()
    st.header("Fotball")
    league_code = st.selectbox(
        "Liga (fixtures)",
        ["E0 (Premier League)", "E1 (Championship)", "D1 (Bundesliga)", "SP1 (La Liga)", "I1 (Serie A)", "F1 (Ligue 1)"],
        index=0
    )
    days_ahead = st.slider("Fotball: dager frem", 1, 60, 21, 1)
    show_tv = st.checkbox("Forsøk å hente 'kanal' fra TV-guide", value=False)
    st.caption("PL i Norge: Viaplay/V Sport (rettigheter).")

# ----------------------------
# DATE WINDOW
# ----------------------------
now = datetime.now(OSLO_TZ)
today = now.date()


def window_dates(view_mode: str):
    if view_mode == "I dag":
        return today, today
    if view_mode == "Helga":
        d = today
        days_to_fri = (4 - d.weekday()) % 7
        fri = d + timedelta(days=days_to_fri)
        sun = fri + timedelta(days=2)
        return fri, sun
    return today, today + timedelta(days=14)


start_d, end_d = window_dates(view)

# ----------------------------
# EVENTS: build list
# ----------------------------
events_rows = []

# ✅ 1) Faste ukedager med ekte datoer innenfor perioden
if show_fixed:
    for v in VENUES:
        if city != "Alle" and v["city"] != city:
            continue
        for fx in v.get("fixed_weekly", []):
            wd = dow_to_int(fx.get("dow", ""))
            for d in dates_for_weekday_in_range(start_d, end_d, wd):
                events_rows.append({
                    "date": d,
                    "time": fx.get("time", ""),
                    "title": fx.get("title", ""),
                    "venue": v["name"],
                    "city": v["city"],
                    "type": "Fast ukedag",
                    "source": v.get("website") or v.get("instagram") or ""
                })

# 2) Skrapede arrangement (Barkaden / Tollboden)
for v in VENUES:
    if city != "Alle" and v["city"] != city:
        continue
    sdf = get_scraped_events(v)
    if not sdf.empty:
        for _, r in sdf.iterrows():
            d = r.get("date")
            if d and (d < start_d or d > end_d):
                continue
            events_rows.append({
                "date": r.get("date"),
                "time": r.get("time", ""),
                "title": r.get("title", ""),
                "venue": v["name"],
                "city": v["city"],
                "type": "Arrangement",
                "source": r.get("source", "")
            })

events = pd.DataFrame(events_rows)

# ----------------------------
# TOP: KPIs + QUICK LINKS
# ----------------------------
k1, k2, k3 = st.columns(3)
k1.markdown(
    f"<div class='kpi'><div class='label'>Periode</div><div class='value'>{start_d.strftime('%d.%m')} – {end_d.strftime('%d.%m')}</div></div>",
    unsafe_allow_html=True
)
k2.markdown(
    f"<div class='kpi'><div class='label'>Steder i lista</div><div class='value'>{len(VENUES)}</div></div>",
    unsafe_allow_html=True
)
k3.markdown(
    f"<div class='kpi'><div class='label'>Events funnet (inkl faste)</div><div class='value'>{0 if events.empty else len(events)}</div></div>",
    unsafe_allow_html=True
)

st.markdown(
    "<div class='card'><div class='card-title'>🔗 Kilder / steder</div>"
    "<div class='small'>Noen steder har egen arrangements-side (f.eks. Barkaden), andre peker vi til IG/FB/nettside.</div></div>",
    unsafe_allow_html=True
)

# ----------------------------
# MAIN TABS
# ----------------------------
tabA, tabB = st.tabs(["🍻 Hva skjer", "⚽ Kommende fotballkamper"])

# ---------- TAB A ----------
with tabA:
    st.markdown(
        f"""
        <div class='card'>
            <div class='card-title'>📍 {city} – {view}</div>
            <div class='small'>
                Barkaden har egen arrangements-side.
                Union Bar har nettside med info.
                Old Irish har egen Skien-side + IG/FB.
            </div>
        </div>
        """,
        unsafe_allow_html=True
    )

    if events.empty:
        st.info("Ingen events å vise (enda). Skru på 'faste ukedager' i sidebaren, eller legg til flere kilder.")
    else:
        def sort_key(row):
            d = row["date"]
            if pd.isna(d) or d is None:
                return datetime(2100, 1, 1)
            return datetime.combine(d, datetime.min.time())

        events2 = events.copy()
        events2["sort"] = events2.apply(sort_key, axis=1)
        events2 = events2.sort_values(["sort", "venue", "title"]).drop(columns=["sort"])

        show = events2.copy()
        show["Dato"] = show["date"].apply(lambda x: "" if pd.isna(x) or x is None else pd.to_datetime(x).strftime("%a %d.%m"))
        show["Sted"] = show["venue"]
        show["Hva"] = show["title"]
        show["Tid"] = show["time"].fillna("")
        show["Type"] = show["type"]
        show["Lenke"] = show["source"].fillna("")

        st.dataframe(
            show[["Dato", "Tid", "Sted", "Hva", "Type", "Lenke"]],
            use_container_width=True,
            hide_index=True
        )

    st.markdown(
        "<div class='card'><div class='card-title'>🧭 Tips</div>"
        "<div class='small'>For Porsgrunn generelt kan du også sjekke VisitTelemark sin “Hva skjer”-side (arrangementer/konserter).</div>"
        "</div>",
        unsafe_allow_html=True
    )

# ---------- TAB B ----------
with tabB:
    st.markdown(
        "<div class='card'><div class='card-title'>⚽ Kommende kamper + dato + klokkeslett</div>"
        "<div class='small'>Kilde: football-data.co.uk fixtures.csv (viser ofte kommende kamper).</div></div>",
        unsafe_allow_html=True
    )

    fx = fetch_footballdata_fixtures()

    code = league_code.split()[0]  # "E0"
    if "Div" in fx.columns:
        fx = fx[fx["Div"].astype(str).str.upper() == code.upper()].copy()

    end = pd.Timestamp(today) + pd.Timedelta(days=int(days_ahead))
    fx = fx.dropna(subset=["HomeTeam", "AwayTeam"]).copy()
    fx = fx[fx["DateParsed"].notna()].copy()
    fx = fx[(fx["DateParsed"] >= pd.Timestamp(today)) & (fx["DateParsed"] <= end)].copy()
    fx = fx.sort_values(["DateParsed", "Time"])

    tv = pd.DataFrame()
    if show_tv and code.upper() == "E0":
        try:
            tv = tvguide_premier_league()
        except Exception:
            tv = pd.DataFrame()

    # ✅ normaliser tv-lagnavn for bedre matching
    if not tv.empty:
        tv["HomeNorm"] = tv["HomeTeam"].astype(str).apply(norm_team)
        tv["AwayNorm"] = tv["AwayTeam"].astype(str).apply(norm_team)

    rows = []
    for _, r in fx.iterrows():
        d = r["DateParsed"]
        t = str(r.get("Time", "") or "").strip()
        ht, at = r["HomeTeam"], r["AwayTeam"]

        channel = ""
        if show_tv and code.upper() == "E0" and not tv.empty:
            htn, atn = norm_team(str(ht)), norm_team(str(at))
            m = tv[(tv["HomeNorm"] == htn) & (tv["AwayNorm"] == atn)]
            if len(m):
                channel = str(m.iloc[0].get("Channel", ""))

        rows.append({
            "Dato": pd.to_datetime(d).strftime("%a %d.%m.%Y"),
            "Kl": t if t and t != "nan" else "",
            "Kamp": f"{ht} vs {at}",
            "Kanal": channel,
        })

    out = pd.DataFrame(rows)
    if out.empty:
        st.info("Fant ingen kamper i perioden. Prøv å øke 'dager frem'.")
    else:
        st.dataframe(out, use_container_width=True, hide_index=True)

    if code.upper() == "E0":
        st.markdown(
            "<div class='card'><div class='card-title'>📺 Om Premier League i Norge</div>"
            "<div class='small'>Rettighetene i Norge er hos Viaplay og V sport-kanalene (TV-guide / oversikt).</div></div>",
            unsafe_allow_html=True
        )

st.caption("⚠️ Dette er en oversiktsapp. For 100% riktige arrangement må kilder oppdateres. Fotball/TV-guide kan endre seg.")
