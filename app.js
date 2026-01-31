(() => {
  const TZ = "Europe/Oslo";

  // ✅ DINE FILPLASSERINGER
  const INDEX_2026 = "data/2026/index.json";
  const PUBS_FILE  = "data/content/pubs.json";
  const EVENTS_FILE = "data/events/events.json";

  const VM_LIST = "data/2026/vm2026_list.json";
  const EM_LIST = "data/2026/em2026_list.json";

  // ---------- FANER ----------
  const tabs = Array.from(document.querySelectorAll(".tab"));
  const views = {
    sport: document.getElementById("view-sport"),
    puber: document.getElementById("view-puber"),
    eventer: document.getElementById("view-eventer"),
    vm: document.getElementById("view-vm"),
    em: document.getElementById("view-em"),
    kalender: document.getElementById("view-kalender"),
  };

  function showView(name){
    for (const [k, el] of Object.entries(views)) {
      if (!el) continue;
      el.classList.toggle("hidden", k !== name);
    }
    tabs.forEach(t => t.classList.toggle("active", t.dataset.view === name));
  }
  tabs.forEach(t => t.addEventListener("click", () => {
    const v = t.dataset.view;
    showView(v);
    if (v === "puber") loadPubs();
    if (v === "eventer") loadEvents();
    if (v === "vm") loadListPage(VM_LIST, "vm");
    if (v === "em") loadListPage(EM_LIST, "em");
  }));
  showView("sport");

  // ---------- STATUS ----------
  const netDot = document.getElementById("netDot");
  const netText = document.getElementById("netText");

  function setNetStatus() {
    const online = navigator.onLine;
    netDot.classList.toggle("ok", online);
    netDot.classList.toggle("bad", !online);
    netText.textContent = online ? "Online" : "Offline";
  }
  window.addEventListener("online", setNetStatus);
  window.addEventListener("offline", setNetStatus);
  setNetStatus();

  // ---------- SPORT DOM ----------
  const leagueSelect = document.getElementById("leagueSelect");
  const daysSelect = document.getElementById("daysSelect");
  const searchInput = document.getElementById("searchInput");
  const refreshBtn = document.getElementById("refreshBtn");

  const listEl = document.getElementById("list");
  const errorBox = document.getElementById("errorBox");
  const emptyBox = document.getElementById("emptyBox");
  const lastUpdated = document.getElementById("lastUpdated");

  // Modal
  const modalBackdrop = document.getElementById("modalBackdrop");
  const modalClose = document.getElementById("modalClose");
  const modalTitle = document.getElementById("modalTitle");
  const modalSub = document.getElementById("modalSub");
  const mTime = document.getElementById("mTime");
  const mChannel = document.getElementById("mChannel");
  const mWhere = document.getElementById("mWhere");

  // Puber
  const pubsError = document.getElementById("pubsError");
  const pubsList = document.getElementById("pubsList");

  // Eventer
  const eventsError = document.getElementById("eventsError");
  const eventsList = document.getElementById("eventsList");

  // VM/EM
  const vmError = document.getElementById("vmError");
  const vmList = document.getElementById("vmList");
  const emError = document.getElementById("emError");
  const emList = document.getElementById("emList");

  const urlOf = (path) => new URL(`./${path}`, window.location.href).toString();

  async function fetchJSON(path) {
    const url = urlOf(path);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Kunne ikke laste ${path} (${res.status}).\nURL: ${url}`);
    return await res.json();
  }

  function clearEl(el){ el.innerHTML = ""; }
  function showErr(el, msg){ el.textContent = msg; el.classList.remove("hidden"); }
  function hideErr(el){ el.textContent = ""; el.classList.add("hidden"); }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[m]));
  }

  function fmtOslo(iso) {
    if (!iso) return "Ukjent";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "Ukjent";
    return d.toLocaleString("no-NO", {
      timeZone: TZ,
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
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

  function normalizeGame(raw) {
    const league = raw.league ?? raw.tournament ?? raw.competition ?? "";
    const home = raw.home ?? raw.homeTeam ?? raw.h ?? "";
    const away = raw.away ?? raw.awayTeam ?? raw.a ?? "";
    const kickoff = raw.kickoff ?? raw.start ?? raw.datetime ?? raw.date ?? "";
    const channel = raw.channel ?? raw.tv ?? raw.broadcaster ?? "Ukjent";
    const where = Array.isArray(raw.where) ? raw.where : (typeof raw.where === "string" ? [raw.where] : []);
    const sport = raw.sport ?? "";
    return { league, home, away, kickoff, channel, where, sport };
  }

  function gameSearchText(g) {
    return [
      g.sport, g.league, g.home, g.away, g.kickoff, g.channel,
      ...(g.where || [])
    ].join(" ").toLowerCase();
  }

  function openModal(game) {
    modalTitle.textContent = `${game.home || "Ukjent"} vs ${game.away || "Ukjent"}`;
    modalSub.textContent = game.league || "Ukjent";
    mTime.textContent = fmtOslo(game.kickoff);
    mChannel.textContent = (game.channel && String(game.channel).trim()) ? game.channel : "Ukjent";

    const pubs = (Array.isArray(game.where) && game.where.length) ? game.where : ["Vikinghjørnet", "Gimle Pub"];
    mWhere.innerHTML = pubs.map(p => `<div class="badge accent">${escapeHtml(p)}</div>`).join(" ");

    modalBackdrop.classList.remove("hidden");
    modalBackdrop.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    modalBackdrop.classList.add("hidden");
    modalBackdrop.setAttribute("aria-hidden", "true");
  }

  modalClose?.addEventListener("click", closeModal);
  modalBackdrop?.addEventListener("click", (e) => { if (e.target === modalBackdrop) closeModal(); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  // ---------- SPORT: load index + selected league ----------
  let INDEX = null;
  let LEAGUES = [];
  let ALL = [];
  let SELECTED = null;

  function renderGames(games) {
    clearEl(listEl);

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
            <div class="muted small">${escapeHtml(g.league || "Ukjent")}${g.sport ? ` • ${escapeHtml(g.sport)}` : ""}</div>
          </div>
          <div class="muted small" style="text-align:right; min-width:140px;">
            ${escapeHtml(fmtOslo(g.kickoff))}
          </div>
        </div>
        <div class="badges">
          <div class="badge accent">${escapeHtml((g.channel && String(g.channel).trim()) ? g.channel : "Ukjent")}</div>
          <div class="badge">${escapeHtml((g.where && g.where[0]) ? g.where[0] : "Ukjent")}</div>
        </div>
      `;

      card.addEventListener("click", () => openModal(g));
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") openModal(g);
      });

      listEl.appendChild(card);
    }
  }

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

    if (q) games = games.filter(g => gameSearchText(g).includes(q));
    renderGames(games);
  }

  async function loadIndex() {
    INDEX = await fetchJSON(INDEX_2026);
    LEAGUES = Array.isArray(INDEX.leagues) ? INDEX.leagues : [];

    leagueSelect.innerHTML = LEAGUES
      .map(l => `<option value="${escapeHtml(l.key)}">${escapeHtml(l.name)}</option>`)
      .join("");

    // default: eliteserien hvis finnes
    const hasElite = LEAGUES.some(l => l.key === "eliteserien");
    leagueSelect.value = hasElite ? "eliteserien" : (LEAGUES[0]?.key || "");
  }

  async function loadSelectedLeague() {
    hideErr(errorBox);
    clearEl(listEl);
    emptyBox.classList.add("hidden");

    const key = leagueSelect.value;
    SELECTED = LEAGUES.find(l => l.key === key) || LEAGUES[0];
    if (!SELECTED) {
      showErr(errorBox, `Ingen ligaer funnet. Sjekk at ${INDEX_2026} finnes.`);
      ALL = [];
      renderGames([]);
      return;
    }

    try {
      const data = await fetchJSON(SELECTED.path.replace(/^\.?\//, ""));
      const raw = Array.isArray(data.games) ? data.games : [];
      ALL = raw.map(normalizeGame);

      const stamp = INDEX?.generated_at ? INDEX.generated_at : new Date().toISOString();
      lastUpdated.textContent = `Sist oppdatert: ${stamp} • Kilde: /${SELECTED.path.replace(/^\.?\//, "")}`;

      applyFilters();
    } catch (err) {
      ALL = [];
      renderGames([]);
      showErr(errorBox, String(err?.message || err));
    }
  }

  async function initSport() {
    try {
      await loadIndex();
      await loadSelectedLeague();
    } catch (err) {
      showErr(errorBox, String(err?.message || err));
    }
  }

  leagueSelect.addEventListener("change", loadSelectedLeague);
  daysSelect.addEventListener("change", applyFilters);
  searchInput.addEventListener("input", applyFilters);
  refreshBtn.addEventListener("click", loadSelectedLeague);

  // ---------- PUBER ----------
  let pubsLoaded = false;

  async function loadPubs() {
    if (pubsLoaded) return;
    pubsLoaded = true;

    hideErr(pubsError);
    clearEl(pubsList);

    try {
      const data = await fetchJSON(PUBS_FILE);
      const pubs = Array.isArray(data.pubs) ? data.pubs : [];

      if (!pubs.length) {
        pubsList.innerHTML = `<div class="empty">Ingen puber funnet i ${escapeHtml(PUBS_FILE)}.</div>`;
        return;
      }

      for (const p of pubs) {
        const website = p.website ? `<a class="link" href="${escapeHtml(p.website)}" target="_blank" rel="noreferrer">Hjemmeside</a>` : "";
        const fb = p.facebook ? `<a class="link" href="${escapeHtml(p.facebook)}" target="_blank" rel="noreferrer">Facebook</a>` : "";
        const ig = p.instagram ? `<a class="link" href="${escapeHtml(p.instagram)}" target="_blank" rel="noreferrer">Instagram</a>` : "";
        const maps = p.maps ? `<a class="link" href="${escapeHtml(p.maps)}" target="_blank" rel="noreferrer">Kart</a>` : "";

        const links = [website, fb, ig, maps].filter(Boolean).join(" • ");

        const card = document.createElement("div");
        card.className = "card";
        card.style.cursor = "default";
        card.innerHTML = `
          <div class="row">
            <div>
              <div class="teams">${escapeHtml(p.name || "Ukjent")}</div>
              <div class="muted small">${escapeHtml(p.city || "")}</div>
            </div>
          </div>
          <div class="muted small" style="margin-top:8px;">
            ${links || "Ingen lenker registrert."}
          </div>
        `;
        pubsList.appendChild(card);
      }
    } catch (err) {
      showErr(pubsError, String(err?.message || err));
    }
  }

  // ---------- EVENTER ----------
  let eventsLoaded = false;

  async function loadEvents() {
    if (eventsLoaded) return;
    eventsLoaded = true;

    hideErr(eventsError);
    clearEl(eventsList);

    try {
      const data = await fetchJSON(EVENTS_FILE);
      const evs = Array.isArray(data.events) ? data.events : [];

      if (!evs.length) {
        eventsList.innerHTML = `<div class="empty">Ingen events funnet i ${escapeHtml(EVENTS_FILE)}.</div>`;
        return;
      }

      for (const e of evs) {
        const when = [e.date, e.time].filter(Boolean).join(" ");
        const img = e.image ? `<div class="muted small" style="margin-top:8px;">Bilde: ${escapeHtml(e.image)}</div>` : "";
        const link = e.link ? `<a class="link" href="${escapeHtml(e.link)}" target="_blank" rel="noreferrer">Åpne event</a>` : "";

        const card = document.createElement("div");
        card.className = "card";
        card.style.cursor = "default";
        card.innerHTML = `
          <div class="row">
            <div>
              <div class="teams">${escapeHtml(e.title || "Event")}</div>
              <div class="muted small">${escapeHtml(e.venue || "")}${e.city ? ` • ${escapeHtml(e.city)}` : ""}${when ? ` • ${escapeHtml(when)}` : ""}</div>
            </div>
          </div>
          <div class="muted small" style="margin-top:8px;">${escapeHtml(e.text || "")}</div>
          ${img}
          <div class="muted small" style="margin-top:8px;">${link}</div>
        `;
        eventsList.appendChild(card);
      }
    } catch (err) {
      showErr(eventsError, String(err?.message || err));
    }
  }

  // ---------- VM/EM LISTEPAGER ----------
  async function loadListPage(path, which) {
    const outError = which === "vm" ? vmError : emError;
    const outList  = which === "vm" ? vmList  : emList;

    hideErr(outError);
    clearEl(outList);

    try {
      const data = await fetchJSON(path);
      const months = Array.isArray(data.months) ? data.months : [];

      if (!months.length) {
        outList.innerHTML = `<div class="empty">Ingen data funnet i ${escapeHtml(path)}.</div>`;
        return;
      }

      for (const m of months) {
        const monthCard = document.createElement("div");
        monthCard.className = "card";
        monthCard.style.cursor = "default";

        const monthTitle = m.month || "Ukjent måned";
        const games = Array.isArray(m.games) ? m.games : [];

        monthCard.innerHTML = `
          <div class="teams">${escapeHtml(monthTitle)}</div>
          <div class="muted small" style="margin-top:6px;">${escapeHtml(String(games.length))} elementer</div>
        `;

        outList.appendChild(monthCard);

        for (const g0 of games) {
          const g = normalizeGame(g0);
          const sub = document.createElement("div");
          sub.className = "card";
          sub.style.cursor = "pointer";
          sub.innerHTML = `
            <div class="row">
              <div>
                <div class="teams">${escapeHtml(g.home || "")}${g.away ? ` – ${escapeHtml(g.away)}` : ""}</div>
                <div class="muted small">${escapeHtml(g.league || "")}${g.sport ? ` • ${escapeHtml(g.sport)}` : ""}</div>
              </div>
              <div class="muted small" style="text-align:right;min-width:140px;">${escapeHtml(fmtOslo(g.kickoff))}</div>
            </div>
            <div class="badges">
              <div class="badge accent">${escapeHtml((g.channel && String(g.channel).trim()) ? g.channel : "Ukjent")}</div>
              <div class="badge">${escapeHtml((g.where && g.where[0]) ? g.where[0] : "Ukjent")}</div>
            </div>
          `;
          sub.addEventListener("click", () => openModal(g));
          outList.appendChild(sub);
        }
      }
    } catch (err) {
      showErr(outError, String(err?.message || err));
    }
  }

  // ---------- START ----------
  initSport();
})();
