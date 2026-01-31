/* calendar.js — Kalender 2026 (NO DESIGN CHANGES)
   Krav:
   - vises direkte i fanen (ikke link)
   - prikker: rød=fotball, gul=håndball, grønn=vintersport
   - liste til høyre (detaljer) når man klikker dato
   - bruker /data/2026/calendar_feed.json hvis den finnes
   - fallback: bygger feed fra sport-data som lastes i app.js (GL_SPORT_UPDATED)
*/

const GL_TZ = "Europe/Oslo";
const CAL_FEED_PATH = "/data/2026/calendar_feed.json";

function c$(id) { return document.getElementById(id); }
function cEsc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function calFetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} (${url})`);
  return await res.json();
}

function calToDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function calDateKeyFromISO(iso) {
  const d = calToDate(iso);
  if (!d) return "";
  return d.toLocaleDateString("sv-SE", { timeZone: GL_TZ }); // yyyy-mm-dd
}

function calFmtOslo(iso) {
  const d = calToDate(iso);
  if (!d) return "Tid ikke oppgitt";
  return d.toLocaleString("no-NO", {
    timeZone: GL_TZ,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function calAsArrayMaybe(data, keys = []) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const k of keys) {
      if (Array.isArray(data[k])) return data[k];
    }
  }
  return [];
}

// ----- Feed format vi støtter -----
// 1) { items:[ {date:"2026-01-17", type:"football", title:"...", iso:"..."} ] }
// 2) { days: { "2026-01-17": { football:[...], handball:[...], wintersport:[...] } } }
// 3) array direkte
function normalizeFeed(data) {
  const items = [];

  if (Array.isArray(data)) {
    for (const it of data) items.push(it);
    return items;
  }

  if (data && typeof data === "object") {
    const arr = calAsArrayMaybe(data, ["items", "list", "events"]);
    if (arr.length) return arr;

    if (data.days && typeof data.days === "object") {
      for (const [date, obj] of Object.entries(data.days)) {
        for (const type of ["football", "handball", "wintersport"]) {
          const list = Array.isArray(obj?.[type]) ? obj[type] : [];
          for (const it of list) {
            items.push({ ...it, date, type });
          }
        }
      }
      return items;
    }
  }

  return items;
}

function normalizeCalItem(raw) {
  const o = raw ?? {};
  const type = (o.type || o.sport || o.category || "").toLowerCase();
  const iso = o.iso || o.kickoff || o.start || o.datetime || o.time || "";
  const date = o.date || (iso ? calDateKeyFromISO(iso) : "");
  const title = o.title || o.name || o.match || o.event || "Oppføring";
  const channel = o.channel || o.tv || "Ukjent";
  const whereArr = Array.isArray(o.where) ? o.where : (Array.isArray(o.pubs) ? o.pubs.map(p => typeof p === "string" ? p : p?.name).filter(Boolean) : []);
  return {
    type: (type === "football" || type === "handball" || type === "wintersport") ? type : "football",
    date,
    iso,
    title,
    league: o.league || o.competition || o.tournament || "",
    channel,
    where: whereArr,
    raw: o
  };
}

function buildIndex(items) {
  // index: date -> {football:[], handball:[], wintersport:[]}
  const idx = new Map();
  for (const it of items) {
    if (!it.date) continue;
    if (!idx.has(it.date)) idx.set(it.date, { football: [], handball: [], wintersport: [] });
    idx.get(it.date)[it.type].push(it);
  }
  return idx;
}

function dotFor(type) {
  // Vi bruker emoji for prikker (ikke CSS-endring)
  if (type === "football") return "🔴";
  if (type === "handball") return "🟡";
  return "🟢";
}

// -------- Calendar rendering --------
function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function weekdayIndexMonFirst(date) {
  // Monday=0 … Sunday=6
  const js = date.getDay(); // Sun=0..Sat=6
  return (js + 6) % 7;
}

function monthNameNo(monthIndex) {
  const d = new Date(2026, monthIndex, 1);
  return d.toLocaleDateString("no-NO", { month: "long" });
}

function renderYear2026(root, feedIndex, selectedDate) {
  const year = 2026;

  let html = `<div class="calendarYear">`;
  for (let m = 0; m < 12; m++) {
    const first = new Date(year, m, 1);
    const firstW = weekdayIndexMonFirst(first);
    const dim = daysInMonth(year, m);

    html += `
      <section class="calendarMonth card">
        <div class="calendarMonthTitle cardTitle">${cEsc(monthNameNo(m))} ${year}</div>
        <div class="calendarGrid">
          <div class="calendarWeekHead muted">Man</div>
          <div class="calendarWeekHead muted">Tir</div>
          <div class="calendarWeekHead muted">Ons</div>
          <div class="calendarWeekHead muted">Tor</div>
          <div class="calendarWeekHead muted">Fre</div>
          <div class="calendarWeekHead muted">Lør</div>
          <div class="calendarWeekHead muted">Søn</div>
    `;

    // blanks
    for (let i = 0; i < firstW; i++) {
      html += `<div class="calendarCell muted"></div>`;
    }

    for (let day = 1; day <= dim; day++) {
      const dateKey = `${year}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const bucket = feedIndex.get(dateKey);
      const hasFootball = bucket && bucket.football.length;
      const hasHandball = bucket && bucket.handball.length;
      const hasWinter = bucket && bucket.wintersport.length;

      const dots = [
        hasFootball ? dotFor("football") : "",
        hasHandball ? dotFor("handball") : "",
        hasWinter ? dotFor("wintersport") : "",
      ].filter(Boolean).join("");

      const isSel = selectedDate === dateKey;
      html += `
        <button class="calendarCell ${isSel ? "active" : ""}" data-date="${cEsc(dateKey)}" type="button">
          <div class="calendarDayNum">${day}</div>
          <div class="calendarDots">${cEsc(dots)}</div>
        </button>
      `;
    }

    html += `</div></section>`;
  }
  html += `</div>`;

  root.innerHTML = html;

  // clicks
  root.querySelectorAll("button.calendarCell[data-date]").forEach(btn => {
    btn.addEventListener("click", () => {
      const date = btn.getAttribute("data-date");
      window.__GL_CAL_SELECTED__ = date;
      renderYear2026(root, feedIndex, date);
      renderDayDetails(date, feedIndex);
    });
  });
}

function renderDayDetails(dateKey, feedIndex) {
  const title = c$("calendarDayTitle");
  const listEl = c$("calendarDayList");

  title.textContent = dateKey ? `Detaljer: ${dateKey}` : "Klikk en dato";
  listEl.innerHTML = "";

  if (!dateKey) return;

  const bucket = feedIndex.get(dateKey);
  if (!bucket || (!bucket.football.length && !bucket.handball.length && !bucket.wintersport.length)) {
    listEl.innerHTML = `<div class="empty muted">Ingen ting denne dagen.</div>`;
    return;
  }

  const sections = [
    { type: "football", label: "Fotball" },
    { type: "handball", label: "Håndball" },
    { type: "wintersport", label: "Vintersport" },
  ];

  const html = sections.map(sec => {
    const arr = bucket[sec.type] || [];
    if (!arr.length) return "";

    // sorter
    arr.sort((a,b) => (calToDate(a.iso)?.getTime() ?? 0) - (calToDate(b.iso)?.getTime() ?? 0));

    const itemsHtml = arr.map(it => {
      const when = it.iso ? calFmtOslo(it.iso) : dateKey;
      const channel = it.channel || "Ukjent";
      const where = Array.isArray(it.where) && it.where.length ? it.where.join(", ") : "Vikinghjørnet, Gimle Pub";
      const league = it.league ? `${it.league} · ` : "";
      return `
        <div class="card">
          <div class="cardTop">
            <div class="cardTitle">${cEsc(dotFor(sec.type))} ${cEsc(it.title)}</div>
            <div class="cardMeta muted">${cEsc(league + when)}</div>
          </div>
          <div class="cardBottom">
            <div class="pill">Kanal: ${cEsc(channel)}</div>
            <div class="pill">Hvor: ${cEsc(where)}</div>
          </div>
        </div>
      `;
    }).join("");

    return `
      <div class="calendarSection">
        <h4 class="muted">${cEsc(sec.label)}</h4>
        ${itemsHtml}
      </div>
    `;
  }).join("");

  listEl.innerHTML = html || `<div class="empty muted">Ingen ting denne dagen.</div>`;
}

// --------- Feed state (source priority) ---------
let FEED_ITEMS = [];
let FEED_INDEX = new Map();

// Fallback feed bygges av sport-oppdateringer (fra app.js)
function upsertFromSport(detail) {
  // detail: { optionKey, label, sport, games }
  if (!detail || !Array.isArray(detail.games)) return;

  // konverter games til kalender-items
  const items = detail.games.map(g => ({
    type: detail.sport === "football" ? "football" : (detail.sport === "handball" ? "handball" : "wintersport"),
    date: calDateKeyFromISO(g.iso),
    iso: g.iso,
    title: g.title || "Kamp",
    league: detail.label || "",
    channel: g.channel || "Ukjent",
    where: g.where || [],
  })).filter(it => it.date && it.date.startsWith("2026-"));

  // merge: behold eksisterende feed + legg til (unngå duplikater)
  const key = (it) => `${it.type}|${it.date}|${it.title}|${it.iso || ""}`;
  const set = new Set(FEED_ITEMS.map(key));
  for (const it of items) {
    const k = key(it);
    if (!set.has(k)) {
      FEED_ITEMS.push(it);
      set.add(k);
    }
  }
  FEED_INDEX = buildIndex(FEED_ITEMS);
}

async function loadCalendarFeedPreferred() {
  try {
    const data = await calFetchJson(CAL_FEED_PATH);
    const rawItems = normalizeFeed(data);
    FEED_ITEMS = rawItems.map(normalizeCalItem).filter(it => it.date && it.date.startsWith("2026-"));
    FEED_INDEX = buildIndex(FEED_ITEMS);
    return true;
  } catch {
    // ignorer, vi bruker fallback
    return false;
  }
}

async function initCalendar() {
  const root = c$("calendarRoot");
  if (!root) return;

  // 1) prøv å laste /data/2026/calendar_feed.json
  await loadCalendarFeedPreferred();

  // 2) render uansett (tom => viser prikker der det finnes)
  const selected = window.__GL_CAL_SELECTED__ || "";
  renderYear2026(root, FEED_INDEX, selected);
  if (selected) renderDayDetails(selected, FEED_INDEX);
}

window.addEventListener("GL_SPORT_UPDATED", (e) => {
  // fallback-bygging av feed (så kalender blir fylt selv om calendar_feed.json er tom/ikke finnes)
  upsertFromSport(e.detail);

  const root = c$("calendarRoot");
  if (!root) return;

  const selected = window.__GL_CAL_SELECTED__ || "";
  renderYear2026(root, FEED_INDEX, selected);
  if (selected) renderDayDetails(selected, FEED_INDEX);
});

window.addEventListener("GL_CALENDAR_SHOW", () => {
  // når man klikker fanen, sørg for init/render
  initCalendar();
});

// Init på load (men uten å kreve at fanen er åpen)
document.addEventListener("DOMContentLoaded", () => {
  initCalendar();
});
