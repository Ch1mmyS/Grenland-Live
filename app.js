# app.py — Grenland Live (Sportsmeny / JSON-feed)
# Leser kun /data/*.json (lokalt i repo). Fungerer på Streamlit Cloud/Netlify JSON.
# Timezone: Europe/Oslo

import json
from pathlib import Path
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pandas as pd
import streamlit as st

TZ = ZoneInfo("Europe/Oslo")

# ----------------------------
# PAGE
# ----------------------------
st.set_page_config(page_title="Grenland Live – Sport", layout="wide")

CSS = """
<style>
:root{--bg:#f6f8ff;--panel:#ffffff;--text:#0b1220;--muted:rgba(11,18,32,.62);--line:rgba(11,18,32,.10);}
html, body, [data-testid="stAppViewContainer"]{background:var(--bg);}
.block-container{padding-top:1.2rem;}
.card{background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:14px 14px; margin:10px 0;}
.meta{color:var(--muted); font-size:0.92rem;}
.badge{display:inline-block; padding:3px 8px; border-radius:999px; border:1px solid var(--line); margin-right:6px; font-size:0.85rem;}
hr{border:none; border-top:1px solid var(--line); margin:14px 0;}
.small{font-size:.9rem; color:var(--muted);}
</style>
"""
st.markdown(CSS, unsafe_allow_html=True)

# ----------------------------
# HELPERS
# ----------------------------
DATA_DIR = Path(__file__).parent / "data"

def _read_json_file(path: Path):
    if not path.exists():
        return {"games": []}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {"games": []}

def parse_dt(s: str | None):
    if not s:
        return None
    try:
        # Støtter ISO med/uten offset
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=TZ)
        return dt.astimezone(TZ)
    except Exception:
        return None

def normalize_games(payload: dict):
    games = payload.get("games", []) or []
    out = []
    for g in games:
        league = g.get("league") or g.get("tournament") or ""
        home = g.get("home") or ""
        away = g.get("away") or ""
        # kickoff / start / datetime
        dt = parse_dt(g.get("kickoff") or g.get("start") or g.get("datetime"))
        channel = g.get("channel") or g.get("tv") or ""

        # pubs/where kan være liste av str eller liste av dict
        pubs_raw = g.get("where") or g.get("pubs") or []
        pubs = []
        if isinstance(pubs_raw, list):
            for p in pubs_raw:
                if isinstance(p, str):
                    pubs.append(p)
                elif isinstance(p, dict):
                    name = p.get("name") or ""
                    city = p.get("city")
                    pubs.append(f"{name} ({city})" if city else name)
        elif isinstance(pubs_raw, str):
            pubs = [pubs_raw]

        out.append({
            "league": league.strip(),
            "home": home.strip(),
            "away": away.strip(),
            "dt": dt,
            "channel": channel.strip(),
            "pubs": [x for x in pubs if x],
        })
    return out

def fmt_dt(dt: datetime | None):
    if not dt:
        return "Ukjent tid"
    return dt.strftime("%a %d.%m.%Y kl %H:%M")

def is_upcoming(dt: datetime | None):
    if not dt:
        return True
    now = datetime.now(TZ)
    return dt >= now

def render_cards(games: list[dict]):
    if not games:
        st.info("Ingen kamper/arrangementer å vise (sjekk at JSON har data).")
        return

    for g in games:
        title = f"{g['home']} vs {g['away']}".strip(" vs ")
        st.markdown(
            f"""
            <div class="card">
              <div style="font-size:1.05rem; font-weight:700;">{title}</div>
              <div class="meta">{fmt_dt(g.get("dt"))}</div>
              <div style="margin-top:8px;">
                {f"<span class='badge'>{g['league']}</span>" if g.get("league") else ""}
                {f"<span class='badge'>📺 {g['channel']}</span>" if g.get("channel") else ""}
              </div>
              <div style="margin-top:10px;" class="small">
                <b>Hvor:</b> {", ".join(g.get("pubs") or []) if (g.get("pubs")) else "Ikke satt"}
              </div>
            </div>
            """,
            unsafe_allow_html=True
        )

def build_filters(games: list[dict], key_prefix: str):
    # Samle filter-verdier
    leagues = sorted({g["league"] for g in games if g.get("league")})
    pubs = sorted({p for g in games for p in (g.get("pubs") or [])})

    c1, c2, c3, c4 = st.columns([1.2, 1.2, 1.2, 1.4])
    with c1:
        only_upcoming = st.toggle("Vis kun kommende", value=True, key=f"{key_prefix}_upcoming")
    with c2:
        league_sel = st.multiselect("Liga/turnering", leagues, default=[], key=f"{key_prefix}_league")
    with c3:
        pub_sel = st.multiselect("Sted (pub)", pubs, default=[], key=f"{key_prefix}_pub")
    with c4:
        q = st.text_input("Søk (lag/liga/pub)", value="", key=f"{key_prefix}_q")

    # Sortering
    sort_mode = st.radio("Sorter", ["Tid (snart først)", "Tid (senest først)"], horizontal=True, key=f"{key_prefix}_sort")
    reverse = (sort_mode == "Tid (senest først)")

    filtered = []
    for g in games:
        if only_upcoming and not is_upcoming(g.get("dt")):
            continue
        if league_sel and g.get("league") not in league_sel:
            continue
        if pub_sel:
            gp = set(g.get("pubs") or [])
            if not any(p in gp for p in pub_sel):
                continue
        if q.strip():
            qq = q.strip().lower()
            hay = " ".join([
                g.get("league",""),
                g.get("home",""),
                g.get("away",""),
                g.get("channel",""),
                " ".join(g.get("pubs") or [])
            ]).lower()
            if qq not in hay:
                continue
        filtered.append(g)

    # sorter på dt (None håndteres)
    def sort_key(x):
        dt = x.get("dt")
        return dt if dt else datetime(2100,1,1,tzinfo=TZ)

    filtered.sort(key=sort_key, reverse=reverse)
    return filtered

# ----------------------------
# LOAD DATA
# ----------------------------
@st.cache_data(show_spinner=False)
def load_category(filename: str):
    payload = _read_json_file(DATA_DIR / filename)
    return normalize_games(payload)

football = load_category("football.json")
handball = load_category("handball.json")
wintersport = load_category("wintersport.json")
vm2026 = load_category("vm2026.json")

# ----------------------------
# HEADER
# ----------------------------
now = datetime.now(TZ).strftime("%d.%m.%Y %H:%M")
st.title("Grenland Live – Sport")
st.caption(f"Sist oppdatert (lokalt): {now} • Leser fra /data/*.json")

with st.expander("📁 Sjekk at filene finnes", expanded=False):
    st.write("Forventet struktur:")
    st.code(
        """.
├─ app.py
└─ data/
   ├─ football.json
   ├─ handball.json
   ├─ wintersport.json
   └─ vm2026.json
""",
        language="text"
    )
    missing = [f for f in ["football.json","handball.json","wintersport.json","vm2026.json"] if not (DATA_DIR/f).exists()]
    if missing:
        st.warning("Mangler: " + ", ".join(missing))
    else:
        st.success("Alle filene finnes ✅")

st.markdown("---")

# ----------------------------
# TABS / MENU
# ----------------------------
tabs = st.tabs(["⚽ Fotball", "🤾 Håndball", "⛷️ Vintersport", "🏆 VM 2026"])

with tabs[0]:
    st.subheader("Fotball")
    filtered = build_filters(football, "football")
    render_cards(filtered)

with tabs[1]:
    st.subheader("Håndball")
    filtered = build_filters(handball, "handball")
    render_cards(filtered)

with tabs[2]:
    st.subheader("Vintersport")
    filtered = build_filters(wintersport, "wintersport")
    render_cards(filtered)

with tabs[3]:
    st.subheader("VM 2026")
    filtered = build_filters(vm2026, "vm2026")
    render_cards(filtered)

# ----------------------------
# OPTIONAL: RAW TABLE VIEW
# ----------------------------
with st.expander("🧾 Se tabell (debug)", expanded=False):
    def to_df(games):
        rows = []
        for g in games:
            rows.append({
                "Tid": fmt_dt(g.get("dt")),
                "Liga": g.get("league",""),
                "Hjemme": g.get("home",""),
                "Borte": g.get("away",""),
                "TV": g.get("channel",""),
                "Hvor": ", ".join(g.get("pubs") or []),
            })
        return pd.DataFrame(rows)

    st.write("Fotball:")
    st.dataframe(to_df(football), use_container_width=True)
    st.write("Håndball:")
    st.dataframe(to_df(handball), use_container_width=True)
    st.write("Vintersport:")
    st.dataframe(to_df(wintersport), use_container_width=True)
    st.write("VM 2026:")
    st.dataframe(to_df(vm2026), use_container_width=True)
