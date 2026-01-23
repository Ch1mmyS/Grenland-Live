// Grenland Live – One-page app (forside + 4 visninger)
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

// --- Velg hvilke JSON-filer du vil bruke ---
// Tilpass disse om filnavnene dine er annerledes.
const SOURCES = {
  sport: [
    { name:"Eliteserien", file:"data/eliteserien.json" },
    { name:"OBOS-ligaen", file:"data/obos.json" },
    { name:"Premier League", file:"data/premier_league.json" },
    { name:"Champions League", file:"data/champions.json" },
    { name:"La Liga", file:"data/laliga.json" },
    { name:"Håndball VM 2026 – Menn", file:"data/handball_vm_2026_menn.json" },
    { name:"Håndball VM 2026 – Damer", file:"data/handball_vm_2026_damer.json" }
    // legg til flere her hvis du vil
  ],
  puber: [
    { name:"Puber", file:"data/pubs.json" } // lag denne hvis du ikke har den
  ],
  events: [
    { name:"Events", file:"data/events.json" }
  ],
  vm2026: [
    { name:"VM 2026", file:"data/vm2026.json" }
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

  // OBS: Hvis JSON-fila er lagret i feil encoding kan selve teksten inneholde mojibake,
  // men JSON.parse vil fortsatt funke. Vi fikser visning i fixText()/escapeHTML().
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

  // Ikke rør tall/boolean/objekter; stringify håndteres der det trengs
  let s = String(value);

  // Rask exit hvis ingen typiske feil-sekvenser
  if (!s.includes("Ã") && !s.includes("Â")) return s;

  // Vanlige feil: UTF-8 bytes tolket som Latin-1/Windows-1252
  // Dette dekker norske bokstaver + noen vanlige tegn.
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

// -------- Data cache --------
const CACHE = {
  sport: { loaded:false, items:[], status:[] },
  puber: { loaded:false, items:[], status:[] },
  events: { loaded:false, items:[], status:[] },
  vm2026: { loaded:false, items:[], status:[] }
};

async function loadTab(tab){
  const conf = SOURCES[tab] || [];
  const status = [];
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

function render(tab){
  const q = fixText((qEl.value || "")).trim().toLowerCase();
  const { items, status } = CACHE[tab] || { items:[], status:[] };

  // Header
  const titleMap = {
    sport: "Sport",
    puber: "Puber",
    events: "Kommende eventer",
    vm2026: "VM kalender 2026"
  };
  h2El.textContent = fixText(titleMap[tab] || "Grenland Live");

  // Meta (viser hvilke filer som lastet / manglet)
  const okCount = status.filter(s => s.ok).length;
  metaEl.textContent = `Kilder: ${okCount}/${status.length} • BASE: ${BASE}`;

  // Filter (søk i hele objektet, men fixer tekst først)
  let filtered = items;
  if (q){
    filtered = items.filter(x => fixText(JSON.stringify(x)).toLowerCase().includes(q));
  }

  // Render list
  listEl.innerHTML = "";

  if (!status.length){
    listEl.innerHTML = `<div class="item">Ingen kilder konfigurert for ${escapeHTML(tab)}.</div>`;
    return;
  }

  // Hvis noe mangler, vis toppvarsling
  const missing = status.filter(s => !s.ok);
  if (missing.length){
    const warn = document.createElement("div");
    warn.className = "item";
    warn.innerHTML = `
      <div class="itemTitle">Noen JSON-filer ble ikke funnet:</div>
      <div class="tagRow">
        ${missing.map(m => `<span class="tag">${escapeHTML(m.file)} (${escapeHTML(m.error)})</span>`).join("")}
      </div>
      <div style="margin-top:8px;color:rgba(11,18,32,.75);font-size:12px">
        Sjekk at filene finnes i <code>/data/</code> og at navnet er helt likt (store/små bokstaver).
      </div>
    `;
    listEl.appendChild(warn);
  }

  if (!filtered.length){
    listEl.innerHTML += `<div class="item">Ingen treff.</div>`;
    return;
  }

  // Vis elementer
  for (const x of filtered){
    const whenIso = getWhen(x);
    const when = whenIso ? fmtOslo(whenIso) : "";

    // Viktig: fixText gjennom escapeHTML, så "TromsÃ¸" blir "Tromsø"
    const title =
      (x.home && x.away) ? `${fixText(x.home)} – ${fixText(x.away)}` :
      fixText(x.title || x.name || x.event || "Ukjent");

    const league = fixText(x.league || x.competition || x.tournament || "");
    const channel = fixText(x.channel || x.tv || x.broadcast || "");
    const where =
      Array.isArray(x.where) ? x.where.map(fixText).join(", ") :
      Array.isArray(x.pubs) ? x.pubs.map(p => fixText(p?.name || p)).join(", ") :
      fixText(x.where || x.place || x.location || "");

    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div class="itemTop">
        <div class="itemTitle">${escapeHTML(title)}</div>
        <div class="tag">${escapeHTML(when || "")}</div>
      </div>
      <div class="tagRow">
        ${league ? `<span class="tag">${escapeHTML(league)}</span>` : ""}
        ${channel ? `<span class="tag">${escapeHTML(channel)}</span>` : ""}
        ${where ? `<span class="tag">${escapeHTML(where)}</span>` : ""}
      </div>
    `;
    listEl.appendChild(row);
  }
}

let CURRENT = "sport";

async function show(tab){
  CURRENT = tab;
  homeEl.classList.add("hidden");
  appEl.classList.remove("hidden");

  setActiveTabUI(tab);

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
