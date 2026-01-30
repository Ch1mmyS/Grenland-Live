// app.js — Grenland Live (SPORT FIX 2026)

const TZ = "Europe/Oslo";

function $(id){ return document.getElementById(id); }

async function fetchJsonSafe(path){
  try{
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  }catch(e){
    return null; // <- ALDRI kast, aldri stopp UI
  }
}

function fmtOslo(iso){
  try{
    return new Date(iso).toLocaleString("no-NO", {
      timeZone: TZ,
      weekday:"short",
      day:"2-digit",
      month:"2-digit",
      hour:"2-digit",
      minute:"2-digit"
    });
  }catch{
    return iso;
  }
}

function showSport(){
  $("sportSection").style.display = "block";
}

async function loadSport(){
  showSport();

  const errors = [];
  const datasets = {
    football: await fetchJsonSafe("data/2026/football.json"),
    handball_men: await fetchJsonSafe("data/2026/handball_men.json"),
    handball_women: await fetchJsonSafe("data/2026/handball_women.json"),
    wintersport_men: await fetchJsonSafe("data/2026/wintersport_men.json"),
    wintersport_women: await fetchJsonSafe("data/2026/wintersport_women.json")
  };

  for (const k in datasets){
    if (!datasets[k]) errors.push(k);
  }

  $("sportErrors").textContent =
    errors.length
      ? "⚠️ Mangler data for: " + errors.join(", ")
      : "";

  const sportSel = $("sportSelect");
  const leagueSel = $("leagueSelect");

  function render(){
    const key = sportSel.value;
    const doc = datasets[key];
    const list = $("sportList");
    list.innerHTML = "";

    if (!doc || !Array.isArray(doc.items)){
      list.innerHTML = "<div>Ingen data tilgjengelig.</div>";
      return;
    }

    let items = doc.items.slice();

    if (key === "football"){
      const leagues = [...new Set(items.map(i => i.league).filter(Boolean))];
      leagueSel.style.display = "inline-block";
      leagueSel.innerHTML =
        `<option value="">Alle ligaer</option>` +
        leagues.map(l => `<option value="${l}">${l}</option>`).join("");

      if (leagueSel.value){
        items = items.filter(i => i.league === leagueSel.value);
      }
    }else{
      leagueSel.style.display = "none";
    }

    items
      .sort((a,b)=> new Date(a.start)-new Date(b.start))
      .slice(0,300)
      .forEach(it=>{
        const title = it.home && it.away
          ? `${it.home} – ${it.away}`
          : it.title || "Event";

        const div = document.createElement("div");
        div.className = "card";
        div.innerHTML = `
          <strong>${title}</strong><br>
          ${fmtOslo(it.start)}<br>
          <span class="muted">${it.league || ""} ${it.channel || ""}</span>
        `;
        list.appendChild(div);
      });
  }

  sportSel.onchange = render;
  leagueSel.onchange = render;
  render();
}

// MENY-KOBLING (VIKTIG)
document.addEventListener("DOMContentLoaded", ()=>{
  const sportBtn = document.querySelector("[data-open='sport']");
  if (sportBtn){
    sportBtn.onclick = loadSport;
  }
});
