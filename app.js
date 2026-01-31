/* app.js — Grenland Live (NO DESIGN CHANGES)
   - Fixer riktige stier
   - Viser ligaer (ikke "Fotball samlet")
   - Kampdetaljer i modal: tid, kanal, hvor vises
   - Default pubs (Vikinghjørnet + Gimle Pub først) hvis mangler
   - Puber-fan: /data/content/pubs.json
   - Eventer-fan: /data/events/events.json
   - VM/EM: /data/2026/vm2026_list.json og /data/2026/em2026_list.json
*/

const TZ = "Europe/Oslo";

// ---------------------- DOM HELPERS ----------------------
function $(id) { return document.getElementById(id); }
function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }
function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ---------------------- DATA PATHS ----------------------
const PATHS = {
  football: {
    eliteserien: "/data/2026/eliteserien.json",
    obos: "/data/2026/obos.json",
    premier_league: "/data/2026/premier_league.json",
    champions_league: "/data/2026/champions_league.json",
    la_liga: "/data/2026/la_liga.json",
  },
  handball: {
    men: "/data/2026/handball_men.json",
    women: "/data/2026/handball_women.json",
  },
  wintersport: {
    men: "/data/2026/wintersport_men.json",
    women: "/data/2026/wintersport_women.json",
  },
  pubs: "/data/content/pubs.json",
  events: "/data/events/events.json",
  vm: "/data/2026/vm2026_list.json",
  em: "/data/2026/em2026_list.json",
};

// Dropdown: akkurat det du ba om
const SPORT_OPTIONS = [
  { key: "eliteserien", label: "Eliteserien", sport: "football", path: PATHS.football.eliteserien },
  { key: "obos", label: "OBOS-ligaen", sport: "football", path: PATHS.football.obos },
  { key: "premier_league", label: "Premier League", sport: "football", path: PATHS.football.premier_league },
  { key: "champions_league", label: "Champions League", sport: "football", path: PATHS.football.champions_league },
  { key: "la_liga", label: "La Liga", sport: "football", path: PATHS.football.la_liga },

  { key: "handball_men", label: "Håndball Menn", sport: "handball", path: PATHS.handball.men },
  { key: "handball_women", label: "Håndball Damer", sport: "handball", path: PATHS.handball.women },

  { key: "wintersport_men", label: "Vintersport Menn", sport: "wintersport", path: PATHS.wintersport.men },
  { key: "wintersport_women", label: "Vintersport Kvinner", sport: "wintersport", path: PATHS.wintersport.women },
];

// Default pubs først hvis mangler
const DEFAULT_PUBS = ["Vikinghjørnet", "Gimle Pub"];

// ---------------------- FETCH ----------------------
async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} (${url})`);
  return await res.json();
}

function asArrayMaybe(data, keys = []) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const k of keys) {
      if (Array.isArray(data[k])) return data[k];
    }
  }
  return [];
}

// ---------------------- TIME FORMAT ----------------------
function toDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function fmtOslo(iso) {
  const d = toDate(iso);
  if (!d) return "Tid ikke oppgitt";
  return d.toLocaleString("no-NO", {
    timeZone: TZ,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtTimeOnly(iso) {
  const d = toDate(iso);
  if (!d) return "—";
  return d.toLocaleTimeString("no-NO", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}

function dateKey(iso) {
  const d = toDate(iso);
  if (!d) return "";
  const s = d.toLocaleDateString("sv-SE", { timeZone: TZ }); // yyyy-mm-dd
  return s;
}

// ---------------------- NORMALIZE GAME ----------------------
function normalizeGame(raw, contextLabel) {
  const obj = raw ?? {};

  // dato
  const iso =
    obj.kickoff || obj.start || obj.datetime || obj.date || obj.time || obj.utc || obj.iso || "";

  // lag/tittel
  const home = obj.home || obj.team_home || obj.homeTeam || obj.hjemme || obj.hjemmelag || "";
  const away = obj.away || obj.team_away || obj.awayTeam || obj.borte || obj.bortelag || "";
  const title =
    obj.title ||
    obj.name ||
    obj.match ||
    (home && away ? `${home} - ${away}` : (obj.event || obj.opponent || obj.summary || "Kamp"));

  // kanal
  const channel = obj.channel || obj.tv || obj.broadcast || obj.kanal || obj.network || "Ukjent";

  // hvor vises (støtter flere former)
  let where = [];
  if (Array.isArray(obj.where)) where = obj.where.slice();
  else if (Array.isArray(obj.pubs)) {
    // kan være [{name,city}] eller ["..."]
    where = obj.pubs.map(p => (typeof p === "string" ? p : (p?.name || ""))).filter(Boolean);
  } else if (typeof obj.where === "string") where = [obj.where];
  else if (typeof obj.pubs === "string") where = [obj.pubs];

  // hvis mangler: default pubs
  if (!where || where.length === 0) where = DEFAULT_PUBS.slice();
  else {
    // sørg for at Vikinghjørnet + Gimle Pub ligger først hvis de ikke finnes
    const set = new Set(where.map(x => x.toLowerCase()));
    const merged = [];
    for (const p of DEFAULT_PUBS) {
      if (!set.has(p.toLowerCase())) merged.push(p);
    }
    where = [...DEFAULT_PUBS.filter(p => set.has(p.toLowerCase())), ...where.filter(p => !DEFAULT_PUBS.map(x=>x.toLowerCase()).includes(String(p).toLowerCase()))];
    // hvis de lå helt borte, tving dem først:
    if (where.length === 0) where = DEFAULT_PUBS.slice();
  }

  const league = obj.league || obj.competition || obj.tournament || contextLabel || "Ukjent liga";

  return {
    iso,
    league,
    home,
    away,
    title: (home && away) ? `${home} - ${away}` : title,
    channel: channel || "Ukjent",
    where,
    raw: obj,
  };
}

// ---------------------- RENDER: SPORT LIST ----------------------
function renderSportList(container, games, q) {
  const query = (q || "").trim().toLowerCase();

  const filtered = !query ? games : games.filter(g => {
    const hay = [
      g.title, g.league, g.channel,
      ...(g.where || []),
    ].join(" ").toLowerCase();
    return hay.includes(query);
  });

  if (!filtered.length) {
    container.innerHTML = `<div class="empty muted">Ingen kamper funnet.</div>`;
    return;
  }

  // sorter på tid
  filtered.sort((a, b) => {
    const da = toDate(a.iso)?.getTime() ?? 0;
    const db = toDate(b.iso)?.getTime() ?? 0;
    return da - db;
  });

  container.innerHTML = filtered.map((g, idx) => {
    const when = fmtOslo(g.iso);
    const timeOnly = fmtTimeOnly(g.iso);
    const channel = g.channel || "Ukjent";
    const where = (g.where || []).slice(0, 3).join(", ");
    return `
      <div class="card clickable" data-idx="${idx}">
        <div class="cardTop">
          <div class="cardTitle">${esc(g.title)}</div>
          <div class="cardMeta muted">${esc(g.league)} · ${esc(when)}</div>
        </div>
        <div class="cardBottom">
          <div class="pill">Kl: ${esc(timeOnly)}</div>
          <div class="pill">Kanal: ${esc(channel || "Ukjent")}</div>
          <div class="pill">Hvor: ${esc(where || "Vikinghjørnet, Gimle Pub")}</div>
        </div>
      </div>
    `;
  }).join("");

  // click -> modal
  container.querySelectorAll(".card.clickable").forEach(el => {
    el.addEventListener("click", () => {
      const idx = Number(el.getAttribute("data-idx"));
      const g = filtered[idx];
      openGameModal(g);
    });
  });
}

function openGameModal(g) {
  $("modalTitle").textContent = g.title || "Detaljer";

  const whereHtml = (g.where || []).map(p => `<li>${esc(p)}</li>`).join("");
  const channel = g.channel || "Ukjent";

  $("modalBody").innerHTML = `
    <div class="modalGrid">
      <div class="kv">
        <div class="k muted">Tid</div>
        <div class="v">${esc(fmtOslo(g.iso))}</div>
      </div>

      <div class="kv">
        <div class="k muted">Kanal</div>
        <div class="v">${esc(channel)}</div>
      </div>

      <div class="kv">
        <div class="k muted">Hvor vises</div>
        <div class="v">
          <ul class="bullets">${whereHtml || `<li>${esc(DEFAULT_PUBS.join(", "))}</li>`}</ul>
        </div>
      </div>
    </div>
  `;

  show($("modal"));
}

function closeModal() { hide($("modal")); }

// ---------------------- TABS ----------------------
function setTab(tabName) {
  // knapper
  document.querySelectorAll("#tabs .tab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });

  // panels
  const panes = ["sport", "pubs", "events", "vm", "em", "calendar"];
  for (const p of panes) {
    const el = $(`tab-${p}`);
    if (!el) continue;
    if (p === tabName) show(el);
    else hide(el);
  }

  // status
  $("statusLine").textContent = `Viser: ${tabName.toUpperCase()}`;
}

// ---------------------- PUBS ----------------------
function normalizePub(raw) {
  const o = raw ?? {};
  return {
    name: o.name || o.title || o.pub || o.place || "Ukjent",
    city: o.city || o.town || o.location || "",
    address: o.address || "",
    url: o.url || o.link || "",
    tags: Array.isArray(o.tags) ? o.tags : [],
    raw: o
  };
}

function renderPubs(list, q) {
  const query = (q || "").trim().toLowerCase();
  const filtered = !query ? list : list.filter(p => {
    const hay = [p.name, p.city, p.address, ...(p.tags||[])].join(" ").toLowerCase();
    return hay.includes(query);
  });

  $("pubsMeta").textContent = filtered.length ? `${filtered.length} puber` : "0 puber";
  if (!filtered.length) {
    $("pubsList").innerHTML = `<div class="empty muted">Ingen puber funnet.</div>`;
    return;
  }

  $("pubsList").innerHTML = filtered.map(p => {
    const link = p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">Åpne</a>` : "";
    const meta = [p.city, p.address].filter(Boolean).join(" · ");
    const tags = (p.tags||[]).slice(0, 6).map(t => `<span class="pill">${esc(t)}</span>`).join("");
    return `
      <div class="card">
        <div class="cardTop">
          <div class="cardTitle">${esc(p.name)}</div>
          <div class="cardMeta muted">${esc(meta)}</div>
        </div>
        <div class="cardBottom">
          ${tags}
          ${link ? `<span class="pill">${link}</span>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

async function loadPubs() {
  try {
    const data = await fetchJson(PATHS.pubs);
    const arr = asArrayMaybe(data, ["pubs", "items", "list"]);
    const pubs = arr.map(normalizePub);
    window.__PUBS__ = pubs;
    renderPubs(pubs, $("pubSearch").value);
  } catch (e) {
    $("pubsMeta").textContent = "Kunne ikke laste puber.";
    $("pubsList").innerHTML = `<div class="empty muted">Feil ved innlasting: ${esc(e.message)}</div>`;
  }
}

// ---------------------- EVENTS ----------------------
function normalizeEvent(raw) {
  const o = raw ?? {};
  const iso = o.start || o.datetime || o.date || o.when || o.time || "";
  return {
    title: o.title || o.name || o.event || "Event",
    place: o.place || o.venue || o.location || "",
    city: o.city || "",
    iso,
    description: o.description || o.desc || "",
    url: o.url || o.link || "",
    raw: o
  };
}

function renderEvents(list, q) {
  const query = (q || "").trim().toLowerCase();
  const filtered = !query ? list : list.filter(ev => {
    const hay = [ev.title, ev.place, ev.city, ev.description].join(" ").toLowerCase();
    return hay.includes(query);
  });

  // sorter på tid
  filtered.sort((a,b) => (toDate(a.iso)?.getTime() ?? 0) - (toDate(b.iso)?.getTime() ?? 0));

  $("eventsMeta").textContent = filtered.length ? `${filtered.length} eventer` : "0 eventer";
  if (!filtered.length) {
    $("eventsList").innerHTML = `<div class="empty muted">Ingen eventer funnet.</div>`;
    return;
  }

  $("eventsList").innerHTML = filtered.map(ev => {
    const when = ev.iso ? fmtOslo(ev.iso) : "Dato ikke oppgitt";
    const meta = [when, ev.place, ev.city].filter(Boolean).join(" · ");
    const link = ev.url ? `<a href="${esc(ev.url)}" target="_blank" rel="noopener">Åpne</a>` : "";
    const desc = ev.description ? `<div class="muted">${esc(ev.description)}</div>` : "";
    return `
      <div class="card">
        <div class="cardTop">
          <div class="cardTitle">${esc(ev.title)}</div>
          <div class="cardMeta muted">${esc(meta)}</div>
        </div>
        <div class="cardBottom">
          ${desc}
          ${link ? `<span class="pill">${link}</span>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

async function loadEvents() {
  try {
    const data = await fetchJson(PATHS.events);
    const arr = asArrayMaybe(data, ["events", "items", "list"]);
    const events = arr.map(normalizeEvent);
    window.__EVENTS__ = events;
    renderEvents(events, $("eventSearch").value);
  } catch (e) {
    $("eventsMeta").textContent = "Kunne ikke laste eventer.";
    $("eventsList").innerHTML = `<div class="empty muted">Feil ved innlasting: ${esc(e.message)}</div>`;
  }
}

// ---------------------- VM / EM ----------------------
function normalizeListItem(raw) {
  const o = raw ?? {};
  const iso = o.start || o.datetime || o.date || o.when || o.time || "";
  return {
    title: o.title || o.name || o.match || o.event || "Oppføring",
    iso,
    meta: o.meta || o.stage || o.group || o.league || o.type || "",
    description: o.description || o.desc || "",
    url: o.url || o.link || "",
    raw: o
  };
}

function renderSimpleList(containerId, metaId, list, emptyText) {
  $(metaId).textContent = list.length ? `${list.length} oppføringer` : "0 oppføringer";
  if (!list.length) {
    $(containerId).innerHTML = `<div class="empty muted">${esc(emptyText)}</div>`;
    return;
  }

  // sorter på tid hvis mulig
  list.sort((a,b) => (toDate(a.iso)?.getTime() ?? 0) - (toDate(b.iso)?.getTime() ?? 0));

  $(containerId).innerHTML = list.map(it => {
    const when = it.iso ? fmtOslo(it.iso) : "Dato ikke oppgitt";
    const meta = [when, it.meta].filter(Boolean).join(" · ");
    const link = it.url ? `<a href="${esc(it.url)}" target="_blank" rel="noopener">Åpne</a>` : "";
    const desc = it.description ? `<div class="muted">${esc(it.description)}</div>` : "";
    return `
      <div class="card">
        <div class="cardTop">
          <div class="cardTitle">${esc(it.title)}</div>
          <div class="cardMeta muted">${esc(meta)}</div>
        </div>
        <div class="cardBottom">
          ${desc}
          ${link ? `<span class="pill">${link}</span>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

async function loadVM() {
  try {
    const data = await fetchJson(PATHS.vm);
    const arr = asArrayMaybe(data, ["items", "list", "vm", "events", "matches"]);
    const list = arr.map(normalizeListItem);
    window.__VM__ = list;
    renderSimpleList("vmList", "vmMeta", list, "Ingen VM 2026-data funnet.");
  } catch (e) {
    $("vmMeta").textContent = "Kunne ikke laste VM 2026.";
    $("vmList").innerHTML = `<div class="empty muted">Feil ved innlasting: ${esc(e.message)}</div>`;
  }
}

async function loadEM() {
  try {
    const data = await fetchJson(PATHS.em);
    const arr = asArrayMaybe(data, ["items", "list", "em", "events", "matches"]);
    const list = arr.map(normalizeListItem);
    window.__EM__ = list;
    renderSimpleList("emList", "emMeta", list, "Ingen EM 2026-data funnet.");
  } catch (e) {
    $("emMeta").textContent = "Kunne ikke laste EM 2026.";
    $("emList").innerHTML = `<div class="empty muted">Feil ved innlasting: ${esc(e.message)}</div>`;
  }
}

// ---------------------- SPORT LOAD ----------------------
async function loadSport(option) {
  $("sportMeta").textContent = `Laster ${option.label}…`;
  $("sportList").innerHTML = "";

  try {
    const data = await fetchJson(option.path);

    // støtt: {games:[...]} eller {matches:[...]} eller array
    const arr = asArrayMaybe(data, ["games", "matches", "items", "list"]);
    const games = arr.map(x => normalizeGame(x, option.label));

    window.__SPORT_CTX__ = { option, games };

    $("sportMeta").textContent = games.length
      ? `${games.length} kamper · ${option.label}`
      : `0 kamper · ${option.label}`;

    renderSportList($("sportList"), games, $("searchInput").value);

    // Oppdater kalender-feed hvis calendar.js lytter
    window.dispatchEvent(new CustomEvent("GL_SPORT_UPDATED", {
      detail: { optionKey: option.key, label: option.label, sport: option.sport, games }
    }));

  } catch (e) {
    $("sportMeta").textContent = `Kunne ikke laste ${option.label}`;
    $("sportList").innerHTML = `<div class="empty muted">Feil ved innlasting: ${esc(e.message)}</div>`;
  }
}

// ---------------------- INIT ----------------------
function initDropdown() {
  const sel = $("sportSelect");
  sel.innerHTML = SPORT_OPTIONS.map(o => `<option value="${esc(o.key)}">${esc(o.label)}</option>`).join("");
  sel.value = SPORT_OPTIONS[0].key;

  sel.addEventListener("change", () => {
    const opt = SPORT_OPTIONS.find(x => x.key === sel.value) || SPORT_OPTIONS[0];
    loadSport(opt);
  });
}

function initTabs() {
  document.querySelectorAll("#tabs .tab").forEach(btn => {
    btn.addEventListener("click", () => {
      setTab(btn.dataset.tab);

      // lazy-load faner
      const tab = btn.dataset.tab;
      if (tab === "pubs" && !window.__PUBS__) loadPubs();
      if (tab === "events" && !window.__EVENTS__) loadEvents();
      if (tab === "vm" && !window.__VM__) loadVM();
      if (tab === "em" && !window.__EM__) loadEM();

      // Kalender initialiseres i calendar.js, men vi kan trigge en refresh her også
      if (tab === "calendar") {
        window.dispatchEvent(new CustomEvent("GL_CALENDAR_SHOW"));
      }
    });
  });
}

function initSearch() {
  $("searchInput").addEventListener("input", () => {
    const ctx = window.__SPORT_CTX__;
    if (!ctx) return;
    renderSportList($("sportList"), ctx.games, $("searchInput").value);
  });

  $("pubSearch").addEventListener("input", () => {
    renderPubs(window.__PUBS__ || [], $("pubSearch").value);
  });

  $("eventSearch").addEventListener("input", () => {
    renderEvents(window.__EVENTS__ || [], $("eventSearch").value);
  });
}

function initModal() {
  $("modalClose").addEventListener("click", closeModal);
  $("modalX").addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
}

async function boot() {
  initDropdown();
  initTabs();
  initSearch();
  initModal();

  // start på sport
  setTab("sport");
  $("statusLine").textContent = "Klar";
  await loadSport(SPORT_OPTIONS[0]);

  // pre-load VM/EM i bakgrunnen (uten å blokkere)
  loadVM().catch(()=>{});
  loadEM().catch(()=>{});
}
boot();
