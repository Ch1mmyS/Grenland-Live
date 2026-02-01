// /app.js — Grenland Live (ROBUST LOADING + MODAL FOR CALENDAR CLICKS)
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

/**
 * ROBUST array extraction:
 * - Accepts [] directly
 * - Accepts common keys: games/matches/items/events/pub(s)/rows/data/fixtures/list/result
 * - If object contains a single array property, uses that
 */
function parseRootToArray(json){
  if (Array.isArray(json)) return { arr: json, source: "root[]" };

  if (json && Array.isArray(json.games)) return { arr: json.games, source: "games" };
  if (json && Array.isArray(json.matches)) return { arr: json.matches, source: "matches" };
  if (json && Array.isArray(json.items)) return { arr: json.items, source: "items" };
  if (json && Array.isArray(json.events)) return { arr: json.events, source: "events" };

  if (json && Array.isArray(json.pubs)) return { arr: json.pubs, source: "pubs" };
  if (json && Array.isArray(json.pub)) return { arr: json.pub, source: "pub" };

  if (json && Array.isArray(json.rows)) return { arr: json.rows, source: "rows" };
  if (json && Array.isArray(json.data)) return { arr: json.data, source: "data" };
  if (json && Array.isArray(json.fixtures)) return { arr: json.fixtures, source: "fixtures" };
  if (json && Array.isArray(json.list)) return { arr: json.list, source: "list" };
  if (json && Array.isArray(json.result)) return { arr: json.result, source: "result" };

  const fa = firstArrayInObject(json);
  if (fa) return { arr: fa.arr, source: fa.key };

  return { arr: [], source: "none" };
}

async function fetchJson(path){
  // Try both relative and absolute (some GH pages setups behave weird with base paths)
  const tries = [
    `${path}?v=${Date.now()}`,
    `/${path}?v=${Date.now()}`
  ];

  let lastErr = null;
  for (const url of tries) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const ct = (r.headers.get("content-type") || "").toLowerCase();
      const text = await r.text();

      // If HTML returned, it's usually a 404 page or redirect result
      if (ct.includes("text/html") || text.trim().startsWith("<!doctype") || text.trim().startsWith("<html")) {
        throw new Error(`Fikk HTML i stedet for JSON (tyder på feil sti/404/cache)`);
      }

      // Parse JSON from text (more robust than r.json() for wrong content-type)
      const json = JSON.parse(text);
      return { json, urlUsed: url.replace(/\?v=.*/, "") };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Ukjent feil ved henting av JSON");
}

/* ---------------- Tabs ---------------- */
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

/* ---------------- Modal ---------------- */
function initModal(){
  const backdrop = $("modalBackdrop");
  const close = $("modalClose");
  close.addEventListener("click", () => hide(backdrop));
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) hide(backdrop); });
}

function openModal(obj){
  const title =
    (obj.home && obj.away) ? `${obj.home} – ${obj.away}` :
    (obj.title || obj.name || obj.league || "Kamp");

  const leagueLine = obj.league ? `Liga: ${obj.league}` : "";

  const kickoff = obj.kickoff || obj.start || obj.date || obj.datetime || "";
  const channel = String(obj.channel || obj.tv || obj.broadcaster || obj.kanal || "Ukjent").trim() || "Ukjent";

  // where: accept array, string, pubs objects, etc.
  let where = [];
  if (Array.isArray(obj.where)) where = obj.where;
  else if (typeof obj.where === "string") where = [obj.where];
  else if (Array.isArray(obj.pubs)) where = obj.pubs.map(p => p?.name || p).filter(Boolean);

  where = uniqKeepOrder([...DEFAULT_PUBS, ...where]);

  $("modalTitle").textContent = title;
  $("modalSub").textContent = leagueLine;

  $("modalTime").textContent = fmtOslo(kickoff);
  $("modalChannel").textContent = channel || "Ukjent";
  $("modalWhere").textContent = where.length ? where.join(", ") : DEFAULT_PUBS.join(", ");

  show($("modalBackdrop"));
}

// Expose for calendar.js
window.GL_openModal = openModal;

/* ---------------- Sport ---------------- */
let currentGames = [];

function normalizeGame(raw, leagueKey){
  const league =
    raw.league || raw.competition || raw.tournament || raw.series ||
    LEAGUE_LABEL[leagueKey] || "Ukjent";

  const home = raw.home || raw.homeTeam || raw.team1 || raw.h || raw.localTeam || "";
  const away = raw.away || raw.awayTeam || raw.team2 || raw.a || raw.visitorTeam || "";

  const kickoff =
    raw.kickoff || raw.start || raw.date || raw.datetime || raw.time ||
    raw.kickOff || raw.matchDate || "";

  const channel = String(raw.channel || raw.tv || raw.broadcaster || raw.kanal || "").trim() || "Ukjent";

  let where = [];
  if (Array.isArray(raw.where)) where = raw.where;
  else if (Array.isArray(raw.pubs)) where = raw.pubs.map(p => p?.name || p).filter(Boolean);
  else if (typeof raw.where === "string") where = [raw.where];
  else if (typeof raw.pubs === "string") where = [raw.pubs];

  where = uniqKeepOrder([...DEFAULT_PUBS, ...where]);

  return { leagueKey, league, home, away, kickoff, channel, where, raw };
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
    const hay = [
      g.league, g.home, g.away, g.channel,
      (g.where || []).join(" ")
    ].join(" ").toLowerCase();
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
    const source = parsed.source;
    const keys = topKeys(json);

    currentGames = arr.map(x => normalizeGame(x, key));
    currentGames.sort((a,b) => (Date.parse(a.kickoff)||0) - (Date.parse(b.kickoff)||0));

    applySportSearch();

    // If empty, show WHY (file loaded, but 0 items / wrong key)
    if (!arr.length) {
      errBox.textContent =
        `Filen lastet OK, men inneholder 0 kamper.\n` +
        `Fil: ${urlUsed}\n` +
        `Fant liste under: ${source}\n` +
        `Topp-nøkler: ${keys.join(", ") || "(ingen)"}`;
      show(errBox);
    }
  } catch (e) {
    currentGames = [];
    $("leagueCount").textContent = "0";
    $("gamesList").innerHTML = `<div class="empty">Ingen kamper funnet.</div>`;
    errBox.textContent = `Kunne ikke laste: ${path}\n${String(e?.message || e)}`;
    show(errBox);
    console.error(e);
  }
}

/* ---------------- Generic list loaders (Puber / Eventer / VM / EM) ---------------- */
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
    const keys = topKeys(json);

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
      err.textContent =
        `Filen lastet OK, men inneholder 0 puber.\n` +
        `Fil: ${urlUsed}\n` +
        `Fant liste under: ${parsed.source}\n` +
        `Topp-nøkler: ${keys.join(", ") || "(ingen)"}`;
      show(err);
    }
  } catch (e) {
    root.innerHTML = `<div class="empty">Ingen puber funnet.</div>`;
    err.textContent = `Kunne ikke laste: ${path}\n${String(e?.message || e)}`;
    show(err);
    console.error(e);
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
    const keys = topKeys(json);

    const list = arr.map(x => ({
      title: x.title || x.name || "Event",
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
      err.textContent =
        `Filen lastet OK, men inneholder 0 eventer.\n` +
        `Fil: ${urlUsed}\n` +
        `Fant liste under: ${parsed.source}\n` +
        `Topp-nøkler: ${keys.join(", ") || "(ingen)"}`;
      show(err);
    }
  } catch (e) {
    root.innerHTML = `<div class="empty">Ingen eventer funnet.</div>`;
    err.textContent = `Kunne ikke laste: ${path}\n${String(e?.message || e)}`;
    show(err);
    console.error(e);
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
    const keys = topKeys(json);

    const list = arr.map(x => ({
      title: x.title || x.name || x.event || "Ukjent",
      when: x.start || x.date || x.datetime || "",
      where: x.where || x.location || ""
    })).sort((a,b) => (Date.parse(a.when)||0) - (Date.parse(b.when)||0));

    const render = () => {
      const q = (input.value || "").trim().toLowerCase();
      const filtered = !q ? list : list.filter(i => `${i.title} ${i.where}`.toLowerCase().includes(q));
      renderSimpleList(root, filtered, i => i.title, i => [fmtOslo(i.when), i.where].filter(Boolean).join(" · "));
    };

    input.oninput = render;
    render();

    if (!arr.length) {
      err.textContent =
        `Filen lastet OK, men inneholder 0 elementer.\n` +
        `Fil: ${urlUsed}\n` +
        `Fant liste under: ${parsed.source}\n` +
        `Topp-nøkler: ${keys.join(", ") || "(ingen)"}`;
      show(err);
    }
  } catch (e) {
    root.innerHTML = `<div class="empty">Ingen elementer funnet.</div>`;
    err.textContent = `Kunne ikke laste: ${path}\n${String(e?.message || e)}`;
    show(err);
    console.error(e);
  }
}

/* ---------------- Init ---------------- */
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

  // initial loads
  loadLeague();
  loadPubs();
  loadEvents();
  loadAnyList("data/2026/vm2026_list.json", "vmList", "vmSearchInput", "vmError");
  loadAnyList("data/2026/em2026_list.json", "emList", "emSearchInput", "emError");
});
