/* Grenland Live – Sportsmeny (GitHub Pages safe)
   - Fikser base-path automatisk (project repo vs root)
   - Leser JSON fra data/*.json
*/

const TZ = "Europe/Oslo";
const $ = (id) => document.getElementById(id);

// ---- Base path: viktig for GitHub Pages /<repo>/ ----
function basePath(){
  // Eks: /Grenland-Live/  eller / (hvis user site)
  const p = location.pathname;
  // Hvis du noen gang endrer repo-navn, oppdater denne listen:
  const known = ["Grenland-Live"];
  for (const repo of known){
    if (p.includes(`/${repo}/`)) return `/${repo}/`;
  }
  return "/";
}
const BASE = basePath();
const url = (p) => (BASE === "/" ? p : BASE + p).replaceAll("//", "/");

// ---- Network indicator ----
function setNetStatus(){
  const el = $("netStatus");
  if (!el) return;
  const online = navigator.onLine;
  el.textContent = online ? "🟢 Online" : "🔴 Offline";
  el.classList.toggle("online", online);
  el.classList.toggle("offline", !online);
}

// ---- Date helpers ----
function parseISO(iso){
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function fmtOslo(iso){
  const d = parseISO(iso);
  if (!d) return "Ukjent tid";
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

function withinDays(iso, days){
  const d = parseISO(iso);
  if (!d) return false;
  const now = new Date();
  const max = new Date(now.getTime() + (days * 24 * 60 * 60 * 1000));
  return d >= new Date(now.getTime() - (2 * 24*60*60*1000)) && d <= max;
}

// ---- Fetch JSON with nice errors ----
async function fetchJSON(path){
  const full = url(path) + `?v=${Date.now()}`;
  const r = await fetch(full, { cache: "no-store" });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  const txt = await r.text();

  // Rask “beskyttelse” hvis GitHub returnerer HTML 404-side:
  if (txt.trim().startsWith("<")) {
    throw new Error(`${path}: returned HTML (wrong path / 404 page)`);
  }

  return JSON.parse(txt);
}

// ---- Expected files ----
const FILES = {
  football: [
    { key:"obos", name:"OBOS-ligaen", file:"data/obos.json" },
    { key:"prem", name:"Premier League", file:"data/premier_league.json" },
    { key:"cl", name:"Champions League", file:"data/champions.json" },
    { key:"laliga", name:"La Liga", file:"data/laliga.json" }
  ],
  handball: [
    { key:"hb_m", name:"Håndball VM 2026 – Menn", file:"data/handball_vm_2026_menn.json" },
    { key:"hb_k", name:"Håndball VM 2026 – Damer", file:"data/handball_vm_2026_damer.json" }
  ],
  wintersport: [
    { key:"ws_m", name:"Vintersport – Menn", file:"data/vintersport_menn.json" },
    { key:"ws_k", name:"Vintersport – Kvinner", file:"data/vintersport_kvinner.json" }
  ],
  vm2026: [
    { key:"vm2026", name:"VM 2026", file:"data/vm2026.json" }
  ],
  events: [
    { key:"events", name:"Events", file:"data/events.json" }
  ]
};

// ---- Normalize different JSON shapes ----
// Vi støtter disse vanligste formatene:
// 1) { "games": [...] }
// 2) { "events": [...] }
// 3) { "items": [...] }
// 4) [...] (array)
function extractItems(obj){
  if (!obj) return [];
  if (Array.isArray(obj)) return obj;
  if (Array.isArray(obj.games)) return obj.games;
  if (Array.isArray(obj.events)) return obj.events;
  if (Array.isArray(obj.items)) return obj.items;
  // fallback: prøv å finne første array
  for (const k of Object.keys(obj)){
    if (Array.isArray(obj[k])) return obj[k];
  }
  return [];
}

// ---- Render sources ----
function renderSources(statusList){
  const wrap = $("sources");
  wrap.innerHTML = "";

  for (const s of statusList){
    const div = document.createElement("div");
    div.className = "source";
    const badgeClass = s.ok ? "ok" : "missing";
    div.innerHTML = `
      <div>
        <div><strong>${escapeHTML(s.name)}</strong></div>
        <small>${escapeHTML(s.file)}</small>
      </div>
      <div class="badge ${badgeClass}">${s.ok ? "OK" : "MANGLER"}</div>
    `;
    wrap.appendChild(div);
  }
}

// ---- Render list ----
function renderList(title, items, days, q){
  $("sectionTitle").textContent = title;

  const list = $("list");
  list.innerHTML = "";

  const qq = (q || "").trim().toLowerCase();

  const filtered = items
    .filter(x => {
      const iso = x.kickoff || x.start || x.datetime || x.date || x.time;
      return withinDays(iso, days);
    })
    .filter(x => {
      if (!qq) return true;
      const blob = JSON.stringify(x).toLowerCase();
      return blob.includes(qq);
    })
    .sort((a,b) => {
      const ta = parseISO(a.kickoff || a.start || a.datetime || a.date || a.time)?.getTime() ?? 0;
      const tb = parseISO(b.kickoff || b.start || b.datetime || b.date || b.time)?.getTime() ?? 0;
      return ta - tb;
    });

  if (!filtered.length){
    const empty = document.createElement("div");
    empty.className = "item";
    empty.innerHTML = `Ingen treff i valgt periode.`;
    list.appendChild(empty);
    return;
  }

  for (const x of filtered){
    const iso = x.kickoff || x.start || x.datetime || x.date || x.time;
    const when = fmtOslo(iso);

    const mainLine =
      x.home && x.away ? `${x.home} – ${x.away}` :
      x.title ? x.title :
      x.name ? x.name :
      "Ukjent";

    const league = x.league || x.competition || x.tournament || "";
    const channel = x.channel || x.tv || x.broadcast || "";
    const where = Array.isArray(x.where) ? x.where.join(", ") :
                  Array.isArray(x.pubs) ? x.pubs.map(p => p.name || p).join(", ") :
                  (x.where || x.place || x.location || "");

    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div class="top">
        <div><strong>${escapeHTML(mainLine)}</strong></div>
        <div class="kv">${escapeHTML(when)}</div>
      </div>
      <div class="meta">
        ${league ? `<span class="kv">${escapeHTML(league)}</span>` : ""}
        ${channel ? `<span class="kv">${escapeHTML(channel)}</span>` : ""}
        ${where ? `<span class="kv">${escapeHTML(where)}</span>` : ""}
      </div>
    `;
    list.appendChild(row);
  }
}

function escapeHTML(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// ---- Load everything ----
let DATA = { status: [], itemsByView: {} };

async function loadAll(){
  const status = [];
  const itemsByView = {};

  for (const view of Object.keys(FILES)){
    itemsByView[view] = [];

    for (const src of FILES[view]){
      try{
        const json = await fetchJSON(src.file);
        const items = extractItems(json);
        status.push({ ...src, ok:true, count: items.length });
        itemsByView[view].push(...items);
      }catch(e){
        console.warn("load failed:", src.file, e);
        status.push({ ...src, ok:false, error: String(e) });
      }
    }
  }

  DATA = { status, itemsByView };
  renderSources(status);

  // Info i footer
  $("buildInfo").textContent = `BASE: ${BASE} • Sist oppdatert: ${new Date().toLocaleString("no-NO")}`;
}

function currentView(){
  return $("viewSelect").value;
}

function updateUI(){
  const view = currentView();
  const days = parseInt($("daysSelect").value, 10);
  const q = $("q").value;

  const titleMap = {
    football:"Fotball",
    handball:"Håndball",
    wintersport:"Vintersport",
    vm2026:"VM 2026",
    events:"Events"
  };

  renderList(titleMap[view] || "Liste", DATA.itemsByView[view] || [], days, q);
}

async function boot(){
  setNetStatus();
  window.addEventListener("online", setNetStatus);
  window.addEventListener("offline", setNetStatus);

  $("refreshBtn").addEventListener("click", async () => {
    await loadAll();
    updateUI();
  });

  $("viewSelect").addEventListener("change", updateUI);
  $("daysSelect").addEventListener("change", updateUI);
  $("q").addEventListener("input", updateUI);

  await loadAll();
  updateUI();
}

boot();
