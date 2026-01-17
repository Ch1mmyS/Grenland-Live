/* Grenland Live – app.js (FULL + CLICKABLE FOOTBALL)
   - PROGRAM-link alltid
   - Smartere matching mot event_sources (tåler parentes/case/aksenter)
   - Tag-filter tolerant (Quiz/Jam)
   - Fotball:
     * Neste 15/30 dager fungerer uansett dropdown value
     * Kamper er klikkbare og viser detaljer (pub, tid, kanal)
     * Pub-filter tolerant + forklaring hvis football.json mangler "pubs"
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

/* ---------- SMART MATCHING (Pubs <-> Event sources) ---------- */
function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .trim()
    .replace(/\([^)]*\)/g, "")        // fjern ( ... )
    .replace(/\s+/g, " ")
    .replace(/[’'"]/g, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, ""); // fjern aksenter
}
function key(name, city) {
  return `${norm(name)}|${norm(city)}`;
}
function buildSourceMap(sources) {
  const m = new Map();
  for (const s of (sources || [])) m.set(key(s.name, s.city), s);
  return m;
}

/* ---------- TAG HELPERS (tolerant) ---------- */
function hasTag(p, tag) {
  const want = String(tag || "").trim().toLowerCase();
  const tags = Array.isArray(p?.tags) ? p.tags : [];
  return tags.some(t => String(t || "").trim().toLowerCase() === want);
}

/* ---------- PROGRAM LINK (always) ---------- */
function resolveProgramLinkForPub(p, sourceMap) {
  const w = String(p.website || "").trim();
  if (w) return { href: w, label: "PROGRAM" };

  const s = sourceMap.get(key(p.name, p.city));
  const sl = s ? String(s.link || "").trim() : "";
  if (sl) return { href: sl, label: "PROGRAM" };

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

/* ---------- FOOTBALL (CLICKABLE + MODE FIX) ---------- */
function normLite(s){
  return String(s ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}
function getTV(g){
  const v = g.tv ?? g.channel ?? g.kanal ?? "";
  return String(v || "").trim();
}

// lager en stabil id pr kamp (for accordion)
function gameId(g, idx){
  return `g_${idx}_${(g.home||"").toString().replace(/\W+/g,"")}_${(g.away||"").toString().replace(/\W+/g,"")}_${(g.start||"").toString().replace(/\W+/g,"")}`;
}

function renderFootball(listEl, games, pubs, pubFilter, mode, sourceMap) {
  if (!listEl) return;

  let filtered = (games || []).slice();

  // MODE (robust): støtter "next", "next15", "next30", "15", "30", "neste15", osv.
  const m = String(mode || "").toLowerCase().trim();

  if (m === "today" || m === "i dag") {
    const now = new Date();
    const y = now.getFullYear(), mo = now.getMonth(), da = now.getDate();
    filtered = filtered.filter(g => {
      const dt = new Date(g.start);
      return !isNaN(dt) && dt.getFullYear() === y && dt.getMonth() === mo && dt.getDate() === da;
    });
  } else {
    const digits = m.match(/\d+/);
    const days = digits ? Number(digits[0]) : ((m === "next" || m === "neste") ? 30 : null);
    if (days) filtered = filtered.filter(g => inNextDays(g.start, days));
  }

  // PUB FILTER (tolerant + forklaring hvis pubs mangler)
  if (pubFilter && pubFilter !== "all") {
    const p = pubs?.[Number(pubFilter)];
    if (p) {
      const anyHasPubs = filtered.some(g => Array.isArray(g.pubs) && g.pubs.length);

      if (!anyHasPubs) {
        listEl.innerHTML = `
          <div class="item">
            <strong>Ingen pub-filter mulig ennå</strong>
            <div class="meta">
              Kampene i <code>data/football.json</code> har ikke <code>"pubs"</code>-felt,
              så appen vet ikke hvilke puber som viser hvilke kamper.
            </div>
            <div class="meta">
              Legg inn f.eks:
              <code>"pubs": [{"name":"Gimle Pub","city":"Skien"}]</code>
              på kampene som vises på Gimle.
            </div>
          </div>
        `;
        return;
      }

      filtered = filtered.filter(g =>
        (g.pubs || []).some(x =>
          normLite(x.city) === normLite(p.city) &&
          (
            normLite(x.name) === normLite(p.name) ||
            normLite(p.name).includes(normLite(x.name)) ||
            normLite(x.name).includes(normLite(p.name))
          )
        )
      );
    }
  }

  if (!filtered.length) {
    listEl.innerHTML = `<div class="item">Ingen kamper å vise.</div>`;
    return;
  }

  // Sorter på tidspunkt
  filtered.sort((a,b)=> new Date(a.start).getTime() - new Date(b.start).getTime());

  // Render clickable list
  listEl.innerHTML = filtered.map((g, idx) => {
    const id = gameId(g, idx);
    const home = esc(g.home || "");
    const away = esc(g.away || "");
    const league = esc(g.league || "");
    const start = esc(fmtTime(g.start));
    const tv = getTV(g);
    const tvText = tv ? `TV: ${esc(tv)}` : "TV: (ukjent)";
    const pubsArr = Array.isArray(g.pubs) ? g.pubs : [];

    // Pubs list: bruk pubs.json hvis vi finner match (for website), ellers bruk navn/city fra kampen
    const pubsHtml = pubsArr.length
      ? `<div class="meta" style="margin-top:8px">
           <strong>Puber som viser kampen:</strong><br/>
           ${pubsArr.map(pp=>{
              const full = (pubs || []).find(p => normLite(p.name) === normLite(pp.name) && normLite(p.city) === normLite(pp.city)) || pp;
              const prog = resolveProgramLinkForPub(full, sourceMap);
              return `<a class="glLink" href="${prog.href}" target="_blank" rel="noopener">${esc(pp.name)} (${esc(pp.city)})</a>`;
            }).join(" ")}
         </div>`
      : `<div class="meta" style="margin-top:8px">Ingen puber er lagt inn på denne kampen ennå.</div>`;

    return `
      <div class="item" style="cursor:pointer" data-game-id="${id}">
        <div class="fbRow" style="display:flex;align-items:center;justify-content:space-between;gap:10px">
          <div>
            <strong>${home} – ${away}</strong>
            <div class="meta">${league} • ${start}</div>
          </div>
          <div class="badge" aria-hidden="true">Trykk</div>
        </div>

        <div id="${id}" class="fbDetails" style="display:none;margin-top:10px">
          <div class="meta"><strong>Tid:</strong> ${start}</div>
          <div class="meta"><strong>Liga:</strong> ${league}</div>
          <div class="meta"><strong>${tvText}</strong></div>
          ${pubsHtml}
        </div>
      </div>
    `;
  }).join("");

  // Click handler: toggle details
  listEl.querySelectorAll(".item[data-game-id]").forEach(card => {
    card.addEventListener("click", (e) => {
      // Ikke toggle hvis brukeren klikker på en link
      const a = e.target.closest("a");
      if (a) return;

      const id = card.getAttribute("data-game-id");
      const details = document.getElementById(id);
      if (!details) return;

      const isOpen = details.style.display === "block";
      // valgfritt: lukk alle andre
      listEl.querySelectorAll(".fbDetails").forEach(d => d.style.display = "none");
      details.style.display = isOpen ? "none" : "block";
    });
  });
}

/* ---------- MAIN ---------- */
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

  function searchAll(query, pubs, sources, games){
    const needle = String(query || "").trim().toLowerCase();
    if (!needle) return [];
    const hits = [];

    const add = (title, meta) => hits.push({ title, meta });

    (pubs || []).forEach(p => {
      const hay = `${p.name} ${p.city} ${(p.tags || []).join(" ")}`.toLowerCase();
      if (hay.includes(needle)) add(`${p.name} (${p.city})`, "Pub");
    });

    (sources || []).forEach(s => {
      const hay = `${s.name} ${s.city} ${s.details || ""}`.toLowerCase();
      if (hay.includes(needle)) add(`${s.name} (${s.city})`, "Program");
    });

    (games || []).forEach(g => {
      const hay = `${g.home} ${g.away} ${g.league || ""}`.toLowerCase();
      if (hay.includes(needle)) add(`${g.home} – ${g.away}`, `Fotball • ${fmtTime(g.start)}`);
    });

    return hits;
  }

  function renderSearch(el, hits){
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

  try {
    // Load pubs + sources first (needed for PROGRAM links)
    const pubsData = await loadJSON("./data/pubs.json");
    pubs = pubsData.places || [];

    const srcData = await loadJSON("./data/event_sources.json");
    sources = srcData.sources || [];
    sourceMap = buildSourceMap(sources);

    // PUBS
    setSelectOptions(pubSelect, pubs, p => `${p.name} (${p.city})`);
    if (pubSelect) pubSelect.addEventListener("change", () => renderInfoBox(pubInfo, pubs[Number(pubSelect.value)], sourceMap));

    // JAM (tolerant)
    const jamPubs = pubs.filter(p => hasTag(p, "Jam") || hasTag(p, "Jam nights"));
    setSelectOptions(jamSelect, jamPubs, p => `${p.name} (${p.city})`);
    if (jamSelect) jamSelect.addEventListener("change", () => renderInfoBox(jamInfo, jamPubs[Number(jamSelect.value)], sourceMap));

    // QUIZ (tolerant)
    const quizPubs = pubs.filter(p => hasTag(p, "Quiz"));
    setSelectOptions(quizSelect, quizPubs, p => `${p.name} (${p.city})`);
    if (quizSelect) quizSelect.addEventListener("change", () => renderInfoBox(quizInfo, quizPubs[Number(quizSelect.value)], sourceMap));

    // EVENTS SOURCES (always PROGRAM)
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

    // FOOTBALL DATA
    const fbData = await loadJSON("./data/football.json");
    games = fbData.games || [];

    // Football filters
    setPubFilterOptions(fbPubFilter, pubs);

    function refreshFootball() {
      renderFootball(
        footballList,
        games,
        pubs,
        fbPubFilter?.value || "all",
        fbMode?.value || "next30",
        sourceMap
      );
    }

    if (fbMode) fbMode.addEventListener("change", refreshFootball);
    if (fbPubFilter) fbPubFilter.addEventListener("change", refreshFootball);
    refreshFootball();

    // SEARCH
    function runSearch(){
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
