/* Grenland Live Sport – viser ALT fra i dag til 31.12.2026 (Europe/Oslo)
   - Ingen 15/30
   - Ingen "Alle puber" dropdown
   - Klikk på kort = detalj (kanal + puber + sted osv.)
*/

const TZ = "Europe/Oslo";

const END_2026 = new Date("2026-12-31T23:59:59+01:00");

const LEAGUES = [
  { id:"eliteserien", label:"Eliteserien", type:"football", file:"./data/eliteserien.json", defaultChannel:"TV 2 / TV 2 Play" },
  { id:"obos", label:"OBOS-ligaen", type:"football", file:"./data/obos.json", defaultChannel:"TV 2 / TV 2 Play" },

  { id:"premier", label:"Premier League", type:"football", file:"./data/premier_league.json", defaultChannel:"Viaplay / V Sport" },
  { id:"champions", label:"Champions League", type:"football", file:"./data/champions.json", defaultChannel:"TV 2 / TV 2 Play" },
  { id:"laliga", label:"La Liga", type:"football", file:"./data/laliga.json", defaultChannel:"TV 2 / TV 2 Play" },

  { id:"handM", label:"Håndball VM (M)", type:"handball", file:"./data/handball_vm_2026_menn.json" },
  { id:"handK", label:"Håndball VM (K)", type:"handball", file:"./data/handball_vm_2026_damer.json" },

  { id:"winterM", label:"Vintersport (M)", type:"wintersport", file:"./data/vintersport_menn.json", gender:"Menn" },
  { id:"winterK", label:"Vintersport (K)", type:"wintersport", file:"./data/vintersport_kvinner.json", gender:"Kvinner" },

  { id:"vm2026", label:"VM 2026 ⚽", type:"vm", file:"./data/vm2026.json" },
];

let activeLeagueId = "eliteserien";
let cache = new Map();

const elButtons = document.getElementById("leagueButtons");
const elGrid = document.getElementById("grid");
const elEmpty = document.getElementById("empty");
const elQ = document.getElementById("q");
const elSectionTitle = document.getElementById("sectionTitle");
const elRangeSubtitle = document.getElementById("rangeSubtitle");

const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
document.getElementById("modalClose").addEventListener("click", () => modal.close());

function setNetStatus(){
  const online = navigator.onLine;
  const ns = document.getElementById("netStatus");
  const nt = document.getElementById("netTxt");
  ns.classList.toggle("online", online);
  ns.classList.toggle("offline", !online);
  nt.textContent = online ? "Online" : "Offline";
}
window.addEventListener("online", setNetStatus);
window.addEventListener("offline", setNetStatus);

function fmtOslo(iso){
  const d = new Date(iso);
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

function norm(s){ return (s||"").toString().trim().toLowerCase(); }

function nowOslo(){
  // JS Date er UTC-basert, men "nå" er ok. Vi filtrerer med absolutt tid.
  return new Date();
}

function withinTodayToEnd(iso){
  const t = new Date(iso);
  return t >= nowOslo() && t <= END_2026;
}

function asArray(data, keys){
  if (!data) return [];
  for (const k of keys){
    if (Array.isArray(data[k])) return data[k];
  }
  if (Array.isArray(data)) return data;
  return [];
}

function leagueById(id){
  return LEAGUES.find(x => x.id === id) || LEAGUES[0];
}

function makeButtons(){
  elButtons.innerHTML = "";
  for (const l of LEAGUES){
    const b = document.createElement("button");
    b.className = "btn" + (l.id === activeLeagueId ? " on" : "");
    b.textContent = l.label;
    b.addEventListener("click", () => {
      activeLeagueId = l.id;
      [...elButtons.querySelectorAll(".btn")].forEach(x => x.classList.remove("on"));
      b.classList.add("on");
      render();
    });
    elButtons.appendChild(b);
  }
}

async function loadJson(path){
  if (cache.has(path)) return cache.get(path);
  const p = fetch(path, { cache:"no-store" }).then(r => {
    if (!r.ok) throw new Error(`Kunne ikke laste ${path}`);
    return r.json();
  });
  cache.set(path, p);
  return p;
}

function buildCard(item){
  const card = document.createElement("div");
  card.className = "card";
  card.addEventListener("click", () => openModal(item));

  const top = document.createElement("div");
  top.className = "cardTop";

  const left = document.createElement("div");
  const title = document.createElement("div");
  title.className = "cardTitle";
  title.textContent = item.title;

  const meta = document.createElement("div");
  meta.className = "cardMeta";
  meta.innerHTML = `
    <div>🕒 ${item.whenTxt}</div>
    ${item.placeTxt ? `<div>📍 ${item.placeTxt}</div>` : ""}
  `;

  left.appendChild(title);
  left.appendChild(meta);

  top.appendChild(left);
  card.appendChild(top);

  const pills = document.createElement("div");
  pills.className = "pills";

  if (item.channel){
    const p = document.createElement("div");
    p.className = "pill";
    p.textContent = `📺 ${item.channel}`;
    pills.appendChild(p);
  }

  if (item.leagueLabel){
    const p = document.createElement("div");
    p.className = "pill";
    p.textContent = item.leagueLabel;
    pills.appendChild(p);
  }

  card.appendChild(pills);
  return card;
}

function openModal(item){
  modalTitle.textContent = item.title;

  const pubs = (item.where && item.where.length) ? item.where : [];
  const extra = [];

  if (item.group) extra.push(row("Gruppe", item.group));
  if (item.stadium) extra.push(row("Stadion", item.stadium));
  if (item.city) extra.push(row("By", item.city));
  if (item.sport) extra.push(row("Sport", item.sport));
  if (item.gender) extra.push(row("Kjønn", item.gender));

  modalBody.innerHTML = `
    ${row("Tid (Norge)", item.whenTxt)}
    ${item.channel ? row("TV / Streaming", item.channel) : ""}
    ${item.placeTxt ? row("Sted", item.placeTxt) : ""}
    ${pubs.length ? `<div class="row"><div class="lbl">Hvor vises kampen?</div><div class="val"><ul>${pubs.map(p=>`<li>${p}</li>`).join("")}</ul></div></div>` : ""}
    ${extra.join("")}
  `;

  modal.showModal();
}

function row(lbl, val){
  return `<div class="row"><div class="lbl">${lbl}</div><div class="val">${val}</div></div>`;
}

function mapFootballGames(data, league){
  const games = asArray(data, ["games", "matches", "items"]);
  const list = [];

  for (const g of games){
    const kickoff = g.kickoff || g.start || g.time;
    if (!kickoff) continue;
    if (!withinTodayToEnd(kickoff)) continue;

    const home = g.home || g.teamHome || g.h;
    const away = g.away || g.teamAway || g.a;
    const title = home && away ? `${home} – ${away}` : (g.title || "Kamp");

    const channel = g.channel || league.defaultChannel || "";
    const where = Array.isArray(g.where) ? g.where : (Array.isArray(g.pubs) ? g.pubs.map(x=>x.name||x) : []);

    list.push({
      kind:"football",
      title,
      whenISO:kickoff,
      whenTxt: fmtOslo(kickoff),
      placeTxt: g.venue || g.stadium || "",
      channel,
      where,
      leagueLabel: league.label
    });
  }

  list.sort((a,b) => new Date(a.whenISO) - new Date(b.whenISO));
  return list;
}

function mapHandball(data, league){
  const matches = asArray(data, ["matches", "games", "items"]);
  const list = [];

  for (const m of matches){
    const t = m.kickoff || m.start || m.time;
    if (!t) continue;
    if (!withinTodayToEnd(t)) continue;

    const title = (m.home && m.away) ? `${m.home} – ${m.away}` : (m.title || "Kamp");
    list.push({
      kind:"handball",
      title,
      whenISO:t,
      whenTxt: fmtOslo(t),
      placeTxt: m.venue || m.city || "",
      channel: m.channel || "",
      where: Array.isArray(m.where) ? m.where : [],
      leagueLabel: league.label
    });
  }

  list.sort((a,b) => new Date(a.whenISO) - new Date(b.whenISO));
  return list;
}

function mapWinter(data, league){
  const events = asArray(data, ["events", "items"]);
  const list = [];

  for (const e of events){
    const t = e.start || e.time;
    if (!t) continue;
    if (!withinTodayToEnd(t)) continue;

    // hvis noen har blandet kjønn i samme fil:
    if (league.gender && e.gender && e.gender !== league.gender) continue;

    const title = `${e.sport || "Vintersport"} – ${e.event || "Event"}`;

    list.push({
      kind:"wintersport",
      title,
      whenISO:t,
      whenTxt: fmtOslo(t),
      placeTxt: e.location || e.place || "",
      channel: e.channel || "",
      sport: e.sport || "",
      gender: e.gender || league.gender || "",
      leagueLabel: league.label
    });
  }

  list.sort((a,b) => new Date(a.whenISO) - new Date(b.whenISO));
  return list;
}

function mapVm(data, league){
  const matches = asArray(data, ["matches", "games", "items"]);
  const list = [];

  for (const m of matches){
    const t = m.kickoff || m.start || m.time;
    if (!t) continue;
    if (!withinTodayToEnd(t)) continue;

    const title = (m.home && m.away) ? `${m.home} – ${m.away}` : (m.title || "Kamp");

    list.push({
      kind:"vm",
      title,
      whenISO:t,
      whenTxt: fmtOslo(t),
      channel: m.channel || "",
      group: m.group || "",
      city: m.city || "",
      stadium: m.stadium || "",
      leagueLabel: league.label
    });
  }

  list.sort((a,b) => new Date(a.whenISO) - new Date(b.whenISO));
  return list;
}

function applySearch(items, query){
  const q = norm(query);
  if (!q) return items;
  return items.filter(x => {
    const blob = norm(`${x.title} ${x.placeTxt||""} ${x.channel||""} ${(x.where||[]).join(" ")} ${x.group||""} ${x.city||""} ${x.stadium||""} ${x.sport||""} ${x.gender||""}`);
    return blob.includes(q);
  });
}

async function render(){
  setNetStatus();

  const from = nowOslo();
  const fromTxt = from.toLocaleDateString("no-NO", { timeZone: TZ, year:"numeric", month:"2-digit", day:"2-digit" });
  elRangeSubtitle.textContent = `Viser fra ${fromTxt} til 31.12.2026 (Norge-tid)`;

  const league = leagueById(activeLeagueId);
  elSectionTitle.textContent = league.label;

  let data;
  try{
    data = await loadJson(league.file);
  }catch(e){
    elGrid.innerHTML = "";
    elEmpty.style.display = "block";
    elEmpty.textContent = `Kunne ikke laste ${league.file}.`;
    return;
  }

  let items = [];
  if (league.type === "football") items = mapFootballGames(data, league);
  if (league.type === "handball") items = mapHandball(data, league);
  if (league.type === "wintersport") items = mapWinter(data, league);
  if (league.type === "vm") items = mapVm(data, league);

  items = applySearch(items, elQ.value);

  elGrid.innerHTML = "";
  if (!items.length){
    elEmpty.style.display = "block";
    elEmpty.textContent = "Ingen treff.";
    return;
  }
  elEmpty.style.display = "none";

  for (const it of items){
    elGrid.appendChild(buildCard(it));
  }
}

elQ.addEventListener("input", () => render());

makeButtons();
render();

// PWA – valgfritt
if ("serviceWorker" in navigator){
  navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
}
