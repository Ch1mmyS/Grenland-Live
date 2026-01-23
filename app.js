// Grenland Live – One-page app
// Klikk på kamp -> modal med puber (Vikinghjørnet + Gimle først), klokkeslett og kanal
// Robust: tid-felter + kanal-felter + encoding-fix

const REPO_NAME = "Grenland-Live";
const BASE = location.pathname.startsWith(`/${REPO_NAME}/`) ? `/${REPO_NAME}/` : "/";
const url = (p) => `${BASE}${p}`.replaceAll("//", "/");

const TZ = "Europe/Oslo";
const $ = (id) => document.getElementById(id);

const homeEl = $("home");
const appEl  = $("app");
const listEl = $("list");
const h2El   = $("panelH2");
const metaEl = $("panelMeta");
const qEl    = $("q");

const modalBack    = $("modalBack");
const modalTitle   = $("modalTitle");
const modalTime    = $("modalTime");
const modalChannel = $("modalChannel");
const modalPubs    = $("modalPubs");
const modalClose   = $("modalClose");

const tabButtons = {
  sport: $("tabSport"),
  puber: $("tabPuber"),
  events: $("tabEvents"),
  vm2026: $("tabVM"),
};

// ===== KILDER =====
const SOURCES = {
  sport: [
    { id:"eliteserien", name:"Eliteserien", file:"data/eliteserien.json" },
    { id:"obos",        name:"OBOS-ligaen", file:"data/obos.json" },
    { id:"premier",     name:"Premier League", file:"data/premier_league.json" },
    { id:"cl",          name:"Champions League", file:"data/champions.json" },
    { id:"laliga",      name:"La Liga", file:"data/laliga.json" },

    { id:"hb_m",        name:"Håndball VM 2026 – Menn", file:"data/handball_vm_2026_menn.json" },
    { id:"hb_k",        name:"Håndball VM 2026 – Damer", file:"data/handball_vm_2026_damer.json" },

    { id:"ws_m",        name:"Vintersport – Menn", file:"data/vintersport_menn.json" },
    { id:"ws_k",        name:"Vintersport – Kvinner", file:"data/vintersport_kvinner.json" }
  ],
  puber: [
    { id:"pubs", name:"Puber", file:"data/pubs.json" }
  ],
  events: [
    { id:"events", name:"Events", file:"data/events.json" }
  ],
  vm2026: [
    { id:"vm2026", name:"VM 2026", file:"data/vm2026.json" }
  ]
};

// -------- Fetch JSON --------
async function fetchJSON(path){
  const full = url(path) + `?v=${Date.now()}`;
  const r = await fetch(full, { cache: "no-store" });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  const txt = await r.text();
  if (txt.trim().startsWith("<")) throw new Error(`${path}: returned HTML (wrong path / 404 page)`);
  return JSON.parse(txt);
}

// -------- Encoding fix --------
function fixText(value){
  if (value == null) return "";
  let s = String(value);
  if (!s.includes("Ã") && !s.includes("Â")) return s;

  const map = [
    ["Ã¸","ø"],["Ã˜","Ø"],["Ã¥","å"],["Ã…","Å"],["Ã¦","æ"],["Ã†","Æ"],
    ["Ã©","é"],["Ã¨","è"],["Ãª","ê"],["Ã¡","á"],["Ã³","ó"],["Ãº","ú"],
    ["Ã¤","ä"],["Ã¶","ö"],["Ã¼","ü"],["Ã„","Ä"],["Ã–","Ö"],["Ãœ","Ü"],
    ["Ã±","ñ"],["ÃŸ","ß"],
    ["Â "," "],["Â·","·"],["Â–","–"],["Â—","—"],["Â«","«"],["Â»","»"]
  ];
  for (const [bad, good] of map) s = s.split(bad).join(good);
  return s;
}

function escapeHTML(s){
  s = fixText(s);
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// -------- Tid: ekstremt robust --------
function tryParseDate(v){
  if (v == null) return null;

  // unix timestamp (sekunder eller ms)
  if (typeof v === "number" && isFinite(v)){
    const ms = (v > 2_000_000_000 ? v : v * 1000); // heuristikk
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  // string
  const s = String(v).trim();
  if (!s) return null;

  // hvis "YYYY-MM-DD HH:MM:SSZ" -> gjør om til ISO
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}Z$/.test(s)){
    const iso = s.replace(" ", "T").replace("Z", "+00:00");
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }

  // vanlig Date parsing (ISO / med timezone / uten)
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function getWhen(obj){
  // prøv mange mulige feltnavn (du slipper å endre data)
  const keys = [
    "kickoff","start","datetime","dateTime","date_time","date",
    "time","utcDate","utc_date","matchDate","match_date",
    "start_time","startTime","ko","k.o.","timestamp","ts"
  ];
  for (const k of keys){
    if (obj && obj[k] != null) return obj[k];
  }
  // nested varianter
  if (obj?.fixture?.date) return obj.fixture.date;
  if (obj?.fixture?.timestamp) return obj.fixture.timestamp;
  if (obj?.event?.date) return obj.event.date;
  return null;
}

function fmtOslo(anyDateValue){
  const d = tryParseDate(anyDateValue);
  if (!d) return null;
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

function scoreSort(a,b){
  const ta = tryParseDate(getWhen(a))?.getTime() ?? 0;
  const tb = tryParseDate(getWhen(b))?.getTime() ?? 0;
  return ta - tb;
}

// -------- Kanal: ekstremt robust --------
function toChannelString(v){
  if (v == null) return "";

  // string
  if (typeof v === "string") return v.trim();

  // array
  if (Array.isArray(v)){
    return v.map(toChannelString).filter(Boolean).join(" / ");
  }

  // object: prøv vanlige felter
  if (typeof v === "object"){
    const keys = ["channel","name","title","tv","broadcast","provider","station"];
    for (const k of keys){
      if (typeof v[k] === "string" && v[k].trim()) return v[k].trim();
      if (Array.isArray(v[k]) && v[k].length) return toChannelString(v[k]);
      if (typeof v[k] === "object" && v[k]) {
        const nested = toChannelString(v[k]);
        if (nested) return nested;
      }
    }
  }
  return "";
}

function getChannel(obj){
  // toppfelter
  const direct = [
    obj?.channel, obj?.tv, obj?.broadcast, obj?.broadcaster, obj?.channels
  ].map(toChannelString).filter(Boolean)[0];
  if (direct) return fixText(direct);

  // nested typiske API/feeds
  const nested = [
    obj?.coverage?.tv,
    obj?.coverage?.channels,
    obj?.broadcasts,
    obj?.streaming,
    obj?.media,
    obj?.television
  ].map(toChannelString).filter(Boolean)[0];
  if (nested) return fixText(nested);

  return "";
}

// -------- Robust extractor --------
function looksLikeEventObj(o){
  if (!o || typeof o !== "object") return false;
  const hasTime = !!tryParseDate(getWhen(o));
  const hasTeams = !!(o.home && o.away) || !!(o.homeTeam && o.awayTeam);
  const hasTitle = !!(o.title || o.name || o.event);
  return hasTime && (hasTeams || hasTitle);
}

function normalizeItem(o){
  if (!o || typeof o !== "object") return o;

  // football-data style
  if (!o.home && o.homeTeam && typeof o.homeTeam === "object") {
    o = { ...o, home: o.homeTeam.name ?? o.homeTeam.shortName ?? o.homeTeam.tla ?? o.homeTeam };
  }
  if (!o.away && o.awayTeam && typeof o.awayTeam === "object") {
    o = { ...o, away: o.awayTeam.name ?? o.awayTeam.shortName ?? o.awayTeam.tla ?? o.awayTeam };
  }
  if (!o.kickoff && o.utcDate) o = { ...o, kickoff: o.utcDate };

  const copy = { ...o };
  for (const k of Object.keys(copy)){
    if (typeof copy[k] === "string") copy[k] = fixText(copy[k]);
  }
  return copy;
}

function extractItems(obj){
  if (!obj) return [];
  if (Array.isArray(obj)) return obj.map(normalizeItem);

  const keys = ["games","matches","fixtures","events","items","data","response","results"];
  for (const k of keys){
    if (Array.isArray(obj[k])) return obj[k].map(normalizeItem);
  }

  for (const k of Object.keys(obj)){
    const v = obj[k];
    if (v && typeof v === "object") {
      for (const kk of keys){
        if (Array.isArray(v[kk])) return v[kk].map(normalizeItem);
      }
    }
  }

  const out = [];
  function walk(node, depth=0){
    if (!node || depth > 6) return;
    if (Array.isArray(node)){
      const arr = node;
      if (arr.length && arr.every(x => x && typeof x === "object")){
        const sample = arr.slice(0, Math.min(40, arr.length));
        const score = sample.filter(looksLikeEventObj).length / sample.length;
        if (score >= 0.35){
          out.push(...arr.map(normalizeItem));
          return;
        }
      }
      for (const it of arr) walk(it, depth+1);
      return;
    }
    if (typeof node === "object"){
      for (const k of Object.keys(node)) walk(node[k], depth+1);
    }
  }
  walk(obj, 0);
  return out;
}

// -------- Cache --------
let CURRENT = "sport";
let CURRENT_LEAGUE = "ALL";

const CACHE = {
  sport: { loaded:false, leagues:[], status:[] },
  puber: { loaded:false, items:[], status:[] },
  events:{ loaded:false, items:[], status:[] },
  vm2026:{ loaded:false, items:[], status:[] }
};

// -------- Load --------
async function loadTab(tab){
  const conf = SOURCES[tab] || [];
  const status = [];

  if (tab === "sport"){
    const leagues = [];
    for (const src of conf){
      try{
        const json = await fetchJSON(src.file);
        const items = extractItems(json).slice().sort(scoreSort);
        leagues.push({ id: src.id, name: src.name, items });
        status.push({ ...src, ok:true, count: items.length });
      }catch(e){
        console.warn("load failed:", src.file, e);
        leagues.push({ id: src.id, name: src.name, items: [] });
        status.push({ ...src, ok:false, error:String(e) });
      }
    }
    CACHE.sport = { loaded:true, leagues, status };
    return;
  }

  const allItems = [];
  for (const src of conf){
    try{
      const json = await fetchJSON(src.file);
      const items = extractItems(json);
      allItems.push(...items);
      status.push({ ...src, ok:true, count: items.length });
    }catch(e){
      console.warn("load failed:", src.file, e);
      status.push({ ...src, ok:false, error:String(e) });
    }
  }
  allItems.sort(scoreSort);
  CACHE[tab] = { loaded:true, items: allItems, status };
}

function setActiveTabUI(tab){
  for (const key of Object.keys(tabButtons)){
    tabButtons[key].classList.toggle("active", key === tab);
  }
}

function renderMissingWarning(status){
  const missing = status.filter(s => !s.ok);
  if (!missing.length) return "";
  return `
    <div class="item">
      <div class="itemTitle">Noen JSON-filer ble ikke funnet:</div>
      <div class="tagRow">
        ${missing.map(m => `<span class="tag">${escapeHTML(m.file)} (${escapeHTML(m.error)})</span>`).join("")}
      </div>
      <div style="margin-top:8px;color:rgba(11,18,32,.75);font-size:12px">
        Sjekk at filene finnes i <code>/data/</code> og at navnet er helt likt (store/små bokstaver).
      </div>
    </div>
  `;
}

// ===== Puber =====
const PINNED_PUBS = ["Vikinghjørnet", "Gimle Pub"];

function extractPubNamesFromPubsJSON(items){
  const out = [];
  for (const it of (items || [])){
    if (typeof it === "string") out.push(fixText(it));
    else if (it && typeof it === "object"){
      if (it.name) out.push(fixText(it.name));
      else if (it.title) out.push(fixText(it.title));
    }
  }
  return Array.from(new Set(out)).filter(Boolean);
}

async function ensurePubsLoaded(){
  if (CACHE.puber.loaded) return;
  const src = SOURCES.puber?.[0];
  if (!src) {
    CACHE.puber = { loaded:true, items:[], status:[] };
    return;
  }
  try{
    const json = await fetchJSON(src.file);
    const items = extractItems(json);
    CACHE.puber = { loaded:true, items, status:[{...src, ok:true, count: items.length}] };
  }catch(e){
    console.warn("pubs load failed:", e);
    CACHE.puber = { loaded:true, items:[], status:[{...src, ok:false, error:String(e)}] };
  }
}

function buildOrderedPubList(matchObj){
  let fromMatch = [];
  if (Array.isArray(matchObj?.where)) fromMatch = matchObj.where.map(fixText);
  else if (Array.isArray(matchObj?.pubs)) fromMatch = matchObj.pubs.map(p => fixText(p?.name || p));
  else if (typeof matchObj?.where === "string" && matchObj.where.trim()) fromMatch = matchObj.where.split(",").map(s => fixText(s.trim()));
  fromMatch = fromMatch.filter(Boolean);

  const allPubs = extractPubNamesFromPubsJSON(CACHE.puber.items);
  const combined = Array.from(new Set([...fromMatch, ...allPubs]));

  const pinned = PINNED_PUBS.slice();
  const rest = combined.filter(p => !pinned.some(x => x.toLowerCase() === p.toLowerCase()));
  rest.sort((a,b) => a.localeCompare(b, "no"));

  const finalList = [...pinned, ...rest];
  return Array.from(new Set(finalList));
}

// ===== Modal =====
function openMatchModal(matchObj, leagueName){
  const title =
    (matchObj.home && matchObj.away) ? `${fixText(matchObj.home)} – ${fixText(matchObj.away)}` :
    fixText(matchObj.title || matchObj.name || matchObj.event || "Kamp");

  const whenTxt = fmtOslo(getWhen(matchObj)) || "Tid ikke oppgitt i data";
  const channel = getChannel(matchObj) || "Kanal ikke oppgitt i data";

  modalTitle.textContent = leagueName ? `${leagueName}: ${title}` : title;
  modalTime.textContent = whenTxt;
  modalChannel.textContent = channel;

  modalPubs.innerHTML = "";
  const pubs = buildOrderedPubList(matchObj);
  for (const p of pubs){
    const span = document.createElement("span");
    span.className = "tag";
    span.textContent = p;
    modalPubs.appendChild(span);
  }

  modalBack.classList.add("show");
  modalBack.setAttribute("aria-hidden", "false");
}

function closeMatchModal(){
  modalBack.classList.remove("show");
  modalBack.setAttribute("aria-hidden", "true");
}

// ===== Render =====
function renderSport(){
  const q = fixText((qEl.value || "")).trim().toLowerCase();
  const { leagues, status } = CACHE.sport;

  h2El.textContent = "Sport";
  const okCount = status.filter(s => s.ok).length;
  metaEl.textContent = `Kilder: ${okCount}/${status.length} • BASE: ${BASE}`;

  const total = leagues.reduce((a,l)=>a+(l.items?.length||0),0);
  const btns = [{ id:"ALL", name:"Alle", count: total }, ...leagues.map(l => ({ id:l.id, name:l.name, count:l.items.length }))];

  let html = "";
  html += renderMissingWarning(status);

  html += `
    <div class="item" style="border:none;padding:0;background:transparent">
      <div class="tagRow" style="gap:10px">
        ${btns.map(b => `
          <button class="pill ${CURRENT_LEAGUE === b.id ? "active" : ""}"
                  type="button"
                  data-league="${escapeHTML(b.id)}"
                  style="border:3px solid #0b1220">
            ${escapeHTML(b.name)} (${b.count})
          </button>
        `).join("")}
      </div>
    </div>
  `;

  let selected = [];
  if (CURRENT_LEAGUE === "ALL"){
    for (const l of leagues) selected.push(...l.items.map(it => ({...it, __leagueName: l.name})));
  } else {
    const found = leagues.find(l => l.id === CURRENT_LEAGUE);
    selected = found ? found.items.map(it => ({...it, __leagueName: found.name})) : [];
  }

  selected.sort(scoreSort);

  if (q){
    selected = selected.filter(x => fixText(JSON.stringify(x)).toLowerCase().includes(q));
  }

  if (!selected.length){
    html += `<div class="item">Ingen data i denne ligaen.</div>`;
    listEl.innerHTML = html;
  } else {
    html += selected.map((x, idx) => {
      const when = fmtOslo(getWhen(x)) || "Tid ikke oppgitt";
      const title =
        (x.home && x.away) ? `${fixText(x.home)} – ${fixText(x.away)}` :
        fixText(x.title || x.name || x.event || "Ukjent");

      const league = fixText(x.__leagueName || x.league || x.competition || x.tournament || "");
      const channel = getChannel(x) || "Kanal ikke oppgitt";

      return `
        <div class="item clickable" data-match-index="${idx}">
          <div class="itemTop">
            <div class="itemTitle">${escapeHTML(title)}</div>
            <div class="tag">${escapeHTML(when)}</div>
          </div>
          <div class="tagRow">
            ${league ? `<span class="tag">${escapeHTML(league)}</span>` : ""}
            <span class="tag">${escapeHTML(channel)}</span>
            <span class="tag">Trykk for pub/kanal</span>
          </div>
        </div>
      `;
    }).join("");

    listEl.innerHTML = html;

    listEl.querySelectorAll("[data-league]").forEach(btn => {
      btn.addEventListener("click", () => {
        CURRENT_LEAGUE = btn.getAttribute("data-league");
        renderSport();
      });
    });

    listEl.querySelectorAll("[data-match-index]").forEach(card => {
      card.addEventListener("click", async () => {
        const idx = Number(card.getAttribute("data-match-index"));
        const obj = selected[idx];
        await ensurePubsLoaded();
        openMatchModal(obj, obj.__leagueName || "");
      });
    });

    return;
  }

  listEl.querySelectorAll("[data-league]").forEach(btn => {
    btn.addEventListener("click", () => {
      CURRENT_LEAGUE = btn.getAttribute("data-league");
      renderSport();
    });
  });
}

function renderGeneric(tab){
  const q = fixText((qEl.value || "")).trim().toLowerCase();
  const { items, status } = CACHE[tab];

  const titleMap = { puber:"Puber", events:"Kommende eventer", vm2026:"VM kalender 2026" };
  h2El.textContent = fixText(titleMap[tab] || "Grenland Live");

  const okCount = status.filter(s => s.ok).length;
  metaEl.textContent = `Kilder: ${okCount}/${status.length} • BASE: ${BASE}`;

  let filtered = items;
  if (q) filtered = items.filter(x => fixText(JSON.stringify(x)).toLowerCase().includes(q));
  filtered.sort(scoreSort);

  let html = "";
  html += renderMissingWarning(status);

  if (!filtered.length){
    html += `<div class="item">Ingen treff.</div>`;
  } else {
    html += filtered.map(x => {
      const when = fmtOslo(getWhen(x)) || "Tid ikke oppgitt";
      const title =
        (x.home && x.away) ? `${fixText(x.home)} – ${fixText(x.away)}` :
        fixText(x.title || x.name || x.event || "Ukjent");

      const league = fixText(x.league || x.competition || x.tournament || "");
      const channel = getChannel(x) || "";
      const where =
        Array.isArray(x.where) ? x.where.map(fixText).join(", ") :
        Array.isArray(x.pubs) ? x.pubs.map(p => fixText(p?.name || p)).join(", ") :
        fixText(x.where || x.place || x.location || "");

      return `
        <div class="item">
          <div class="itemTop">
            <div class="itemTitle">${escapeHTML(title)}</div>
            <div class="tag">${escapeHTML(when)}</div>
          </div>
          <div class="tagRow">
            ${league ? `<span class="tag">${escapeHTML(league)}</span>` : ""}
            ${channel ? `<span class="tag">${escapeHTML(channel)}</span>` : ""}
            ${where ? `<span class="tag">${escapeHTML(where)}</span>` : ""}
          </div>
        </div>
      `;
    }).join("");
  }

  listEl.innerHTML = html;
}

function render(tab){
  if (tab === "sport") return renderSport();
  return renderGeneric(tab);
}

async function show(tab){
  CURRENT = tab;

  homeEl.classList.add("hidden");
  appEl.classList.remove("hidden");

  setActiveTabUI(tab);

  if (tab === "sport") CURRENT_LEAGUE = "ALL";

  if (!CACHE[tab]?.loaded){
    h2El.textContent = "Laster…";
    metaEl.textContent = "";
    listEl.innerHTML = `<div class="item">Laster data…</div>`;
    await loadTab(tab);
  }
  render(tab);
}

function backHome(){
  appEl.classList.add("hidden");
  homeEl.classList.remove("hidden");
  qEl.value = "";
  CURRENT_LEAGUE = "ALL";
  closeMatchModal();
}

function boot(){
  document.querySelectorAll("[data-go]").forEach(btn => btn.addEventListener("click", () => show(btn.dataset.go)));
  document.querySelectorAll("[data-tab]").forEach(btn => btn.addEventListener("click", () => show(btn.dataset.tab)));
  qEl.addEventListener("input", () => render(CURRENT));

  $("backHome")?.addEventListener("click", backHome);
  $("backHome2")?.addEventListener("click", backHome);

  modalClose?.addEventListener("click", closeMatchModal);
  modalBack?.addEventListener("click", (e) => { if (e.target === modalBack) closeMatchModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMatchModal(); });
}

boot();
