// Grenland Live – One-page app (forside + 4 visninger)
// SPORT:
//  - Leser ALL fotball fra data/football.json og lager liga-knapper automatisk (via feltet "league")
//  - Leser håndball menn/damer + vintersport menn/kvinner som egne liga-knapper
//  - Sorterer etter dato, robust parsing + fikser feil tegnkoding (TromsÃ¸ -> Tromsø)
// Fungerer på GitHub Pages project repo: /Grenland-Live/

const REPO_NAME = "Grenland-Live";
const BASE = location.pathname.startsWith(`/${REPO_NAME}/`) ? `/${REPO_NAME}/` : "/";
const url = (p) => `${BASE}${p}`.replaceAll("//", "/");

const TZ = "Europe/Oslo";
const $ = (id) => document.getElementById(id);

const homeEl = $("home");
const appEl  = $("app");
const listEl = $("list");
const h2El   = $("panelH2");
const metaEl = $("panelMeta");
const qEl    = $("q");

const tabButtons = {
  sport: $("tabSport"),
  puber: $("tabPuber"),
  events: $("tabEvents"),
  vm2026: $("tabVM"),
};

// ===== KILDER =====
// Sport bruker football.json som hovedkilde for fotball-ligaer
const SOURCES = {
  sport: [
    { id:"football_all", name:"Fotball", file:"data/football.json", mode:"group_by_league" },

    { id:"hb_m", name:"Håndball VM 2026 – Menn", file:"data/handball_vm_2026_menn.json", mode:"single_league" },
    { id:"hb_k", name:"Håndball VM 2026 – Damer", file:"data/handball_vm_2026_damer.json", mode:"single_league" },

    { id:"ws_m", name:"Vintersport – Menn", file:"data/vintersport_menn.json", mode:"single_league" },
    { id:"ws_k", name:"Vintersport – Kvinner", file:"data/vintersport_kvinner.json", mode:"single_league" },
  ],
  puber: [
    { id:"pubs", name:"Puber", file:"data/pubs.json" }
  ],
  events: [
    { id:"events", name:"Events", file:"data/events.json" }
  ],
  vm2026: [
    { id:"vm2026", name:"VM 2026", file:"data/vm2026.json" }
  ]
};

// -------- Fetch JSON (robust) --------
async function fetchJSON(path){
  const full = url(path) + `?v=${Date.now()}`;
  const r = await fetch(full, { cache: "no-store" });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  const txt = await r.text();
  if (txt.trim().startsWith("<")) throw new Error(`${path}: returned HTML (wrong path / 404 page)`);
  return JSON.parse(txt);
}

// -------- Encoding / mojibake fix (global) --------
function fixText(value){
  if (value == null) return "";
  let s = String(value);
  if (!s.includes("Ã") && !s.includes("Â")) return s;

  const map = [
    ["Ã¸","ø"],["Ã˜","Ø"],["Ã¥","å"],["Ã…","Å"],["Ã¦","æ"],["Ã†","Æ"],
    ["Ã©","é"],["Ã¨","è"],["Ãª","ê"],["Ã¡","á"],["Ã³","ó"],["Ãº","ú"],
    ["Ã¤","ä"],["Ã¶","ö"],["Ã¼","ü"],["Ã„","Ä"],["Ã–","Ö"],["Ãœ","Ü"],
    ["Ã±","ñ"],["ÃŸ","ß"],
    ["Â "," "],["Â·","·"],["Â–","–"],["Â—","—"],["Â«","«"],["Â»","»"]
  ];
  for (const [bad, good] of map) s = s.split(bad).join(good);
  return s;
}

function escapeHTML(s){
  s = fixText(s);
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// -------- Tid / sortering --------
function parseISO(iso){
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}
function fmtOslo(iso){
  const d = parseISO(iso);
  if (!d) return "Ukjent tid";
  return d.toLocaleString("no-NO", {
    timeZone: TZ,
    weekday:"short",
    year:"numeric",
    month:"2-digit",
    day:"2-digit",
    hour:"2-digit",
    minute:"2-digit"
  });
}
function getWhen(obj){
  return obj.kickoff || obj.start || obj.datetime || obj.date || obj.time || obj.utcDate || null;
}
function scoreSort(a,b){
  const ta = parseISO(getWhen(a))?.getTime() ?? 0;
  const tb = parseISO(getWhen(b))?.getTime() ?? 0;
  return ta - tb;
}

// -------- Robust extractor (tåler mange JSON-varianter) --------
function looksLikeEventObj(o){
  if (!o || typeof o !== "object") return false;
  const hasTime = !!getWhen(o);
  const hasTeams = !!(o.home && o.away) || !!(o.homeTeam && o.awayTeam);
  const hasTitle = !!(o.title || o.name || o.event);
  return (hasTime && (hasTeams || hasTitle));
}

function normalizeItem(o){
  if (!o || typeof o !== "object") return o;

  // football-data style
  if (!o.home && o.homeTeam && typeof o.homeTeam === "object") {
    o = { ...o, home: o.homeTeam.name ?? o.homeTeam.shortName ?? o.homeTeam.tla ?? o.homeTeam };
  }
  if (!o.away && o.awayTeam && typeof o.awayTeam === "object") {
    o = { ...o, away: o.awayTeam.name ?? o.awayTeam.shortName ?? o.awayTeam.tla ?? o.awayTeam };
  }
  if (!o.kickoff && o.utcDate) o = { ...o, kickoff: o.utcDate };

  // fiks tekstfelt (ikke destruktivt)
  const copy = { ...o };
  for (const k of Object.keys(copy)){
    if (typeof copy[k] === "string") copy[k] = fixText(copy[k]);
  }
  return copy;
}

function extractItems(obj){
  if (!obj) return [];
  if (Array.isArray(obj)) return obj.map(normalizeItem);

  const keys = ["games","matches","fixtures","events","items","data","response","results"];
  for (const k of keys){
    if (Array.isArray(obj[k])) return obj[k].map(normalizeItem);
  }

  // nestet
  for (const k of Object.keys(obj)){
    const v = obj[k];
    if (v && typeof v === "object") {
      for (const kk of keys){
        if (Array.isArray(v[kk])) return v[kk].map(normalizeItem);
      }
    }
  }

  // rekursiv fallback
  const out = [];
  function walk(node, depth=0){
    if (!node || depth > 6) return;
    if (Array.isArray(node)){
      const arr = node;
      if (arr.length && arr.every(x => x && typeof x === "object")){
        const sample = arr.slice(0, Math.min(40, arr.length));
        const score = sample.filter(looksLikeEventObj).length / sample.length;
        if (score >= 0.35){
          out.push(...arr.map(normalizeItem));
          return;
        }
      }
      for (const it of arr) walk(it, depth+1);
      return;
    }
    if (typeof node === "object"){
      for (const k of Object.keys(node)) walk(node[k], depth+1);
    }
  }
  walk(obj, 0);
  return out;
}

// -------- UI state --------
let CURRENT = "sport";
let CURRENT_LEAGUE = "ALL";

// -------- Cache --------
const CACHE = {
  sport: { loaded:false, leagues:[], status:[] }, // leagues: [{id,name,items}]
  puber: { loaded:false, items:[], status:[] },
  events: { loaded:false, items:[], status:[] },
  vm2026: { loaded:false, items:[], status:[] }
};

async function loadTab(tab){
  const conf = SOURCES[tab] || [];
  const status = [];

  if (tab === "sport"){
    const leaguesById = new Map(); // id -> {id,name,items}

    for (const src of conf){
      try{
        const json = await fetchJSON(src.file);
        const items = extractItems(json).slice().sort(scoreSort);

        if (src.mode === "group_by_league"){
          // Gruppér fotball på item.league
          for (const it of items){
            const leagueName = fixText(it.league || it.competition || it.tournament || "Ukjent liga");
            const id = "fb_" + leagueName.toLowerCase().replaceAll(" ", "_").replaceAll("/", "_").replaceAll(".", "");
            if (!leaguesById.has(id)) leaguesById.set(id, { id, name: leagueName, items: [] });
            leaguesById.get(id).items.push(it);
          }
        } else {
          // Én knapp per kilde (håndball/vintersport)
          const id = src.id;
          leaguesById.set(id, { id, name: src.name, items });
        }

        status.push({ ...src, ok:true, count: items.length });
      }catch(e){
        console.warn("load failed:", src.file, e);
        // tom liga-knapp likevel (så du ser den)
        leaguesById.set(src.id, { id: src.id, name: src.name, items: [] });
        status.push({ ...src, ok:false, error:String(e) });
      }
    }

    // sortér items i hver liga
    for (const l of leaguesById.values()) l.items.sort(scoreSort);

    // lag liste i en stabil rekkefølge: fotball-ligaer alfabetisk + resten
    const leagues = Array.from(leaguesById.values());
    leagues.sort((a,b) => a.name.localeCompare(b.name, "no"));

    CACHE.sport = { loaded:true, leagues, status };
    return;
  }

  // andre tabs = flat liste
  const allItems = [];
  for (const src of conf){
    try{
      const json = await fetchJSON(src.file);
      const items = extractItems(json);
      allItems.push(...items);
      status.push({ ...src, ok:true, count: items.length });
    }catch(e){
      console.warn("load failed:", src.file, e);
      status.push({ ...src, ok:false, error:String(e) });
    }
  }

  allItems.sort(scoreSort);
  CACHE[tab] = { loaded:true, items: allItems, status };
}

function setActiveTabUI(tab){
  for (const key of Object.keys(tabButtons)){
    tabButtons[key].classList.toggle("active", key === tab);
  }
}

function renderMissingWarning(status){
  const missing = status.filter(s => !s.ok);
  if (!missing.length) return "";
  return `
    <div class="item">
      <div class="itemTitle">Noen JSON-filer ble ikke funnet:</div>
      <div class="tagRow">
        ${missing.map(m => `<span class="tag">${escapeHTML(m.file)} (${escapeHTML(m.error)})</span>`).join("")}
      </div>
      <div style="margin-top:8px;color:rgba(11,18,32,.75);font-size:12px">
        Sjekk at filene finnes i <code>/data/</code> og at navnet er helt likt (store/små bokstaver).
      </div>
    </div>
  `;
}

function buildItemView(x){
  const whenIso = getWhen(x);
  const when = whenIso ? fmtOslo(whenIso) : "";

  const title =
    (x.home && x.away) ? `${fixText(x.home)} – ${fixText(x.away)}` :
    fixText(x.title || x.name || x.event || "Ukjent");

  const league = fixText(x.league || x.competition || x.tournament || "");
  const channel = fixText(x.channel || x.tv || x.broadcast || "");
  const where =
    Array.isArray(x.where) ? x.where.map(fixText).join(", ") :
    Array.isArray(x.pubs) ? x.pubs.map(p => fixText(p?.name || p)).join(", ") :
    fixText(x.where || x.place || x.location || "");

  return `
    <div class="item">
      <div class="itemTop">
        <div class="itemTitle">${escapeHTML(title)}</div>
        <div class="tag">${escapeHTML(when || "")}</div>
      </div>
      <div class="tagRow">
        ${league ? `<span class="tag">${escapeHTML(league)}</span>` : ""}
        ${channel ? `<span class="tag">${escapeHTML(channel)}</span>` : ""}
        ${where ? `<span class="tag">${escapeHTML(where)}</span>` : ""}
      </div>
    </div>
  `;
}

// ===== SPORT RENDER =====
function renderSport(){
  const q = fixText((qEl.value || "")).trim().toLowerCase();
  const { leagues, status } = CACHE.sport;

  h2El.textContent = "Sport";
  const okCount = status.filter(s => s.ok).length;
  metaEl.textContent = `Kilder: ${okCount}/${status.length} • BASE: ${BASE}`;

  const total = leagues.reduce((a,l)=>a+(l.items?.length||0),0);
  const btns = [{ id:"ALL", name:"Alle", count: total }, ...leagues.map(l => ({ id:l.id, name:l.name, count:l.items.length }))];

  let html = "";
  html += renderMissingWarning(status);

  // knapper
  html += `
    <div class="item" style="border:none;padding:0;background:transparent">
      <div class="tagRow" style="gap:10px">
        ${btns.map(b => `
          <button
            class="pill ${CURRENT_LEAGUE === b.id ? "active" : ""}"
            type="button"
            data-league="${escapeHTML(b.id)}"
            style="border:3px solid #0b1220"
          >${escapeHTML(b.name)} (${b.count})</button>
        `).join("")}
      </div>
    </div>
  `;

  // velg items
  let selected = [];
  if (CURRENT_LEAGUE === "ALL"){
    for (const l of leagues) selected.push(...l.items);
  } else {
    const found = leagues.find(l => l.id === CURRENT_LEAGUE);
    selected = found ? found.items.slice() : [];
  }
  selected.sort(scoreSort);

  if (q){
    selected = selected.filter(x => fixText(JSON.stringify(x)).toLowerCase().includes(q));
  }

  if (!selected.length){
    html += `<div class="item">Ingen data i denne ligaen.</div>`;
  } else {
    html += selected.map(buildItemView).join("");
  }

  listEl.innerHTML = html;

  // wire knapper
  listEl.querySelectorAll("[data-league]").forEach(btn => {
    btn.addEventListener("click", () => {
      CURRENT_LEAGUE = btn.getAttribute("data-league");
      renderSport();
    });
  });
}

// ===== GENERIC RENDER =====
function renderGeneric(tab){
  const q = fixText((qEl.value || "")).trim().toLowerCase();
  const { items, status } = CACHE[tab];

  const titleMap = {
    puber: "Puber",
    events: "Kommende eventer",
    vm2026: "VM kalender 2026"
  };
  h2El.textContent = fixText(titleMap[tab] || "Grenland Live");

  const okCount = status.filter(s => s.ok).length;
  metaEl.textContent = `Kilder: ${okCount}/${status.length} • BASE: ${BASE}`;

  let filtered = items;
  if (q) filtered = items.filter(x => fixText(JSON.stringify(x)).toLowerCase().includes(q));
  filtered.sort(scoreSort);

  let html = "";
  html += renderMissingWarning(status);
  html += filtered.length ? filtered.map(buildItemView).join("") : `<div class="item">Ingen treff.</div>`;
  listEl.innerHTML = html;
}

function render(tab){
  if (tab === "sport") return renderSport();
  return renderGeneric(tab);
}

async function show(tab){
  CURRENT = tab;
  homeEl.classList.add("hidden");
  appEl.classList.remove("hidden");
  setActiveTabUI(tab);

  if (tab === "sport") CURRENT_LEAGUE = "ALL";

  if (!CACHE[tab]?.loaded){
    h2El.textContent = "Laster…";
    metaEl.textContent = "";
    listEl.innerHTML = `<div class="item">Laster data…</div>`;
    await loadTab(tab);
  }
  render(tab);
}

function backHome(){
  appEl.classList.add("hidden");
  homeEl.classList.remove("hidden");
  qEl.value = "";
  CURRENT_LEAGUE = "ALL";
}

function boot(){
  document.querySelectorAll("[data-go]").forEach(btn => btn.addEventListener("click", () => show(btn.dataset.go)));
  document.querySelectorAll("[data-tab]").forEach(btn => btn.addEventListener("click", () => show(btn.dataset.tab)));
  qEl.addEventListener("input", () => render(CURRENT));
  $("backHome")?.addEventListener("click", backHome);
  $("backHome2")?.addEventListener("click", backHome);
}

boot();
