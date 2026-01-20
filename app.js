const TZ = "Europe/Oslo";
const END_UTC = Date.parse("2026-12-31T23:59:59Z");

// 1 knapp = 1 fil (slik du vil ha det)
const LEAGUES = [
  { id:"eliteserien", label:"Eliteserien", type:"football", file:"/data/eliteserien.json" },
  { id:"obos", label:"OBOS-ligaen", type:"football", file:"/data/obos.json" },
  { id:"premier", label:"Premier League", type:"football", file:"/data/premier_league.json" },
  { id:"champions", label:"Champions League", type:"football", file:"/data/champions.json" },
  { id:"laliga", label:"La Liga", type:"football", file:"/data/laliga.json" },

  { id:"handM", label:"Håndball VM (Herrer)", type:"handball", file:"/data/handball_vm_2026_menn.json" },
  { id:"handK", label:"Håndball VM (Damer)", type:"handball", file:"/data/handball_vm_2026_damer.json" },

  { id:"winterM", label:"Vintersport (Menn)", type:"wintersport", file:"/data/vintersport_menn.json" },
  { id:"winterK", label:"Vintersport (Kvinner)", type:"wintersport", file:"/data/vintersport_kvinner.json" },

  { id:"vm2026", label:"VM 2026 ⚽", type:"vm", file:"/data/vm2026.json" },
];

let activeId = "eliteserien";
let query = "";

// Cache
const cache = new Map();

// DOM
const leagueButtons = document.getElementById("leagueButtons");
const sectionTitle = document.getElementById("sectionTitle");
const grid = document.getElementById("grid");
const empty = document.getElementById("empty");
const foot = document.getElementById("foot");
const qInput = document.getElementById("q");

// Modal DOM
const modalBack = document.getElementById("modalBack");
const mTitle = document.getElementById("mTitle");
const mBody = document.getElementById("mBody");
const mClose = document.getElementById("mClose");

// ----------------------------
// Nettstatus
// ----------------------------
function setNetStatus(){
  const el = document.getElementById("netStatus");
  const txt = document.getElementById("netTxt");
  const online = navigator.onLine;
  el.classList.toggle("online", online);
  el.classList.toggle("offline", !online);
  txt.textContent = online ? "Online" : "Offline";
}
window.addEventListener("online", setNetStatus);
window.addEventListener("offline", setNetStatus);

// ----------------------------
// Utils
// ----------------------------
function norm(s){ return (s || "").toString().toLowerCase().trim(); }

function fmtOslo(iso){
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Ugyldig dato";
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

function parseTime(anyIso){
  const t = Date.parse(anyIso);
  return Number.isNaN(t) ? null : t;
}

// ALT fra i dag og ut 2026
function inWindow(iso){
  const t = parseTime(iso);
  if (t === null) return false;
  const now = Date.now();
  return t >= (now - 5*60*1000) && t <= END_UTC;
}

async function loadJson(file){
  if (cache.has(file)) return cache.get(file);
  const res = await fetch(file, { cache:"no-store" });
  if (!res.ok) throw new Error(`Kunne ikke laste ${file}`);
  const json = await res.json();
  cache.set(file, json);
  return json;
}

// Støtte både {games:[...]} og [...]
function asArray(obj, keys){
  if (Array.isArray(obj)) return obj;
  for (const k of keys){
    if (obj && Array.isArray(obj[k])) return obj[k];
  }
  return [];
}

// ----------------------------
// Modal
// ----------------------------
function openModal(title, rows){
  mTitle.textContent = title;
  mBody.innerHTML = "";

  for (const r of rows){
    const box = document.createElement("div");
    box.className = "kv";

    const k = document.createElement("div");
    k.className = "k";
    k.textContent = r.k;

    const v = document.createElement("div");
    v.className = "v";

    if (r.type === "list"){
      const ul = document.createElement("ul");
      for (const it of (r.items || [])){
        const li = document.createElement("li");
        li.textContent = it;
        ul.appendChild(li);
      }
      v.appendChild(ul);
    } else {
      v.textContent = r.v ?? "";
    }

    box.appendChild(k);
    box.appendChild(v);
    mBody.appendChild(box);
  }

  modalBack.classList.add("show");
  modalBack.setAttribute("aria-hidden", "false");
}

function closeModal(){
  modalBack.classList.remove("show");
  modalBack.setAttribute("aria-hidden", "true");
}

modalBack.addEventListener("click", (e) => {
  if (e.target === modalBack) closeModal();
});
mClose.addEventListener("click", closeModal);
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

// ----------------------------
// UI: knapper
// ----------------------------
function renderButtons(){
  leagueButtons.innerHTML = "";
  for (const l of LEAGUES){
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn" + (l.id === activeId ? " active" : "");
    b.textContent = l.label;
    b.addEventListener("click", () => {
      activeId = l.id;
      renderButtons();
      render();
    });
    leagueButtons.appendChild(b);
  }
}

// ----------------------------
// Render
// ----------------------------
async function render(){
  setNetStatus();

  const league = LEAGUES.find(x => x.id === activeId) || LEAGUES[0];

  sectionTitle.textContent = `${league.label} – alle events fra i dag → 31.12.2026`;
  grid.innerHTML = "";
  empty.style.display = "none";
  empty.textContent = "";
  foot.textContent = "";

  try{
    const data = await loadJson(league.file);
    let items = [];

    // FOOTBALL / HANDBALL
    if (league.type === "football" || league.type === "handball"){
      const games = asArray(data, ["games", "matches"]);
      items = games
        .filter(g => inWindow(g.kickoff || g.start || g.time))
        .filter(g => {
          if (!query) return true;
          const s = norm(`${g.home||""} ${g.away||""} ${g.channel||""} ${(g.where||[]).join(" ")} ${g.league||""}`);
          return s.includes(query);
        })
        .sort((a,b) => (parseTime(a.kickoff||a.start||a.time) ?? 0) - (parseTime(b.kickoff||b.start||b.time) ?? 0))
        .map(g => ({
          kind: league.type,
          title: `${g.home || "TBA"} – ${g.away || "TBA"}`,
          when: g.kickoff || g.start || g.time,
          channel: g.channel || "Ukjent kanal",
          where: Array.isArray(g.where) ? g.where : []
        }));
    }

    // WINTERSPORT
    if (league.type === "wintersport"){
      const events = asArray(data, ["events", "items"]);
      items = events
        .filter(e => inWindow(e.start || e.time))
        .filter(e => {
          if (!query) return true;
          const s = norm(`${e.sport||""} ${e.event||""} ${e.location||""} ${e.channel||""}`);
          return s.includes(query);
        })
        .sort((a,b) => (parseTime(a.start||a.time) ?? 0) - (parseTime(b.start||b.time) ?? 0))
        .map(e => ({
          kind: "wintersport",
          title: `${e.sport || "Vintersport"} – ${e.event || "Event"}`,
          when: e.start || e.time,
          location: e.location || "",
          channel: e.channel || "Ukjent kanal"
        }));
    }

    // VM 2026 (hele kalenderen i 2026)
    if (league.type === "vm"){
      const matches = asArray(data, ["matches", "games"]);
      items = matches
        .filter(m => {
          const t = parseTime(m.kickoff || m.start || m.time);
          if (t === null) return false;
          const d = new Date(t);
          return d.getUTCFullYear() === 2026; // hele VM-kalenderen 2026
        })
        .filter(m => {
          if (!query) return true;
          const s = norm(`${m.group||""} ${m.home||""} ${m.away||""} ${m.city||""} ${m.stadium||""} ${m.channel||""}`);
          return s.includes(query);
        })
        .sort((a,b) => (parseTime(a.kickoff||a.start||a.time) ?? 0) - (parseTime(b.kickoff||b.start||b.time) ?? 0))
        .map(m => ({
          kind: "vm",
          title: `${m.home || "TBA"} – ${m.away || "TBA"}`,
          when: m.kickoff || m.start || m.time,
          group: m.group || "",
          stadium: m.stadium || "",
          city: m.city || "",
          channel: m.channel || "Ukjent kanal"
        }));

      sectionTitle.textContent = `${league.label} – hele kalenderen 2026 (norsk tid)`;
    }

    if (items.length === 0){
      empty.style.display = "block";
      empty.textContent = "Ingen treff i perioden (fra i dag → 31.12.2026).";
      foot.textContent = "Sjekk at dato/tid er ISO-format i JSON (f.eks. 2026-05-16T16:00:00+02:00).";
      return;
    }

    for (const it of items){
      const card = document.createElement("div");
      card.className = "card";

      const row1 = document.createElement("div");
      row1.className = "row1";

      const left = document.createElement("div");
      const match = document.createElement("div");
      match.className = "match";
      match.textContent = it.title;

      const time = document.createElement("div");
      time.className = "time";
      time.textContent = fmtOslo(it.when);

      left.appendChild(match);
      left.appendChild(time);

      const meta = document.createElement("div");
      meta.className = "meta";

      const pill1 = document.createElement("span");
      pill1.className = "pill soft";
      pill1.textContent = it.kind === "wintersport" ? "Event" : (it.kind === "vm" ? (it.group ? `Gruppe ${it.group}` : "VM") : "Kamp");

      const pill2 = document.createElement("span");
      pill2.className = "pill";
      pill2.textContent = it.channel;

      meta.appendChild(pill1);
      meta.appendChild(pill2);

      row1.appendChild(left);
      row1.appendChild(meta);
      card.appendChild(row1);

      card.addEventListener("click", () => {
        if (it.kind === "football" || it.kind === "handball"){
          openModal(it.title, [
            { k:"Dato", v: fmtOslo(it.when) },
            { k:"Kanal", v: it.channel },
            { k:"Vises på", type:"list", items: (it.where && it.where.length) ? it.where : ["Ingen puber lagt inn ennå"] }
          ]);
        } else if (it.kind === "wintersport"){
          openModal(it.title, [
            { k:"Dato", v: fmtOslo(it.when) },
            { k:"Sted", v: it.location || "Ukjent" },
            { k:"Kanal", v: it.channel }
          ]);
        } else if (it.kind === "vm"){
          openModal(it.title, [
            { k:"Dato", v: fmtOslo(it.when) },
            { k:"Gruppe", v: it.group || "Ukjent" },
            { k:"By", v: it.city || "Ukjent" },
            { k:"Stadion", v: it.stadium || "Ukjent" },
            { k:"Kanal", v: it.channel }
          ]);
        }
      });

      grid.appendChild(card);
    }

    foot.textContent = `Viser ${items.length} stk. Klikk på kamp/event for detaljer. Alle tider i norsk tid (Europe/Oslo).`;

  } catch (err){
    empty.style.display = "block";
    empty.textContent = "Feil: " + (err?.message || "Ukjent feil");
    foot.textContent = "Sjekk at filene ligger i /data/ og at JSON er gyldig.";
  }
}

// Events
qInput.addEventListener("input", (e) => {
  query = norm(e.target.value);
  render();
});

// Start
renderButtons();
setNetStatus();
render();
