// Grenland Live – robust JSON-leser (tåler kickoff/start/date/datetime)
// VIKTIG: Fungerer på GitHub Pages + lokal server.

const TZ = "Europe/Oslo";
const MS_DAY = 24 * 60 * 60 * 1000;

// Kildeliste (slik du har i bildet)
const SOURCES = [
  { key:"obos",           name:"OBOS-ligaen",            category:"football",   path:"data/obos.json" },
  { key:"premier",        name:"Premier League",         category:"football",   path:"data/premier_league.json" },
  { key:"cl",             name:"Champions League",       category:"football",   path:"data/champions.json" },
  { key:"laliga",         name:"La Liga",                category:"football",   path:"data/laliga.json" },

  { key:"hb_menn",        name:"Håndball VM 2026 - Menn", category:"handball",  path:"data/handball_vm_2026_menn.json" },
  { key:"hb_damer",       name:"Håndball VM 2026 - Damer",category:"handball",  path:"data/handball_vm_2026_damer.json" },

  { key:"ws_menn",        name:"Vintersport - Menn",     category:"wintersport",path:"data/vintersport_menn.json" },
  { key:"ws_kvinner",     name:"Vintersport - Kvinner",  category:"wintersport",path:"data/vintersport_kvinner.json" },

  { key:"vm2026",         name:"VM 2026",                category:"vm",         path:"data/vm2026.json" },
  { key:"events",         name:"Events",                 category:"events",     path:"data/events.json" },
];

function $(id){ return document.getElementById(id); }

// Bygg riktig base-url (GitHub Pages repo-subpath)
function basePath(){
  // /Grenland-Live/ når du er på Pages, ellers /
  const parts = location.pathname.split("/").filter(Boolean);
  // Hvis du kjører på github.io/<repo>/...
  if (location.hostname.endsWith("github.io") && parts.length > 0) {
    return `/${parts[0]}/`;
  }
  // lokal server (eller root deploy)
  return "/";
}

function url(rel){
  // rel: "data/obos.json"
  return new URL(rel, location.origin + basePath()).toString();
}

// Nettstatus
function setNetStatus(){
  const el = $("netStatus");
  if (!el) return;
  const online = navigator.onLine;
  el.textContent = online ? "🟢 Online" : "🔴 Offline";
  el.classList.toggle("online", online);
  el.classList.toggle("offline", !online);
}
window.addEventListener("online", setNetStatus);
window.addEventListener("offline", setNetStatus);

// Datoformat
function fmtOslo(d){
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

// Finn dato uansett felt
function getGameDate(obj){
  const raw =
    obj.kickoff ||
    obj.start ||
    obj.date ||
    obj.datetime ||
    obj.time ||
    obj.ts;

  if (!raw) return null;

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// Normaliser objekter til felles struktur
function normalizeItem(source, item){
  const d = getGameDate(item);

  // Fotball-lignende
  const home = item.home ?? item.hjemme ?? item.homeTeam ?? item.hjemmelag ?? "";
  const away = item.away ?? item.borte ?? item.awayTeam ?? item.bortelag ?? "";

  // Liga/turnering
  const league =
    item.league ||
    item.tournament ||
    item.competition ||
    item.series ||
    source.name;

  // Kanal/TV
  const channel = item.channel || item.tv || item.broadcast || item.kanal || "";

  // Sted/arena
  const venue = item.venue || item.arena || item.stadium || item.place || item.sted || "";

  // Pub-liste
  const where = item.where || item.pubs || item.visesHos || item.vises_hos || [];

  // Event-lignende
  const title =
    item.title ||
    item.name ||
    item.event ||
    (home && away ? `${home} – ${away}` : league);

  const city = item.city || item.by || "";
  const desc = item.description || item.desc || item.tekst || "";

  return {
    sourceKey: source.key,
    sourceName: source.name,
    category: source.category,
    league: league,
    title,
    home, away,
    datetime: d,              // Date | null
    datetimeRaw: item.kickoff || item.start || item.date || item.datetime || "",
    channel,
    venue,
    city,
    desc,
    where: Array.isArray(where) ? where : [],
    raw: item
  };
}

// Les JSON robust
async function fetchJSON(relPath){
  const full = url(relPath) + `?v=${Date.now()}`;
  const r = await fetch(full, { cache: "no-store" });
  if (!r.ok) throw new Error(`${relPath}: ${r.status}`);

  // Noen ganger returneres tekst; parse sikkert
  const txt = await r.text();
  try {
    return JSON.parse(txt);
  } catch {
    throw new Error(`${relPath}: kunne ikke parse JSON`);
  }
}

// Render kilder
function renderSourcesStatus(statuses){
  const el = $("sourcesList");
  el.innerHTML = "";

  for (const s of SOURCES){
    const st = statuses[s.key]; // { state, msg }
    const item = document.createElement("div");
    item.className = "source-item";

    const left = document.createElement("div");
    left.className = "source-meta";
    left.innerHTML = `
      <div class="source-name">${s.name}</div>
      <div class="source-path">${s.path}</div>
    `;

    const right = document.createElement("div");
    const badge = document.createElement("div");
    badge.className = "badge";

    if (!st){
      badge.textContent = "…";
    } else if (st.state === "ok"){
      badge.textContent = "OK";
      badge.classList.add("ok");
    } else if (st.state === "missing"){
      badge.textContent = "MANGLER";
      badge.classList.add("miss");
    } else {
      badge.textContent = "FEIL";
      badge.classList.add("err");
      badge.title = st.msg || "";
    }

    right.appendChild(badge);
    item.appendChild(left);
    item.appendChild(right);
    el.appendChild(item);
  }
}

function setPanelTitle(cat){
  const map = {
    football:"Fotball",
    handball:"Håndball",
    wintersport:"Vintersport",
    vm:"VM 2026",
    events:"Events",
    all:"Alle"
  };
  $("panelTitle").textContent = map[cat] || "Alle";
}

// Filtrer
function matchSearch(it, q){
  if (!q) return true;
  q = q.toLowerCase();

  const whereStr = Array.isArray(it.where)
    ? it.where.map(x => (typeof x === "string" ? x : (x?.name || ""))).join(" ")
    : "";

  const hay = [
    it.title, it.league, it.home, it.away,
    it.channel, it.venue, it.city, it.desc,
    it.sourceName,
    whereStr
  ].join(" ").toLowerCase();

  return hay.includes(q);
}

function inNextDays(d, days){
  if (!d) return false;
  const now = new Date();
  const from = now.getTime();
  const to = from + (Number(days) * MS_DAY);
  const t = d.getTime();
  return t >= from && t <= to;
}

// Render resultater
function renderResults(items, cat, days, q){
  const el = $("results");
  el.innerHTML = "";

  const filtered = items
    .filter(it => (cat === "all" ? true : it.category === cat))
    .filter(it => inNextDays(it.datetime, days))
    .filter(it => matchSearch(it, q))
    .sort((a,b) => (a.datetime?.getTime() || 0) - (b.datetime?.getTime() || 0));

  if (filtered.length === 0){
    const div = document.createElement("div");
    div.className = "empty";
    div.innerHTML = `
      <b>Ingen treff i valgt periode.</b><br>
      Tips: øk <b>Dager</b> (f.eks. 365) eller sjekk at JSON har dato i feltet <code>kickoff</code>/<code>start</code>/<code>date</code>.
    `;
    el.appendChild(div);
    return;
  }

  for (const it of filtered){
    const card = document.createElement("div");
    card.className = "item";

    const when = it.datetime ? fmtOslo(it.datetime) : "(mangler dato)";
    const line2 = [
      it.league ? `🏷️ ${escapeHtml(it.league)}` : "",
      it.venue ? `📍 ${escapeHtml(it.venue)}` : "",
      it.channel ? `📺 ${escapeHtml(it.channel)}` : "",
      it.city ? `🏙️ ${escapeHtml(it.city)}` : ""
    ].filter(Boolean).join(" · ");

    const wherePills = renderWherePills(it.where);

    card.innerHTML = `
      <div class="item-top">
        <div>
          <div class="item-title">${escapeHtml(it.title)}</div>
          <div class="item-sub">🕒 ${escapeHtml(when)}${line2 ? `<br>${line2}` : ""}</div>
        </div>
        <div class="pill">${escapeHtml(it.sourceName)}</div>
      </div>
      ${wherePills}
    `;

    el.appendChild(card);
  }
}

function renderWherePills(where){
  if (!where) return "";
  let arr = [];
  if (Array.isArray(where)){
    arr = where.map(x => (typeof x === "string" ? x : (x?.name || ""))).filter(Boolean);
  }
  if (arr.length === 0) return "";

  const pills = arr.slice(0, 10).map(x => `<span class="pill">${escapeHtml(x)}</span>`).join("");
  const more = arr.length > 10 ? `<span class="pill">+${arr.length - 10} flere</span>` : "";

  return `<div class="pills">${pills}${more}</div>`;
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// Hoved-last
async function loadAll(){
  setNetStatus();

  const statuses = {};
  renderSourcesStatus(statuses);

  const allItems = [];

  for (const src of SOURCES){
    try{
      const data = await fetchJSON(src.path);

      // Godta både {games:[...]} og {events:[...]} og direkte array
      const arr =
        Array.isArray(data) ? data :
        Array.isArray(data.games) ? data.games :
        Array.isArray(data.events) ? data.events :
        Array.isArray(data.items) ? data.items :
        [];

      for (const it of arr){
        const n = normalizeItem(src, it);
        // kun behold hvis vi har dato (ellers havner alt i "ingen treff")
        // Men vi tar med de som mangler dato også? Du kan velge. Her: ta med,
        // men de vil ikke vises i periodefilteret.
        allItems.push(n);
      }

      statuses[src.key] = { state:"ok" };
    } catch (e){
      const msg = String(e?.message || e);
      if (msg.includes(": 404")){
        statuses[src.key] = { state:"missing", msg };
      } else {
        statuses[src.key] = { state:"error", msg };
      }
    }
    renderSourcesStatus(statuses);
  }

  return allItems;
}

// App state
let STATE = {
  items: [],
  category: "football",
  days: 30,
  q: ""
};

function bindUI(){
  $("selCategory").addEventListener("change", (e)=>{
    STATE.category = e.target.value;
    setPanelTitle(STATE.category);
    renderResults(STATE.items, STATE.category, STATE.days, STATE.q);
  });

  $("selDays").addEventListener("change", (e)=>{
    STATE.days = Number(e.target.value);
    renderResults(STATE.items, STATE.category, STATE.days, STATE.q);
  });

  $("inpSearch").addEventListener("input", (e)=>{
    STATE.q = e.target.value.trim();
    renderResults(STATE.items, STATE.category, STATE.days, STATE.q);
  });

  $("btnRefresh").addEventListener("click", async ()=>{
    STATE.items = await loadAll();
    renderResults(STATE.items, STATE.category, STATE.days, STATE.q);
  });
}

(async function init(){
  bindUI();
  setPanelTitle(STATE.category);
  STATE.items = await loadAll();
  renderResults(STATE.items, STATE.category, STATE.days, STATE.q);
})();
