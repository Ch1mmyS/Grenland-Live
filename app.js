// Grenland Live – JSON-feed version
// Oppdatering: Endre kun /data/*.json (GitHub/Netlify) – appen leser data ved refresh.

const MS_DAY = 24 * 60 * 60 * 1000;
const TZ = "Europe/Oslo";

function setNetStatus(){
  const el = document.getElementById("netStatus");
  if (!el) return;
  const online = navigator.onLine;
  el.textContent = online ? "🟢 Online" : "🔴 Offline";
  el.classList.toggle("online", online);
  el.classList.toggle("offline", !online);
}

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

function inNextDays(iso, days=30){
  const now = Date.now();
  const t = new Date(iso).getTime();
  return t >= now - 2*60*60*1000 && t <= now + days*MS_DAY;
}

function esc(s){ return (s ?? "").toString(); }

function badgeClass(type){
  const t = (type || "").toLowerCase();
  if (t.includes("fotball")) return "football";
  if (t.includes("quiz")) return "quiz";
  if (t.includes("jam")) return "jam";
  if (t.includes("pub")) return "pub";
  return "event";
}

function cardHTML({ title, type, when, where, desc, inner }){
  const badge = badgeClass(type);
  return `
    <div class="card">
      <div class="topRow">
        <div>
          <div class="title">${esc(title)}</div>
          <div class="meta">
            <div><strong>Når:</strong> ${esc(when)}</div>
            <div><strong>Hvor:</strong> ${esc(where)}</div>
          </div>
        </div>
        <div class="badge ${badge}">${esc(type)}</div>
      </div>
      <hr class="sep">
      <div class="meta">${esc(desc)}</div>
      ${inner || ""}
    </div>
  `;
}

function infoHTML({ title, lines=[], link="" }){
  const body = lines.map(x => `<div>${x}</div>`).join("");
  const btn = link ? `<div style="margin-top:8px;"><a class="glLink" href="${link}" target="_blank" rel="noreferrer">Åpne</a></div>` : "";
  return `
    <div class="infoBox">
      <div class="boxTitle">${esc(title)}</div>
      <div class="boxBody">${body}</div>
      ${btn}
    </div>
  `;
}

async function loadJSON(path){
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Kunne ikke laste ${path}`);
  return await res.json();
}

// ---- RULE ENGINES (Jam/Quiz genereres automatisk fra rules JSON) ----

function firstSaturdayOfMonth(year, monthIndex /*0-11*/){
  const d = new Date(Date.UTC(year, monthIndex, 1, 12, 0, 0)); // midt på dagen (stabilt)
  // Finn første lørdag
  const day = d.getUTCDay(); // 0..6
  const add = (6 - day + 7) % 7;
  return new Date(Date.UTC(year, monthIndex, 1 + add, 12, 0, 0));
}

function buildMonthlyFirstSaturday({ hour, minute, monthsAhead=6, title, place, city, details, link }){
  const now = new Date();
  const out = [];
  for (let i=0; i<monthsAhead; i++){
    const m = new Date(now.getFullYear(), now.getMonth()+i, 1);
    const fs = firstSaturdayOfMonth(m.getFullYear(), m.getMonth());
    // sett Oslo-tid klokkeslett ved å bygge ISO med +01/+02 automatisk via local constructor:
    const local = new Date(fs.getUTCFullYear(), fs.getUTCMonth(), fs.getUTCDate(), hour, minute, 0);
    out.push({
      title,
      iso: local.toISOString(),
      place, city, details, link
    });
  }
  return out;
}

function nextWeekdayDates(weekday /*0=Sun..6*/, hour, minute, count=5){
  const out = [];
  const now = new Date();
  let d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0);
  const diff = (weekday - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  if (d.getTime() < now.getTime()) d.setDate(d.getDate() + 7);

  while(out.length < count){
    out.push(new Date(d));
    d = new Date(d.getTime() + 7*MS_DAY);
  }
  return out;
}

// ---- TV CHANNELS (per kamp) ----
function tvForCompetition(competition){
  const c = (competition || "").toLowerCase();
  // Norge: Odd/Eliteserien -> TV 2. Premier League -> Viaplay/V Sport.
  if (c.includes("premier")) return "V Sport / Viaplay";
  if (c.includes("odd") || c.includes("eliteserien") || c.includes("nm")) return "TV 2 Sport 1 / TV 2 Play";
  return "Sjekk rettigheter";
}

// ---- MAIN ----
let DATA = null;

function applySearchTerm(term, items){
  const q = (term || "").toLowerCase().trim();
  if (!q) return items;
  return items.filter(it => JSON.stringify(it).toLowerCase().includes(q));
}

function sortByIsoAsc(arr){
  return arr.slice().sort((a,b)=>new Date(a.iso)-new Date(b.iso));
}

function upcomingOnly(arr){
  const now = Date.now();
  return arr.filter(x => new Date(x.iso).getTime() >= now - 2*60*60*1000);
}

function football15(matches){
  return upcomingOnly(sortByIsoAsc(matches)).slice(0, 15);
}
function football30(matches){
  return upcomingOnly(sortByIsoAsc(matches)).filter(x=>inNextDays(x.iso, 30));
}

function buildWhatsOn30({ jams, quizzes, footballMatches }){
  const out = [];
  jams.filter(x=>inNextDays(x.iso, 30)).forEach(x=>{
    out.push({ kind:"Jam", title:x.title, iso:x.iso, where:`${x.place} (${x.city})`, extra:x.details, link:x.link });
  });
  quizzes.filter(x=>inNextDays(x.iso, 30)).forEach(x=>{
    out.push({ kind:"Quiz", title:x.title, iso:x.iso, where:`${x.place} (${x.city})`, extra:x.details, link:x.link });
  });
  football30(footballMatches).forEach(x=>{
    out.push({
      kind:"Fotball",
      title:x.match,
      iso:x.iso,
      where:x.watchAt,
      extra:`📺 ${x.tv} • ${x.competition}${x.note ? " • " + x.note : ""}`,
      link:x.link || ""
    });
  });
  return sortByIsoAsc(out);
}

function render(){
  const root = document.getElementById("results");
  root.innerHTML = "";

  const term = document.getElementById("q")?.value || "";

  // pubs
  const pubs = applySearchTerm(term, DATA.pubs);
  const pubOptions = pubs.map((p,i)=>`<option value="${i}">${p.name} (${p.city})</option>`).join("");

  root.insertAdjacentHTML("beforeend", cardHTML({
    title:"Puber i Grenland",
    type:"Pub",
    when:"Alltid",
    where:"Skien / Porsgrunn",
    desc:"Velg et sted for info og link.",
    inner: `
      <hr class="sep">
      <label class="small"><strong>Velg sted:</strong></label>
      <select class="glSelect" id="pubSelect">
        <option value="">Velg…</option>
        ${pubOptions}
      </select>
      <div id="pubInfo"></div>
    `
  }));

  // jam dropdown
  const jams = applySearchTerm(term, DATA.jams);
  const jamOptions = sortByIsoAsc(jams).map((e,i)=>`<option value="${i}">${fmtOslo(e.iso)} – ${e.place}</option>`).join("");

  root.insertAdjacentHTML("beforeend", cardHTML({
    title:"Jam-kvelder i Grenland",
    type:"Jam",
    when:"Kommende",
    where:"Grenland",
    desc:"Velg jam for tid, sted og info.",
    inner: `
      <hr class="sep">
      <label class="small"><strong>Velg jam:</strong></label>
      <select class="glSelect" id="jamSelect">
        <option value="">Velg…</option>
        ${jamOptions}
      </select>
      <div id="jamInfo"></div>
    `
  }));

  // quiz dropdown
  const quizzes = applySearchTerm(term, DATA.quizzes);
  const quizOptions = sortByIsoAsc(quizzes).map((e,i)=>`<option value="${i}">${e.place} (${e.city}) – ${fmtOslo(e.iso)}</option>`).join("");

  root.insertAdjacentHTML("beforeend", cardHTML({
    title:"Quiz i Grenland",
    type:"Quiz",
    when:"Kommende",
    where:"Grenland",
    desc:"Velg quiz for tid, sted og info.",
    inner: `
      <hr class="sep">
      <label class="small"><strong>Velg quiz:</strong></label>
      <select class="glSelect" id="quizSelect">
        <option value="">Velg…</option>
        ${quizOptions}
      </select>
      <div id="quizInfo"></div>
    `
  }));

  // event sources dropdown (programlenker – alltid oppdatert uten at du vedlikeholder datoer)
  const sources = applySearchTerm(term, DATA.eventSources);
  const srcOptions = sources.map((s,i)=>`<option value="${i}">${s.name} (${s.city})</option>`).join("");

  root.insertAdjacentHTML("beforeend", cardHTML({
    title:"Kommende arrangementer",
    type:"Event",
    when:"Oppdatert program",
    where:"Grenland",
    desc:"Velg sted for å åpne oppdatert program/arrangementsliste.",
    inner: `
      <hr class="sep">
      <label class="small"><strong>Velg sted:</strong></label>
      <select class="glSelect" id="srcSelect">
        <option value="">Velg…</option>
        ${srcOptions}
      </select>
      <div id="srcInfo"></div>
    `
  }));

  // football dropdown (15 vs 30)
  const footballMatches = applySearchTerm(term, DATA.footballMatches).map(m => ({
    ...m,
    tv: m.tv || tvForCompetition(m.competition)
  }));
  const list15 = football15(footballMatches);
  const list30 = football30(footballMatches);

  root.insertAdjacentHTML("beforeend", cardHTML({
    title:"Fotball (Odd + Premier League)",
    type:"Fotball",
    when:"Kommende",
    where:"Puber i Grenland",
    desc:"Velg visning og kamp. Detaljer viser 📺 kanal.",
    inner: `
      <hr class="sep">
      <div class="twoCol">
        <div>
          <label class="small"><strong>Visning:</strong></label>
          <select class="glSelect" id="fbMode">
            <option value="15">15 kamper (neste)</option>
            <option value="30">Kommende fotball (neste 30 dager)</option>
          </select>
        </div>
        <div>
          <label class="small"><strong>Velg kamp:</strong></label>
          <select class="glSelect" id="fbSelect">
            <option value="">Velg…</option>
          </select>
        </div>
      </div>
      <div id="fbInfo"></div>
      <div class="small" style="margin-top:10px;">
        Tider vises alltid i Norge (Europe/Oslo). 📺 Kanal er oppgitt per liga.
      </div>
    `
  }));

  // “Hva skjer 30 dager” dropdown
  const whats = buildWhatsOn30({ jams: DATA.jams, quizzes: DATA.quizzes, footballMatches });
  const whOptions = whats.map((e,i)=>`<option value="${i}">${e.kind} • ${fmtOslo(e.iso)} • ${e.title}</option>`).join("");

  root.insertAdjacentHTML("beforeend", cardHTML({
    title:"Hva skjer i Grenland (neste 30 dager)",
    type:"Event",
    when:"Neste 30 dager",
    where:"Grenland",
    desc:"Samlet oversikt (jam + quiz + fotball).",
    inner: `
      <hr class="sep">
      <label class="small"><strong>Velg:</strong></label>
      <select class="glSelect" id="whSelect">
        <option value="">Velg…</option>
        ${whOptions}
      </select>
      <div id="whInfo"></div>
    `
  }));

  wirePubs(pubs);
  wireJam(sortByIsoAsc(jams));
  wireQuiz(sortByIsoAsc(quizzes));
  wireSources(sources);
  wireFootball(list15, list30);
  wireWhatsOn(whats);
}

function wirePubs(pubs){
  const sel = document.getElementById("pubSelect");
  const out = document.getElementById("pubInfo");
  if (!sel || !out) return;
  sel.addEventListener("change", ()=>{
    if (sel.value===""){ out.innerHTML=""; return; }
    const p = pubs[Number(sel.value)];
    out.innerHTML = infoHTML({
      title: `${p.name} (${p.city})`,
      lines: [
        p.tags?.length ? `✅ ${p.tags.join(" • ")}` : "",
        p.note ? `ℹ️ ${p.note}` : ""
      ].filter(Boolean),
      link: p.link || ""
    });
  });
}

function wireJam(list){
  const sel = document.getElementById("jamSelect");
  const out = document.getElementById("jamInfo");
  if (!sel || !out) return;
  sel.addEventListener("change", ()=>{
    if (sel.value===""){ out.innerHTML=""; return; }
    const e = list[Number(sel.value)];
    out.innerHTML = infoHTML({
      title: e.title,
      lines: [`🕒 ${fmtOslo(e.iso)}`, `📍 ${e.place} (${e.city})`, e.details],
      link: e.link || ""
    });
  });
}

function wireQuiz(list){
  const sel = document.getElementById("quizSelect");
  const out = document.getElementById("quizInfo");
  if (!sel || !out) return;
  sel.addEventListener("change", ()=>{
    if (sel.value===""){ out.innerHTML=""; return; }
    const e = list[Number(sel.value)];
    out.innerHTML = infoHTML({
      title: e.title,
      lines: [`🕒 ${fmtOslo(e.iso)}`, `📍 ${e.place} (${e.city})`, e.details],
      link: e.link || ""
    });
  });
}

function wireSources(list){
  const sel = document.getElementById("srcSelect");
  const out = document.getElementById("srcInfo");
  if (!sel || !out) return;
  sel.addEventListener("change", ()=>{
    if (sel.value===""){ out.innerHTML=""; return; }
    const s = list[Number(sel.value)];
    out.innerHTML = infoHTML({
      title: s.name,
      lines: [`📍 ${s.city}`, s.details || "Åpne program/arrangementsliste."],
      link: s.link || ""
    });
  });
}

function fillFootballSelect(sel, matches){
  sel.innerHTML = `<option value="">Velg…</option>` + matches.map((m,i)=>{
    // label: dato + kamp + liten kanalhint
    const tv = m.tv || tvForCompetition(m.competition);
    return `<option value="${i}">${fmtOslo(m.iso)} – ${m.match} (📺 ${tv})</option>`;
  }).join("");
}

function wireFootball(list15, list30){
  const mode = document.getElementById("fbMode");
  const sel = document.getElementById("fbSelect");
  const out = document.getElementById("fbInfo");
  if (!mode || !sel || !out) return;

  let active = list15;
  fillFootballSelect(sel, active);

  mode.addEventListener("change", ()=>{
    active = (mode.value === "30") ? list30 : list15;
    fillFootballSelect(sel, active);
    sel.value = "";
    out.innerHTML = "";
  });

  sel.addEventListener("change", ()=>{
    if (sel.value===""){ out.innerHTML=""; return; }
    const m = active[Number(sel.value)];
    const tv = m.tv || tvForCompetition(m.competition);
    out.innerHTML = infoHTML({
      title: m.match,
      lines: [
        `🏆 ${m.competition}`,
        `🕒 ${fmtOslo(m.iso)}`,
        `📍 Visning: ${m.watchAt}`,
        `📺 Kanal: ${tv}`,
        m.note ? `ℹ️ ${m.note}` : ""
      ].filter(Boolean),
      link: m.link || ""
    });
  });
}

function wireWhatsOn(list){
  const sel = document.getElementById("whSelect");
  const out = document.getElementById("whInfo");
  if (!sel || !out) return;
  sel.addEventListener("change", ()=>{
    if (sel.value===""){ out.innerHTML=""; return; }
    const e = list[Number(sel.value)];
    out.innerHTML = infoHTML({
      title: `${e.kind}: ${e.title}`,
      lines: [`🕒 ${fmtOslo(e.iso)}`, `📍 ${e.where}`, e.extra],
      link: e.link || ""
    });
  });
}

async function init(){
  setNetStatus();

  // Load feeds
  const [pubs, football, jamRules, quizRules, eventSources] = await Promise.all([
    loadJSON("./data/pubs.json"),
    loadJSON("./data/football.json"),
    loadJSON("./data/jam_rules.json"),
    loadJSON("./data/quiz_rules.json"),
    loadJSON("./data/event_sources.json")
  ]);

  // Build jams from rules
  const jams = [];
  jamRules.rules.forEach(r => {
    if (r.type === "monthly_first_saturday") {
      jams.push(...buildMonthlyFirstSaturday(r));
    }
  });

  // Build quizzes from rules
  const quizzes = [];
  quizRules.rules.forEach(r => {
    if (r.type === "weekly") {
      const dates = nextWeekdayDates(r.weekday, r.hour, r.minute, r.count || 6);
      dates.forEach(dt => {
        quizzes.push({
          title: r.title,
          iso: dt.toISOString(),
          place: r.place,
          city: r.city,
          details: r.details,
          link: r.link || ""
        });
      });
    }
  });

  // Normalize football: make sure tv exists, show Oslo times via fmtOslo anyway
  const footballMatches = football.matches.map(m => ({
    ...m,
    tv: m.tv || tvForCompetition(m.competition)
  }));

  DATA = {
    pubs: pubs.places,
    footballMatches,
    jams: upcomingOnly(sortByIsoAsc(jams)),
    quizzes: upcomingOnly(sortByIsoAsc(quizzes)),
    eventSources: eventSources.sources
  };

  render();

  const btn = document.getElementById("go");
  const input = document.getElementById("q");
  if (btn) btn.addEventListener("click", render);
  if (input) input.addEventListener("keydown", (e)=>{ if(e.key==="Enter") render(); });
}

function sortByIsoAsc(arr){ return arr.slice().sort((a,b)=>new Date(a.iso)-new Date(b.iso)); }
function upcomingOnly(arr){
  const now = Date.now();
  return arr.filter(x => new Date(x.iso).getTime() >= now - 2*60*60*1000);
}

window.addEventListener("online", setNetStatus);
window.addEventListener("offline", setNetStatus);

document.addEventListener("DOMContentLoaded", () => {
  init().catch(err => {
    const root = document.getElementById("results");
    if (root) root.innerHTML = `<div class="card"><div class="title">Kunne ikke laste data</div><div class="meta">${esc(err.message)}</div></div>`;
  });
});
