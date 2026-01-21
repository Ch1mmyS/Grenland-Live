// app.js — Grenland Live (JS) — Sport + Events + Pubs
// - Fotball: samlet (Eliteserien + OBOS + Premier + Champions + LaLiga)
// - Håndball: undermeny (Menn / Damer)
// - Vintersport: undermeny (Menn / Kvinner)
// - VM 2026: egen fane
// - Arrangementer: events.json
// - Pubbene: pubs.json med kart + link
// - Norsk tid (Europe/Oslo)
// - Viser kanal + pub (hvis i data)

const TZ = "Europe/Oslo";

// ----------- DATA FILES (relative paths) -----------
const FILES = {
  eliteserien: "data/eliteserien.json",
  obos: "data/obos.json",
  premier: "data/premier_league.json",
  champions: "data/champions.json",
  laliga: "data/laliga.json",

  hb_menn: "data/handball_vm_2026_menn.json",
  hb_damer: "data/handball_vm_2026_damer.json",

  vinter_menn: "data/vintersport_menn.json",
  vinter_kvinner: "data/vintersport_kvinner.json",

  vm2026: "data/vm2026.json",

  pubs: "data/pubs.json",
  events: "data/events.json" // vi lager denne i steg 5 (auto)
};

// ----------- UI -----------
const elMainTabs = document.getElementById("mainTabs");
const elSubTabs = document.getElementById("subTabs");
const elSubSubTabs = document.getElementById("subSubTabs");
const elToolbar = document.getElementById("toolbar");

const elList = document.getElementById("list");
const elErrors = document.getElementById("errors");

const elLeagueFilter = document.getElementById("leagueFilter");
const elPubFilter = document.getElementById("pubFilter");
const elSearch = document.getElementById("search");
const elOnlyUpcoming = document.getElementById("onlyUpcoming");
const elSort = document.getElementById("sort");

const elNetStatus = document.getElementById("netStatus");
const elLastUpdated = document.getElementById("lastUpdated");
const elCountInfo = document.getElementById("countInfo");

// ----------- STATE -----------
let state = {
  main: "sport",        // sport | events | pubs
  sport: "football",    // football | handball | wintersport | vm2026
  sportSub: "menn",     // for handball/vintersport: menn/damer/kvinner
  data: {
    sport: {
      football: [],
      hb_menn: [],
      hb_damer: [],
      vinter_menn: [],
      vinter_kvinner: [],
      vm2026: []
    },
    pubs: [],
    events: []
  },
  errors: []
};

// ----------- HELPERS -----------
function escapeHTML(s){
  return (s || "").toString()
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function setNetStatus(){
  elNetStatus.textContent = navigator.onLine ? "🟢 Online" : "🔴 Offline";
}
window.addEventListener("online", setNetStatus);
window.addEventListener("offline", setNetStatus);

function parseISO(val){
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function fmtOslo(d){
  if (!(d instanceof Date) || isNaN(d.getTime())) return "Tid ikke satt";
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

function upcomingOnlyFilter(item){
  if (!elOnlyUpcoming.checked) return true;
  if (!item.dt) return true;
  return item.dt.getTime() >= Date.now();
}

function sortByTime(arr){
  const key = (x) => x.dt ? x.dt.getTime() : 4102444800000; // year 2100
  arr.sort((a,b)=>key(a)-key(b));
  if (elSort.value === "late") arr.reverse();
  return arr;
}

async function fetchJSON(url){
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} (${url})`);
  return await res.json();
}

// Normalize games to one format
function normalizeGames(payload){
  const games = (payload && payload.games) ? payload.games : [];
  const out = [];

  for (const g of games){
    const rawPubs = g.where || g.pubs || [];
    let pubs = [];

    if (Array.isArray(rawPubs)){
      pubs = rawPubs.map(p => {
        if (typeof p === "string") return p;
        if (p && typeof p === "object"){
          const name = (p.name || "").trim();
          const city = (p.city || "").trim();
          return city ? `${name} (${city})` : name;
        }
        return "";
      }).filter(Boolean);
    } else if (typeof rawPubs === "string"){
      pubs = [rawPubs];
    }

    out.push({
      league: (g.league || g.tournament || "").trim(),
      home: (g.home || "").trim(),
      away: (g.away || "").trim(),
      tv: (g.channel || g.tv || "").trim(),
      dt: parseISO(g.kickoff || g.start || g.datetime),
      pubs
    });
  }

  return out;
}

// Normalize events: expects { events: [...] }
function normalizeEvents(payload){
  const events = (payload && payload.events) ? payload.events : [];
  const out = [];
  for (const e of events){
    out.push({
      title: (e.title || "").trim(),
      venue: (e.venue || e.place || "").trim(),
      city: (e.city || "").trim(),
      url: (e.url || "").trim(),
      dt: parseISO(e.start || e.datetime || e.date),
      category: (e.category || "").trim()
    });
  }
  return out;
}

// pubs.json: expects { pubs: [...] }
// each pub should have: name, city, website, lat, lon (recommended), address (optional)
function normalizePubs(payload){
  const pubs = (payload && payload.pubs) ? payload.pubs : [];
  return pubs.map(p => ({
    name: (p.name || "").trim(),
    city: (p.city || "").trim(),
    website: (p.website || p.url || "").trim(),
    address: (p.address || "").trim(),
    lat: (p.lat ?? p.latitude ?? null),
    lon: (p.lon ?? p.lng ?? p.longitude ?? null)
  })).filter(p => p.name);
}

function showErrors(){
  if (!state.errors.length){
    elErrors.style.display = "none";
    elErrors.innerHTML = "";
    return;
  }
  elErrors.style.display = "block";
  elErrors.innerHTML = `
    <b>Det er problemer med noen datafiler:</b>
    <ul>${state.errors.map(e => `<li>${escapeHTML(e)}</li>`).join("")}</ul>
  `;
}

// ----------- TABS RENDERING -----------
function renderMainTabs(){
  const tabs = [
    { key:"sport", label:"🏟️ Sport" },
    { key:"events", label:"📅 Kommende arrangementer" },
    { key:"pubs", label:"🍻 Pubbene i Grenland" }
  ];

  elMainTabs.innerHTML = "";
  for (const t of tabs){
    const b = document.createElement("button");
    b.className = "tabbtn" + (state.main === t.key ? " active" : "");
    b.textContent = t.label;
    b.onclick = () => {
      state.main = t.key;
      // reset some UI
      elSearch.value = "";
      elLeagueFilter.value = "";
      elPubFilter.value = "";
      elOnlyUpcoming.checked = true;
      elSort.value = "soon";
      renderAll();
    };
    elMainTabs.appendChild(b);
  }
}

function renderSubTabs(){
  // only for sport
  if (state.main !== "sport"){
    elSubTabs.style.display = "none";
    elSubTabs.innerHTML = "";
    return;
  }

  elSubTabs.style.display = "";
  const tabs = [
    { key:"football", label:"⚽ Fotball (samlet)" },
    { key:"handball", label:"🤾 Håndball" },
    { key:"wintersport", label:"⛷️ Vintersport" },
    { key:"vm2026", label:"🏆 VM 2026" }
  ];

  elSubTabs.innerHTML = "";
  for (const t of tabs){
    const b = document.createElement("button");
    b.className = "tabbtn" + (state.sport === t.key ? " active" : "");
    b.textContent = t.label;
    b.onclick = () => {
      state.sport = t.key;
      // default sub menu
      if (t.key === "handball") state.sportSub = "menn";
      if (t.key === "wintersport") state.sportSub = "menn";
      elSearch.value = "";
      elLeagueFilter.value = "";
      elPubFilter.value = "";
      elOnlyUpcoming.checked = true;
      elSort.value = "soon";
      renderAll();
    };
    elSubTabs.appendChild(b);
  }
}

function renderSubSubTabs(){
  // only for handball & wintersport
  if (state.main !== "sport" || (state.sport !== "handball" && state.sport !== "wintersport")){
    elSubSubTabs.style.display = "none";
    elSubSubTabs.innerHTML = "";
    return;
  }

  elSubSubTabs.style.display = "";
  const isHB = state.sport === "handball";
  const tabs = isHB
    ? [{key:"menn", label:"Menn"},{key:"damer", label:"Damer"}]
    : [{key:"menn", label:"Menn"},{key:"kvinner", label:"Kvinner"}];

  elSubSubTabs.innerHTML = "";
  for (const t of tabs){
    const b = document.createElement("button");
    b.className = "tabbtn" + (state.sportSub === t.key ? " active" : "");
    b.textContent = t.label;
    b.onclick = () => {
      state.sportSub = t.key;
      elSearch.value = "";
      elLeagueFilter.value = "";
      elPubFilter.value = "";
      elOnlyUpcoming.checked = true;
      elSort.value = "soon";
      renderAll();
    };
    elSubSubTabs.appendChild(b);
  }
}

// ----------- FILTER BUILD -----------
function setToolbarVisible(on){
  elToolbar.style.display = on ? "" : "none";
}

function buildFiltersForGames(games){
  const leagues = Array.from(new Set(games.map(g => g.league).filter(Boolean))).sort((a,b)=>a.localeCompare(b,"no"));
  const pubsFromGames = Array.from(new Set(games.flatMap(g => g.pubs || []).filter(Boolean))).sort((a,b)=>a.localeCompare(b,"no"));

  // also include pubs from pubs.json so dropdown always has full list
  const pubsAll = Array.from(new Set([
    ...pubsFromGames,
    ...state.data.pubs.map(p => p.city ? `${p.name} (${p.city})` : p.name)
  ])).sort((a,b)=>a.localeCompare(b,"no"));

  const keepLeague = elLeagueFilter.value;
  const keepPub = elPubFilter.value;

  elLeagueFilter.innerHTML = `<option value="">Alle</option>` + leagues.map(x => `<option value="${escapeHTML(x)}">${escapeHTML(x)}</option>`).join("");
  elPubFilter.innerHTML = `<option value="">Alle</option>` + pubsAll.map(x => `<option value="${escapeHTML(x)}">${escapeHTML(x)}</option>`).join("");

  if (leagues.includes(keepLeague)) elLeagueFilter.value = keepLeague; else elLeagueFilter.value = "";
  if (pubsAll.includes(keepPub)) elPubFilter.value = keepPub; else elPubFilter.value = "";
}

function buildFiltersForEvents(events){
  // use leagueFilter as category filter, pubFilter as city/venue filter
  const cats = Array.from(new Set(events.map(e => e.category).filter(Boolean))).sort((a,b)=>a.localeCompare(b,"no"));
  const places = Array.from(new Set(
    events.map(e => e.venue || e.city).filter(Boolean)
  )).sort((a,b)=>a.localeCompare(b,"no"));

  const keepCat = elLeagueFilter.value;
  const keepPlace = elPubFilter.value;

  elLeagueFilter.innerHTML = `<option value="">Alle kategorier</option>` + cats.map(x => `<option value="${escapeHTML(x)}">${escapeHTML(x)}</option>`).join("");
  elPubFilter.innerHTML = `<option value="">Alle steder</option>` + places.map(x => `<option value="${escapeHTML(x)}">${escapeHTML(x)}</option>`).join("");

  if (cats.includes(keepCat)) elLeagueFilter.value = keepCat; else elLeagueFilter.value = "";
  if (places.includes(keepPlace)) elPubFilter.value = keepPlace; else elPubFilter.value = "";
}

// ----------- LIST RENDER -----------
function renderGameList(games){
  const q = (elSearch.value || "").trim().toLowerCase();

  let filtered = games
    .filter(upcomingOnlyFilter)
    .filter(g => !elLeagueFilter.value || g.league === elLeagueFilter.value)
    .filter(g => !elPubFilter.value || (g.pubs || []).includes(elPubFilter.value))
    .filter(g => {
      if (!q) return true;
      const hay = [g.league, g.home, g.away, g.tv, ...(g.pubs||[])].join(" ").toLowerCase();
      return hay.includes(q);
    });

  filtered = sortByTime(filtered);

  elCountInfo.textContent = `Viser: ${filtered.length} / ${games.length}`;

  if (!filtered.length){
    elList.innerHTML = `<div class="card"><b>Ingen treff</b><div class="meta">Prøv å slå av “kun kommende”, eller endre filter.</div></div>`;
    return;
  }

  elList.innerHTML = filtered.slice(0,300).map(g=>{
    const title = `${escapeHTML(g.home)}${g.away ? " – " + escapeHTML(g.away) : ""}` || "(mangler lag)";
    const time = g.dt ? fmtOslo(g.dt) : "Tid ikke satt";
    const league = g.league ? `<span class="badge">🏷️ ${escapeHTML(g.league)}</span>` : "";
    const tv = g.tv ? `<span class="badge">📺 ${escapeHTML(g.tv)}</span>` : "";
    const where = (g.pubs && g.pubs.length) ? escapeHTML(g.pubs.join(", ")) : "Ikke satt";

    return `
      <div class="card">
        <div class="title">${title}</div>
        <div class="meta">🕒 ${escapeHTML(time)}</div>
        <div class="badges">${league}${tv}</div>
        <div class="where"><b>🍻 Pub:</b> ${where}</div>
      </div>
    `;
  }).join("");
}

function renderEventsList(events){
  const q = (elSearch.value || "").trim().toLowerCase();
  let filtered = events
    .filter(upcomingOnlyFilter)
    .filter(e => !elLeagueFilter.value || e.category === elLeagueFilter.value)
    .filter(e => !elPubFilter.value || (e.venue === elPubFilter.value || e.city === elPubFilter.value))
    .filter(e => {
      if (!q) return true;
      const hay = [e.title, e.venue, e.city, e.category].join(" ").toLowerCase();
      return hay.includes(q);
    });

  filtered = sortByTime(filtered);

  elCountInfo.textContent = `Viser: ${filtered.length} / ${events.length}`;

  if (!filtered.length){
    elList.innerHTML = `<div class="card"><b>Ingen arrangementer</b><div class="meta">Prøv å slå av “kun kommende”, eller endre filter.</div></div>`;
    return;
  }

  elList.innerHTML = filtered.slice(0,400).map(e=>{
    const title = escapeHTML(e.title || "(uten tittel)");
    const time = e.dt ? fmtOslo(e.dt) : "Tid ikke satt";
    const place = escapeHTML([e.venue, e.city].filter(Boolean).join(" • "));
    const cat = e.category ? `<span class="badge">🏷️ ${escapeHTML(e.category)}</span>` : "";
    const link = e.url ? `<a class="linkbtn" href="${escapeHTML(e.url)}" target="_blank" rel="noopener">Åpne</a>` : "";
    return `
      <div class="card">
        <div class="title">${title}</div>
        <div class="meta">🕒 ${escapeHTML(time)}</div>
        <div class="meta">📍 ${place || "Sted ikke satt"}</div>
        <div class="badges">${cat}</div>
        ${link}
      </div>
    `;
  }).join("");
}

function renderPubsPage(pubs){
  setToolbarVisible(false);
  elCountInfo.textContent = `Puber: ${pubs.length}`;

  const options = pubs.map(p => `${p.name}${p.city ? " ("+p.city+")" : ""}`);
  const dd = `
    <div class="card">
      <div class="title">🍻 Pubbene i Grenland</div>
      <div class="meta">Velg en pub for kart og link</div>
      <div style="margin-top:10px;">
        <select id="pubPicker">
          <option value="">Velg pub…</option>
          ${options.map(o => `<option value="${escapeHTML(o)}">${escapeHTML(o)}</option>`).join("")}
        </select>
      </div>
    </div>
  `;

  const listCards = pubs.map(p => {
    const title = escapeHTML(`${p.name}${p.city ? " ("+p.city+")" : ""}`);
    const addr = p.address ? `<div class="meta">📍 ${escapeHTML(p.address)}</div>` : "";
    const link = p.website ? `<a class="linkbtn" href="${escapeHTML(p.website)}" target="_blank" rel="noopener">Hjemmeside</a>` : "";
    const coord = (p.lat && p.lon) ? `<div class="meta">🧭 ${escapeHTML(p.lat)} , ${escapeHTML(p.lon)}</div>` : `<div class="meta">🧭 Mangler koordinater (lat/lon)</div>`;
    return `
      <div class="card">
        <div class="title">${title}</div>
        ${addr}
        ${coord}
        ${link}
      </div>
    `;
  }).join("");

  elList.innerHTML = dd + `<div class="list">${listCards}</div>`;

  const picker = document.getElementById("pubPicker");
  picker.addEventListener("change", () => {
    const val = picker.value;
    if (!val) return;

    const chosen = pubs.find(p => (`${p.name}${p.city ? " ("+p.city+")" : ""}`) === val);
    if (!chosen) return;

    // Render a selected pub detail card with map
    const nameCity = `${chosen.name}${chosen.city ? " ("+chosen.city+")" : ""}`;
    const title = escapeHTML(nameCity);
    const addr = chosen.address ? `<div class="meta">📍 ${escapeHTML(chosen.address)}</div>` : "";
    const link = chosen.website ? `<a class="linkbtn" href="${escapeHTML(chosen.website)}" target="_blank" rel="noopener">Hjemmeside</a>` : "";

    let mapHTML = `<div class="card"><b>Kart</b><div class="meta">Mangler lat/lon i pubs.json</div></div>`;
    if (chosen.lat && chosen.lon){
      // OpenStreetMap embed
      const lat = Number(chosen.lat);
      const lon = Number(chosen.lon);
      const bbox = `${lon-0.01}%2C${lat-0.01}%2C${lon+0.01}%2C${lat+0.01}`;
      const marker = `${lat}%2C${lon}`;
      mapHTML = `
        <div class="map">
          <iframe
            width="100%" height="280" frameborder="0"
            src="https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${marker}">
          </iframe>
        </div>
      `;
    }

    const detail = `
      <div class="card">
        <div class="title">${title}</div>
        ${addr}
        ${link}
        <div style="margin-top:12px;" class="grid2">
          <div>${mapHTML}</div>
          <div class="card">
            <div class="title">Tips</div>
            <div class="meta">Legg inn <b>lat</b> og <b>lon</b> i <code>data/pubs.json</code> for perfekt kart.</div>
          </div>
        </div>
      </div>
    `;

    elList.insertAdjacentHTML("afterbegin", detail);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

// ----------- DATA SELECTORS -----------
function getCurrentSportGames(){
  if (state.sport === "football") return state.data.sport.football;
  if (state.sport === "vm2026") return state.data.sport.vm2026;

  if (state.sport === "handball"){
    return (state.sportSub === "damer")
      ? state.data.sport.hb_damer
      : state.data.sport.hb_menn;
  }

  if (state.sport === "wintersport"){
    return (state.sportSub === "kvinner")
      ? state.data.sport.vinter_kvinner
      : state.data.sport.vinter_menn;
  }

  return [];
}

// ----------- MAIN RENDER -----------
function renderAll(){
  renderMainTabs();
  renderSubTabs();
  renderSubSubTabs();

  showErrors();

  if (state.main === "sport"){
    setToolbarVisible(true);

    const games = getCurrentSportGames();
    buildFiltersForGames(games);
    renderGameList(games);
    return;
  }

  if (state.main === "events"){
    setToolbarVisible(true);

    // reuse toolbar: leagueFilter=category, pubFilter=venue/city, onlyUpcoming works
    const events = state.data.events;
    buildFiltersForEvents(events);
    renderEventsList(events);
    return;
  }

  if (state.main === "pubs"){
    renderPubsPage(state.data.pubs);
    return;
  }
}

// ----------- LOAD ALL DATA -----------
async function loadAll(){
  state.errors = [];

  // load pubs
  try{
    const pubsPayload = await fetchJSON(FILES.pubs);
    state.data.pubs = normalizePubs(pubsPayload);
  }catch(e){
    state.data.pubs = [];
    state.errors.push(`${FILES.pubs}: ${e.message}`);
  }

  // load events
  try{
    const eventsPayload = await fetchJSON(FILES.events);
    state.data.events = normalizeEvents(eventsPayload);
  }catch(e){
    state.data.events = [];
    // Ikke “hard fail” – events kan være tom i starten
    state.errors.push(`${FILES.events}: ${e.message} (lag data/events.json)`);
  }

  // load football leagues then merge
  const footballFiles = [FILES.eliteserien, FILES.obos, FILES.premier, FILES.champions, FILES.laliga];
  const footballNames = ["Eliteserien","OBOS-ligaen","Premier League","Champions League","La Liga"];

  let footballAll = [];
  for (let i=0;i<footballFiles.length;i++){
    const f = footballFiles[i];
    try{
      const payload = await fetchJSON(f);
      const norm = normalizeGames(payload);
      // if league missing in items, force it from file name label
      for (const g of norm){
        if (!g.league) g.league = footballNames[i];
      }
      footballAll = footballAll.concat(norm);
    }catch(e){
      state.errors.push(`${f}: ${e.message}`);
    }
  }
  state.data.sport.football = footballAll;

  // handball
  try{
    state.data.sport.hb_menn = normalizeGames(await fetchJSON(FILES.hb_menn));
  }catch(e){
    state.data.sport.hb_menn = [];
    state.errors.push(`${FILES.hb_menn}: ${e.message}`);
  }
  try{
    state.data.sport.hb_damer = normalizeGames(await fetchJSON(FILES.hb_damer));
  }catch(e){
    state.data.sport.hb_damer = [];
    state.errors.push(`${FILES.hb_damer}: ${e.message}`);
  }

  // wintersport
  try{
    state.data.sport.vinter_menn = normalizeGames(await fetchJSON(FILES.vinter_menn));
  }catch(e){
    state.data.sport.vinter_menn = [];
    state.errors.push(`${FILES.vinter_menn}: ${e.message}`);
  }
  try{
    state.data.sport.vinter_kvinner = normalizeGames(await fetchJSON(FILES.vinter_kvinner));
  }catch(e){
    state.data.sport.vinter_kvinner = [];
    state.errors.push(`${FILES.vinter_kvinner}: ${e.message}`);
  }

  // vm2026
  try{
    state.data.sport.vm2026 = normalizeGames(await fetchJSON(FILES.vm2026));
  }catch(e){
    state.data.sport.vm2026 = [];
    state.errors.push(`${FILES.vm2026}: ${e.message}`);
  }

  showErrors();

  elLastUpdated.textContent = `Oppdatert: ${new Date().toLocaleString("no-NO", { timeZone: TZ })}`;
}

// ----------- BIND UI -----------
function bindUI(){
  elLeagueFilter.addEventListener("change", renderAll);
  elPubFilter.addEventListener("change", renderAll);
  elSearch.addEventListener("input", renderAll);
  elOnlyUpcoming.addEventListener("change", renderAll);
  elSort.addEventListener("change", renderAll);
}

// ----------- INIT -----------
async function init(){
  setNetStatus();
  bindUI();
  await loadAll();
  renderAll();
}

init();
