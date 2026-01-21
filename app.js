# app.py — Grenland Live Sport (FAILSAFE / NO BLANK PAGE)
# -------------------------------------------------------
# - Viser alltid UI selv om data mangler/feiler
# - Leser fra ./data/*.json
# - Timezone: Europe/Oslo

import json
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo

import streamlit as st

TZ = ZoneInfo("Europe/Oslo")

# ----------------------------
# PAGE CONFIG
# ----------------------------
st.set_page_config(page_title="Grenland Live – Sport", layout="wide")

# ----------------------------
# SAFE, MINIMAL CSS (ikke aggressiv)
# ----------------------------
CSS = """
<style>
/* Litt lys bakgrunn på "canvas" */
[data-testid="stAppViewContainer"] { background: #f6f8ff; }

/* Kort / cards */
.card{
  background:#ffffff;
  border:1px solid rgba(11,18,32,.12);
  border-radius:16px;
  padding:14px;
  margin:10px 0;
}
.meta{ color: rgba(11,18,32,.65); font-size: .92rem; }
.badge{
  display:inline-block;
  padding:4px 10px;
  border-radius:999px;
  border:1px solid rgba(11,18,32,.15);
  background:#eef1ff;
  font-size:.82rem;
  margin-right:6px;
}
hr{ border:none; border-top:1px solid rgba(11,18,32,.12); margin: 14px 0; }
</style>
"""
st.markdown(CSS, unsafe_allow_html=True)

# ----------------------------
# DATA HELPERS
# ----------------------------
BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"

def parse_dt(val: str | None):
    if not val:
        return None
    try:
        dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=TZ)
        return dt.astimezone(TZ)
    except Exception:
        return None

def safe_read_json(path: Path) -> dict:
    # Returnerer alltid en dict med "games"
    if not path.exists():
        return {"games": []}
    try:
        txt = path.read_text(encoding="utf-8")
        data = json.loads(txt)
        if isinstance(data, dict) and "games" in data:
            return data
        # Hvis noen har lagret liste direkte
        if isinstance(data, list):
            return {"games": data}
        return {"games": []}
    except Exception as e:
        # Legg feilen i et felt så vi kan vise den
        return {"games": [], "_error": f"{e.__class__.__name__}: {e}"}

def normalize_games(payload: dict) -> list[dict]:
    games = payload.get("games", []) or []
    out = []
    for g in games:
        # Tåler forskjellige feltnavn
        league = (g.get("league") or g.get("tournament") or "").strip()
        home = (g.get("home") or "").strip()
        away = (g.get("away") or "").strip()

        dt = parse_dt(g.get("kickoff") or g.get("start") or g.get("datetime"))

        channel = (g.get("channel") or g.get("tv") or "").strip()

        pubs_raw = g.get("where") or g.get("pubs") or []
        pubs = []
        if isinstance(pubs_raw, list):
            for p in pubs_raw:
                if isinstance(p, str):
                    pubs.append(p)
                elif isinstance(p, dict):
                    name = (p.get("name") or "").strip()
                    city = (p.get("city") or "").strip()
                    if name and city:
                        pubs.append(f"{name} ({city})")
                    elif name:
                        pubs.append(name)
        elif isinstance(pubs_raw, str):
            pubs = [pubs_raw]

        out.append({
            "league": league,
            "home": home,
            "away": away,
            "dt": dt,
            "channel": channel,
            "pubs": [x for x in pubs if x],
        })
    return out

def fmt_dt(dt):
    if not dt:
        return "Tid ikke satt"
    return dt.strftime("%a %d.%m.%Y kl %H:%M")

def render_cards(games: list[dict]):
    if not games:
        st.info("Ingen arrangementer å vise (sjekk JSON-filene).")
        return

    # Sorter: først de med tid, så uten
    def key(x):
        return x["dt"] if x["dt"] else datetime(2100, 1, 1, tzinfo=TZ)

    for g in sorted(games, key=key):
        title = " vs ".join([x for x in [g.get("home"), g.get("away")] if x]).strip()
        if not title:
            title = "(Uten lagnavn)"

        league_badge = f"<span class='badge'>{g['league']}</span>" if g.get("league") else ""
        tv_badge = f"<span class='badge'>📺 {g['channel']}</span>" if g.get("channel") else ""

        where_txt = ", ".join(g.get("pubs") or []) if g.get("pubs") else "Ikke satt"

        st.markdown(
            f"""
            <div class="card">
              <div style="font-size:1.05rem; font-weight:700;">{title}</div>
              <div class="meta">{fmt_dt(g.get("dt"))}</div>
              <div style="margin-top:8px;">
                {league_badge}
                {tv_badge}
              </div>
              <div class="meta" style="margin-top:10px;">
                <b>Hvor:</b> {where_txt}
              </div>
            </div>
            """,
            unsafe_allow_html=True
        )

def load_category(filename: str):
    payload = safe_read_json(DATA_DIR / filename)
    games = normalize_games(payload)
    err = payload.get("_error")
    return games, err

# ----------------------------
# APP (WRAP I TRY så du aldri får blank side)
# ----------------------------
try:
    st.title("Grenland Live – Sport")
    st.caption(f"Klokke: {datetime.now(TZ).strftime('%d.%m.%Y %H:%M')} • Leser fra ./data/*.json")

    # Status / fil-sjekk
    with st.expander("📁 Filstatus (viktig)", expanded=False):
        st.write("Forventet struktur:")
        st.code(
            """.\n├─ app.py\n└─ data/\n   ├─ football.json\n   ├─ handball.json\n   ├─ wintersport.json\n   └─ vm2026.json\n""",
            language="text"
        )
        files = ["football.json", "handball.json", "wintersport.json", "vm2026.json"]
        for f in files:
            p = DATA_DIR / f
            st.write(("✅" if p.exists() else "❌"), f, "—", str(p))

    football, err_f = load_category("football.json")
    handball, err_h = load_category("handball.json")
    wintersport, err_w = load_category("wintersport.json")
    vm2026, err_v = load_category("vm2026.json")

    # Vis eventuelle JSON-lesefeil
    errs = [( "football.json", err_f), ("handball.json", err_h), ("wintersport.json", err_w), ("vm2026.json", err_v)]
    bad = [(f,e) for f,e in errs if e]
    if bad:
        st.error("En eller flere JSON-filer kunne ikke leses (format-feil). Se detaljer under.")
        with st.expander("Detaljer på JSON-feil", expanded=True):
            for f,e in bad:
                st.write(f"**{f}**: {e}")

    st.markdown("---")

    tabs = st.tabs(["⚽ Fotball", "🤾 Håndball", "⛷️ Vintersport", "🏆 VM 2026"])

    with tabs[0]:
        st.subheader("Fotball")
        render_cards(football)

    with tabs[1]:
        st.subheader("Håndball")
        render_cards(handball)

    with tabs[2]:
        st.subheader("Vintersport")
        render_cards(wintersport)

    with tabs[3]:
        st.subheader("VM 2026")
        render_cards(vm2026)

except Exception as e:
    # Dette gjør at du aldri får "helt hvit side" uten forklaring
    st.error("Appen krasjet – her er feilen:")
    st.code(f"{e.__class__.__name__}: {e}", language="text")
    st.info("Tips: Dette skjer ofte hvis en JSON-fil har komma/klammefeil, eller hvis filene ikke ligger i ./data/")
