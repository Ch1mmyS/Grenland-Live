// /app.js (KOMPLETT – ROOT) ✅ FIXET fetchJson + tekst/encoding

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

/* =========================================================
   ✅ UTF/MOJIBAKE FIX (Ã¸ Ã¥ Ã¦ etc)
   - Fixer typiske UTF-8->Latin1 feil i ALLE strings i JSON
========================================================= */
function fixMojibakeString(s){
  if (typeof s !== "string") return s;

  // Bare prøv å fikse hvis den ser mistenkelig ut (unngår å ødelegge normale tekster)
  if (!/[ÃÂ]/.test(s)) return s;

  try{
    // klassisk: UTF-8 bytes tolket som Latin-1
    return decodeURIComponent(escape(s));
  }catch{
    // fallback – ingen endring hvis det feiler
    return s;
  }
}

function deepFixText(value){
  if (typeof value === "string") return fixMojibakeString(value);
  if (Array.isArray(value)) return value.map(deepFixText);
  if (value && typeof value === "object"){
    const out = {};
    for (const [k, v] of Object.entries(value)){
      out[deepFixText(k)] = deepFixText(v);
    }
    return out;
  }
  return value;
}

/* =========================================================
   ✅ fetchJson: henter som TEXT + JSON.parse + deepFixText
   (IKKE res.json())
========================================================= */
async function fetchJson(url){
  const r = await fetch(url, { cache: "no-store" });
  if(!r.ok) throw new Error(`${r.status} ${r.statusText} :: ${url}`);

  const txt = await r.text();          // <-- viktig
  let data;
  try{
    data = JSON.parse(txt);            // <-- viktig
  }catch(e){
    throw new Error(`JSON parse error (${url}): ${e.message}`);
  }
  return deepFixText(data);            // <-- viktig
}

/* =========================================================
   STABILISERING HELPERS (NO DESIGN CHANGES)
========================================================= */
const ONLY_YEAR = 2026;

// ✅ Vikinghjørnet først
const DEFAULT_PUBS = ["Vikinghjørnet", "Gimle Pub"];

function defaultChannelForLeague(leagueRaw=""){
  const s = (leagueRaw || "").toLowerCase();
  if (s.includes("premier")) return "Viaplay / V Sport";
  if (s.includes("champions")) return "TV 2 / TV 2 Play";
  if (s.includes("la liga") || s.includes("laliga")) return "TV 2 / TV 2 Play";
  if (s.includes("eliteserien") || s.includes("obos")) return "TV 2 / TV 2 Play";
  return "Ukjent";
}

function toIsoMaybe(v){
  if (!v) return null;
  if (typeof v === "string" && (v.includes("T") && (v.includes("+") || v.endsWith("Z")))) return v;
  try{
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toISOString();
  }catch(e){}
  return null;
}

function isInOnlyYearKickoff(kickoff){
  const iso = toIsoMaybe(kickoff);
  if (!iso) return false;
  try { return new Date(iso).getFullYear() === ONLY_YEAR; } catch(e){ return false; }
}

// pub kan være string eller object {name, city, url}
function pubToHtml(pub){
  const name = (typeof pub === "string") ? pub : (pub?.name || "Ukjent");
  const city = (typeof pub === "object" && pub?.city) ? pub.city : "";
  const url  = (typeof pub === "object" && pub?.url) ? pub.url : "";

  const q = encodeURIComponent(city ? `${name}, ${city}` : name);
  const maps = `https://www.google.com/maps/search/?api=1&query=${q}`;

  const website = url
    ? ` <a href="${url}" target="_blank" rel="noopener" style="text-decoration:inherit;color:inherit;">(Nettside)</a>`
    : "";

  return `<a href="${maps}" target="_blank" rel="noopener" style="text-decoration:inherit;color:inherit;">${safeText(name)}</a>${website}`;
}

function mergeWhereWithDefaults(whereArr){
  const strings = [];
  const objs = [];

  for (const p of (whereArr || [])){
    if (typeof p === "string") strings.push(p);
    else if (p && typeof p === "object") objs.push(p);
  }

  const restStrings = strings.filter(x => !DEFAULT_PUBS.includes(x));
  const restObjs = objs.filter(o => !DEFAULT_PUBS.includes(o?.name));

  const merged = [
    ...DEFAULT_PUBS,
    ...restStrings,
    ...restObjs
  ];

  const rebuilt = [];
  const seen = new Set();
  for (const p of merged){
    if (typeof p === "string"){
      if (!seen.has(p)){
        seen.add(p);
        rebuilt.push(p);
      }
    }else{
      rebuilt.push(p);
    }
  }
  return rebuilt;
}

function displayTitle(g){
  const h = safeText(g.home);
  const a = safeText(g.away);
  if ((h === "" || h === "Ukjent") && (a === "" || a === "Ukjent")){
    const t = safeText(g.title || g.name || "");
    if (t) return t;
  }
  return `${h || "Ukjent"} – ${a || "Ukjent"}`;
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
  if (Array.isArray(payload)) return payload;
  for(const k of listKeys){
    if(Array.isArray(payload?.[k])) return payload[k];
  }
  return [];
}

function normalizeGame(x, fallbackLeague){
  const league = x.league || x.competition || x.tournament || fallbackLeague || "Ukjent";
  const home = x.home || x.homeTeam || x.hjemme || x.team1 || x.athlete || "Ukjent";
  const away = x.away || x.awayTeam || x.borte || x.team2 || x.opponent || "Ukjent";

  const kickoffRaw = x.kickoff || x.start || x.date || x.datetime || x.time || x.utcDate || null;
  const kickoff = toIsoMaybe(kickoffRaw);

  let channel = x.channel || x.tv || x.broadcast || x.broadcaster || "Ukjent";
  if (!channel || String(channel).trim() === "" || String(channel).toLowerCase() === "ukjent"){
    channel = defaultChannelForLeague(league);
  }

  const where = x.where || x.pubs || x.places || x.venue_pubs || x.venues || [];
  const whereArr = Array.isArray(where) ? where : [];

  const title = x.title || x.name || x.event || x.race || x.summary || "";

  return {
    league,
    home,
    away,
    kickoff,
    channel,
    where: mergeWhereWithDefaults(whereArr),
    title
  };
}

function renderGameCard(g){
  const card = document.createElement("div");
  card.className = "card";

  const dt = g.kickoff ? fmtNoDateTime(g.kickoff) : "Tid ikke oppgitt";
  const title = displayTitle(g);

  card.innerHTML = `
    <div class="row">
      <div>
        <div class="teams">${safeText(title)}</div>
        <div class="muted small">${safeText(dt)}</div>
      </div>
      <div class="badge accent">${safeText(g.channel || "Ukjent")}</div>
    </div>
    <div class="badges">
      ${ (g.where?.length ? g.where : DEFAULT_PUBS).map(p=>`<span class="badge">${safeText(typeof p === "string" ? p : (p?.name || "Ukjent"))}</span>`).join("") }
    </div>
  `;

  card.addEventListener("click", ()=> openModal(g));
  return card;
}

function openModal(g){
  let backdrop = document.querySelector(".modal-backdrop");
  if(backdrop) backdrop.remove();

  backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";

  const pubsHtml = (g.where?.length ? g.where : DEFAULT_PUBS).map(pubToHtml).join(", ");

  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        <div>
          <div class="modal-title">${safeText(displayTitle(g))}</div>
          <div class="modal-sub">${safeText(g.league)} • ${g.kickoff ? fmtNoDateTime(g.kickoff) : "Tid ikke oppgitt"}</div>
        </div>
        <button class="iconbtn" id="modalClose">Lukk</button>
      </div>
      <div class="modal-body">
        <div class="kv">
          <div class="k">TV</div><div class="v">${safeText(g.channel || "Ukjent")}</div>
          <div class="k">Vises på</div><div class="v">${pubsHtml || "Ukjent"}</div>
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

    const games = raw
      .map(x=>normalizeGame(x, league.label))
      .filter(g => g.kickoff && isInOnlyYearKickoff(g.kickoff));

    const filtered = games.filter(g=>{
      if(!q) return true;
      return (
        (g.home||"").toLowerCase().includes(q) ||
        (g.away||"").toLowerCase().includes(q) ||
        (g.league||"").toLowerCase().includes(q) ||
        (g.channel||"").toLowerCase().includes(q) ||
        (g.title||"").toLowerCase().includes(q)
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

      card.addEventListener("click", ()=>{
        const name = safeText(p.name);
        const city = safeText(p.city || "");
        const query = encodeURIComponent(city ? `${name}, ${city}` : name);
        window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, "_blank", "noopener");
      });

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

  const dt = g.kickoff ? fmtNoDateTime(g.kickoff) : "";
  const title = displayTitle(g);

  card.innerHTML = `
    <div class="teams">${safeText(title)}</div>
    <div class="muted small">${safeText(dt)}</div>
    <div class="badges">
      <span class="badge accent">${safeText(g.channel || "Ukjent")}</span>
      ${(g.where?.length ? g.where : DEFAULT_PUBS).map(p=>`<span class="badge">${safeText(typeof p === "string" ? p : (p?.name || "Ukjent"))}</span>`).join("")}
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

    const only2026 = items.filter(x=>{
      const kickoff = x.kickoff || x.start || x.date || x.datetime || x.time || x.utcDate || null;
      return kickoff && isInOnlyYearKickoff(kickoff);
    });

    const filtered = only2026.filter(x=>{
      const s = `${x.league||""} ${x.home||""} ${x.away||""} ${x.sport||""} ${x.title||""} ${x.name||""}`.toLowerCase();
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

    const only2026 = items.filter(x=>{
      const kickoff = x.kickoff || x.start || x.date || x.datetime || x.time || x.utcDate || null;
      return kickoff && isInOnlyYearKickoff(kickoff);
    });

    const filtered = only2026.filter(x=>{
      const s = `${x.league||""} ${x.home||""} ${x.away||""} ${x.sport||""} ${x.title||""} ${x.name||""}`.toLowerCase();
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
