const TZ = "Europe/Oslo";
const END = new Date("2026-12-31T23:59:59+01:00");

// 🔘 ÉN KNAPP = ÉN FIL
const LEAGUES = [
  { id:"eliteserien", label:"Eliteserien", file:"data/eliteserien.json", key:"games" },
  { id:"obos", label:"OBOS-ligaen", file:"data/obos.json", key:"games" },
  { id:"premier", label:"Premier League", file:"data/premier_league.json", key:"games" },
  { id:"champions", label:"Champions League", file:"data/champions.json", key:"games" },
  { id:"laliga", label:"La Liga", file:"data/laliga.json", key:"games" },

  { id:"handM", label:"Håndball VM (Herrer)", file:"data/handball_vm_2026_menn.json", key:"games" },
  { id:"handK", label:"Håndball VM (Damer)", file:"data/handball_vm_2026_damer.json", key:"games" },

  { id:"winterM", label:"Vintersport (Menn)", file:"data/vintersport_menn.json", key:"events" },
  { id:"winterK", label:"Vintersport (Kvinner)", file:"data/vintersport_kvinner.json", key:"events" },

  { id:"vm2026", label:"VM 2026 ⚽", file:"data/vm2026.json", key:"matches" }
];

const btnWrap = document.getElementById("leagueButtons");
const list = document.getElementById("list");

let active = LEAGUES[0];

// 🕒 Format dato i norsk tid
function fmt(iso){
  const d = new Date(iso);
  return d.toLocaleString("no-NO", {
    timeZone: TZ,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// 🔘 Lag knapper
function buildButtons(){
  btnWrap.innerHTML = "";
  LEAGUES.forEach(l => {
    const b = document.createElement("button");
    b.textContent = l.label;
    b.className = l.id === active.id ? "active" : "";
    b.onclick = () => {
      active = l;
      buildButtons();
      load();
    };
    btnWrap.appendChild(b);
  });
}

// 📥 Hent JSON (alltid ferskt)
async function load(){
  list.innerHTML = "Laster…";

  try{
    const res = await fetch(active.file + "?t=" + Date.now(), { cache:"no-store" });
    const json = await res.json();
    const arr = json[active.key] || [];

    const now = new Date();

    const future = arr
      .filter(x => x.kickoff || x.start)
      .map(x => ({
        ...x,
        when: new Date(x.kickoff || x.start)
      }))
      .filter(x => x.when >= now && x.when <= END)
      .sort((a,b) => a.when - b.when);

    if (!future.length){
      list.innerHTML = "<p class='empty'>Ingen kommende arrangementer</p>";
      return;
    }

    list.innerHTML = "";

    future.forEach(x => {
      const card = document.createElement("div");
      card.className = "card";

      const title = x.home
        ? `<strong>${x.home} – ${x.away}</strong>`
        : `<strong>${x.event || x.sport || "Event"}</strong>`;

      card.innerHTML = `
        ${title}
        <div class="time">${fmt(x.when)}</div>
        ${x.channel ? `<div class="tv">📺 ${x.channel}</div>` : ""}
        ${x.where && x.where.length ? `<div class="where">📍 ${x.where.join(", ")}</div>` : ""}
      `;

      list.appendChild(card);
    });

  } catch(e){
    list.innerHTML = "<p class='error'>Kunne ikke laste data</p>";
    console.error(e);
  }
}

// 🚀 Start
buildButtons();
load();
