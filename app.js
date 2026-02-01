// /app.js — Grenland Live (ROBUST + FALLBACK)
// Hvis eliteserien/obos/handball-filer er TOMME, hentes data automatisk fra data/2026/calendar_feed.json

const TZ = "Europe/Oslo";
const DEFAULT_PUBS = ["Vikinghjørnet", "Gimle Pub"];

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

const FALLBACK_FEED = "data/2026/calendar_feed.json";

/* ---- helpers ---- */
function $(id){ return document.getElementById(id); }
function show(el){ el.classList.remove("hidden"); }
function hide(el){ el.classList.add("hidden"); }

function esc(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

function uniqKeepOrder(arr){
  const seen = new Set();
  const out = [];
  for (const v of arr) {
    const k = String(v ?? "").trim();
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

function topKeys(json){
  if (!json || typeof json !== "object" || Array.isArray(json)) return [];
  return Object.keys(json).slice(0, 20);
}

function firstArrayInObject(json){
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  for (const k of Object.keys(json)) {
    if (Array.isArray(json[k])) return { key: k, arr: json[k] };
  }
  return null;
}

function parseRootToArray(json){
  if (Array.isArray(json)) return { arr: json, source: "root[]" };
  if (json && Array.isArray(json.games)) return { arr: json.games, source: "games" };
  if (json && Array.isArray(json.items)) return { arr: json.items, source: "items" };
  if (json && Array.isArray(json.matches)) return { arr: json.matches, source: "matches" };
  if (json && Array.isArray(json.events)) return { arr: json.events, source: "events" };
  if (json && Array.isArray(json.pubs)) return { arr: json.pubs, source: "pubs" };
  if (json && Array.isArray(json.data)) return { arr: json.data, source: "data" };
  if (json && Array.isArray(json.rows)) return { arr: json.rows, source: "rows" };

  const fa = firstArrayInObject(json);
  if (fa) return { arr: fa.arr, source: fa.key };

  return { arr: [], source: "none" };
}

async function fetchJson(path){
  const tries = [`${path}?v=${Date.now()}`, `/${path}?v=${Date.now()}`];
  let lastErr = null;

  for (const url of tries) {
    try{
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      if (text.trim().startsWith("<!doctype") || text.trim().startsWith("<html")) {
        throw new Error("Fikk HTML i stedet for JSON (404/redirect/cache)");
      }
      return { json: JSON.parse(text), urlUsed: url.replace(/\?v=.*/, "") };
    } catch(e){
      lastErr = e;
    }
  }
  throw lastErr || new Error("Ukjent feil ved henting av JSON");
}

/* ---- tabs ---- */
function initTabs(){
  const buttons = Array.from(document.querySelectorAll(".tab[data-tab]"));
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

/* ---- modal ---- */
function initModal(){
  const backdrop = $("modalBackdrop");
  $("modalClose").addEventListener("click", () => hide(backdrop));
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) hide(backdrop); });
}

function openModal(obj){
  const home = obj.home || obj.homeTeam || "";
  const away = obj.away || obj.awayTeam || "";
  const title = (home && away) ? `${home} – ${away}` : (obj.title || obj.name || obj.league || "Kamp");

  const kickoff = obj.kickoff || obj.start || obj.date || obj.datetime || "";
  const channel = String(obj.channel || obj.tv || obj.broadcaster || obj.kanal || "Ukjent").trim() || "Ukjent";

  let where = [];
  if (Array.isArray(obj.where)) where = obj.where;
  else if (typeof obj.where === "string") where = [obj.where];
  else if (Array.isArray(obj.pubs)) where = obj.pubs.map(p => p?.name || p).filter(Boolean);

  where = uniqKeepOrder([...DEFAULT_PUBS, ...where]);

  $("modalTitle").textContent = title;
  $("modalSub").textContent = obj.league ? `Liga: ${obj.league}` : "";

  $("modalTime").textContent = fmtOslo(kickoff);
  $("modalChannel").textContent = channel;
  $("modalWhere").textContent = where.join(", ");

  show($("modalBackdrop"));
}
window.GL_openModal = openModal;

/* ---- sport ---- */
let currentGames = [];

function normalizeGame(raw, leagueKey){
  const league = raw.league || raw.competition || raw.tournament || raw.series || LEAGUE_LABEL[leagueKey] || "Ukjent";
  const home = raw.home || raw.homeTeam || raw.team1 || raw.h || raw.localTeam || "";
  const away = raw.away || raw.awayTeam || raw.team2 || raw.a || raw.visitorTeam || "";
  const kickoff = raw.kickoff || raw.start || raw.date || raw.datetime || raw.time || raw.kickOff || raw.matchDate || "";
  const channel = String(raw.channel || raw.tv || raw.broadcaster || raw.kanal || "").trim() || "Ukjent";

  let where = [];
  if (Array.isArray(raw.where)) where = raw.where;
  else if (Array.isArray(raw.pubs)) where = raw.pubs.map(p => p?.name || p).filter(Boolean);
  else if (typeof raw.where === "string") where = [raw.where];
  else if (typeof raw.pubs === "string") where = [raw.pubs];

  where = uniqKeepOrder([...DEFAULT_PUBS, ...where]);

  return { leagueKey, league, home, away, kickoff, channel, where, raw };
}

// Fallback: filter calendar_feed by leagueKey / sport
function matchFallbackItemToLeague(it, leagueKey){
  const leagueText = String(it.league || it.competition || it.tournament || it.series || it.name || it.title || "").toLowerCase();
  const typeText  = String(it.type || it.sport || "").toLowerCase();

  if (leagueKey === "eliteserien") return leagueText.includes("eliteserien");
  if (leagueKey === "obos") return leagueText.includes("obos");
  if (leagueKey === "premier_league") return leagueText.includes("premier");
  if (leagueKey === "champions_league") return leagueText.includes("champions");
  if (leagueKey === "la_liga") return leagueText.includes("la liga") || leagueText.includes("laliga");

  if (leagueKey === "handball_men" || leagueKey === "handball_women") {
    // Best-effort: må ha type/sport "handball" eller "håndball"
    return typeText.includes("handball") || typeText.includes("håndball");
  }

  if (leagueKey === "wintersport_men" || leagueKey === "wintersport_women") {
    return typeText.includes("vintersport") || typeText.includes("winter") || typeText.includes("ski");
  }

  return false;
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
    btn.className = "card";
    btn.innerHTML = `
      <div class="row">
        <div>
          <div class="teams">${esc(g.home && g.away ? `${g.home} – ${g.away}` : g.league)}</div>
          <div class="muted small">${esc(fmtOslo(g.kickoff))}</div>
        </div>
        <div class="badge accent">${esc(g.channel || "Ukjent")}</div>
      </div>
      <div class="badges">
        ${(g.where || []).slice(0, 4).map(p => `<span class="badge">${esc(p)}</span>`).join("")}
      </div>
    `;
    btn.addEventListener("click", () => openModal(g));
    root.appendChild(btn);
  }
}

function applySportSearch(){
  const q = ($("searchInput").value || "").trim().toLowerCase();
  const filtered = !q ? currentGames : currentGames.filter(g => {
    const hay = [g.league, g.home, g.away, g.channel, (g.where || []).join(" ")].join(" ").toLowerCase();
    return hay.includes(q);
  });

  $("leagueCount").textContent = String(filtered.length);
  renderGames(filtered);
}

async function loadLeague(){
  const key = $("leagueSelect").value;
  $("leagueName").textContent = LEAGUE_LABEL[key] || key;

  const errBox = $("gamesError");
  hide(errBox); errBox.textContent = "";

  $("gamesList").innerHTML = `<div class="empty">Laster…</div>`;
  $("leagueCount").textContent = "0";

  const path = LEAGUE_FILE[key];

  try {
    const { json, urlUsed } = await fetchJson(path);
    const parsed = parseRootToArray(json);
    const arr = parsed.arr;

    // Normal normal
    if (arr.length) {
      currentGames = arr.map(x => normalizeGame(x, key));
      currentGames.sort((a,b) => (Date.parse(a.kickoff)||0) - (Date.parse(b.kickoff)||0));
      applySportSearch();
      return;
    }

    // TOM FIL: fallback fra calendar_feed
    const { json: feedJson } = await fetchJson(FALLBACK_FEED);
    const feed = parseRootToArray(feedJson).arr;

    const filtered = feed.filter(it => matchFallbackItemToLeague(it, key)).map(it => normalizeGame(it, key));
    filtered.sort((a,b) => (Date.parse(a.kickoff)||0) - (Date.parse(b.kickoff)||0));

    currentGames = filtered;
    applySportSearch();

    errBox.textContent =
      `OBS: ${path} er tom (${parsed.source}: 0). Viser i stedet kamper fra ${FALLBACK_FEED}.\n` +
      `Fil: ${urlUsed}\nTopp-nøkler: ${topKeys(json).join(", ") || "(ingen)"}`;
    show(errBox);

  } catch (e) {
    currentGames = [];
    $("leagueCount").textContent = "0";
    $("gamesList").innerHTML = `<div class="empty">Ingen kamper funnet.</div>`;
    errBox.textContent = `Kunne ikke laste: ${path}\n${String(e?.message || e)}`;
    show(errBox);
    console.error(e);
  }
}

/* ---- pubs/events/vm/em loaders (viser hvorfor tom) ---- */
function renderSimpleList(rootEl, items, makeTitle, makeSub){
  rootEl.innerHTML = "";
  if (!items.length) {
    rootEl.innerHTML = `<div class="empty">Ingen elementer funnet.</div>`;
    return;
  }
  for (const it of items) {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <div class="row">
        <div>
          <div class="teams">${esc(makeTitle(it))}</div>
          <div class="muted small">${esc(makeSub(it))}</div>
        </div>
      </div>
    `;
    rootEl.appendChild(div);
  }
}

function bestTitle(x){
  // plukk første “fornuftige” string-felt
  const candidates = ["title","name","event","match","stage","group","round","text","label"];
  for (const k of candidates) {
    if (typeof x?.[k] === "string" && x[k].trim()) return x[k];
  }
  // ellers finn første string i object
  if (x && typeof x === "object") {
    for (const k of Object.keys(x)) {
      if (typeof x[k] === "string" && x[k].trim()) return x[k];
    }
  }
  return "Ukjent";
}

function bestSub(x){
  const when = x?.start || x?.date || x?.datetime || x?.time || "";
  const where = x?.where || x?.location || x?.venue || "";
  return [fmtOslo(when), where].filter(Boolean).join(" · ") || "Ukjent";
}

async function loadPubs(){
  const err = $("pubsError");
  hide(err); err.textContent = "";
  const root = $("pubsList");
  root.innerHTML = `<div class="empty">Laster…</div>`;

  const path = "data/content/pubs.json";
  try {
    const { json, urlUsed } = await fetchJson(path);
    const parsed = parseRootToArray(json);
    const arr = parsed.arr;

    const pubs = arr.map(p => ({
      name: p.name || p.title || p.pub || "Ukjent",
      city: p.city || p.town || "",
      type: p.type || p.category || ""
    }));

    const input = $("pubSearchInput");
    const render = () => {
      const q = (input.value || "").trim().toLowerCase();
      const filtered = !q ? pubs : pubs.filter(p => `${p.name} ${p.city} ${p.type}`.toLowerCase().includes(q));
      renderSimpleList(root, filtered, p => p.name, p => [p.city, p.type].filter(Boolean).join(" · "));
    };
    input.oninput = render;
    render();

    if (!arr.length) {
      err.textContent = `Filen lastet OK, men inneholder 0 puber.\nFil: ${urlUsed}\nFant liste under: ${parsed.source}\nTopp-nøkler: ${topKeys(json).join(", ")}`;
      show(err);
    }
  } catch (e) {
    root.innerHTML = `<div class="empty">Ingen puber funnet.</div>`;
    err.textContent = `Kunne ikke laste: ${path}\n${String(e?.message || e)}`;
    show(err);
  }
}

async function loadEvents(){
  const err = $("eventsError");
  hide(err); err.textContent = "";
  const root = $("eventsList");
  root.innerHTML = `<div class="empty">Laster…</div>`;

  const path = "data/events/events.json";
  try {
    const { json, urlUsed } = await fetchJson(path);
    const parsed = parseRootToArray(json);
    const arr = parsed.arr;

    const list = arr.map(x => ({
      title: x.title || x.name || bestTitle(x),
      when: x.start || x.date || x.datetime || "",
      where: x.where || x.location || ""
    })).sort((a,b) => (Date.parse(a.when)||0) - (Date.parse(b.when)||0));

    const input = $("eventSearchInput");
    const render = () => {
      const q = (input.value || "").trim().toLowerCase();
      const filtered = !q ? list : list.filter(e => `${e.title} ${e.where}`.toLowerCase().includes(q));
      renderSimpleList(root, filtered, e => e.title, e => [fmtOslo(e.when), e.where].filter(Boolean).join(" · "));
    };
    input.oninput = render;
    render();

    if (!arr.length) {
      err.textContent = `Filen lastet OK, men inneholder 0 eventer.\nFil: ${urlUsed}\nFant liste under: ${parsed.source}\nTopp-nøkler: ${topKeys(json).join(", ")}`;
      show(err);
    }
  } catch (e) {
    root.innerHTML = `<div class="empty">Ingen eventer funnet.</div>`;
    err.textContent = `Kunne ikke laste: ${path}\n${String(e?.message || e)}`;
    show(err);
  }
}

async function loadAnyList(path, rootId, inputId, errId){
  const root = $(rootId);
  const input = $(inputId);
  const err = $(errId);

  hide(err); err.textContent = "";
  root.innerHTML = `<div class="empty">Laster…</div>`;

  try {
    const { json, urlUsed } = await fetchJson(path);
    const parsed = parseRootToArray(json);
    const arr = parsed.arr;

    const list = arr.map(x => ({
      raw: x,
      title: bestTitle(x),
      sub: bestSub(x)
    }));

    const render = () => {
      const q = (input.value || "").trim().toLowerCase();
      const filtered = !q ? list : list.filter(i => `${i.title} ${i.sub}`.toLowerCase().includes(q));
      renderSimpleList(root, filtered, i => i.title, i => i.sub);
    };
    input.oninput = render;
    render();

    if (!arr.length) {
      err.textContent = `Filen lastet OK, men inneholder 0 elementer.\nFil: ${urlUsed}\nFant liste under: ${parsed.source}\nTopp-nøkler: ${topKeys(json).join(", ")}`;
      show(err);
    }
  } catch (e) {
    root.innerHTML = `<div class="empty">Ingen elementer funnet.</div>`;
    err.textContent = `Kunne ikke laste: ${path}\n${String(e?.message || e)}`;
    show(err);
  }
}

/* ---- init ---- */
document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initModal();

  $("leagueName").textContent = LEAGUE_LABEL[$("leagueSelect").value] || $("leagueSelect").value;

  $("leagueSelect").addEventListener("change", () => {
    $("searchInput").value = "";
    loadLeague();
  });
  $("searchInput").addEventListener("input", applySportSearch);

  $("reloadBtn").addEventListener("click", loadLeague);
  $("reloadPubsBtn").addEventListener("click", loadPubs);
  $("reloadEventsBtn").addEventListener("click", loadEvents);
  $("reloadVmBtn").addEventListener("click", () => loadAnyList("data/2026/vm2026_list.json", "vmList", "vmSearchInput", "vmError"));
  $("reloadEmBtn").addEventListener("click", () => loadAnyList("data/2026/em2026_list.json", "emList", "emSearchInput", "emError"));

  loadLeague();
  loadPubs();
  loadEvents();
  loadAnyList("data/2026/vm2026_list.json", "vmList", "vmSearchInput", "vmError");
  loadAnyList("data/2026/em2026_list.json", "emList", "emSearchInput", "emError");
});
