const CAL_TZ = "Europe/Oslo";
function c$(id){ return document.getElementById(id); }

function dateKey(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function parseRoot(json){
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.items)) return json.items;
  if (json && Array.isArray(json.events)) return json.events;
  if (json && Array.isArray(json.games)) return json.games;
  return [];
}

function dot(type){
  const t = String(type||"").toLowerCase();
  if (t.includes("fotball") || t.includes("football") || t.includes("soccer")) return "🔴";
  if (t.includes("håndball") || t.includes("handball")) return "🟡";
  if (t.includes("vintersport") || t.includes("winter") || t.includes("ski")) return "🟢";
  return "•";
}

function title(it){
  return it.title || it.name || (it.home && it.away ? `${it.home} – ${it.away}` : "Event");
}

function timeOnly(iso){
  if (!iso) return "Ukjent";
  try {
    return new Date(iso).toLocaleString("no-NO", { timeZone: CAL_TZ, hour:"2-digit", minute:"2-digit" });
  } catch { return "Ukjent"; }
}

async function fetchJson(path){
  const r = await fetch(`${path}?v=${Date.now()}`, { cache:"no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${path}`);
  return r.json();
}

function buildGrid(y,m){
  const first = new Date(y,m,1);
  const last = new Date(y,m+1,0);
  const start = (first.getDay()+6)%7; // man=0
  const days = last.getDate();
  const cells = [];
  for(let i=0;i<start;i++) cells.push(null);
  for(let d=1;d<=days;d++) cells.push(new Date(y,m,d));
  while(cells.length%7!==0) cells.push(null);
  return cells;
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}

function renderSide(key, items){
  c$("calendarPicked").textContent = key;
  const list = c$("calendarList");
  list.innerHTML = "";

  if (!items || !items.length) {
    list.innerHTML = `<div class="empty">Ingen elementer.</div>`;
    return;
  }

  for (const it of items) {
    const div = document.createElement("div");
    div.className = "list-item";
    div.innerHTML = `
      <div class="li-main">
        <div class="li-title">${escapeHtml(dot(it.type||it.sport) + " " + title(it))}</div>
        <div class="li-sub muted">${escapeHtml(timeOnly(it.start||it.kickoff||it.date) + " · " + (it.channel||it.tv||"Ukjent"))}</div>
      </div>
    `;
    list.appendChild(div);
  }
}

function renderMonth(root, y, m, map){
  const names = ["Januar","Februar","Mars","April","Mai","Juni","Juli","August","September","Oktober","November","Desember"];
  const wrap = document.createElement("div");
  wrap.className = "cal-month";

  const head = document.createElement("div");
  head.className = "cal-head";
  head.textContent = `${names[m]} ${y}`;
  wrap.appendChild(head);

  const dow = document.createElement("div");
  dow.className = "cal-dow";
  dow.innerHTML = `<div>Man</div><div>Tir</div><div>Ons</div><div>Tor</div><div>Fre</div><div>Lør</div><div>Søn</div>`;
  wrap.appendChild(dow);

  const grid = document.createElement("div");
  grid.className = "cal-grid";

  for (const d of buildGrid(y,m)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cal-cell";

    if (!d) {
      btn.classList.add("cal-empty");
      btn.disabled = true;
      btn.innerHTML = `<span class="cal-day"></span>`;
    } else {
      const key = dateKey(d);
      const items = map.get(key) || [];
      const dots = items.slice(0,6).map(it => dot(it.type||it.sport)).join("");
      btn.innerHTML = `<span class="cal-day">${d.getDate()}</span><span class="cal-dots">${dots}</span>`;
      btn.addEventListener("click", () => renderSide(key, items));
    }
    grid.appendChild(btn);
  }

  wrap.appendChild(grid);
  root.appendChild(wrap);
}

document.addEventListener("DOMContentLoaded", async () => {
  const root = c$("calendarRoot");
  if (!root) return;

  root.innerHTML = `<div class="empty">Laster kalender…</div>`;

  try {
    const json = await fetchJson("data/2026/calendar_feed.json");
    const arr = parseRoot(json);

    const map = new Map();
    for (const it of arr) {
      const iso = it.start || it.kickoff || it.date || it.datetime || "";
      if (!iso) continue;
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) continue;
      const key = dateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
      const list = map.get(key) || [];
      list.push(it);
      map.set(key, list);
    }

    for (const [k,list] of map.entries()) {
      list.sort((a,b)=> (Date.parse(a.start||a.kickoff||a.date||"")||0)-(Date.parse(b.start||b.kickoff||b.date||"")||0));
      map.set(k,list);
    }

    root.innerHTML = "";
    for (let m=0;m<12;m++) renderMonth(root, 2026, m, map);
  } catch (e) {
    root.innerHTML = `<div class="empty">Kunne ikke laste /data/2026/calendar_feed.json</div>`;
    console.error(e);
  }
});
