// app.js — Grenland Live Sport (JS) — RELATIVE DATA PATHS
console.log("✅ app.js loaded: using relative 'data/*.json' paths");

const TZ = "Europe/Oslo";

const SOURCES = [
  { key: "eliteserien", label: "Eliteserien", file: "data/eliteserien.json" },
  { key: "obos", label: "OBOS-ligaen", file: "data/obos.json" },
  { key: "premier", label: "Premier League", file: "data/premier_league.json" },
  { key: "champions", label: "Champions League", file: "data/champions.json" },
  { key: "laliga", label: "La Liga", file: "data/laliga.json" },
  { key: "hb_menn", label: "Håndball VM 2026 – Menn", file: "data/handball_vm_2026_menn.json" },
  { key: "hb_damer", label: "Håndball VM 2026 – Damer", file: "data/handball_vm_2026_damer.json" },
  { key: "vinter_menn", label: "Vintersport – Menn", file: "data/vintersport_menn.json" },
  { key: "vinter_kvinner", label: "Vintersport – Kvinner", file: "data/vintersport_kvinner.json" },
  { key: "vm2026", label: "VM 2026", file: "data/vm2026.json" }
];

const elTabs = document.getElementById("tabs");
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

let state = {
  activeKey: SOURCES[0].key,
  byKey: {},
  errors: []
};

function setNetStatus(){
  elNetStatus.textContent = navigator.onLine ? "🟢 Online" : "🔴 Offline";
}
window.addEventListener("online", setNetStatus);
window.addEventListener("offline", setNetStatus);

function escapeHTML(s){
  return (s || "").toString()
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
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

function parseISO(val){
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeGames(payload){
  const games = (payload && payload.games) ? payload.games : [];
  const out = [];

  for (const g of games){
    const raw = g.where || g.pubs || [];
    let pubs = [];

    if (Array.isArray(raw)){
      pubs = raw.map(p => {
        if (typeof p === "string") return p;
        if (p && typeof p === "object"){
          const name = (p.name || "").trim();
          const city = (p.city || "").trim();
          return city ? `${name} (${city})` : name;
        }
        return "";
      }).filter(Boolean);
    } else if (typeof raw === "string"){
      pubs = [raw];
    }

    out.push({
      league: (g.league || g.tournament || "").trim(),
      home: (g.home || "").trim(),
      away: (g.away || "").trim(),
      dt: parseISO(g.kickoff || g.start || g.datetime),
      tv: (g.channel || g.tv || "").trim(),
      pubs
    });
  }

  return out;
}

async function fetchJSON(url){
  console.log("Fetching:", url);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} (${url})`);
  return await res.json();
}

function renderTabs(){
  elTabs.innerHTML = "";
  for (const s of SOURCES){
    const b = document.createElement("button");
    b.className = "tabbtn" + (s.key === state.activeKey ? " active" : "");
    b.textContent = s.label;
    b.onclick = () => {
      state.activeKey = s.key;
      renderTabs();
      rebuildFilters();
      renderList();
    };
    elTabs.appendChild(b);
  }
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

function getActiveGames(){ return state.byKey[state.activeKey] || []; }

function rebuildFilters(){
  const games = getActiveGames();
  const leagues = Array.from(new Set(games.map(g => g.league).filter(Boolean))).sort((a,b)=>a.localeCompare(b,"no"));
  const pubs = Array.from(new Set(games.flatMap(g => g.pubs || []).filter(Boolean))).sort((a,b)=>a.localeCompare(b,"no"));

  const keepLeague = elLeagueFilter.value;
  const keepPub = elPubFilter.value;

  elLeagueFilter.innerHTML = `<option value="">Alle</option>` + leagues.map(x => `<option value="${escapeHTML(x)}">${escapeHTML(x)}</option>`).join("");
  elPubFilter.innerHTML = `<option value="">Alle</option>` + pubs.map(x => `<option value="${escapeHTML(x)}">${escapeHTML(x)}</option>`).join("");

  if (leagues.includes(keepLeague)) elLeagueFilter.value = keepLeague;
  if (pubs.includes(keepPub)) elPubFilter.value = keepPub;
}

function passesFilters(g){
  if (elOnlyUpcoming.checked && g.dt){
    if (g.dt.getTime() < Date.now()) return false;
  }
  if (elLeagueFilter.value && g.league !== elLeagueFilter.value) return false;
  if (elPubFilter.value && !(g.pubs || []).includes(elPubFilter.value)) return false;

  const q = (elSearch.value || "").trim().toLowerCase();
  if (q){
    const hay = [g.league, g.home, g.away, g.tv, ...(g.pubs||[])].join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function sortGames(arr){
  const key = (x) => x.dt ? x.dt.getTime() : 4102444800000;
  arr.sort((a,b)=>key(a)-key(b));
  if (elSort.value === "late") arr.reverse();
  return arr;
}

function renderList(){
  const all = getActiveGames();
  const filtered = sortGames(all.filter(passesFilters));
  elCountInfo.textContent = `Viser: ${filtered.length} / ${all.length}`;

  if (!filtered.length){
    elList.innerHTML = `<div class="card"><b>Ingen treff</b><div class="meta">Prøv å slå av “kun kommende”, eller endre filter.</div></div>`;
    return;
  }

  elList.innerHTML = filtered.slice(0,300).map(g=>{
    const title = `${escapeHTML(g.home)}${g.away ? " – " + escapeHTML(g.away) : ""}`;
    const time = g.dt ? fmtOslo(g.dt) : "Tid ikke satt";
    const league = g.league ? `<span class="badge">${escapeHTML(g.league)}</span>` : "";
    const tv = g.tv ? `<span class="badge">📺 ${escapeHTML(g.tv)}</span>` : "";
    const where = (g.pubs && g.pubs.length) ? escapeHTML(g.pubs.join(", ")) : "Ikke satt";
    return `
      <div class="card">
        <div class="title">${title || "(mangler lag)"}</div>
        <div class="meta">${escapeHTML(time)}</div>
        <div class="badges">${league}${tv}</div>
        <div class="where"><b>Hvor:</b> ${where}</div>
      </div>
    `;
  }).join("");
}

function bindUI(){
  elLeagueFilter.addEventListener("change", renderList);
  elPubFilter.addEventListener("change", renderList);
  elSearch.addEventListener("input", renderList);
  elOnlyUpcoming.addEventListener("change", renderList);
  elSort.addEventListener("change", renderList);
}

async function init(){
  setNetStatus();
  bindUI();
  renderTabs();

  state.errors = [];
  state.byKey = {};

  await Promise.all(SOURCES.map(async (s)=>{
    try{
      const payload = await fetchJSON(s.file);
      state.byKey[s.key] = normalizeGames(payload);
    }catch(e){
      state.byKey[s.key] = [];
      state.errors.push(`${s.file}: ${e.message}`);
    }
  }));

  showErrors();
  elLastUpdated.textContent = `Oppdatert: ${new Date().toLocaleString("no-NO", { timeZone: TZ })}`;
  rebuildFilters();
  renderList();
}

init();
