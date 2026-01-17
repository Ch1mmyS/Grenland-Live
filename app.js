/* Grenland Live – app.js (AUTO-FIX LINKS + ALWAYS "PROGRAM")
   - Alltid PROGRAM som link-tekst
   - Smartere matching mellom pubs og event_sources (tåler parentes / case / tegn)
   - Hvis ingen offisiell link finnes -> fallback til Google-søk (men fortsatt PROGRAM)
*/

const MS_DAY = 24 * 60 * 60 * 1000;

async function loadJSON(path) {
  const url = new URL(path, window.location.href);
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`Kunne ikke laste ${path} (${res.status})`);
  return await res.json();
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[m]));
}

function mapLink(q) {
  return `https://www.google.com/maps?q=${encodeURIComponent(q)}`;
}

function searchLink(q) {
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

function fmtTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return String(iso ?? "");
  return d.toLocaleString("no-NO", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit"
  });
}

function inNextDays(iso, days = 30) {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return false;
  const now = Date.now();
  return t >= now && t <= now + days * MS_DAY;
}

function $(id) { return document.getElementById(id) || null; }

function setSelectOptions(select, items, labelFn) {
  if (!select) return;
  select.innerHTML =
    `<option value="">Velg …</option>` +
    items.map((it, i) => `<option value="${i}">${esc(labelFn(it))}</option>`).join("");
}

function setPubFilterOptions(select, pubs) {
  if (!select) return;
  select.innerHTML =
    `<option value="all">Alle puber</option>` +
    pubs.map((p, i) => `<option value="${i}">${esc(p.name)} (${esc(p.city)})</option>`).join("");
}

/* ---------- SMART MATCHING ---------- */
function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .trim()
    .replace(/\([^)]*\)/g, "")       // fjern ( ... )
    .replace(/\s+/g, " ")
    .replace(/[’'"]/g, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, ""); // fjern aksenter (é -> e)
}

function key(name, city) {
  return `${norm(name)}|${norm(city)}`;
}

function buildSourceMap(sources) {
  const m = new Map();
  for (const s of (sources || [])) {
    m.set(key(s.name, s.city), s);
  }
  return m;
}

// Alltid: returnerer en href + label "PROGRAM"
function resolveProgramLinkForPub(p, sourceMap) {
  // 1) pub.website (hvis fylt)
  const w = String(p.website || "").trim();
  if (w) return { href: w, label: "PROGRAM" };

  // 2) match i sources (smart match)
  const s = sourceMap.get(key(p.name, p.city));
  const sl = s ? String(s.link || "").trim() : "";
  if (sl) return { href: sl, label: "PROGRAM" };

  // 3) fallback: Google-søk (men fortsatt PROGRAM)
  return { href: searchLink(`${p.name} ${p.city}`), label: "PROGRAM" };
}

function renderInfoBox(el, p, sourceMap) {
  if (!el) return;
  if (!p) { el.innerHTML = ""; return; }

  const tags = (p.tags || []).map(t => esc(t)).join(" • ");
  const prog = resolveProgramLinkForPub(p, sourceMap);
  const program = `<a class="glLink" href="${prog.href}" target="_blank" rel="noopener">${prog.label}</a>`;
  const map = `<a class="glLink" href="${p.map || mapLink(p.name + " " + p.city)}" target="_blank" rel="noopener">Kart</a>`;

  el.innerHTML = `
    <div class="item">
      <strong>${esc(p.name)} <span class="badge">${esc(p.city)}</span></strong>
      <div class="meta">${tags}</div>
      ${program}${map}
    </div>
  `;
}

function renderFootball(listEl, games, pubs, pubFilter, mode, sourceMap) {
  if (!listEl) return;

  let filtered = (games || []).slice();

  if (mode === "next") filtered = filtered.filter(g => inNextDays(g.start, 30));
  if (mode === "today") {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
    filtered = filtered.filter(g => {
      const dt = new Date(g.start);
      return !isNaN(dt) && dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d;
    });
  }

  if (pubFilter && pubFilter !== "all") {
    const p = pubs?.[Number(pubFilter)];
    if (p) filtered = filtered.filter(g => (g.pubs || []).some(x => x.name === p.name && x.city === p.city));
  }

  if (!filtered.length) {
    listEl.innerHTML = `<div class="item">Ingen kamper å vise.</div>`;
    return;
  }

  listEl.innerHTML = filtered.map(g => {
    const home = esc(g.home || "");
    const away = esc(g.away || "");
    const league = esc(g.league || "");
    const start = esc(fmtTime(g.start));

    const pubsHtml = (g.pubs || []).map(pp => {
      const match = (pubs || []).find(p => p.name === pp.name && p.city === pp.city) || pp;
      const prog = resolveProgramLinkForPub(match, sourceMap);
      return `<a class="glLink" href="${prog.href}" target="_blank" rel="noopener">${esc(match.name)} (${esc(match.city)})</a>`;
    }).join(" ");

    return `
      <div class="item">
        <strong>${home} – ${away}</strong>
        <div class="meta">${league} • ${start}</div>
        <div class="meta">${pubsHtml}</div>
      </div>
    `;
  }).join("");
}

function searchAll(query, pubs, sources, games) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];
  const hits = [];

  function add(type, title, meta) {
    hits.push({ type, title, meta });
  }

  (pubs || []).forEach(p => {
    const hay = `${p.name} ${p.city} ${(p.tags || []).join(" ")}`.toLowerCase();
    if (hay.includes(q)) add("pub", `${p.name} (${p.city})`, `Pub`);
  });

  (sources || []).forEach(s => {
    const hay = `${s.name} ${s.city} ${s.details || ""}`.toLowerCase();
    if (hay.includes(q)) add("program", `${s.name} (${s.city})`, `Program`);
  });

  (games || []).forEach(g => {
    const hay = `${g.home} ${g.away} ${g.league || ""}`.toLowerCase();
    if (hay.includes(q)) add("fotball", `${g.home} – ${g.away}`, `Fotball • ${fmtTime(g.start)}`);
  });

  return hits;
}

function renderSearch(el, hits) {
  if (!el) return;
  if (!hits.length) {
    el.innerHTML = `<div class="item">Ingen treff.</div>`;
    return;
  }
  el.innerHTML = hits.map(h => `
    <div class="item">
      <strong>${esc(h.title)}</strong>
      <div class="meta">${esc(h.meta)}</div>
    </div>
  `).join("");
}

document.addEventListener("DOMContentLoaded", async () => {
  const pubSelect = $("pubSelect");
  const pubInfo = $("pubInfo");

  const jamSelect = $("jamSelect");
  const jamInfo = $("jamInfo");

  const quizSelect = $("quizSelect");
  const quizInfo = $("quizInfo");

  const eventsSelect = $("eventsSelect");
  const eventsInfo = $("eventsInfo");

  const fbMode = $("fbMode");
  const fbPubFilter = $("fbPubFilter");
  const footballList = $("footballList");

  const q = $("q");
  const go = $("go");
  const searchResults = $("searchResults");

  let pubs = [];
  let games = [];
  let sources = [];
  let sourceMap = new Map();

  try {
    const pubsData = await loadJSON("./data/pubs.json");
    pubs = pubsData.places || [];

    const srcData = await loadJSON("./data/event_sources.json");
    sources = srcData.sources || [];
    sourceMap = buildSourceMap(sources);

    // Dropdowns
    setSelectOptions(pubSelect, pubs, p => `${p.name} (${p.city})`);
    setSelectOptions(jamSelect, pubs.filter(p => (p.tags || []).includes("Jam") || (p.tags || []).includes("Jam nights")), p => `${p.name} (${p.city})`);
    setSelectOptions(quizSelect, pubs.filter(p => (p.tags || []).includes("Quiz")), p => `${p.name} (${p.city})`);
    setPubFilterOptions(fbPubFilter, pubs);

    if (pubSelect) pubSelect.addEventListener("change", () => renderInfoBox(pubInfo, pubs[Number(pubSelect.value)], sourceMap));

    if (jamSelect) jamSelect.addEventListener("change", () => {
      const jamPubs = pubs.filter(p => (p.tags || []).includes("Jam") || (p.tags || []).includes("Jam nights"));
      renderInfoBox(jamInfo, jamPubs[Number(jamSelect.value)], sourceMap);
    });

    if (quizSelect) quizSelect.addEventListener("change", () => {
      const quizPubs = pubs.filter(p => (p.tags || []).includes("Quiz"));
      renderInfoBox(quizInfo, quizPubs[Number(quizSelect.value)], sourceMap);
    });

    // Event sources dropdown (skal også vise PROGRAM)
    if (eventsSelect) {
      eventsSelect.innerHTML =
        `<option value="">Velg program …</option>` +
        sources.map((s, i) => `<option value="${i}">${esc(s.name)} (${esc(s.city)})</option>`).join("");

      eventsSelect.addEventListener("change", () => {
        const s = sources[Number(eventsSelect.value)];
        if (!eventsInfo) return;
        if (!s) { eventsInfo.innerHTML = ""; return; }

        const href = String(s.link || "").trim() || searchLink(`${s.name} ${s.city}`);
        const mapHref = mapLink(`${s.name} ${s.city}`);

        eventsInfo.innerHTML = `
          <div class="item">
            <strong>${esc(s.name)} <span class="badge">${esc(s.city)}</span></strong>
            <div class="meta">${esc(s.details || "")}</div>
            <a class="glLink" href="${href}" target="_blank" rel="noopener">PROGRAM</a>
            <a class="glLink" href="${mapHref}" target="_blank" rel="noopener">Kart</a>
          </div>
        `;
      });
    }

    // Football
    const fbData = await loadJSON("./data/football.json");
    games = fbData.games || [];

    function refreshFootball() {
      renderFootball(
        footballList,
        games,
        pubs,
        fbPubFilter?.value || "all",
        fbMode?.value || "next",
        sourceMap
      );
    }
    if (fbMode) fbMode.addEventListener("change", refreshFootball);
    if (fbPubFilter) fbPubFilter.addEventListener("change", refreshFootball);
    refreshFootball();

    // Search
    function runSearch() {
      const hits = searchAll(q?.value, pubs, sources, games);
      renderSearch(searchResults, hits);
    }
    if (go) go.addEventListener("click", runSearch);
    if (q) q.addEventListener("keydown", (e) => { if (e.key === "Enter") runSearch(); });

  } catch (err) {
    console.error(err);
    const msg = `❌ Feil: ${esc(err.message)}`;
    if (searchResults) searchResults.innerHTML = `<div class="item">${msg}</div>`;
    else if (pubInfo) pubInfo.innerHTML = `<div class="item">${msg}</div>`;
    else document.body.insertAdjacentHTML("afterbegin", `<div style="padding:12px;background:#300;color:#fff;font-family:system-ui">${msg}</div>`);
  }
});
