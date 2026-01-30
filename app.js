// app.js — Grenland Live (Sports loader v2026)
// Uses: data/index.json + data/2026/*.json
// Fixes legacy 404 (data/eliteserien.json etc.)

const TZ = "Europe/Oslo";

function $(id){ return document.getElementById(id); }

async function fetchJson(path){
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return await res.json();
}

function fmtOslo(iso){
  try{
    const d = new Date(iso);
    return d.toLocaleString("no-NO", {
      timeZone: TZ,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }catch(e){
    return iso;
  }
}

function normalizeItems(doc){
  if (!doc) return [];
  if (Array.isArray(doc.items)) return doc.items;
  if (Array.isArray(doc.games)) return doc.games;
  return [];
}

function renderErrorList(errors){
  const el = $("errors");
  if (!el) return;
  if (!errors.length){
    el.style.display = "none";
    el.textContent = "";
    return;
  }
  el.style.display = "block";
  el.textContent = "Noen JSON-filer ble ikke funnet:\n" + errors.join("\n");
}

function renderItems(items){
  const list = $("sportsList");
  if (!list) return;

  list.innerHTML = "";

  if (!items.length){
    list.innerHTML = `<div class="card"><div class="muted">Ingen kamper/arrangementer funnet.</div></div>`;
    return;
  }

  for (const it of items){
    const home = it.home || "";
    const away = it.away || "";
    const title = it.title || (home && away ? `${home} - ${away}` : "Event");
    const when = it.start ? fmtOslo(it.start) : "";
    const league = it.league || "";
    const channel = it.channel || "";
    const where = Array.isArray(it.where) ? it.where.join(", ") : (it.where || "");

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="row">
        <div class="title">${title}</div>
        <div class="muted">${when}</div>
      </div>
      <div class="muted">${league}${channel ? " • " + channel : ""}</div>
      <div class="muted">${where ? "📍 " + where : ""}</div>
    `;
    list.appendChild(card);
  }
}

function byUpcoming(items, days=365){
  const now = Date.now();
  const max = now + days*24*60*60*1000;
  return items
    .filter(it => {
      const t = Date.parse(it.start || "");
      return Number.isFinite(t) && t >= now - 6*60*60*1000 && t <= max;
    })
    .sort((a,b) => Date.parse(a.start) - Date.parse(b.start));
}

async function loadSports(){
  const errors = [];

  // 1) read index.json (single source of truth)
  let index;
  try{
    index = await fetchJson("data/index.json");
  }catch(e){
    renderErrorList([`data/index.json (Error: ${e.message})`]);
    return;
  }

  // 2) load datasets
  const datasets = {};
  const sports = index?.sports || {};

  for (const key of Object.keys(sports)){
    const path = sports[key]?.path;
    if (!path) continue;
    try{
      datasets[key] = await fetchJson(path);
    }catch(e){
      errors.push(`${path} (Error: ${e.message})`);
      datasets[key] = { meta:{}, items:[] };
    }
  }

  renderErrorList(errors);

  // 3) build UI controls
  const sportSel = $("sportSelect");
  const leagueSel = $("leagueSelect");

  const sportOptions = [
    { key:"football", label:"Fotball" },
    { key:"handball_men", label:"Håndball (menn)" },
    { key:"handball_women", label:"Håndball (damer)" },
    { key:"wintersport_men", label:"Vintersport (menn)" },
    { key:"wintersport_women", label:"Vintersport (kvinner)" }
  ].filter(o => sports[o.key]?.path);

  if (sportSel){
    sportSel.innerHTML = sportOptions.map(o => `<option value="${o.key}">${o.label}</option>`).join("");
  }

  function refresh(){
    const sportKey = sportSel ? sportSel.value : "football";

    // leagues only apply to football
    if (leagueSel){
      if (sportKey === "football"){
        const leagues = sports.football?.leagues || [];
        leagueSel.style.display = "inline-block";
        leagueSel.innerHTML = `<option value="">Alle ligaer</option>` + leagues.map(l => `<option value="${l}">${l}</option>`).join("");
      }else{
        leagueSel.style.display = "none";
        leagueSel.innerHTML = "";
      }
    }

    let items = normalizeItems(datasets[sportKey]);
    items = byUpcoming(items, 365);

    if (sportKey === "football" && leagueSel && leagueSel.value){
      const wanted = leagueSel.value;
      items = items.filter(it => it.league === wanted);
    }

    renderItems(items.slice(0, 400));
  }

  if (sportSel) sportSel.addEventListener("change", refresh);
  if (leagueSel) leagueSel.addEventListener("change", refresh);

  refresh();
}

document.addEventListener("DOMContentLoaded", () => {
  loadSports();
});
