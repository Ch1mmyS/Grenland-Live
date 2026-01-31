const TZ = "Europe/Oslo";

const LEAGUE_LABEL = {
  eliteserien: "Eliteserien",
  obos: "OBOS-ligaen",
  premier_league: "Premier League",
  champions_league: "Champions League",
  la_liga: "La Liga",
  handball_men: "Håndball Menn",
  handball_women: "Håndball Damer",
  wintersport_men: "Vintersport Menn",
  wintersport_women: "Vintersport Kvinner"
};

const LEAGUE_FILE = {
  eliteserien: "data/2026/eliteserien.json",
  obos: "data/2026/obos.json",
  premier_league: "data/2026/premier_league.json",
  champions_league: "data/2026/champions_league.json",
  la_liga: "data/2026/la_liga.json",
  handball_men: "data/2026/handball_men.json",
  handball_women: "data/2026/handball_women.json",
  wintersport_men: "data/2026/wintersport_men.json",
  wintersport_women: "data/2026/wintersport_women.json"
};

const DEFAULT_PUBS = ["Vikinghjørnet", "Gimle Pub"];

function $(id){ return document.getElementById(id); }
function show(el){ el.classList.remove("hidden"); }
function hide(el){ el.classList.add("hidden"); }

function safeArr(x){ return Array.isArray(x) ? x : []; }

function uniqKeepOrder(arr){
  const seen = new Set();
  const out = [];
  for (const v of arr) {
    const k = String(v || "").trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function fmtOslo(iso){
  if (!iso) return "Ukjent";
  try {
    return new Date(iso).toLocaleString("no-NO", {
      timeZone: TZ,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch { return "Ukjent"; }
}

function parseRootToArray(json){
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.games)) return json.games;
  if (json && Array.isArray(json.matches)) return json.matches;
  if (json && Array.isArray(json.events)) return json.events;
  if (json && Array.isArray(json.items)) return json.items;
  return [];
}

function normalizeGame(raw, leagueKey){
  const league = raw.league || raw.competition || raw.tournament || LEAGUE_LABEL[leagueKey] || "Ukjent";
  const home = raw.home || raw.homeTeam || raw.team1 || raw.h || "";
  const away = raw.away || raw.awayTeam || raw.team2 || raw.a || "";
  const kickoff = raw.kickoff || raw.start || raw.date || raw.datetime || raw.time || "";
  const channel = (raw.channel || raw.tv || raw.broadcaster || raw.kanal || "").toString().trim() || "Ukjent";

  let where = [];
  if (Array.isArray(raw.where)) where = raw.where;
  else if (Array.isArray(raw.pubs)) where = raw.pubs.map(p => p?.name || p).filter(Boolean);
  else if (typeof raw.where === "string") where = [raw.where];
  else if (typeof raw.pubs === "string") where = [raw.pubs];

  where = uniqKeepOrder([...DEFAULT_PUBS, ...safeArr(where)]);

  return { leagueKey, league, home, away, kickoff, channel, where, raw };
}

async function fetchJson(path){
  const url = `${path}?v=${Date.now()}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${path}`);
  return r.json();
}

/* ---------- Faner ---------- */
function initTabs(){
  const buttons = Array.from(document.querySelectorAll(".tab-btn"));
  const panels = {
    sport: $("tab-sport"),
    pubs: $("tab-pubs"),
    events: $("tab-events"),
    vm2026: $("tab-vm2026"),
    em2026: $("tab-em2026"),
    calendar: $("tab-calendar")
  };

  function activate(tab){
    for (const b of buttons) b.classList.toggle("active", b.dataset.tab === tab);
    for (const [k, el] of Object.entries(panels)) {
      if (!el) continue;
      el.classList.toggle("hidden", k !== tab);
    }
  }

  for (const b of buttons) b.addEventListener("click", () => activate(b.dataset.tab));
}

/* ---------- Modal ---------- */
function initModal(){
  const overlay = $("modalOverlay");
  $("modalClose").addEventListener("click", () => hide(overlay));
  overlay.addEventListener("click", (e) => { if (e.target === overlay) hide(overlay); });
}

function openGameModal(game){
  $("modalTitle").textContent = game.home && game.away ? `${game.home} – ${game.away}` : (game.league || "Kamp");
  $("modalTime").textContent = fmtOslo(game.kickoff);
  $("modalChannel").textContent = game.channel || "Ukjent";
  $("modalWhere").textContent = uniqKeepOrder([...DEFAULT_PUBS, ...safeArr(game.where)]).join(", ");
  $("modalMeta").textContent = game.league ? `Liga: ${game.league}` : "";
  show($("modalOverlay"));
}

/* ---------- Sport liste ---------- */
let currentGames = [];

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}

function renderGames(list){
  const root = $("gamesList");
  root.innerHTML = "";

  if (!list.length) {
    root.innerHTML = `<div class="empty">Ingen kamper funnet.</div>`;
    return;
  }

  for (const g of list) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "list-item";
    btn.innerHTML = `
      <div class="li-main">
        <div class="li-title">${escapeHtml(g.home && g.away ? `${g.home} – ${g.away}` : g.league)}</div>
        <div class="li-sub muted">${escapeHtml(fmtOslo(g.kickoff))}</div>
      </div>
      <div class="li-right">
        <div class="li-chip">${escapeHtml(g.channel || "Ukjent")}</div>
      </div>
    `;
    btn.addEventListener("click", () => openGameModal(g));
    root.appendChild(btn);
  }
}

function applySearch(){
  const q = ($("searchInput").value || "").trim().toLowerCase();
  const list = !q ? currentGames : currentGames.filter(g => {
    const hay = [g.league, g.home, g.away, g.channel, (g.where||[]).join(" ")].join(" ").toLowerCase();
    return hay.includes(q);
  });
  $("leagueCount").textContent = String(list.length);
  renderGames(list);
}

async function loadLeague(leagueKey){
  const path = LEAGUE_FILE[leagueKey];
  $("leagueName").textContent = LEAGUE_LABEL[leagueKey] || leagueKey;
  $("leagueCount").textContent = "0";
  $("gamesList").innerHTML = `<div class="empty">Laster…</div>`;

  try {
    const json = await fetchJson(path);
    const arr = parseRootToArray(json);
    currentGames = arr.map(x => normalizeGame(x, leagueKey));
    currentGames.sort((a,b)=> (Date.parse(a.kickoff)||0) - (Date.parse(b.kickoff)||0));
    applySearch();
  } catch (e) {
    currentGames = [];
    $("leagueCount").textContent = "0";
    $("gamesList").innerHTML = `<div class="empty">Kunne ikke laste ${path}. (Sjekk 404 / JSON)</div>`;
    console.error(e);
  }
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initModal();

  const select = $("leagueSelect");
  $("leagueName").textContent = LEAGUE_LABEL[select.value] || select.value;

  select.addEventListener("change", () => {
    $("searchInput").value = "";
    loadLeague(select.value);
  });
  $("searchInput").addEventListener("input", applySearch);

  loadLeague(select.value);
});
