// /app.js  (KOMPLETT FIL – legg i ROOT)
(() => {
  const TZ = "Europe/Oslo";
  const YEAR_DIR = "data/2026";
  const ROOT_DIR = "data";

  const DEFAULT_WHERE = [
    "Vikinghjørnet",
    "Gimle Pub",
    "O’Learys Skien",
    "The Old Irish Pub (Skien)",
    "Union Bar",
    "Tollboden Bar",
    "Daimlers",
    "Jimmys"
  ];

  // ---------- FANER ----------
  const tabs = Array.from(document.querySelectorAll(".tab"));
  const views = {
    sport: document.getElementById("view-sport"),
    puber: document.getElementById("view-puber"),
    eventer: document.getElementById("view-eventer"),
    vm: document.getElementById("view-vm"),
    kalender: document.getElementById("view-kalender"),
  };

  function showView(name){
    for (const [k, el] of Object.entries(views)) {
      if (!el) continue;
      el.classList.toggle("hidden", k !== name);
    }
    tabs.forEach(t => t.classList.toggle("active", t.dataset.view === name));
  }
  tabs.forEach(t => t.addEventListener("click", () => showView(t.dataset.view)));
  showView("sport");

  // ---------- DOM (SPORT) ----------
  const leagueSelect = document.getElementById("leagueSelect");
  const daysSelect = document.getElementById("daysSelect");
  const searchInput = document.getElementById("searchInput");
  const refreshBtn = document.getElementById("refreshBtn");

  const listEl = document.getElementById("list");
  const errorBox = document.getElementById("errorBox");
  const emptyBox = document.getElementById("emptyBox");
  const lastUpdated = document.getElementById("lastUpdated");

  const netDot = document.getElementById("netDot");
  const netText = document.getElementById("netText");

  const modalBackdrop = document.getElementById("modalBackdrop");
  const modalClose = document.getElementById("modalClose");
  const modalTitle = document.getElementById("modalTitle");
  const modalSub = document.getElementById("modalSub");
  const mTime = document.getElementById("mTime");
  const mChannel = document.getElementById("mChannel");
  const mWhere = document.getElementById("mWhere");

  const urlOf = (path) => new URL(`./${path}`, window.location.href).toString();
  const isArr = (v) => Array.isArray(v);
  const clampStr = (s) => (s == null ? "" : String(s));

  const LEAGUE_CANDIDATES = [
    { key: "eliteserien", name: "Eliteserien", files: ["eliteserien.json"] },
    { key: "obos", name: "OBOS-ligaen", files: ["obos.json", "obos-ligaen.json", "obos_ligaen.json"] },
    { key: "premier_league", name: "Premier League", files: ["premier_league.json", "epl.json", "premierleague.json"] },
    { key: "champions_league", name: "Champions League", files: ["champions_league.json", "champions-league.json", "ucl.json", "championsleague.json"] },
    { key: "la_liga", name: "La Liga", files: ["la_liga.json", "laliga.json", "la-liga.json"] },
    { key: "handball_men", name: "Håndball VM 2026 Menn", files: ["handball_vm_2026_menn.json", "handball_men.json"] },
    { key: "handball_women", name: "Håndball VM 2026 Damer", files: ["handball_vm_2026_damer.json", "handball_women.json"] },
    { key: "ws_men", name: "Vintersport Menn", files: ["vintersport_menn.json", "wintersport_men.json"] },
    { key: "ws_women", name: "Vintersport Kvinner", files: ["vintersport_kvinner.json", "wintersport_women.json"] }
  ];

  function setNetStatus() {
    const online = navigator.onLine;
    netDot.classList.toggle("ok", online);
    netDot.classList.toggle("bad", !online);
    netText.textContent = online ? "Online" : "Offline";
  }

  function fmtOslo(iso) {
    if (!iso) return "Ukjent";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "Ukjent";
    return d.toLocaleString("no-NO", {
      timeZone: TZ,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function isoToMs(iso) {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d.getTime();
  }

  function withinNextDays(iso, days) {
    const ms = isoToMs(iso);
    if (ms == null) return false;
    const now = Date.now();
    const max = now + days * 24 * 60 * 60 * 1000;
    return ms >= (now - 6 * 60 * 60 * 1000) && ms <= max;
  }

  function normGame(raw) {
    const league = raw.league ?? raw.tournament ?? raw.competition ?? raw.name ?? "";
    const home = raw.home ?? raw.homeTeam ?? raw.h ?? "";
    const away = raw.away ?? raw.awayTeam ?? raw.a ?? "";
    const kickoff = raw.kickoff ?? raw.start ?? raw.datetime ?? raw.date ?? raw.time ?? "";
    const channel = raw.channel ?? raw.tv ?? raw.broadcaster ?? "";
    const where = raw.where ?? raw.pubs ?? raw.venues ?? raw.pub ?? null;

    let whereList = [];
    if (isArr(where)) {
      whereList = where.map(x => (typeof x === "string" ? x : (x?.name ?? ""))).filter(Boolean);
    } else if (typeof where === "string") {
      whereList = [where];
    }

    return {
      league: clampStr(league),
      home: clampStr(home),
      away: clampStr(away),
      kickoff: clampStr(kickoff),
      channel: clampStr(channel),
      where: whereList
    };
  }

  function displayChannel(ch) {
    const v = clampStr(ch).trim();
    return v ? v : "Ukjent";
  }

  function displayWhere(whereList) {
    const list = (isArr(whereList) && whereList.length) ? whereList : DEFAULT_WHERE;
    return list;
  }

  function gameText(g) {
    return [g.league, g.home, g.away, g.kickoff, g.channel, ...(displayWhere(g.where) || [])]
      .join(" ").toLowerCase();
  }

  function extractGames(json) {
    if (isArr(json)) return json;
    if (isArr(json?.games)) return json.games;
    if (isArr(json?.matches)) return json.matches;
    if (isArr(json?.data)) return json.data;
    return [];
  }

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.remove("hidden");
  }
  function clearError() {
    errorBox.textContent = "";
    errorBox.classList.add("hidden");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[m]));
  }

  function openModal(game) {
    modalTitle.textContent = `${game.home || "Ukjent"} vs ${game.away || "Ukjent"}`;
    modalSub.textContent = game.league || "Ukjent";
    mTime.textContent = fmtOslo(game.kickoff);
    mChannel.textContent = displayChannel(game.channel);

    const pubs = displayWhere(game.where);
    mWhere.innerHTML = pubs.map(p => `<div class="badge accent">${escapeHtml(p)}</div>`).join(" ");

    modalBackdrop.classList.remove("hidden");
    modalBackdrop.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    modalBackdrop.classList.add("hidden");
    modalBackdrop.setAttribute("aria-hidden", "true");
  }

  function renderList(games) {
    listEl.innerHTML = "";
    if (!games.length) {
      emptyBox.classList.remove("hidden");
      return;
    }
    emptyBox.classList.add("hidden");

    for (const g of games) {
      const card = document.createElement("div");
      card.className = "card";
      card.tabIndex = 0;

      card.innerHTML = `
        <div class="row">
          <div>
            <div class="teams">${escapeHtml(g.home || "Ukjent")} <span class="muted">vs</span> ${escapeHtml(g.away || "Ukjent")}</div>
            <div class="muted small">${escapeHtml(g.league || "Ukjent")}</div>
          </div>
          <div class="muted small" style="text-align:right; min-width:140px;">
            ${escapeHtml(fmtOslo(g.kickoff))}
          </div>
        </div>
        <div class="badges">
          <div class="badge accent">${escapeHtml(displayChannel(g.channel))}</div>
          <div class="badge">${escapeHtml(displayWhere(g.where)[0] || "Ukjent")}</div>
        </div>
      `;

      card.addEventListener("click", () => openModal(g));
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") openModal(g);
      });

      listEl.appendChild(card);
    }
  }

  async function headOk(path) {
    try {
      const res = await fetch(urlOf(path), { method: "HEAD", cache: "no-store" });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function fetchJSON(path) {
    const url = urlOf(path);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Kunne ikke laste ${path} (${res.status}).\nURL: ${url}`);
    return await res.json();
  }

  async function resolveLeagues() {
    const resolved = [];
    for (const c of LEAGUE_CANDIDATES) {
      let chosen = null;

      for (const f of c.files) {
        const p = `${YEAR_DIR}/${f}`;
        if (await headOk(p)) { chosen = p; break; }
      }
      if (!chosen) {
        for (const f of c.files) {
          const p = `${ROOT_DIR}/${f}`;
          if (await headOk(p)) { chosen = p; break; }
        }
      }

      if (chosen) resolved.push({ key: c.key, name: c.name, path: chosen });
    }
    return resolved;
  }

  let LEAGUES = [];
  let ALL = [];

  function applyFilters() {
    const days = Number(daysSelect.value || 30);
    const q = (searchInput.value || "").trim().toLowerCase();

    let games = ALL
      .filter(g => withinNextDays(g.kickoff, days))
      .sort((a, b) => {
        const am = isoToMs(a.kickoff) ?? Number.MAX_SAFE_INTEGER;
        const bm = isoToMs(b.kickoff) ?? Number.MAX_SAFE_INTEGER;
        return am - bm;
      });

    if (q) games = games.filter(g => gameText(g).includes(q));
    renderList(games);
  }

  async function loadSelectedLeague() {
    clearError();
    listEl.innerHTML = "";
    emptyBox.classList.add("hidden");

    const key = leagueSelect.value;
    const league = LEAGUES.find(l => l.key === key) || LEAGUES[0];
    if (!league) {
      showError("Ingen liga-filer funnet i /data/2026/ (eller /data/).");
      return;
    }

    try {
      const json = await fetchJSON(league.path);
      const rawGames = extractGames(json);
      ALL = rawGames.map(normGame);

      const stamp = new Date().toLocaleString("no-NO", { timeZone: TZ });
      lastUpdated.textContent = `Sist oppdatert: ${stamp} • Kilde: /${league.path}`;

      applyFilters();
    } catch (err) {
      ALL = [];
      renderList([]);
      showError(String(err?.message || err));
    }
  }

  async function init() {
    setNetStatus();

    LEAGUES = await resolveLeagues();

    leagueSelect.innerHTML = LEAGUES
      .map(l => `<option value="${l.key}">${l.name}</option>`)
      .join("");

    const hasElite = LEAGUES.some(l => l.key === "eliteserien");
    leagueSelect.value = hasElite ? "eliteserien" : (LEAGUES[0]?.key || "");

    loadSelectedLeague();
  }

  window.addEventListener("online", setNetStatus);
  window.addEventListener("offline", setNetStatus);

  leagueSelect.addEventListener("change", loadSelectedLeague);
  daysSelect.addEventListener("change", applyFilters);
  searchInput.addEventListener("input", applyFilters);
  refreshBtn.addEventListener("click", loadSelectedLeague);

  modalClose.addEventListener("click", closeModal);
  modalBackdrop.addEventListener("click", (e) => { if (e.target === modalBackdrop) closeModal(); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  init();
})();
