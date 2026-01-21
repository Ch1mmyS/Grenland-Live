// app.js — Grenland Live Sport (JS)
// Leser fra /data/*.json i repoet ditt (GitHub Pages / Netlify).

const TZ = "Europe/Oslo";

const SOURCES = [
  { key: "eliteserien", label: "Eliteserien", file: "/data/eliteserien.json" },
  { key: "obos", label: "OBOS-ligaen", file: "/data/obos.json" },
  { key: "premier", label: "Premier League", file: "/data/premier_league.json" },
  { key: "champions", label: "Champions League", file: "/data/champions.json" },
  { key: "laliga", label: "La Liga", file: "/data/laliga.json" },

  { key: "hb_menn", label: "Håndball VM 2026 – Menn", file: "/data/handball_vm_2026_menn.json" },
  { key: "hb_damer", label: "Håndball VM 2026 – Damer", file: "/data/handball_vm_2026_damer.json" },

  { key: "vinter_menn", label: "Vintersport – Menn", file: "/data/vintersport_menn.json" },
  { key: "vinter_kvinner", label: "Vintersport – Kvinner", file: "/data/vintersport_kvinner.json" },

  { key: "vm2026", label: "VM 2026", file: "/data/vm2026.json" },

  // (valgfri fallback hvis du vil)
  // { key: "football", label: "Fotball (samlet)", file: "/data/football.json" },
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
  byKey: {},   // key -> normalized games
  errors: []
};

function setNetStatus(){
  const online = navigator.onLine;
  elNetStatus.textContent = online ? "🟢 Online" : "🔴 Offline";
}
window.addEventListener("online", setNetStatus);
window.addEventListener("offline", setNetStatus);

function fmtOslo(isoOrDate){
  const d = (isoOrDate instanceof Date) ? isoOrDate : new Date(isoOrDate);
  if (isNaN(d.getTime())) return "Tid ikke satt";
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
  if (!isNaN(d.getTime())) return d;
  return null;
}

// Normaliser til samme format uansett JSON
// Forventer at hver fil er { games: [...] } (slik du allerede bruker)
function normalizeGames(payload){
  const games = (payload && payload.games) ? payload.games : [];
  const out = [];

  for (const g of games){
    const league = (g.league || g.tournament || "").trim();
    const home = (g.home || "").trim();
    const away = (g.away || "").trim();

    const dt = parseISO(g.kickoff || g.start || g.datetime);

    const tv = (g.channel || g.tv || "").trim();

    // where/pubs kan være ["Gimle Pub"] eller [{name,city}]
    const raw = g.where || g.pubs || [];
    let pubs = [];
    if (Array.isArray(raw)){
      for (const p of raw){
        if (typeof p === "string") pubs.push(p);
        else if (p && typeof p === "object"){
          const name = (p.name || "").trim();
          const city = (p.city || "").trim();
          pubs.push(city ? `${name} (${city})` : name);
        }
      }
    } else if (typeof raw === "string"){
      pubs = [raw];
    }

    out.push({
      league,
      home,
      away,
      dt,       // Date|null
      tv,
      pubs: pubs.filter(Boolean),
      _raw: g
    });
  }

  return out;
}

async function fetchJSON(url){
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} (${url})`);
  return await res.json();
}

function renderTabs(){
  elTabs.innerHTML = "";
  for (const s of SOURCES){
    const btn = document.createElement("button");
    btn.className = "tabbtn" + (s.key === state.activeKey ? " active" : "");
    btn.textContent = s.label;
    btn.onclick = () => {
      state.activeKey = s.key;
      renderTabs();
      rebuildFilters();
      renderList();
    };
    elTabs.appendChild(btn);
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
    <ul>
      ${state.errors.map(e => `<li>${escapeHTML(e)}</li>`).join("")}
    </ul>
  `;
}

function escapeHTML(s){
  return (s || "").toString()
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function getActiveGames(){
  return state.byKey[state.activeKey] || [];
}

function rebuildFilters(){
  const games = getActiveGames();

  // leagues
  const leagues = Array.from(new Set(games.map(g => g.league).filter(Boolean))).sort((a,b)=>a.localeCompare(b,"no"));
  const pubs = Array.from(new Set(games.flatMap(g => g.pubs || []).filter(Boolean))).sort((a,b)=>a.localeCompare(b,"no"));

  const currentLeague = elLeagueFilter.value;
  const currentPub = elPubFilter.value;

  elLeagueFilter.innerHTML = `<option value="">Alle</option>` + leagues.map(x => `<option value="${escapeHTML(x)}">${escapeHTML(x)}</option>`).join("");
  elPubFilter.innerHTML = `<option value="">Alle</option>` + pubs.map(x => `<option value="${escapeHTML(x)}">${escapeHTML(x)}</option>`).join("");

  // forsøk å beholde valgt verdi om den finnes
  if (leagues.includes(currentLeague)) elLeagueFilter.value = currentLeague;
  if (pubs.includes(currentPub)) elPubFilter.value = currentPub;
}

function passesFilters(g){
  // upcoming
  if (elOnlyUpcoming.checked && g.dt){
    const now = new Date();
    if (g.dt.getTime() < now.getTime()) return false;
  }

  // league filter
  if (elLeagueFilter.value && g.league !== elLeagueFilter.value) return false;

  // pub filter
  if (elPubFilter.value){
    const has = (g.pubs || []).includes(elPubFilter.value);
    if (!has) return false;
  }

  // search
  const q = (elSearch.value || "").trim().toLowerCase();
  if (q){
    const hay = [
      g.league, g.home, g.away, g.tv, ...(g.pubs || [])
    ].join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }

  return true;
}

function sortGames(arr){
  const mode = elSort.value; // soon or late

  const key = (x) => x.dt ? x.dt.getTime() : 4102444800000; // year 2100
  arr.sort((a,b) => key(a) - key(b));

  if (mode === "late") arr.reverse();
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

  elList.innerHTML = filtered.slice(0, 300).map(g => {
    const title = `${escapeHTML(g.home || "")}${g.away ? " – " + escapeHTML(g.away) : ""}` || "(mangler lag)";
    const time = g.dt ? fmtOslo(g.dt) : "Tid ikke satt";
    const leagueBadge = g.league ? `<span class="badge">${escapeHTML(g.league)}</span>` : "";
    const tvBadge = g.tv ? `<span class="badge">📺 ${escapeHTML(g.tv)}</span>` : "";
    const where = (g.pubs && g.pubs.length) ? escapeHTML(g.pubs.join(", ")) : "Ikke satt";

    return `
      <div class="card">
        <div class="cardtop">
          <div>
            <div class="title">${title}</div>
            <div class="meta">${escapeHTML(time)}</div>
          </div>
        </div>
        <div class="badges">
          ${leagueBadge}
          ${tvBadge}
        </div>
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

  // last alt
  await Promise.all(SOURCES.map(async (s) => {
    try{
      const payload = await fetchJSON(s.file);
      state.byKey[s.key] = normalizeGames(payload);
    }catch(e){
      state.byKey[s.key] = [];
      state.errors.push(`${s.file}: ${e.message}`);
    }
  }));

  showErrors();

  // oppdater "Oppdatert"
  elLastUpdated.textContent = `Oppdatert: ${new Date().toLocaleString("no-NO", { timeZone: TZ })}`;

  rebuildFilters();
  renderList();
}

init();
