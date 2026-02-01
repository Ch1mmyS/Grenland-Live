// /app.js (KOMPLETT – ROOT)

function $(id){ return document.getElementById(id); }
function show(el){ el.classList.remove("hidden"); }
function hide(el){ el.classList.add("hidden"); }

function safeText(v){
  return (v === null || v === undefined) ? "" : String(v);
}

function fmtNoDateTime(iso){
  try{
    const d = new Date(iso);
    return d.toLocaleString("no-NO", { timeZone:"Europe/Oslo" });
  }catch{
    return safeText(iso);
  }
}

async function fetchJson(url){
  const r = await fetch(url, { cache: "no-store" });
  if(!r.ok) throw new Error(`${r.status} ${r.statusText} :: ${url}`);
  return await r.json();
}

/* ---------------- TABS ---------------- */
const TAB_IDS = ["sport","puber","eventer","vm2026","em2026","kalender"];

function setActiveTab(tabKey){
  for(const k of TAB_IDS){
    const panel = $(`tab-${k}`);
    if(!panel) continue;
    (k === tabKey) ? show(panel) : hide(panel);
  }
  document.querySelectorAll(".tab").forEach(btn=>{
    btn.classList.toggle("active", btn.dataset.tab === tabKey);
  });

  // last data for current tab
  if(tabKey === "sport") loadSport();
  if(tabKey === "puber") loadPubs();
  if(tabKey === "eventer") loadEvents();
  if(tabKey === "vm2026") loadVM();
  if(tabKey === "em2026") loadEM();
}

function initTabs(){
  const wrap = $("tabs");
  wrap?.addEventListener("click", (e)=>{
    const btn = e.target.closest(".tab");
    if(!btn) return;
    setActiveTab(btn.dataset.tab);
  });
}

/* ---------------- SPORT ---------------- */
// “En fil per liga” (som du ba om)
const LEAGUES = [
  { key:"eliteserien", label:"Eliteserien", url:"/data/2026/eliteserien.json", listKeys:["games","items"] },
  { key:"obos", label:"OBOS-ligaen", url:"/data/2026/obos.json", listKeys:["games","items"] },
  { key:"premier_league", label:"Premier League", url:"/data/2026/premier_league.json", listKeys:["games","items"] },
  { key:"champions_league", label:"Champions League", url:"/data/2026/champions_league.json", listKeys:["games","items"] },
  { key:"la_liga", label:"La Liga", url:"/data/2026/la_liga.json", listKeys:["games","items"] },

  { key:"handball_men", label:"Håndball Menn", url:"/data/2026/handball_men.json", listKeys:["items","games"] },
  { key:"handball_women", label:"Håndball Damer", url:"/data/2026/handball_women.json", listKeys:["items","games"] },

  { key:"wintersport_men", label:"Vintersport Menn", url:"/data/2026/wintersport_men.json", listKeys:["items","games"] },
  { key:"wintersport_women", label:"Vintersport Kvinner", url:"/data/2026/wintersport_women.json", listKeys:["items","games"] },
];

function getListFromPayload(payload, listKeys){
  for(const k of listKeys){
    if(Array.isArray(payload?.[k])) return payload[k];
  }
  return [];
}

function normalizeGame(x, fallbackLeague){
  // støtter ulike formater fra pipeline
  const league = x.league || x.competition || fallbackLeague || "Ukjent";
  const home = x.home || x.homeTeam || x.hjemme || x.team1 || "Ukjent";
  const away = x.away || x.awayTeam || x.borte || x.team2 || "Ukjent";

  const kickoff = x.kickoff || x.start || x.date || x.datetime || x.time || null;
  const channel = x.channel || x.tv || x.broadcast || "Ukjent";

  const where = x.where || x.pubs || x.places || x.venue_pubs || [];
  const whereArr = Array.isArray(where) ? where : [];

  return { league, home, away, kickoff, channel, where: whereArr };
}

function renderGameCard(g){
  const card = document.createElement("div");
  card.className = "card";

  const dt = g.kickoff ? fmtNoDateTime(g.kickoff) : "Tid ikke oppgitt";
  const title = `${g.home} – ${g.away}`;

  card.innerHTML = `
    <div class="row">
      <div>
        <div class="teams">${safeText(title)}</div>
        <div class="muted small">${safeText(dt)}</div>
      </div>
      <div class="badge accent">${safeText(g.channel || "Ukjent")}</div>
    </div>
    <div class="badges">
      ${(g.where?.length ? g.where : ["Vikinghjørnet","Gimle Pub"]).map(p=>`<span class="badge">${safeText(p)}</span>`).join("")}
    </div>
  `;

  // Klikk åpner modal
  card.addEventListener("click", ()=> openModal(g));
  return card;
}

function openModal(g){
  // enkel modal uten ekstra filer
  let backdrop = document.querySelector(".modal-backdrop");
  if(backdrop) backdrop.remove();

  backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        <div>
          <div class="modal-title">${safeText(g.home)} – ${safeText(g.away)}</div>
          <div class="modal-sub">${safeText(g.league)} • ${g.kickoff ? fmtNoDateTime(g.kickoff) : "Tid ikke oppgitt"}</div>
        </div>
        <button class="iconbtn" id="modalClose">Lukk</button>
      </div>
      <div class="modal-body">
        <div class="kv">
          <div class="k">TV</div><div class="v">${safeText(g.channel || "Ukjent")}</div>
          <div class="k">Vises på</div><div class="v">${(g.where?.length ? g.where : ["Vikinghjørnet","Gimle Pub"]).map(safeText).join(", ")}</div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  $("modalClose")?.addEventListener("click", ()=> backdrop.remove());
  backdrop.addEventListener("click", (e)=>{
    if(e.target === backdrop) backdrop.remove();
  });
}

function fillLeagueSelect(){
  const sel = $("leagueSelect");
  sel.innerHTML = "";
  for(const l of LEAGUES){
    const opt = document.createElement("option");
    opt.value = l.key;
    opt.textContent = l.label;
    sel.appendChild(opt);
  }
}

function currentLeague(){
  const sel = $("leagueSelect");
  const key = sel.value || "eliteserien";
  return LEAGUES.find(x=>x.key===key) || LEAGUES[0];
}

async function loadSport(){
  const err = $("sportError");
  const empty = $("sportEmpty");
  const list = $("sportList");
  hide(err); hide(empty);
  list.innerHTML = "";

  const league = currentLeague();
  const q = ( $("searchInput").value || "" ).trim().toLowerCase();

  try{
    const payload = await fetchJson(league.url);
    const raw = getListFromPayload(payload, league.listKeys);
    const games = raw.map(x=>normalizeGame(x, league.label));

    const filtered = games.filter(g=>{
      if(!q) return true;
      return (
        (g.home||"").toLowerCase().includes(q) ||
        (g.away||"").toLowerCase().includes(q) ||
        (g.league||"").toLowerCase().includes(q) ||
        (g.channel||"").toLowerCase().includes(q)
      );
    });

    $("countLabel").textContent = `${filtered.length} kamper · ${league.label}`;

    if(filtered.length === 0){
      show(empty);
      return;
    }

    for(const g of filtered){
      list.appendChild(renderGameCard(g));
    }
  }catch(e){
    err.textContent = `Kunne ikke laste ${league.url}\n${e.message}`;
    show(err);
    $("countLabel").textContent = `0 kamper · ${league.label}`;
  }
}

/* ---------------- PUBER ---------------- */
async function loadPubs(){
  const err = $("pubError");
  const empty = $("pubEmpty");
  const list = $("pubList");
  hide(err); hide(empty);
  list.innerHTML = "";

  const q = ( $("pubSearch").value || "" ).trim().toLowerCase();

  try{
    const payload = await fetchJson("/data/content/pubs.json");

    // DU har: { "places": [...] }
    const items = Array.isArray(payload.places) ? payload.places
                : Array.isArray(payload.pubs) ? payload.pubs
                : [];

    const filtered = items.filter(p=>{
      const n = (p.name||"").toLowerCase();
      const c = (p.city||"").toLowerCase();
      return !q || n.includes(q) || c.includes(q);
    });

    if(filtered.length === 0){ show(empty); return; }

    for(const p of filtered){
      const card = document.createElement("div");
      card.className = "card";
      const tags = Array.isArray(p.tags) ? p.tags : [];
      card.innerHTML = `
        <div class="teams">${safeText(p.name)}</div>
        <div class="muted small">${safeText(p.city || "")}</div>
        <div class="badges">${tags.map(t=>`<span class="badge">${safeText(t)}</span>`).join("")}</div>
      `;
      list.appendChild(card);
    }
  }catch(e){
    err.textContent = `Kunne ikke laste /data/content/pubs.json\n${e.message}`;
    show(err);
  }
}

/* ---------------- EVENTER ---------------- */
async function loadEvents(){
  const err = $("eventError");
  const empty = $("eventEmpty");
  const list = $("eventList");
  hide(err); hide(empty);
  list.innerHTML = "";

  const q = ( $("eventSearch").value || "" ).trim().toLowerCase();

  try{
    const payload = await fetchJson("/data/events/events.json");
    const items = Array.isArray(payload.events) ? payload.events : [];

    const filtered = items.filter(ev=>{
      const t = (ev.title||ev.name||"").toLowerCase();
      const w = (ev.where||ev.place||"").toLowerCase();
      return !q || t.includes(q) || w.includes(q);
    });

    if(filtered.length === 0){ show(empty); return; }

    for(const ev of filtered){
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="teams">${safeText(ev.title || ev.name || "Event")}</div>
        <div class="muted small">${safeText(ev.date || ev.when || "")}${ev.where ? " • " + safeText(ev.where) : ""}</div>
      `;
      list.appendChild(card);
    }
  }catch(e){
    err.textContent = `Kunne ikke laste /data/events/events.json\n${e.message}`;
    show(err);
  }
}

/* ---------------- VM/EM ---------------- */
function flattenMonths(payload){
  // vm2026_list.json hos deg: { generated_at, months:[{month, games:[...]}] }
  const months = Array.isArray(payload.months) ? payload.months : [];
  const all = [];
  for(const m of months){
    const games = Array.isArray(m.games) ? m.games : [];
    for(const g of games) all.push(g);
  }
  return all;
}

function renderSimpleItem(x){
  const g = normalizeGame(x, x.league || x.sport || "Ukjent");
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="teams">${safeText(g.home)} – ${safeText(g.away)}</div>
    <div class="muted small">${g.kickoff ? fmtNoDateTime(g.kickoff) : ""}</div>
    <div class="badges">
      <span class="badge accent">${safeText(g.channel || "Ukjent")}</span>
    </div>
  `;
  card.addEventListener("click", ()=> openModal(g));
  return card;
}

async function loadVM(){
  const err = $("vmError");
  const empty = $("vmEmpty");
  const list = $("vmList");
  hide(err); hide(empty);
  list.innerHTML = "";

  const q = ( $("vmSearch").value || "" ).trim().toLowerCase();

  try{
    const payload = await fetchJson("/data/2026/vm2026_list.json");
    const items = flattenMonths(payload);

    const filtered = items.filter(x=>{
      const s = `${x.league||""} ${x.home||""} ${x.away||""} ${x.sport||""}`.toLowerCase();
      return !q || s.includes(q);
    });

    if(filtered.length === 0){ show(empty); return; }
    for(const x of filtered) list.appendChild(renderSimpleItem(x));
  }catch(e){
    err.textContent = `Kunne ikke laste /data/2026/vm2026_list.json\n${e.message}`;
    show(err);
  }
}

async function loadEM(){
  const err = $("emError");
  const empty = $("emEmpty");
  const list = $("emList");
  hide(err); hide(empty);
  list.innerHTML = "";

  const q = ( $("emSearch").value || "" ).trim().toLowerCase();

  try{
    const payload = await fetchJson("/data/2026/em2026_list.json");
    const items = flattenMonths(payload);

    const filtered = items.filter(x=>{
      const s = `${x.league||""} ${x.home||""} ${x.away||""} ${x.sport||""}`.toLowerCase();
      return !q || s.includes(q);
    });

    if(filtered.length === 0){ show(empty); return; }
    for(const x of filtered) list.appendChild(renderSimpleItem(x));
  }catch(e){
    err.textContent = `Kunne ikke laste /data/2026/em2026_list.json\n${e.message}`;
    show(err);
  }
}

/* ---------------- INIT ---------------- */
function init(){
  initTabs();
  fillLeagueSelect();

  $("leagueSelect")?.addEventListener("change", loadSport);
  $("refreshBtn")?.addEventListener("click", loadSport);
  $("searchInput")?.addEventListener("input", ()=>{ clearTimeout(window.__sT); window.__sT=setTimeout(loadSport,120); });

  $("pubRefresh")?.addEventListener("click", loadPubs);
  $("pubSearch")?.addEventListener("input", ()=>{ clearTimeout(window.__pT); window.__pT=setTimeout(loadPubs,120); });

  $("eventRefresh")?.addEventListener("click", loadEvents);
  $("eventSearch")?.addEventListener("input", ()=>{ clearTimeout(window.__eT); window.__eT=setTimeout(loadEvents,120); });

  $("vmRefresh")?.addEventListener("click", loadVM);
  $("vmSearch")?.addEventListener("input", ()=>{ clearTimeout(window.__vT); window.__vT=setTimeout(loadVM,120); });

  $("emRefresh")?.addEventListener("click", loadEM);
  $("emSearch")?.addEventListener("input", ()=>{ clearTimeout(window.__mT); window.__mT=setTimeout(loadEM,120); });

  setActiveTab("sport");
}

document.addEventListener("DOMContentLoaded", init);
