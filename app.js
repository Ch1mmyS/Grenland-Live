// /app.js (KOMPLETT FIL – ROOT)
// Grenland Live – UI loader (NO design changes)
// - Skjuler debug-OBS fra UI (logger kun i console)
// - Robust parsing av ulike JSON-formater
// - Bruker alltid per-liga filer i Sport

const TZ = "Europe/Oslo";
const DEFAULT_PUBS = [
  { name: "Gimle Pub", city: "Skien" },
  { name: "Vikinghjørnet", city: "Skien" },
  { name: "O’Learys Skien", city: "Skien" },
  { name: "The Old Irish Pub (Skien)", city: "Skien" },
  { name: "Union Bar", city: "Skien" },
  { name: "Tollboden Bar", city: "Porsgrunn" },
  { name: "Daimlers", city: "Porsgrunn" },
  { name: "Jimmys", city: "Porsgrunn" },
];

const DEFAULT_WHERE = ["Vikinghjørnet", "Gimle Pub"];

function $(id){ return document.getElementById(id); }
function show(el){ el && el.classList.remove("hidden"); }
function hide(el){ el && el.classList.add("hidden"); }

// ---------- TIME ----------
function fmtOslo(iso){
  try{
    return new Date(iso).toLocaleString("no-NO", { timeZone: TZ, weekday:"short", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" });
  }catch(e){
    return iso || "";
  }
}
function onlyTime(iso){
  try{
    return new Date(iso).toLocaleTimeString("no-NO", { timeZone: TZ, hour:"2-digit", minute:"2-digit" });
  }catch(e){ return ""; }
}

// ---------- FETCH ----------
async function fetchJSON(path){
  const url = path + (path.includes("?") ? "&" : "?") + "v=" + Date.now();
  const res = await fetch(url, { cache: "no-store" });
  if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return await res.json();
}

// ---------- LIST EXTRACTOR (robust) ----------
function extractList(obj, preferredKeys=[]){
  if(Array.isArray(obj)) return obj;
  if(!obj || typeof obj !== "object") return [];
  for(const k of preferredKeys){
    if(Array.isArray(obj[k])) return obj[k];
  }
  // common fallbacks
  const common = ["games","items","events","pubs","list","data","matches"];
  for(const k of common){
    if(Array.isArray(obj[k])) return obj[k];
  }
  return [];
}

// ---------- NORMALIZERS ----------
function normalizeGame(x){
  const league = x.league || x.competition || x.tournament || "";
  const home = x.home || x.homeTeam || x.team1 || "";
  const away = x.away || x.awayTeam || x.team2 || "";
  const kickoff = x.kickoff || x.start || x.dateTime || x.datetime || x.date || "";
  const channel = (x.channel || x.tv || x.broadcaster || x.kanal || "Ukjent") || "Ukjent";

  // where/pub mapping
  let where = [];
  if(Array.isArray(x.where)) where = x.where;
  else if(typeof x.where === "string" && x.where.trim()) where = [x.where.trim()];
  else if(Array.isArray(x.pubs)){
    where = x.pubs.map(p => (p && typeof p === "object" && p.name) ? p.name : String(p)).filter(Boolean);
  }
  // ensure Vikinghjørnet + Gimle first
  where = [...DEFAULT_WHERE, ...where].filter(Boolean);
  where = [...new Set(where)];

  return { league, home, away, kickoff, channel, where };
}

function normalizePub(x){
  if(typeof x === "string") return { name: x, city: "" };
  return {
    name: (x.name || x.title || "").trim(),
    city: (x.city || x.place || x.location || "").trim(),
  };
}

function normalizeEvent(x){
  return {
    title: (x.title || x.name || "Ukjent").trim(),
    date: (x.date || x.start || "").trim(),
    place: (x.place || x.location || "").trim(),
    desc: (x.desc || x.description || "").trim(),
    link: (x.link || x.url || "").trim(),
  };
}

function normalizeListItem(x){
  if(typeof x === "string") return { title: x, desc: "" };
  return { title: (x.title || x.name || "Ukjent").trim(), desc: (x.desc || x.description || "").trim() };
}

// ---------- MODAL ----------
function openModal(game){
  const backdrop = $("modalBackdrop");
  const title = $("modalTitle");
  const sub = $("modalSub");
  const kv = $("modalKV");
  if(!backdrop || !title || !sub || !kv) return;

  title.textContent = `${game.home} – ${game.away}`;
  sub.textContent = game.league || "";

  const kickoffText = game.kickoff ? fmtOslo(game.kickoff) : "Tid ikke oppgitt";
  const channelText = game.channel || "Ukjent";
  const whereText = (game.where && game.where.length) ? game.where.join(", ") : DEFAULT_WHERE.join(", ");

  kv.innerHTML = `
    <div class="k">Tid</div><div class="v">${kickoffText}</div>
    <div class="k">Kanal</div><div class="v">${channelText}</div>
    <div class="k">Hvor vises</div><div class="v">${whereText}</div>
  `;

  show(backdrop);
}

function closeModal(){
  hide($("modalBackdrop"));
}

// ---------- UI HELPERS ----------
function setEmpty(listEl, text){
  listEl.innerHTML = `<div class="empty">${text}</div>`;
}

function renderGames(listEl, games, q){
  const query = (q||"").toLowerCase().trim();
  const filtered = games.filter(g => {
    if(!query) return true;
    const hay = `${g.league} ${g.home} ${g.away} ${g.channel} ${(g.where||[]).join(" ")}`.toLowerCase();
    return hay.includes(query);
  });

  if(filtered.length === 0){
    setEmpty(listEl, "Ingen kamper funnet.");
    return;
  }

  listEl.innerHTML = "";
  filtered.slice(0, 200).forEach(g => {
    const time = g.kickoff ? fmtOslo(g.kickoff) : "Tid ikke oppgitt";
    const ch = g.channel || "Ukjent";
    const where = (g.where && g.where.length) ? g.where.slice(0,2).join(" • ") : DEFAULT_WHERE.join(" • ");

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="row">
        <div>
          <div class="teams">${g.home} – ${g.away}</div>
          <div class="muted small">${time}</div>
        </div>
        <div class="badge accent">${ch}</div>
      </div>
      <div class="badges">
        <span class="badge">${where}</span>
      </div>
    `;
    card.addEventListener("click", () => openModal(g));
    listEl.appendChild(card);
  });
}

function renderPubs(listEl, pubs, q){
  const query = (q||"").toLowerCase().trim();
  const filtered = pubs.filter(p => {
    if(!query) return true;
    return `${p.name} ${p.city}`.toLowerCase().includes(query);
  });

  if(filtered.length === 0){
    setEmpty(listEl, "Ingen elementer funnet.");
    return;
  }

  listEl.innerHTML = "";
  filtered.forEach(p => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="teams">${p.name || "Ukjent"}</div>
      <div class="muted small">${p.city || ""}</div>
    `;
    listEl.appendChild(card);
  });
}

function renderEvents(listEl, events, q){
  const query = (q||"").toLowerCase().trim();
  const filtered = events.filter(e => {
    if(!query) return true;
    return `${e.title} ${e.place} ${e.desc}`.toLowerCase().includes(query);
  });

  if(filtered.length === 0){
    setEmpty(listEl, "Ingen elementer funnet.");
    return;
  }

  listEl.innerHTML = "";
  filtered.forEach(e => {
    const card = document.createElement("div");
    card.className = "card";
    const when = e.date ? e.date : "";
    const place = e.place ? ` • ${e.place}` : "";
    const link = e.link ? `<a class="link" href="${e.link}" target="_blank" rel="noopener">Mer info</a>` : "";
    card.innerHTML = `
      <div class="teams">${e.title}</div>
      <div class="muted small">${when}${place}</div>
      ${e.desc ? `<div class="muted small" style="margin-top:6px;">${e.desc}</div>` : ""}
      ${link ? `<div style="margin-top:8px;">${link}</div>` : ""}
    `;
    listEl.appendChild(card);
  });
}

function renderSimpleList(listEl, items, q){
  const query = (q||"").toLowerCase().trim();
  const filtered = items.filter(i => {
    if(!query) return true;
    return `${i.title} ${i.desc}`.toLowerCase().includes(query);
  });

  if(filtered.length === 0){
    setEmpty(listEl, "Ingen elementer funnet.");
    return;
  }

  listEl.innerHTML = "";
  filtered.forEach(i => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="teams">${i.title}</div>
      ${i.desc ? `<div class="muted small" style="margin-top:6px;">${i.desc}</div>` : ""}
    `;
    listEl.appendChild(card);
  });
}

// ---------- DATA PATHS ----------
const PATHS = {
  sport: {
    eliteserien: "data/2026/eliteserien.json",
    obos: "data/2026/obos.json",
    premier_league: "data/2026/premier_league.json",
    champions_league: "data/2026/champions_league.json",
    la_liga: "data/2026/la_liga.json",
    handball_men: "data/2026/handball_men.json",
    handball_women: "data/2026/handball_women.json",
    wintersport_men: "data/2026/wintersport_men.json",
    wintersport_women: "data/2026/wintersport_women.json",
  },
  pubs: "data/content/pubs.json",
  events: "data/events/events.json",
  vm: "data/2026/vm2026_list.json",
  em: "data/2026/em2026_list.json",
};

const LEAGUE_OPTIONS = [
  ["eliteserien", "Eliteserien"],
  ["obos", "OBOS-ligaen"],
  ["premier_league", "Premier League"],
  ["champions_league", "Champions League"],
  ["la_liga", "La Liga"],
  ["handball_men", "Håndball Menn"],
  ["handball_women", "Håndball Damer"],
  ["wintersport_men", "Vintersport Menn"],
  ["wintersport_women", "Vintersport Kvinner"],
];

// ---------- INIT ----------
document.addEventListener("click", (e) => {
  if(e.target && e.target.id === "modalClose") closeModal();
  if(e.target && e.target.id === "modalBackdrop") closeModal();
});

function setTab(active){
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === active));

  ["viewSport","viewPuber","viewEventer","viewVM","viewEM","viewKalender"].forEach(id => hide($(id)));

  if(active === "sport") show($("viewSport"));
  if(active === "puber") show($("viewPuber"));
  if(active === "eventer") show($("viewEventer"));
  if(active === "vm") show($("viewVM"));
  if(active === "em") show($("viewEM"));
  if(active === "kalender") show($("viewKalender"));
}

function initTabs(){
  const map = {
    tabSport: "sport",
    tabPuber: "puber",
    tabEventer: "eventer",
    tabVM: "vm",
    tabEM: "em",
    tabKalender: "kalender",
  };
  Object.entries(map).forEach(([id, key]) => {
    const el = $(id);
    if(el) el.addEventListener("click", () => setTab(key));
  });

  setTab("sport");
}

function initLeagueDropdown(){
  const sel = $("leagueSelect");
  if(!sel) return;

  sel.innerHTML = "";
  LEAGUE_OPTIONS.forEach(([val, label]) => {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = label;
    sel.appendChild(opt);
  });
}

async function loadSport(){
  const sel = $("leagueSelect");
  const listEl = $("sportList");
  const countEl = $("sportCount");
  const q = $("sportSearch") ? $("sportSearch").value : "";

  if(!sel || !listEl) return;

  const key = sel.value;
  const path = PATHS.sport[key];

  try{
    const j = await fetchJSON(path);
    const raw = extractList(j, ["games","items"]);
    const games = raw.map(normalizeGame).filter(g => g.home && g.away);
    if(countEl) countEl.textContent = `${games.length} kamper · ${sel.options[sel.selectedIndex].textContent}`;

    renderGames(listEl, games, q);

    // Debug kun i console (IKKE i UI)
    if(games.length === 0){
      console.warn(`[sport] file loaded but 0 games: ${path}`, j);
    }
  }catch(err){
    if(countEl) countEl.textContent = `0 kamper · ${sel.options[sel.selectedIndex].textContent}`;
    listEl.innerHTML = `<div class="error">Kunne ikke laste: ${path}\n${String(err)}</div>`;
    console.warn("[sport] load failed", path, err);
  }
}

async function loadPubs(){
  const listEl = $("pubList");
  const q = $("pubSearch") ? $("pubSearch").value : "";
  if(!listEl) return;

  try{
    const j = await fetchJSON(PATHS.pubs);
    const raw = extractList(j, ["pubs","items"]);
    let pubs = raw.map(normalizePub).filter(p => p.name);
    if(pubs.length === 0){
      console.warn(`[pubs] file loaded but 0 pubs: ${PATHS.pubs}`, j);
      pubs = DEFAULT_PUBS.slice();
    }
    renderPubs(listEl, pubs, q);
  }catch(err){
    console.warn("[pubs] load failed -> fallback list", err);
    renderPubs(listEl, DEFAULT_PUBS.slice(), q);
  }
}

async function loadEvents(){
  const listEl = $("eventList");
  const q = $("eventSearch") ? $("eventSearch").value : "";
  if(!listEl) return;

  try{
    const j = await fetchJSON(PATHS.events);
    const raw = extractList(j, ["events","items"]);
    const events = raw.map(normalizeEvent).filter(e => e.title);
    if(events.length === 0) console.warn(`[events] file loaded but 0 events: ${PATHS.events}`, j);
    renderEvents(listEl, events, q);
  }catch(err){
    listEl.innerHTML = `<div class="error">Kunne ikke laste eventer.\n${String(err)}</div>`;
    console.warn("[events] load failed", err);
  }
}

async function loadVM(){
  const listEl = $("vmList");
  const q = $("vmSearch") ? $("vmSearch").value : "";
  if(!listEl) return;

  try{
    const j = await fetchJSON(PATHS.vm);
    const raw = extractList(j, ["items","list"]);
    const items = raw.map(normalizeListItem).filter(i => i.title);
    if(items.length === 0) console.warn(`[vm] file loaded but 0 items: ${PATHS.vm}`, j);
    renderSimpleList(listEl, items, q);
  }catch(err){
    listEl.innerHTML = `<div class="error">Kunne ikke laste VM.\n${String(err)}</div>`;
    console.warn("[vm] load failed", err);
  }
}

async function loadEM(){
  const listEl = $("emList");
  const q = $("emSearch") ? $("emSearch").value : "";
  if(!listEl) return;

  try{
    const j = await fetchJSON(PATHS.em);
    const raw = extractList(j, ["items","list"]);
    const items = raw.map(normalizeListItem).filter(i => i.title);
    if(items.length === 0) console.warn(`[em] file loaded but 0 items: ${PATHS.em}`, j);
    renderSimpleList(listEl, items, q);
  }catch(err){
    listEl.innerHTML = `<div class="error">Kunne ikke laste EM.\n${String(err)}</div>`;
    console.warn("[em] load failed", err);
  }
}

function initButtons(){
  const bSport = $("btnSport"); if(bSport) bSport.addEventListener("click", loadSport);
  const bPubs = $("btnPuber"); if(bPubs) bPubs.addEventListener("click", loadPubs);
  const bEvents = $("btnEventer"); if(bEvents) bEvents.addEventListener("click", loadEvents);
  const bVM = $("btnVM"); if(bVM) bVM.addEventListener("click", loadVM);
  const bEM = $("btnEM"); if(bEM) bEM.addEventListener("click", loadEM);

  const sel = $("leagueSelect");
  if(sel) sel.addEventListener("change", loadSport);

  const sportSearch = $("sportSearch");
  if(sportSearch) sportSearch.addEventListener("input", () => loadSport());

  const pubSearch = $("pubSearch");
  if(pubSearch) pubSearch.addEventListener("input", () => loadPubs());

  const eventSearch = $("eventSearch");
  if(eventSearch) eventSearch.addEventListener("input", () => loadEvents());

  const vmSearch = $("vmSearch");
  if(vmSearch) vmSearch.addEventListener("input", () => loadVM());

  const emSearch = $("emSearch");
  if(emSearch) emSearch.addEventListener("input", () => loadEM());
}

window.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initLeagueDropdown();
  initButtons();

  // initial loads
  loadSport();
  loadPubs();
  loadEvents();
  loadVM();
  loadEM();
});
