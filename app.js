const MS_DAY = 24 * 60 * 60 * 1000;

async function loadJSON(path){
  const res = await fetch(path, { cache: "no-store" });
  if(!res.ok) throw new Error(`Kunne ikke laste ${path} (${res.status})`);
  return await res.json();
}

function esc(s){ return String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

function mapLink(q){
  return `https://www.google.com/maps?q=${encodeURIComponent(q)}`;
}

function fmtTime(iso){
  // Hvis du legger inn ISO-tid i JSON (f.eks. 2026-01-16T19:30:00+01:00),
  // så blir dette riktig i Norge.
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString("no-NO", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" });
}

function inNextDays(iso, days=30){
  const t = new Date(iso).getTime();
  if (isNaN(t)) return false;
  const now = Date.now();
  return t >= now && t <= now + days * MS_DAY;
}

function renderInfoBox(el, p){
  if(!p){ el.innerHTML = ""; return; }

  const tags = (p.tags || []).map(t => esc(t)).join(" • ");
  const website = p.website ? `<a class="glLink" href="${p.website}" target="_blank" rel="noopener">Nettside / SoMe</a>` : "";
  const map = `<a class="glLink" href="${p.map || mapLink(p.name + " " + p.city)}" target="_blank" rel="noopener">Kart</a>`;

  el.innerHTML = `
    <div class="item">
      <strong>${esc(p.name)} <span class="badge">${esc(p.city)}</span></strong>
      <div class="meta">${tags}</div>
      ${website}${map}
    </div>
  `;
}

function setSelectOptions(select, items, labelFn){
  select.innerHTML = `<option value="">Velg …</option>` + items.map((it, i) =>
    `<option value="${i}">${esc(labelFn(it))}</option>`
  ).join("");
}

function setPubFilterOptions(select, pubs){
  select.innerHTML = `<option value="all">Alle puber</option>` + pubs.map((p, i) =>
    `<option value="${i}">${esc(p.name)} (${esc(p.city)})</option>`
  ).join("");
}

function renderFootball(listEl, games, pubs, pubFilter, mode){
  let filtered = games.slice();

  // Filter 30 dager
  if (mode === "next30") filtered = filtered.filter(g => inNextDays(g.kickoff, 30));

  // Sorter etter tid
  filtered.sort((a,b) => new Date(a.kickoff) - new Date(b.kickoff));

  // Filter på pub (valgfritt)
  if(pubFilter !== "all"){
    const p = pubs[Number(pubFilter)];
    if(p) filtered = filtered.filter(g => (g.where || []).includes(p.name));
  }

  // 15 stk visning
  if (mode === "next15") filtered = filtered.slice(0, 15);

  if(filtered.length === 0){
    listEl.innerHTML = `<div class="item">Ingen kamper å vise (sjekk JSON / filter).</div>`;
    return;
  }

  listEl.innerHTML = filtered.map(g => {
    const where = (g.where || []).map(w => esc(w)).join(", ");
    const channel = g.channel ? ` · 📺 ${esc(g.channel)}` : "";
    return `
      <div class="item">
        <strong>${esc(g.league)}: ${esc(g.home)} – ${esc(g.away)}</strong>
        <div class="meta">⏱️ ${esc(fmtTime(g.kickoff))}${channel}</div>
        <div class="meta">📍 ${where || "Ikke satt pub ennå"}</div>
      </div>
    `;
  }).join("");
}

function searchAll(q, pubs, jam, quiz, sources, games){
  const s = q.trim().toLowerCase();
  if(!s) return [];

  const hits = [];

  pubs.forEach(p => {
    const hay = `${p.name} ${p.city} ${(p.tags||[]).join(" ")}`.toLowerCase();
    if(hay.includes(s)) hits.push({type:"Pub", title:`${p.name} (${p.city})`, meta:(p.tags||[]).join(" • "), link:p.website || ""});
  });

  jam.forEach(p => {
    const hay = `${p.name} ${p.city} ${(p.tags||[]).join(" ")}`.toLowerCase();
    if(hay.includes(s)) hits.push({type:"Jam", title:`${p.name} (${p.city})`, meta:(p.tags||[]).join(" • "), link:p.website || ""});
  });

  quiz.forEach(p => {
    const hay = `${p.name} ${p.city} ${(p.tags||[]).join(" ")}`.toLowerCase();
    if(hay.includes(s)) hits.push({type:"Quiz", title:`${p.name} (${p.city})`, meta:(p.tags||[]).join(" • "), link:p.website || ""});
  });

  sources.forEach(src => {
    const hay = `${src.name} ${src.city} ${src.details}`.toLowerCase();
    if(hay.includes(s)) hits.push({type:"Program", title:`${src.name} (${src.city})`, meta:src.details || "", link:src.link || ""});
  });

  games.forEach(g => {
    const hay = `${g.league} ${g.home} ${g.away} ${(g.where||[]).join(" ")} ${g.channel||""}`.toLowerCase();
    if(hay.includes(s)) hits.push({type:"Fotball", title:`${g.league}: ${g.home} – ${g.away}`, meta:`${fmtTime(g.kickoff)} · ${(g.where||[]).join(", ")} · ${g.channel||""}`, link:""});
  });

  return hits.slice(0, 40);
}

function renderSearch(listEl, hits){
  if(!hits.length){
    listEl.innerHTML = `<div class="item">Ingen treff.</div>`;
    return;
  }
  listEl.innerHTML = hits.map(h => `
    <div class="item">
      <strong>${esc(h.type)}: ${esc(h.title)}</strong>
      <div class="meta">${esc(h.meta || "")}</div>
      ${h.link ? `<a class="glLink" href="${h.link}" target="_blank" rel="noopener">Åpne</a>` : ""}
    </div>
  `).join("");
}

document.addEventListener("DOMContentLoaded", async () => {
  const pubSelect = document.getElementById("pubSelect");
  const pubInfo = document.getElementById("pubInfo");
  const jamSelect = document.getElementById("jamSelect");
  const jamInfo = document.getElementById("jamInfo");
  const quizSelect = document.getElementById("quizSelect");
  const quizInfo = document.getElementById("quizInfo");
  const eventsSelect = document.getElementById("eventsSelect");
  const eventsInfo = document.getElementById("eventsInfo");
  const fbMode = document.getElementById("fbMode");
  const fbPubFilter = document.getElementById("fbPubFilter");
  const footballList = document.getElementById("footballList");
  const q = document.getElementById("q");
  const go = document.getElementById("go");
  const searchResults = document.getElementById("searchResults");

  let pubs = [];
  let games = [];
  let sources = [];

  try{
    // PUBER (din liste)
    const pubsData = await loadJSON("./data/pubs.json");
    pubs = pubsData.places || [];
    setSelectOptions(pubSelect, pubs, p => `${p.name} (${p.city})`);
    setSelectOptions(jamSelect, pubs.filter(p => (p.tags||[]).includes("Jam") || (p.tags||[]).includes("Jam nights")), p => `${p.name} (${p.city})`);
    setSelectOptions(quizSelect, pubs.filter(p => (p.tags||[]).includes("Quiz")), p => `${p.name} (${p.city})`);
    setPubFilterOptions(fbPubFilter, pubs);

    pubSelect.addEventListener("change", () => renderInfoBox(pubInfo, pubs[pubSelect.value]));
    jamSelect.addEventListener("change", () => renderInfoBox(jamInfo, pubs.filter(p => (p.tags||[]).includes("Jam") || (p.tags||[]).includes("Jam nights"))[jamSelect.value]));
    quizSelect.addEventListener("change", () => renderInfoBox(quizInfo, pubs.filter(p => (p.tags||[]).includes("Quiz"))[quizSelect.value]));

    // ARRANGEMENT-KILDER (programsider)
    const srcData = await loadJSON("./data/event_sources.json");
    sources = srcData.sources || [];
    eventsSelect.innerHTML = `<option value="">Velg program …</option>` + sources.map((s,i)=>`<option value="${i}">${esc(s.name)} (${esc(s.city)})</option>`).join("");
    eventsSelect.addEventListener("change", () => {
      const s = sources[eventsSelect.value];
      if(!s){ eventsInfo.innerHTML = ""; return; }
      eventsInfo.innerHTML = `
        <div class="item">
          <strong>${esc(s.name)} <span class="badge">${esc(s.city)}</span></strong>
          <div class="meta">${esc(s.details || "")}</div>
          ${s.link ? `<a class="glLink" href="${s.link}" target="_blank" rel="noopener">Åpne program</a>` : ""}
        </div>
      `;
    });

    // FOTBALL
    const fbData = await loadJSON("./data/football.json");
    games = fbData.games || [];

    function refreshFootball(){
      renderFootball(footballList, games, pubs, fbPubFilter.value, fbMode.value);
    }
    fbMode.addEventListener("change", refreshFootball);
    fbPubFilter.addEventListener("change", refreshFootball);
    refreshFootball();

    // SØK
    function runSearch(){
      const hits = searchAll(q.value, pubs, pubs.filter(p => (p.tags||[]).includes("Jam") || (p.tags||[]).includes("Jam nights")), pubs.filter(p => (p.tags||[]).includes("Quiz")), sources, games);
      renderSearch(searchResults, hits);
    }
    go.addEventListener("click", runSearch);
    q.addEventListener("keydown", (e)=>{ if(e.key==="Enter") runSearch(); });

  }catch(err){
    console.error(err);
    searchResults.innerHTML = `<div class="item">❌ Feil: ${esc(err.message)}</div>`;
  }
});
