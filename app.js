/* Grenland Live – app.js (REPARERT, robust)
   - Ingen dropdowns "forsvinner" pga JS-krasj
   - Logger advarsler hvis HTML-id’er mangler
   - Viser feilmelding i UI hvis data/paths feiler
*/

const MS_DAY = 24 * 60 * 60 * 1000;

async function loadJSON(path) {
  // Robust URL-resolving (fungerer på GitHub Pages og Cloudflare Pages)
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

// Henter element – krasjer ikke hvis mangler
function $(id) {
  const el = document.getElementById(id);
  return el || null;
}

// Setter options – gjør ingenting hvis select mangler
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

function resolvePubLink(p, sources = []) {
  const sourceMatch = sources.find(s => s.name === p.name && s.city === p.city);
  const sourceLink = sourceMatch && sourceMatch.link ? sourceMatch.link : "";

  if (p.website) return { href: p.website, label: "Nettside / SoMe" };
  if (sourceLink) return { href: sourceLink, label: "Program / SoMe" };

  return {
    href: `https://www.google.com/search?q=${encodeURIComponent(p.name + " " + p.city)}`,
    label: "Søk etter pub",
  };
}

function renderInfoBox(el, p, sources = []) {
  if (!el) return;
  if (!p) { el.innerHTML = ""; return; }

  const tags = (p.tags || []).map(t => esc(t)).join(" • ");
  const websiteInfo = resolvePubLink(p, sources);
  const website = websiteInfo?.href
    ? `<a class="glLink" href="${websiteInfo.href}" target="_blank" rel="noopener">${esc(websiteInfo.label)}</a>`
    : "";
  const map = `<a class="glLink" href="${p.map || mapLink(p.name + " " + p.city)}" target="_blank" rel="noopener">Kart</a>`;

  el.innerHTML = `
    <div class="item">
      <strong>${esc(p.name)} <span class="badge">${esc(p.city)}</span></strong>
      <div class="meta">${tags}</div>
      ${website}${map}
    </div>
  `;
}

function renderFootball(listEl, games, pubs, pubFilter, mode) {
  if (!listEl) return;

  let filtered = (games || []).slice();

  // Mode
  if (mode === "next") filtered = filtered.filter(g => inNextDays(g.start, 30));
  if (mode === "today") {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
    filtered = filtered.filter(g => {
      const dt = new Date(g.start);
      return !isNaN(dt) && dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d;
    });
  }

  // Pub filter
  if (pubFilter && pubFilter !== "all") {
    const p = pubs?.[Number(pubFilter)];
    if (p) filtered = filtered.filter(g => (g.pubs || []).some(x => x.name === p.name && x.city === p.city));
  }

  // Render
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
      const href = match.website || mapLink(`${match.name} ${match.city}`);
      return `<a class="glLink" href="${href}" target="_blank" rel="noopener">${esc(match.name)} (${esc(match.city)})</a>`;
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

function searchAll(query, pubs, jamPubs, quizPubs, sources, games) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];

  const hits = [];

  function add(type, title, html) {
    hits.push({ type, title, html });
  }

  (pubs || []).forEach(p => {
    const hay = `${p.name} ${p.city} ${(p.tags || []).join(" ")}`.toLowerCase();
    if (hay.includes(q)) add("pub", `${p.name} (${p.city})`, `Pub`);
  });

  (sources || []).forEach(s => {
    const hay = `${s.name} ${s.city} ${s.details || ""}`.toLowerCase();
    if (hay.includes(q)) add("program", `${s.name} (${s.city})`, `Programside`);
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
      <div class="meta">${esc(h.html)}</div>
    </div>
  `).join("");
}

document.addEventListener("DOMContentLoaded", async () => {
  // Elementer (kan være null, og da bare skipper vi den delen)
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

  try {
    // 1) PUBER
    const pubsData = await loadJSON("./data/pubs.json");
    pubs = pubsData.places || [];

    setSelectOptions(pubSelect, pubs, p => `${p.name} (${p.city})`);
    setSelectOptions(jamSelect, pubs.filter(p => (p.tags || []).includes("Jam") || (p.tags || []).includes("Jam nights")), p => `${p.name} (${p.city})`);
    setSelectOptions(quizSelect, pubs.filter(p => (p.tags || []).includes("Quiz")), p => `${p.name} (${p.city})`);
    setPubFilterOptions(fbPubFilter, pubs);

    if (pubSelect) pubSelect.addEventListener("change", () => renderInfoBox(pubInfo, pubs[Number(pubSelect.value)], sources));
    if (jamSelect) jamSelect.addEventListener("change", () => {
      const jamPubs = pubs.filter(p => (p.tags || []).includes("Jam") || (p.tags || []).includes("Jam nights"));
      renderInfoBox(jamInfo, jamPubs[Number(jamSelect.value)], sources);
    });
    if (quizSelect) quizSelect.addEventListener("change", () => {
      const quizPubs = pubs.filter(p => (p.tags || []).includes("Quiz"));
      renderInfoBox(quizInfo, quizPubs[Number(quizSelect.value)], sources);
    });

    // 2) PROGRAM-KILDER
    const srcData = await loadJSON("./data/event_sources.json");
    sources = srcData.sources || [];

    if (eventsSelect) {
      eventsSelect.innerHTML =
        `<option value="">Velg program …</option>` +
        sources.map((s, i) => `<option value="${i}">${esc(s.name)} (${esc(s.city)})</option>`).join("");

      eventsSelect.addEventListener("change", () => {
        const s = sources[Number(eventsSelect.value)];
        if (!eventsInfo) return;
        if (!s) { eventsInfo.innerHTML = ""; return; }

        const pubMatch = pubs.find(p => p.name === s.name && p.city === s.city);
        const pubWebsite = pubMatch?.website || "";
        const pubMap = pubMatch?.map || mapLink(`${s.name} ${s.city}`);
        const programLink = s.link || "";

        const searchHref = `https://www.google.com/search?q=${encodeURIComponent(`${s.name} ${s.city}`)}`;
        const linkHtml = programLink
          ? `<a class="glLink" href="${programLink}" target="_blank" rel="noopener">Åpne program</a>`
          : (pubWebsite
            ? `<a class="glLink" href="${pubWebsite}" target="_blank" rel="noopener">Åpne pub</a>`
            : `<a class="glLink" href="${searchHref}" target="_blank" rel="noopener">Søk etter pub</a>`);

        eventsInfo.innerHTML = `
          <div class="item">
            <strong>${esc(s.name)} <span class="badge">${esc(s.city)}</span></strong>
            <div class="meta">${esc(s.details || "")}</div>
            ${linkHtml}
            <a class="glLink" href="${pubMap}" target="_blank" rel="noopener">Kart</a>
          </div>
        `;
      });
    }

    // 3) FOTBALL
    const fbData = await loadJSON("./data/football.json");
    games = fbData.games || [];

    function refreshFootball() {
      renderFootball(footballList, games, pubs, fbPubFilter?.value || "all", fbMode?.value || "next");
    }
    if (fbMode) fbMode.addEventListener("change", refreshFootball);
    if (fbPubFilter) fbPubFilter.addEventListener("change", refreshFootball);
    refreshFootball();

    // 4) SØK
    function runSearch() {
      const jamPubs = pubs.filter(p => (p.tags || []).includes("Jam") || (p.tags || []).includes("Jam nights"));
      const quizPubs = pubs.filter(p => (p.tags || []).includes("Quiz"));
      const hits = searchAll(q?.value, pubs, jamPubs, quizPubs, sources, games);
      renderSearch(searchResults, hits);
    }
    if (go) go.addEventListener("click", runSearch);
    if (q) q.addEventListener("keydown", (e) => { if (e.key === "Enter") runSearch(); });

    // Hvis dropdowns fortsatt virker “tomme”, gi tydelig hint i console:
    if (!pubSelect || !jamSelect || !quizSelect || !eventsSelect) {
      console.warn("Noen dropdown-elementer mangler i HTML. Sjekk id'er:", {
        pubSelect: !!pubSelect, jamSelect: !!jamSelect, quizSelect: !!quizSelect, eventsSelect: !!eventsSelect
      });
    }

  } catch (err) {
    console.error(err);
    const msg = `❌ Feil: ${esc(err.message)}`;

    // Vis feilen et sted som finnes
    if (searchResults) searchResults.innerHTML = `<div class="item">${msg}</div>`;
    else if (pubInfo) pubInfo.innerHTML = `<div class="item">${msg}</div>`;
    else {
      // siste utvei
      document.body.insertAdjacentHTML("afterbegin", `<div style="padding:12px;background:#300;color:#fff;font-family:system-ui">${msg}</div>`);
    }
  }
});
