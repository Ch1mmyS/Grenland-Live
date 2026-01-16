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

function infoHTML({ title, lines=[], links=[] }){
  const body = lines.filter(Boolean).map(x => `<div>${x}</div>`).join("");
  const linkBtns = links
    .filter(l => l && l.href)
    .map(l => `<a class="glLink" href="${l.href}" target="_blank" rel="noreferrer">${l.label}</a>`)
    .join("");

  return `
    <div class="infoBox">
      <div class="boxTitle">${esc(title)}</div>
      <div class="boxBody">${body}</div>
      ${linkBtns ? `<div class="linkRow">${linkBtns}</div>` : ""}
    </div>
  `;
}

async function loadJSON(path){
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Kunne ikke laste ${path}`);
  return await res.json();
}

// ---- rule generators ----
function nextWeekdayDates(weekday /*0=Sun..6*/, hour, minute, count=6){
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

function firstSaturdayOfMonth(year, monthIndex /*0-11*/){
  const d = new Date(Date.UTC(year, monthIndex, 1, 12, 0, 0));
  const day = d.getUTCDay();
  const add = (6 - day + 7) % 7;
  return new Date(Date.UTC(year, monthIndex, 1 + add, 12, 0, 0));
}

function buildMonthlyFirstSaturday(rule){
  const { hour, minute, monthsAhead=6, title, place, city, details, link } = rule;
  const now = new Date();
  const out = [];
  for (let i=0; i<monthsAhead; i++){
    const m = new Date(now.getFullYear(), now.getMonth()+i, 1);
    const fs = firstSaturdayOfMonth(m.getFullYear(), m.getMonth());
    const local = new Date(fs.getUTCFullYear(), fs.getUTCMonth(), fs.getUTCDate(), hour, minute, 0);
    out.push({ title, iso: local.toISOString(), place, city, details, link });
  }
  return out;
}

function tvForCompetition(competition){
  const c = (competition || "").toLowerCase();
  if (c.includes("premier")) return "V Sport / Viaplay";
  if (c.includes("odd") || c.includes("eliteserien") || c.includes("nm")) return "TV 2 Sport 1 / TV 2 Play";
  return "Sjekk rettigheter";
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
      link: x.link || ""
    });
  });
  return sortByIsoAsc(out);
}

let DATA = null;

function applySearchTerm(term, items){
  const q = (term || "").toLowerCase().trim();
  if (!q) return items;
  return items.filter(it => JSON.stringify(it).toLowerCase().includes(q));
}

function render(){
  const root = document.getElementById("results");
  root.innerHTML = "";

  const term = document.getElementById("q")?.value || "";

  // PUBS
  const pubs = applySearchTerm(term, DATA.pubs);
  const pubOptions = pubs.map((p,i)=>`<option value="${i}">${p.name} (${p.city})</option>`).join("");

  root.insertAdjacentHTML("beforeend", cardHTML({
    title:"Puber i Grenland",
    type:"Pub",
    when:"Alltid",
    where:"Skien / Porsgrunn",
    desc:"Velg et sted for info, hjemmeside og kart.",
    inner: `
      <hr class="sep">
      <select class="glSelect" id="pubSelect">
        <option value="">Velg…</option>
        ${pubOptions}
      </select>
      <div id="pubInfo"></div>
    `
  }));

  // JAM
  const jams = applySearchTerm(term, DATA.jams);
  const jamOptions = sortByIsoAsc(jams).map((e,i)=>`<option value="${i}">${fmtOslo(e.iso)} – ${e.place}</option>`).join("");

  root.insertAdjacentHTML("beforeend", cardHTML({
    title:"Jam nights i Grenland",
    type:"Jam",
    when:"Kommende",
    where:"Grenland",
    desc:"Velg jam for tid, sted og info.",
    inner: `
      <hr class="sep">
      <select class="glSelect" id="jamSelect">
        <option value="">Velg…</option>
        ${jamOptions}
      </select>
      <div id="jamInfo"></div>
    `
  }));

  // QUIZ
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
      <select class="glSelect" id="quizSelect">
        <option value="">Velg…</option>
        ${quizOptions}
      </select>
      <div id="quizInfo"></div>
    `
  }));

  // ARRANGEMENT-KILDER
  const sources = applySearchTerm(term, DATA.eventSources);
  const srcOptions = sources.map((s,i)=>`<option value="${i}">${s.name} (${s.city})</option>`).join("");

  root.insertAdjacentHTML("beforeend", cardHTML({
    title:"Kommende arrangementer (programmer)",
    type:"Event",
    when:"Oppdatert hos arrangør",
    where:"Grenland",
    desc:"Velg sted for å åpne program (konserter, DJ-kvelder, eventer, kulturprogram, live).",
    inner: `
      <hr class="sep">
      <select class="glSelect" id="srcSelect">
        <option value="">Velg…</option>
        ${srcOptions}
      </select>
      <div id="srcInfo"></div>
    `
  }));

  // FOTBALL
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
    desc:"Velg visning og kamp. Detaljer viser 📺 kanal (tid i Norge).",
    inner: `
      <hr class="sep">
      <div class="twoCol">
        <div>
          <select class="glSelect" id="fbMode">
            <option value="15">15 kamper (neste)</option>
            <option value="30">Kommende fotball (neste 30 dager)</option>
          </select>
        </div>
        <div>
          <select class="glSelect" id="fbSelect">
            <option value="">Velg…</option>
          </select>
        </div>
      </div>
      <div id="fbInfo"></div>
      <div class="meta" style="margin-top:10px;">Tider vises alltid i Norge (Europe/Oslo).</div>
    `
  }));

  // HVA SKJER 30 DAGER
  const whats = buildWhatsOn30({ jams: DATA.jams, quizzes: DATA.quizzes, footballMatches });
  const whOptions = whats.map((e,i)=>`<option value="${i}">${e.kind} • ${fmtOslo(e.iso)} • ${e.title}</option>`).join("");

  root.insertAdjacentHTML("beforeend", cardHTML({
    title:"Hva skjer i Grenland (neste 30 dager)",
    type:"Event",
    when:"Neste 30 dager",
    where:"Grenland",
    desc:"Samlet oversikt (jam + quiz + fotball). For konserter/DJ/eventer: bruk «Kommende arrangementer (programmer)».",
    inner: `
      <hr class="sep">
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
    const website = p.website || p.link || "";
    const map = p.map || "";
    const tags = (p.tags || []).length ? `✅ ${(p.tags || []).join(" • ")}` : "";

    out.innerHTML = infoHTML({
      title: `${p.name} (${p.city})`,
      lines: [tags, p.note ? `ℹ️ ${p.note}` : ""].filter(Boolean),
      links: [
        website ? { label: "🔗 Hjemmeside/SoMe", href: website } : null,
        map ? { label: "🗺️ Kart", href: map } : null
      ]
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
      lines: [`🕒 ${fmtOslo(e.iso)}`, `📍 ${e.place} (${e.city})`, e.details].filter(Boolean),
      links: e.link ? [{ label: "🔗 Åpne", href: e.link }] : []
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
      lines: [`🕒 ${fmtOslo(e.iso)}`, `📍 ${e.place} (${e.city})`, e.details].filter(Boolean),
      links: e.link ? [{ label: "🔗 Åpne", href: e.link }] : []
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
      title: `${s.name} (${s.city})`,
      lines: [s.details || "Åpne program/arrangementsliste."],
      links: s.link ? [{ label: "🔗 Åpne program", href: s.link }] : []
    });
  });
}

function fillFootballSelect(sel, matches){
  sel.innerHTML = `<option value="">Velg…</option>` + matches.map((m,i)=>{
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
      links: m.link ? [{ label: "🔗 Åpne", href: m.link }] : []
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
      lines: [`🕒 ${fmtOslo(e.iso)}`, `📍 ${e.where}`, e.extra].filter(Boolean),
      links: e.link ? [{ label: "🔗 Åpne", href: e.link }] : []
    });
  });
}

async function init(){
  setNetStatus();

  const [pubs, football, jamRules, quizRules, eventSources] = await Promise.all([
    loadJSON("./data/pubs.json"),
    loadJSON("./data/football.json"),
    loadJSON("./data/jam_rules.json"),
    loadJSON("./data/quiz_rules.json"),
    loadJSON("./data/event_sources.json")
  ]);

  // Jams
  const jams = [];
  (jamRules.rules || []).forEach(r => {
    if (r.type === "monthly_first_saturday") {
      jams.push(...buildMonthlyFirstSaturday(r));
    } else if (r.type === "weekly") {
      const dates = nextWeekdayDates(r.weekday, r.hour, r.minute, r.count || 8);
      dates.forEach(dt => jams.push({
        title: r.title, iso: dt.toISOString(), place: r.place, city: r.city,
        details: r.details, link: r.link || ""
      }));
    }
  });

  // Quizzes
  const quizzes = [];
  (quizRules.rules || []).forEach(r => {
    if (r.type === "weekly") {
      const dates = nextWeekdayDates(r.weekday, r.hour, r.minute, r.count || 10);
      dates.forEach(dt => quizzes.push({
        title: r.title, iso: dt.toISOString(), place: r.place, city: r.city,
        details: r.details, link: r.link || ""
      }));
    }
  });

  const footballMatches = (football.matches || []).map(m => ({
    ...m,
    tv: m.tv || tvForCompetition(m.competition)
  }));

  DATA = {
    pubs: pubs.places || [],
    footballMatches,
    jams: upcomingOnly(sortByIsoAsc(jams)),
    quizzes: upcomingOnly(sortByIsoAsc(quizzes)),
    eventSources: eventSources.sources || []
  };

  render();

  const btn = document.getElementById("go");
  const input = document.getElementById("q");
  if (btn) btn.addEventListener("click", render);
  if (input) input.addEventListener("keydown", (e)=>{ if(e.key==="Enter") render(); });
}

window.addEventListener("online", setNetStatus);
window.addEventListener("offline", setNetStatus);

document.addEventListener("DOMContentLoaded", () => {
  init().catch(err => {
    const root = document.getElementById("results");
    if (root) root.innerHTML =
      `<div class="card"><div class="title">Kunne ikke laste data</div><div class="meta">${esc(err.message)}</div></div>`;
  });
});
