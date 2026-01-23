// Grenland Live – One-page app (forside + 4 visninger)
// Sport: viser egne knapper for hver liga + kamper sortert i riktig liga
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

// ===== KILDER (SPORT-KNAPPER = KILDENE UNDER) =====
// Hver source under blir en EGEN knapp i Sport.
const SOURCES = {
  sport: [
    { id:"eliteserien", name:"Eliteserien", file:"data/eliteserien.json" },
    { id:"obos",        name:"OBOS-ligaen", file:"data/obos.json" },
    { id:"premier",     name:"Premier League", file:"data/premier_league.json" },
    { id:"cl",          name:"Champions League", file:"data/champions.json" },
    { id:"laliga",      name:"La Liga", file:"data/laliga.json" },

    // Håndball
    { id:"hb_m",        name:"Håndball VM 2026 – Menn", file:"data/handball_vm_2026_menn.json" },
    { id:"hb_k",        name:"Håndball VM 2026 – Damer", file:"data/handball_vm_2026_damer.json" },

    // Vintersport (slik du skrev: herrer + damer)
    { id:"ws_m",        name:"Vintersport – Menn", file:"data/vintersport_menn.json" },
    { id:"ws_k",        name:"Vintersport – Kvinner", file:"data/vintersport_kvinner.json" }
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

  // Beskytter mot GitHub Pages som returnerer HTML (typisk 404-side)
  if (txt.trim().startsWith("<")) {
    throw new Error(`${path}: returned HTML (wrong path / 404 page)`);
  }

  return JSON.parse(txt);
}

// -------- Normalisering av ulike JSON-formater --------
// Støtter:
// 1) { "games": [...] }
// 2) { "events": [...] }
// 3) { "items": [...] }
// 4) [...]
function extractItems(obj){
  if (!obj) return [];
  if (Array.isArray(obj)) return obj;
  if (Array.isArray(obj.games)) return obj.games;
  if (Array.isArray(obj.events)) return obj.events;
  if (Array.isArray(obj.items)) return obj.items;

  for (const k of Object.keys(obj)){
    if (Array.isArray(obj[k])) return obj[k];
  }
  return [];
}

// -------- Tegnkoding / “mojibake” fix (global) --------
// Fikser typiske UTF-8->Latin1 feil: TromsÃ¸ -> Tromsø, etc.
function fixText(value){
  if (value == null) return "";

  let s = String(value);

  // Rask exit hvis ingen typiske feil-sekvenser
  if (!s.includes("Ã") && !s.includes("Â")) return s;

  const map = [
    ["Ã¸","ø"],["Ã˜","Ø"],["Ã¥","å"],["Ã…","Å"],["Ã¦","æ"],["Ã†","Æ"],
    ["Ã©","é"],["Ã¨","è"],["Ãª","ê"],["Ã¡","á"],["Ã³","ó"],["Ãº","ú"],
    ["Ã¤","ä"],["Ã¶","ö"],["Ã¼","ü"],["Ã„","Ä"],["Ã–","Ö"],["Ãœ","Ü"],
    ["Ã±","ñ"],["ÃŸ","ß"],
    ["Â "," "],["Â·","·"],["Â–","–"],["Â—","—"],["Â«","«"],["Â»","»"]
  ];

  for (const [bad, good] of map){
    s = s.split(bad).join(good);
  }

  return s;
}

// -------- HTML escape (bruker fixText først) --------
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
  return obj.kickoff || obj.start || obj.datetime || obj.date || obj.time || null;
}

function scoreSort(a,b){
  const ta = parseISO(getWhen(a))?.getTime() ?? 0;
  const tb = parseISO(getWhen(b))?.getTime() ?? 0;
  return ta - tb;
}

// -------- Sport: league state --------
let CURRENT = "sport";
let CURRENT_LEAGUE = "ALL"; // id fra sport sources, eller "ALL"

// -------- Data cache --------
const CACHE = {
  sport: { loaded:false, leagues:[], status:[] }, // leagues = [{id,name,items}]
  puber: { loaded:false, items:[], status:[] },
  events: { loaded:false, items:[], status:[] },
  vm2026: { loaded:false, items:[], status:[] }
};

async function loadTab(tab){
  const conf = SOURCES[tab] || [];
  const status = [];

  if (tab === "sport"){
    const leagues = [];

    for (const src of conf){
      try{
        const json = await fetchJSON(src.file);
        const items = extractItems(json).slice().sort(scoreSort);
        leagues.push({ id: src.id, name: src.name, items });
        status.push({ ...src, ok:true, count: items.length });
      }catch(e){
        console.warn("load failed:", src.file, e);
        leagues.push({ id: src.id, name: src.name, items: [] });
        status.push({ ...src, ok:false, error:String(e) });
      }
    }

    CACHE.sport = { loaded:true, leagues, status };
    return;
  }

  // andre tabs: vanlig flat liste
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

// ===== Render helpers =====
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

  const okCount = status.filter(s => s.ok).length;
  metaEl.textContent = `Kilder: ${okCount}/${status.length} • BASE: ${BASE}`;

  // Header
  h2El.textContent = "Sport";

  // liga-knapper
  const btns = [
    { id:"ALL", name:"Alle" },
    ...leagues.map(l => ({ id:l.id, name:l.name }))
  ];

  const leagueButtonsHTML = `
    <div class="item" style="border:none;padding:0;background:transparent">
      <div class="tagRow" style="gap:10px">
        ${btns.map(b => `
          <button
            class="pill ${CURRENT_LEAGUE === b.id ? "active" : ""}"
            type="button"
            data-league="${escapeHTML(b.id)}"
            style="border:3px solid #0b1220"
          >${escapeHTML(b.name)}</button>
        `).join("")}
      </div>
    </div>
  `;

  // velg items basert på liga
  let selectedItems = [];
  if (CURRENT_LEAGUE === "ALL"){
    for (const l of leagues) selectedItems.push(...l.items);
  } else {
    const found = leagues.find(l => l.id === CURRENT_LEAGUE);
    selectedItems = found ? found.items.slice() : [];
  }

  selectedItems.sort(scoreSort);

  // søk
  if (q){
    selectedItems = selectedItems.filter(x => fixText(JSON.stringify(x)).toLowerCase().includes(q));
  }

  // bygg liste
  let html = "";
  html += renderMissingWarning(status);
  html += leagueButtonsHTML;

  if (!selectedItems.length){
    html += `<div class="item">Ingen treff.</div>`;
  } else {
    html += selectedItems.map(buildItemView).join("");
  }

  listEl.innerHTML = html;

  // wire liga-knapper (etter render)
  listEl.querySelectorAll("[data-league]").forEach(btn => {
    btn.addEventListener("click", () => {
      CURRENT_LEAGUE = btn.getAttribute("data-league");
      renderSport();
    });
  });
}

// ===== GENERIC RENDER (puber/events/vm2026) =====
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
  if (q){
    filtered = items.filter(x => fixText(JSON.stringify(x)).toLowerCase().includes(q));
  }
  filtered.sort(scoreSort);

  let html = "";
  html += renderMissingWarning(status);

  if (!filtered.length){
    html += `<div class="item">Ingen treff.</div>`;
  } else {
    html += filtered.map(buildItemView).join("");
  }

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

  // reset league når du går inn i sport
  if (tab === "sport" && CURRENT_LEAGUE !== "ALL" && !CACHE.sport.loaded){
    CURRENT_LEAGUE = "ALL";
  }

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

// ---- Wiring ----
function boot(){
  // Forsideknapper
  document.querySelectorAll("[data-go]").forEach(btn => {
    btn.addEventListener("click", () => show(btn.dataset.go));
  });

  // Tabs
  document.querySelectorAll("[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => show(btn.dataset.tab));
  });

  // Søk
  qEl.addEventListener("input", () => render(CURRENT));

  // Back buttons
  $("backHome")?.addEventListener("click", backHome);
  $("backHome2")?.addEventListener("click", backHome);
}

boot();
