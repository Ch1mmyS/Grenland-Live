// app.js — Grenland Live (SPORT: football + handball + wintersport) + league filter + default pubs
// ✅ Uses ONLY data/2026/*.json
// ✅ Sport shows combined feed + sport/league filters
// ✅ Auto-adds Vikinghjørnet + Gimle Pub if "where" missing
// ✅ Keeps your existing HTML IDs intact

window.__GL_APP_OK__ = false;

const TZ = "Europe/Oslo";
const DEFAULT_PUBS = ["Vikinghjørnet", "Gimle Pub"];

const PATHS = {
  football: "data/2026/football.json",
  handball_men: "data/2026/handball_men.json",
  handball_women: "data/2026/handball_women.json",
  wintersport_men: "data/2026/wintersport_men.json",
  wintersport_women: "data/2026/wintersport_women.json",
  pubs: "data/content/pubs.json",
  events: "data/events/events.json"
};

function $(id){ return document.getElementById(id); }
function show(el){ el.classList.remove("hidden"); }
function hide(el){ el.classList.add("hidden"); }

function fmtOslo(iso){
  try{
    return new Date(iso).toLocaleString("no-NO", {
      timeZone: TZ,
      weekday:"short",
      day:"2-digit",
      month:"2-digit",
      hour:"2-digit",
      minute:"2-digit"
    });
  }catch{
    return iso || "";
  }
}

async function fetchJsonSafe(url){
  try{
    const res = await fetch(url, { cache:"no-store" });
    if (!res.ok) throw new Error(String(res.status));
    return { ok:true, data: await res.json() };
  }catch(e){
    return { ok:false, error: String(e.message || e) };
  }
}

function normalizeItems(doc){
  if (!doc) return [];
  if (Array.isArray(doc.items)) return doc.items;
  if (Array.isArray(doc.games)) return doc.games;
  return [];
}

function safeWhere(where){
  if (Array.isArray(where) && where.length) return where;
  return DEFAULT_PUBS.slice();
}

function guessSportFromItem(it){
  const s = (it.sport || "").toLowerCase();
  if (s) return s;
  const league = (it.league || "").toLowerCase();
  if (league.includes("handball") || league.includes("håndball")) return "handball";
  if (league.includes("wintersport") || league.includes("vintersport") || league.includes("skiskyting")) return "wintersport";
  return "football";
}

function titleFromItem(it){
  if (it.home && it.away) return `${it.home} – ${it.away}`;
  return it.title || "Event";
}

function startMs(it){
  const t = Date.parse(it.start || "");
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

function withinNextDays(items, days=120){
  const now = Date.now();
  const max = now + days*24*60*60*1000;
  return items
    .filter(it => {
      const t = startMs(it);
      return t >= now - 12*60*60*1000 && t <= max;
    })
    .sort((a,b)=> startMs(a) - startMs(b));
}

// ---------- MODAL ----------
function openModal(it){
  $("modalTitle").textContent = titleFromItem(it);
  $("modalTime").textContent = it.start ? fmtOslo(it.start) : "Ukjent";
  $("modalChannel").textContent = it.channel || "Ukjent";

  const pubs = safeWhere(it.where);
  const wrap = $("modalPubs");
  wrap.innerHTML = "";
  pubs.forEach(p=>{
    const s = document.createElement("span");
    s.className = "tag";
    s.textContent = p;
    wrap.appendChild(s);
  });

  $("modalBack").classList.add("show");
}

function closeModal(){
  $("modalBack").classList.remove("show");
}

// ---------- UI HELPERS ----------
function ensureSportFiltersRow(){
  // inject one row of filters under the panel title (without touching index.html manually)
  const panel = document.querySelector(".panel");
  const panelTitle = document.querySelector(".panelTitle");
  if (!panel || !panelTitle) return;

  if ($("sportFiltersRow")) return; // already exists

  const row = document.createElement("div");
  row.id = "sportFiltersRow";
  row.style.display = "flex";
  row.style.gap = "10px";
  row.style.flexWrap = "wrap";
  row.style.marginTop = "12px";

  row.innerHTML = `
    <select id="filterSport" class="search" style="flex:0; min-width:200px; max-width:260px;">
      <option value="all">Alle sporter</option>
      <option value="football">Fotball</option>
      <option value="handball">Håndball</option>
      <option value="wintersport">Vintersport</option>
    </select>

    <select id="filterLeague" class="search" style="flex:1; min-width:220px;">
      <option value="all">Alle ligaer</option>
    </select>
  `;

  panel.insertBefore(row, $("list"));
}

function setPanelError(text){
  // show error inside list (keeps site alive)
  $("list").innerHTML = `
    <div class="item">
      <div class="itemTitle">⚠️ Feil</div>
      <div class="meta" style="white-space:pre-wrap">${text}</div>
    </div>
  `;
}

function renderList(items){
  const list = $("list");
  list.innerHTML = "";

  if (!items.length){
    list.innerHTML = `<div class="item"><div class="itemTitle">Ingen treff</div><div class="meta">Ingen data tilgjengelig.</div></div>`;
    return;
  }

  items.forEach(it=>{
    const div = document.createElement("div");
    div.className = "item clickable";
    div.innerHTML = `
      <div class="itemTop">
        <div class="itemTitle">${titleFromItem(it)}</div>
        <div class="meta">${it.start ? fmtOslo(it.start) : ""}</div>
      </div>
      <div class="tagRow">
        <span class="tag">${it.league || "Ukjent"}</span>
        <span class="tag">${it.channel || "Ukjent kanal"}</span>
        <span class="tag">${guessSportFromItem(it) === "football" ? "Fotball" : (guessSportFromItem(it) === "handball" ? "Håndball" : "Vintersport")}</span>
      </div>
    `;
    div.addEventListener("click", ()=> openModal(it));
    list.appendChild(div);
  });
}

// ---------- SPORT (COMBINED) ----------
async function showSport(){
  $("panelH2").textContent = "Sport";
  $("panelMeta").textContent = "2026 • Fotball + Håndball + Vintersport";
  $("list").innerHTML = `<div class="item">Laster…</div>`;

  ensureSportFiltersRow();

  const errs = [];
  const [
    football,
    hbMen,
    hbWomen,
    wsMen,
    wsWomen
  ] = await Promise.all([
    fetchJsonSafe(PATHS.football),
    fetchJsonSafe(PATHS.handball_men),
    fetchJsonSafe(PATHS.handball_women),
    fetchJsonSafe(PATHS.wintersport_men),
    fetchJsonSafe(PATHS.wintersport_women)
  ]);

  if (!football.ok) errs.push(`Fotball: ${PATHS.football} (${football.error})`);
  if (!hbMen.ok) errs.push(`Håndball menn: ${PATHS.handball_men} (${hbMen.error})`);
  if (!hbWomen.ok) errs.push(`Håndball damer: ${PATHS.handball_women} (${hbWomen.error})`);
  if (!wsMen.ok) errs.push(`Vintersport menn: ${PATHS.wintersport_men} (${wsMen.error})`);
  if (!wsWomen.ok) errs.push(`Vintersport kvinner: ${PATHS.wintersport_women} (${wsWomen.error})`);

  // Build combined list (even if some are missing)
  const all = [];

  normalizeItems(football.data).forEach(it => all.push({ ...it, sport: "football", where: safeWhere(it.where) }));
  normalizeItems(hbMen.data).forEach(it => all.push({ ...it, sport: "handball", where: safeWhere(it.where) }));
  normalizeItems(hbWomen.data).forEach(it => all.push({ ...it, sport: "handball", where: safeWhere(it.where) }));
  normalizeItems(wsMen.data).forEach(it => all.push({ ...it, sport: "wintersport", where: safeWhere(it.where) }));
  normalizeItems(wsWomen.data).forEach(it => all.push({ ...it, sport: "wintersport", where: safeWhere(it.where) }));

  if (!all.length){
    setPanelError(
      (errs.length ? errs.join("\n") + "\n\n" : "") +
      "Ingen sportsdata lastet. Sjekk at filene finnes i repoet: data/2026/*.json"
    );
    return;
  }

  // Limit to next 120 days for speed/clean UI
  let base = withinNextDays(all, 120);

  // Fill league dropdown from base list
  const filterSport = $("filterSport");
  const filterLeague = $("filterLeague");

  function rebuildLeagueOptions(currentSport){
    const leagues = new Set();
    base.forEach(it=>{
      const s = guessSportFromItem(it);
      if (currentSport !== "all" && s !== currentSport) return;
      if (it.league) leagues.add(it.league);
    });
    const sorted = Array.from(leagues).sort((a,b)=> a.localeCompare(b, "no"));
    const current = filterLeague.value || "all";
    filterLeague.innerHTML = `<option value="all">Alle ligaer</option>` + sorted.map(l=>`<option value="${l}">${l}</option>`).join("");
    // try keep selection if still exists
    if ([...filterLeague.options].some(o=>o.value===current)) filterLeague.value = current;
  }

  function applyFilters(){
    const sportVal = filterSport.value;
    const leagueVal = filterLeague.value;

    let items = base.slice();

    if (sportVal !== "all"){
      items = items.filter(it => guessSportFromItem(it) === sportVal);
    }
    if (leagueVal !== "all"){
      items = items.filter(it => it.league === leagueVal);
    }

    renderList(items.slice(0, 300));

    // update meta (shows if partial feeds failing)
    $("panelMeta").textContent =
      `2026 • ${items.length} treff` + (errs.length ? ` • ⚠️ ${errs.length} kilde(r) feilet` : "");
  }

  // Hook events once
  filterSport.onchange = ()=>{
    rebuildLeagueOptions(filterSport.value);
    applyFilters();
  };
  filterLeague.onchange = applyFilters;

  // initial
  rebuildLeagueOptions(filterSport.value);
  applyFilters();

  // Show non-blocking errors in console for debugging
  if (errs.length) console.warn("Grenland Live: some sports feeds failed:\n" + errs.join("\n"));
}

// ---------- PUBER ----------
async function showPuber(){
  $("panelH2").textContent = "Puber";
  $("panelMeta").textContent = PATHS.pubs;
  $("list").innerHTML = `<div class="item">Laster…</div>`;

  const r = await fetchJsonSafe(PATHS.pubs);
  if (!r.ok){
    setPanelError(`Puber: ${PATHS.pubs} (${r.error})`);
    return;
  }

  const pubs = normalizeItems(r.data);
  renderList(pubs.map(p=>({
    title: p.name || p.title || "Pub",
    start: "",
    league: p.city || "",
    channel: "",
    where: []
  })));
}

// ---------- EVENTER ----------
async function showEvents(){
  $("panelH2").textContent = "Eventer";
  $("panelMeta").textContent = PATHS.events;
  $("list").innerHTML = `<div class="item">Laster…</div>`;

  const r = await fetchJsonSafe(PATHS.events);
  if (!r.ok){
    setPanelError(`Eventer: ${PATHS.events} (${r.error})`);
    return;
  }

  const events = normalizeItems(r.data)
    .map(ev => ({
      title: ev.title || ev.name || "Event",
      start: ev.start || ev.date || "",
      league: ev.location || "",
      channel: "",
      where: []
    }))
    .sort((a,b)=> (Date.parse(a.start)||0) - (Date.parse(b.start)||0))
    .slice(0, 250);

  renderList(events);
}

// ---------- NAV ----------
function goApp(tab){
  hide($("home"));
  show($("app"));

  // reset any previous filter row values safely
  if ($("filterSport")) $("filterSport").value = "all";
  if ($("filterLeague")) $("filterLeague").value = "all";

  if (tab === "sport") showSport();
  if (tab === "puber") showPuber();
  if (tab === "events") showEvents();
}

function goHome(){
  hide($("app"));
  show($("home"));
}

// ---------- WIRE ----------
document.addEventListener("DOMContentLoaded", ()=>{
  // Modal
  const modalClose = $("modalClose");
  const modalBack = $("modalBack");
  if (modalClose) modalClose.onclick = closeModal;
  if (modalBack) modalBack.onclick = e => { if (e.target && e.target.id==="modalBack") closeModal(); };

  // Forside-knapper
  document.querySelectorAll("[data-go]").forEach(b=>{
    b.onclick = ()=> goApp(b.dataset.go);
  });

  // Tabs
  const tabSport = $("tabSport");
  const tabPuber = $("tabPuber");
  const tabEvents = $("tabEvents");
  if (tabSport) tabSport.onclick = ()=> goApp("sport");
  if (tabPuber) tabPuber.onclick = ()=> goApp("puber");
  if (tabEvents) tabEvents.onclick = ()=> goApp("events");

  // Back
  const backHome = $("backHome");
  const backHome2 = $("backHome2");
  if (backHome) backHome.onclick = goHome;
  if (backHome2) backHome2.onclick = goHome;

  // ✅ signal to index.html debug banner
  window.__GL_APP_OK__ = true;
  console.log("Grenland Live JS OK");

  // Optional: remove the JS warning banner if it exists
  const warn = document.getElementById("jsWarn");
  if (warn) warn.remove();
});
