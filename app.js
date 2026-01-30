// app.js – Grenland Live (SAFE RESTORE – FIXED)

window.__GL_APP_OK__ = false; // settes true når alt er koblet

const TZ = "Europe/Oslo";

function $(id){ return document.getElementById(id); }
function show(el){ el.classList.remove("hidden"); }
function hide(el){ el.classList.add("hidden"); }

// ---------- TIME ----------
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
    return iso || "";
  }
}

// ---------- FETCH ----------
async function fetchJsonSafe(url){
  try{
    const res = await fetch(url, { cache:"no-store" });
    if (!res.ok) throw new Error(res.status);
    return { ok:true, data: await res.json() };
  }catch(e){
    return { ok:false, error:e.message };
  }
}

function normalizeItems(doc){
  if (!doc) return [];
  if (Array.isArray(doc.items)) return doc.items;
  if (Array.isArray(doc.games)) return doc.games;
  return [];
}

// ---------- MODAL ----------
function openModal(it){
  $("modalTitle").textContent =
    it.home && it.away ? `${it.home} – ${it.away}` : (it.title || "Event");
  $("modalTime").textContent = it.start ? fmtOslo(it.start) : "Ukjent";
  $("modalChannel").textContent = it.channel || "Ukjent";

  const pubs = Array.isArray(it.where) ? it.where : ["Vikinghjørnet","Gimle Pub"];
  const wrap = $("modalPubs");
  wrap.innerHTML = "";
  pubs.forEach(p=>{
    const s = document.createElement("span");
    s.className = "tag";
    s.textContent = p;
    wrap.appendChild(s);
  });

  $("modalBack").classList.add("show");
}

function closeModal(){
  $("modalBack").classList.remove("show");
}

// ---------- SPORT ----------
async function showSport(){
  $("panelH2").textContent = "Sport";
  $("panelMeta").textContent = "2026";
  $("list").innerHTML = "";

  const r = await fetchJsonSafe("data/2026/football.json");

  if (!r.ok){
    $("list").innerHTML = `
      <div class="item">
        <strong>⚠️ Kunne ikke laste sport</strong><br>
        data/2026/football.json (${r.error})
      </div>
    `;
    return;
  }

  const items = normalizeItems(r.data)
    .sort((a,b)=> new Date(a.start)-new Date(b.start))
    .slice(0,200);

  if (!items.length){
    $("list").innerHTML = `<div class="item">Ingen kamper funnet</div>`;
    return;
  }

  items.forEach(it=>{
    const div = document.createElement("div");
    div.className = "item clickable";
    div.innerHTML = `
      <div class="itemTop">
        <div class="itemTitle">
          ${it.home && it.away ? `${it.home} – ${it.away}` : (it.title || "Event")}
        </div>
        <div class="meta">${it.start ? fmtOslo(it.start) : ""}</div>
      </div>
      <div class="tagRow">
        <span class="tag">${it.league || "Ukjent"}</span>
        <span class="tag">${it.channel || "Ukjent kanal"}</span>
      </div>
    `;
    div.addEventListener("click", ()=> openModal(it));
    $("list").appendChild(div);
  });
}

// ---------- PUBER ----------
function showPuber(){
  $("panelH2").textContent = "Puber";
  $("panelMeta").textContent = "";
  $("list").innerHTML = "<div class='item'>Puber-visning OK</div>";
}

// ---------- EVENTER ----------
function showEvents(){
  $("panelH2").textContent = "Eventer";
  $("panelMeta").textContent = "";
  $("list").innerHTML = "<div class='item'>Eventer-visning OK</div>";
}

// ---------- NAV ----------
function goApp(tab){
  hide($("home"));
  show($("app"));

  if (tab === "sport") showSport();
  if (tab === "puber") showPuber();
  if (tab === "events") showEvents();
}

function goHome(){
  hide($("app"));
  show($("home"));
}

// ---------- WIRE ----------
document.addEventListener("DOMContentLoaded", ()=>{
  // Modal
  $("modalClose").onclick = closeModal;
  $("modalBack").onclick = e => { if (e.target.id==="modalBack") closeModal(); };

  // Forside-knapper
  document.querySelectorAll("[data-go]").forEach(b=>{
    b.onclick = ()=> goApp(b.dataset.go);
  });

  // Tabs
  $("tabSport").onclick = ()=> goApp("sport");
  $("tabPuber").onclick = ()=> goApp("puber");
  $("tabEvents").onclick = ()=> goApp("events");

  // Back
  $("backHome").onclick = goHome;
  $("backHome2").onclick = goHome;

  // ✅ SIGNAL TIL index.html
  window.__GL_APP_OK__ = true;
  console.log("Grenland Live JS OK");
});
