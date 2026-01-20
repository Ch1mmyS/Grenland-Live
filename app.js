const TZ = "Europe/Oslo";

// Vis fra i dag til slutten av 2026 (som du ba om)
function endOf2026Ms(){
  return new Date("2026-12-31T23:59:59+01:00").getTime();
}
function todayMs(){
  const now = new Date();
  // liten buffer: ta med kamper som starter “nå nettopp”
  return now.getTime() - (5 * 60 * 1000);
}

const LEAGUES = [
  { id:"eliteserien", label:"Eliteserien", feed:"eliteserien" },
  { id:"obos", label:"OBOS-ligaen", feed:"obos" },
  { id:"premier", label:"Premier League", feed:"premier_league" },

  // Disse står klare – men må ha offisielle kilder / avtale / nøkkel for “kanal”.
  // Foreløpig returnerer feedene tom liste, men UI/struktur er ferdig.
  { id:"champions", label:"Champions League", feed:"champions" },
  { id:"laliga", label:"La Liga", feed:"laliga" },

  { id:"handM", label:"Håndball VM (M)", feed:"handball_menn" },
  { id:"handK", label:"Håndball VM (K)", feed:"handball_kvinner" },

  { id:"winterM", label:"Vintersport (M)", feed:"vintersport_menn" },
  { id:"winterK", label:"Vintersport (K)", feed:"vintersport_kvinner" },

  { id:"vm2026", label:"VM 2026 ⚽", feed:"vm2026" },
];

let activeId = "eliteserien";
let query = "";

const leagueButtons = document.getElementById("leagueButtons");
const sectionTitle = document.getElementById("sectionTitle");
const grid = document.getElementById("grid");
const empty = document.getElementById("empty");
const foot = document.getElementById("foot");
const qInput = document.getElementById("q");

// Modal
const modalBack = document.getElementById("modalBack");
const mTitle = document.getElementById("mTitle");
const mBody = document.getElementById("mBody");
const mClose = document.getElementById("mClose");

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

function inRange(iso){
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return t >= todayMs() && t <= endOf2026Ms();
}

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
modalBack.addEventListener("click", (e) => { if (e.target === modalBack) closeModal(); });
mClose.addEventListener("click", closeModal);
window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

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

// Hent via Netlify function: /.netlify/functions/feed?kind=...
async function fetchFeed(kind){
  const res = await fetch(`/.netlify/functions/feed?kind=${encodeURIComponent(kind)}`, { cache:"no-store" });
  if (!res.ok) throw new Error("Kunne ikke hente feed: " + kind);
  return await res.json();
}

async function render(){
  setNetStatus();

  const league = LEAGUES.find(x => x.id === activeId) || LEAGUES[0];
  sectionTitle.textContent = `${league.label} – fra i dag → 31.12.2026`;
  grid.innerHTML = "";
  empty.style.display = "none";
  empty.textContent = "";
  foot.textContent = "";

  try{
    const data = await fetchFeed(league.feed);

    // Normalisert format fra backend:
    // { items: [{ title, start, channel?, where?, extra? }] }
    let items = Array.isArray(data.items) ? data.items : [];

    items = items
      .filter(x => inRange(x.start))
      .filter(x => {
        if (!query) return true;
        const s = norm(`${x.title||""} ${x.channel||""} ${(x.where||[]).join(" ")} ${x.location||""} ${x.group||""}`);
        return s.includes(query);
      })
      .sort((a,b) => new Date(a.start) - new Date(b.start));

    if (items.length === 0){
      empty.style.display = "block";
      empty.textContent = "Ingen kamper/events funnet i perioden.";
      foot.textContent = "Hvis dette er en turnering uten offisiell åpen feed, må vi legge inn kilde eller API-nøkkel.";
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
      time.textContent = fmtOslo(it.start);

      left.appendChild(match);
      left.appendChild(time);

      const meta = document.createElement("div");
      meta.className = "meta";

      const pill1 = document.createElement("span");
      pill1.className = "pill soft";
      pill1.textContent = it.tag || "Event";

      const pill2 = document.createElement("span");
      pill2.className = "pill";
      pill2.textContent = it.channel || "Kanal: ikke oppgitt";

      meta.appendChild(pill1);
      meta.appendChild(pill2);

      row1.appendChild(left);
      row1.appendChild(meta);
      card.appendChild(row1);

      card.addEventListener("click", () => {
        openModal(it.title, [
          { k:"Dato", v: fmtOslo(it.start) },
          { k:"Kanal", v: it.channel || "Ikke oppgitt i offisiell kilde" },
          { k:"Sted", v: it.location || "—" },
          { k:"Info", v: it.info || "—" },
          { k:"Vises på", type:"list", items: (it.where && it.where.length) ? it.where : ["Klikk-kamp viser puber (legg inn hvor dere viser den)"] }
        ]);
      });

      grid.appendChild(card);
    }

    foot.textContent = "Alle tider vises i norsk tid (Europe/Oslo). Klikk på en kamp for detaljer.";
  } catch (err){
    empty.style.display = "block";
    empty.textContent = "Feil: " + (err?.message || "Ukjent feil");
    foot.textContent = "Sjekk at Netlify function feed finnes og at kind=... matcher.";
  }
}

qInput.addEventListener("input", (e) => { query = norm(e.target.value); render(); });

// start
renderButtons();
setNetStatus();
render();
