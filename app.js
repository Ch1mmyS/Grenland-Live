// Grenland Live – Static JSON app (no Streamlit)
// Tabs + merged leagues + pub suggestions + channels + Norway time

const TZ = "Europe/Oslo";
const MS_DAY = 24 * 60 * 60 * 1000;

const DATA_FILES = {
  football: [
    "/data/eliteserien.json",
    "/data/obos.json",
    "/data/premier_league.json",
    "/data/champions.json",
    "/data/laliga.json"
  ],
  handball: {
    menn: "/data/handball_vm_2026_menn.json",
    damer: "/data/handball_vm_2026_damer.json"
  },
  wintersport: {
    menn: "/data/vintersport_menn.json",
    kvinner: "/data/vintersport_kvinner.json"
  },
  vm2026: "/data/vm2026.json",
  events: "/data/events.json",
  pubs: "/data/pubs.json"
};

const DEFAULT_TV_BY_LEAGUE = [
  { match: /eliteserien/i, channel: "TV 2 / TV 2 Play" },
  { match: /obos/i,       channel: "TV 2 / TV 2 Play" },
  { match: /premier/i,    channel: "Viaplay / V Sport" },
  { match: /champions/i,  channel: "TV 2 Play" },
  { match: /laliga/i,     channel: "TV 2 Play" }
];

// Simple pub suggestion rules (you can extend anytime)
const PUB_RULES = [
  // Odd-kamper -> Skien focus
  {
    when: g => /(^|\s)odd(\s|$)/i.test(`${g.home} ${g.away}`),
    pubs: ["Gimle Pub", "The Old Irish Pub (Skien)", "O’Learys Skien", "Union Bar", "Vikinghjørnet"]
  },
  // Big televised football -> wider list (Skien + Porsgrunn)
  {
    when: g => /premier|champions|laliga/i.test(g.league || ""),
    pubs: ["Gimle Pub", "Vikinghjørnet", "O’Learys Skien", "The Old Irish Pub (Skien)", "Union Bar", "Tollboden Bar", "Daimlers", "Jimmys"]
  },
  // Default football
  {
    when: g => /eliteserien|obos/i.test(g.league || ""),
    pubs: ["Gimle Pub", "Vikinghjørnet", "O’Learys Skien", "The Old Irish Pub (Skien)", "Union Bar", "Tollboden Bar", "Daimlers", "Jimmys"]
  }
];

function qs(id){ return document.getElementById(id); }

function setNetStatus(){
  const el = qs("netStatus");
  if (!el) return;
  const online = navigator.onLine;
  el.textContent = online ? "🟢 Online" : "🔴 Offline";
  el.classList.toggle("online", online);
  el.classList.toggle("offline", !online);
}

function bust(url){
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}v=${Date.now()}`;
}

async function fetchJSON(url){
  const res = await fetch(bust(url), { cache: "no-store" });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return await res.json();
}

// Fix common mojibake like "BodÃ¸/Glimt"
function fixMojibake(s){
  if (!s || typeof s !== "string") return s;
  if (!/Ã|Â|�/.test(s)) return s;
  try{
    // Convert "latin1 misread" back to utf8
    return decodeURIComponent(escape(s));
  }catch(_){
    return s;
  }
}

function fmtOslo(iso){
  if (!iso) return "-";
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

function nowOslo(){
  return new Date().toLocaleString("no-NO", { timeZone: TZ });
}

function toEpoch(iso){
  const d = new Date(iso);
  const t = d.getTime();
  return Number.isFinite(t) ? t : 0;
}

function isUpcoming(iso){
  const t = toEpoch(iso);
  return t >= Date.now() - (2 * 60 * 60 * 1000); // allow a bit grace
}

function normalizeGame(g){
  const league = fixMojibake(g.league || g.tournament || "");
  const home = fixMojibake(g.home || "");
  const away = fixMojibake(g.away || "");
  const kickoff = g.kickoff || g.start || g.date || "";
  let channel = fixMojibake(g.channel || g.tv || "");

  if (!channel){
    const rule = DEFAULT_TV_BY_LEAGUE.find(r => r.match.test(league));
    channel = rule ? rule.channel : "";
  }

  return {
    league,
    home,
    away,
    kickoff,
    channel,
    where: Array.isArray(g.where) ? g.where.map(fixMojibake) : []
  };
}

function normalizeEvent(e){
  return {
    title: fixMojibake(e.title || e.name || "Arrangement"),
    venue: fixMojibake(e.venue || e.place || ""),
    city: fixMojibake(e.city || ""),
    start: e.start || e.date || "",
    category: fixMojibake(e.category || "Event"),
    url: e.url || e.link || ""
  };
}

function normalizePub(p){
  return {
    name: fixMojibake(p.name || ""),
    city: fixMojibake(p.city || ""),
    website: p.website || p.link || "",
    tags: Array.isArray(p.tags) ? p.tags.map(fixMojibake) : [],
    note: fixMojibake(p.note || ""),
    lat: typeof p.lat === "number" ? p.lat : null,
    lon: typeof p.lon === "number" ? p.lon : null
  };
}

function buildPubIndex(pubs){
  const byName = new Map();
  pubs.forEach(p => byName.set(p.name, p));
  return { byName };
}

function suggestPubsForGame(game, pubIndex){
  // If data already has "where", respect it
  if (game.where && game.where.length) return game.where;

  for (const r of PUB_RULES){
    if (r.when(game)){
      // Only include pubs that exist in pubs.json, but allow unknown too
      const list = r.pubs.filter(n => pubIndex.byName.has(n) || true);
      return list;
    }
  }
  return [];
}

function uniq(arr){
  return [...new Set(arr.filter(Boolean))];
}

function renderTabs(activeKey){
  const tabsEl = qs("tabs");
  tabsEl.innerHTML = "";

  const tabs = [
    { key:"football", label:"Fotball (samlet)" },
    { key:"handball", label:"Håndball (VM)" },
    { key:"wintersport", label:"Vintersport" },
    { key:"vm2026", label:"VM 2026" },
    { key:"events", label:"Kommende arrangementer i Grenland" },
    { key:"pubs", label:"Pubbene i Grenland" }
  ];

  for (const t of tabs){
    const btn = document.createElement("div");
    btn.className = "tab" + (t.key === activeKey ? " active" : "");
    btn.textContent = t.label;
    btn.onclick = () => setActiveTab(t.key);
    tabsEl.appendChild(btn);
  }
}

function renderSubtabs(tabKey, activeSub){
  const subtabsEl = qs("subtabs");
  subtabsEl.innerHTML = "";

  let items = [];
  if (tabKey === "handball"){
    items = [
      { key:"menn", label:"Menn" },
      { key:"damer", label:"Damer" }
    ];
  } else if (tabKey === "wintersport"){
    items = [
      { key:"menn", label:"Menn" },
      { key:"kvinner", label:"Kvinner" }
    ];
  }

  if (!items.length){
    subtabsEl.style.display = "none";
    return;
  }

  subtabsEl.style.display = "flex";

  for (const it of items){
    const b = document.createElement("div");
    b.className = "subtab" + (it.key === activeSub ? " active" : "");
    b.textContent = it.label;
    b.onclick = () => {
      state.subtab = it.key;
      refresh();
    };
    subtabsEl.appendChild(b);
  }
}

function fillSelect(el, options, value){
  el.innerHTML = "";
  for (const opt of options){
    const o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.label;
    if (opt.value === value) o.selected = true;
    el.appendChild(o);
  }
}

function showCount(shown, total){
  qs("countInfo").textContent = `Viser: ${shown} / ${total}`;
  qs("updatedAt").textContent = `Oppdatert: ${nowOslo()}`;
}

function sortItems(items, mode){
  const copy = [...items];
  if (mode === "time_asc") copy.sort((a,b)=>toEpoch(a.kickoff||a.start)-toEpoch(b.kickoff||b.start));
  if (mode === "time_desc") copy.sort((a,b)=>toEpoch(b.kickoff||b.start)-toEpoch(a.kickoff||a.start));
  if (mode === "league_asc") copy.sort((a,b)=>(a.league||a.category||"").localeCompare(b.league||b.category||"", "no"));
  if (mode === "league_desc") copy.sort((a,b)=>(b.league||b.category||"").localeCompare(a.league||a.category||"", "no"));
  return copy;
}

function renderGames(games, pubsIndex){
  const content = qs("content");
  const leagueSel = qs("leagueSelect").value;
  const pubSel = qs("pubSelect").value;
  const q = (qs("q").value || "").trim().toLowerCase();
  const upcomingOnly = qs("upcomingOnly").checked;
  const sortMode = qs("sortSelect").value;

  // enrich with pub suggestions
  const enriched = games.map(g => {
    const pubs = suggestPubsForGame(g, pubsIndex);
    return { ...g, pubs };
  });

  let filtered = enriched;

  if (leagueSel !== "__all__"){
    filtered = filtered.filter(x => (x.league || "") === leagueSel);
  }

  if (pubSel !== "__all__"){
    if (pubSel === "__unset__"){
      filtered = filtered.filter(x => !x.pubs || x.pubs.length === 0);
    } else {
      filtered = filtered.filter(x => (x.pubs || []).includes(pubSel));
    }
  }

  if (upcomingOnly){
    filtered = filtered.filter(x => isUpcoming(x.kickoff));
  }

  if (q){
    filtered = filtered.filter(x => {
      const hay = [
        x.home, x.away, x.league, x.channel,
        ...(x.pubs||[])
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  filtered = sortItems(filtered, sortMode);

  // render
  const total = enriched.length;
  showCount(filtered.length, total);

  const wrap = document.createElement("div");
  wrap.className = "cards";

  for (const g of filtered){
    const card = document.createElement("div");
    card.className = "card";

    const h = document.createElement("h3");
    h.textContent = `${g.home} – ${g.away}`;
    card.appendChild(h);

    const meta = document.createElement("div");
    meta.className = "meta";

    meta.appendChild(badge(`🕒 ${fmtOslo(g.kickoff)}`));
    meta.appendChild(badge(`🏷️ ${g.league || "Ukjent"}`));
    meta.appendChild(badge(`📺 ${g.channel || "Ikke satt"}`));

    card.appendChild(meta);

    const pubsLine = document.createElement("div");
    pubsLine.className = "publine";

    if (g.pubs && g.pubs.length){
      pubsLine.innerHTML = `🍻 <span class="muted">Pub:</span> ${g.pubs.join(", ")}`;
    } else {
      pubsLine.innerHTML = `🍻 <span class="muted">Pub:</span> Ikke satt`;
    }
    card.appendChild(pubsLine);

    wrap.appendChild(card);
  }

  content.innerHTML = "";
  content.appendChild(wrap);
}

function badge(text){
  const b = document.createElement("span");
  b.className = "badge";
  b.textContent = text;
  return b;
}

function renderEvents(events){
  const content = qs("content");
  const leagueSel = qs("leagueSelect").value; // used as category filter here
  const pubSel = qs("pubSelect").value;       // unused here, but we keep UI consistent
  const q = (qs("q").value || "").trim().toLowerCase();
  const upcomingOnly = qs("upcomingOnly").checked;
  const sortMode = qs("sortSelect").value;

  let items = events.map(normalizeEvent);

  // category filter (reuse leagueSelect)
  if (leagueSel !== "__all__"){
    items = items.filter(x => (x.category || "") === leagueSel);
  }

  if (upcomingOnly){
    items = items.filter(x => isUpcoming(x.start));
  }

  if (q){
    items = items.filter(x => {
      const hay = [x.title, x.venue, x.city, x.category].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  // sort (reuse)
  const mapped = items.map(x => ({...x, kickoff:x.start, league:x.category}));
  const sorted = sortItems(mapped, sortMode).map(x => ({...x, start:x.kickoff, category:x.league}));

  showCount(sorted.length, events.length);

  const wrap = document.createElement("div");
  wrap.className = "cards";

  for (const e of sorted){
    const card = document.createElement("div");
    card.className = "card";

    const h = document.createElement("h3");
    h.textContent = e.title;
    card.appendChild(h);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.appendChild(badge(`🕒 ${fmtOslo(e.start)}`));
    meta.appendChild(badge(`🏷️ ${e.category || "Event"}`));
    if (e.venue) meta.appendChild(badge(`📍 ${e.venue}${e.city ? ", " + e.city : ""}`));
    card.appendChild(meta);

    if (e.url){
      const hr = document.createElement("div");
      hr.className = "hr";
      card.appendChild(hr);

      const a = document.createElement("a");
      a.href = e.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "Åpne arrangement";
      a.style.color = "var(--accent)";
      a.style.textDecoration = "none";
      card.appendChild(a);
    }

    wrap.appendChild(card);
  }

  content.innerHTML = "";
  content.appendChild(wrap);
}

function renderPubs(pubs){
  const content = qs("content");
  const sel = qs("leagueSelect"); // reuse as "by city/tags"? We'll keep simple: show all in list; filter via search
  const pubSel = qs("pubSelect").value;
  const q = (qs("q").value || "").trim().toLowerCase();
  const upcomingOnly = qs("upcomingOnly"); // irrelevant here
  if (upcomingOnly) upcomingOnly.checked = false;

  // Build pub dropdown behavior:
  let list = pubs.map(normalizePub);

  // filter by pubSelect: in pubs tab we use pubSelect as "choose pub"
  if (pubSel !== "__all__" && pubSel !== "__unset__"){
    list = list.filter(p => p.name === pubSel);
  }

  if (q){
    list = list.filter(p => {
      const hay = [p.name, p.city, ...(p.tags||[])].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  showCount(list.length, pubs.length);

  // If exactly 1 pub selected, show map + details (as requested)
  if (list.length === 1){
    const p = list[0];

    const box = document.createElement("div");
    box.className = "pubBox";

    const left = document.createElement("div");
    left.className = "pubCard";

    const h = document.createElement("h3");
    h.textContent = `${p.name} (${p.city})`;
    left.appendChild(h);

    if (p.tags && p.tags.length){
      const t = document.createElement("div");
      t.className = "meta";
      t.appendChild(badge(`🏷️ ${p.tags.join(" • ")}`));
      left.appendChild(t);
    }

    if (p.note){
      const n = document.createElement("div");
      n.style.marginTop = "10px";
      n.style.color = "var(--muted)";
      n.textContent = p.note;
      left.appendChild(n);
    }

    const hr = document.createElement("div");
    hr.className = "hr";
    left.appendChild(hr);

    const website = document.createElement("div");
    if (p.website){
      website.innerHTML = `🌐 <a href="${p.website}" target="_blank" rel="noopener">Hjemmeside</a>`;
    } else {
      website.innerHTML = `🌐 <span style="color:var(--muted)">Ingen link satt</span>`;
    }
    left.appendChild(website);

    // Map
    const right = document.createElement("div");
    right.className = "mapFrame";

    const map = document.createElement("iframe");
    map.style.border = "0";
    map.width = "100%";
    map.height = "100%";
    map.loading = "lazy";
    map.referrerPolicy = "no-referrer-when-downgrade";

    if (typeof p.lat === "number" && typeof p.lon === "number"){
      // embed OSM
      const bbox = `${p.lon-0.01},${p.lat-0.01},${p.lon+0.01},${p.lat+0.01}`;
      const marker = `${p.lat},${p.lon}`;
      map.src = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(marker)}`;
      right.appendChild(map);
    } else {
      // fallback search
      const q = encodeURIComponent(`${p.name} ${p.city}`);
      map.src = `https://www.openstreetmap.org/export/embed.html?bbox=9.6,59.0,9.9,59.2&layer=mapnik`;
      right.appendChild(map);

      const tip = document.createElement("div");
      tip.style.padding = "10px 12px";
      tip.style.color = "var(--muted)";
      tip.innerHTML = `Tips: legg inn <strong>lat</strong> og <strong>lon</strong> i <code>data/pubs.json</code> for nøyaktig kart. <br>Åpne søk: <a style="color:var(--accent); text-decoration:none" target="_blank" rel="noopener" href="https://www.openstreetmap.org/search?query=${q}">OpenStreetMap-søk</a>`;
      left.appendChild(tip);
    }

    box.appendChild(left);
    box.appendChild(right);

    content.innerHTML = "";
    content.appendChild(box);
    return;
  }

  // else show list
  const wrap = document.createElement("div");
  wrap.className = "cards";

  for (const p of list){
    const card = document.createElement("div");
    card.className = "card";

    const h = document.createElement("h3");
    h.textContent = `${p.name} (${p.city})`;
    card.appendChild(h);

    const meta = document.createElement("div");
    meta.className = "meta";
    if (p.tags && p.tags.length) meta.appendChild(badge(`🏷️ ${p.tags.join(" • ")}`));
    if (p.website) meta.appendChild(badge(`🌐 Hjemmeside`));
    card.appendChild(meta);

    if (p.website){
      const a = document.createElement("a");
      a.href = p.website;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = p.website;
      a.style.color = "var(--accent)";
      a.style.textDecoration = "none";
      a.style.display = "inline-block";
      a.style.marginTop = "10px";
      card.appendChild(a);
    }

    wrap.appendChild(card);
  }

  content.innerHTML = "";
  content.appendChild(wrap);
}

const state = {
  tab: "football",
  subtab: "menn",
  data: {
    football: [],
    handball_menn: [],
    handball_damer: [],
    wintersport_menn: [],
    wintersport_kvinner: [],
    vm2026: [],
    events: [],
    pubs: []
  }
};

async function loadAll(){
  // pubs first (used by mapping)
  try{
    const pubsObj = await fetchJSON(DATA_FILES.pubs);
    const pubsArr = (pubsObj.pubs || pubsObj.places || []);
    state.data.pubs = Array.isArray(pubsArr) ? pubsArr.map(normalizePub) : [];
  }catch(e){
    console.warn("pubs.json load failed:", e);
    state.data.pubs = [];
  }

  // football merged
  const football = [];
  for (const f of DATA_FILES.football){
    try{
      const obj = await fetchJSON(f);
      const arr = obj.games || obj.matches || [];
      if (Array.isArray(arr)) football.push(...arr.map(normalizeGame));
    }catch(e){
      console.warn("football file failed:", f, e);
    }
  }
  state.data.football = football;

  // handball
  for (const k of ["menn","damer"]){
    try{
      const obj = await fetchJSON(DATA_FILES.handball[k]);
      const arr = obj.games || obj.matches || [];
      state.data[`handball_${k}`] = Array.isArray(arr) ? arr.map(normalizeGame) : [];
    }catch(e){
      console.warn("handball load failed:", k, e);
      state.data[`handball_${k}`] = [];
    }
  }

  // wintersport
  for (const k of ["menn","kvinner"]){
    try{
      const obj = await fetchJSON(DATA_FILES.wintersport[k]);
      const arr = obj.games || obj.matches || obj.events || [];
      // allow either game-like or event-like
      const normalized = Array.isArray(arr)
        ? arr.map(x => x.kickoff || x.home ? normalizeGame(x) : ({...normalizeEvent(x), league: normalizeEvent(x).category, kickoff: normalizeEvent(x).start}))
        : [];
      state.data[`wintersport_${k}`] = normalized.map(x => {
        // normalize to game-like for renderer
        if (x.kickoff) return normalizeGame(x);
        return normalizeGame({
          league: x.league || "Vintersport",
          home: x.title || "",
          away: x.venue || "",
          kickoff: x.start || x.kickoff || "",
          channel: "",
          where: []
        });
      });
    }catch(e){
      console.warn("wintersport load failed:", k, e);
      state.data[`wintersport_${k}`] = [];
    }
  }

  // vm2026
  try{
    const obj = await fetchJSON(DATA_FILES.vm2026);
    const arr = obj.games || obj.matches || obj.events || [];
    state.data.vm2026 = Array.isArray(arr) ? arr.map(normalizeGame) : [];
  }catch(e){
    console.warn("vm2026 load failed:", e);
    state.data.vm2026 = [];
  }

  // events
  try{
    const obj = await fetchJSON(DATA_FILES.events);
    const arr = obj.events || [];
    state.data.events = Array.isArray(arr) ? arr.map(normalizeEvent) : [];
  }catch(e){
    console.warn("events load failed:", e);
    state.data.events = [];
  }
}

function setupControls(){
  // listeners
  qs("leagueSelect").onchange = refresh;
  qs("pubSelect").onchange = refresh;
  qs("q").oninput = refresh;
  qs("sortSelect").onchange = refresh;
  qs("upcomingOnly").onchange = refresh;

  window.addEventListener("online", ()=>{ setNetStatus(); });
  window.addEventListener("offline", ()=>{ setNetStatus(); });
}

function setActiveTab(key){
  state.tab = key;

  // default subtabs
  if (key === "handball") state.subtab = state.subtab || "menn";
  if (key === "wintersport") state.subtab = state.subtab || "menn";

  renderTabs(state.tab);
  renderSubtabs(state.tab, state.subtab);
  refresh(true);
}

function refresh(resetFilters=false){
  setNetStatus();

  const leagueSelect = qs("leagueSelect");
  const pubSelect = qs("pubSelect");
  const controls = qs("controls");

  const pubs = state.data.pubs || [];
  const pubIndex = buildPubIndex(pubs);

  // Determine dataset based on tab
  let items = [];
  let leagueOptions = [{ value:"__all__", label:"Alle" }];
  let pubOptions = [{ value:"__all__", label:"Alle" }, { value:"__unset__", label:"Ikke satt" }];

  if (state.tab === "football"){
    items = state.data.football || [];
    const leagues = uniq(items.map(x => x.league)).sort((a,b)=>a.localeCompare(b,"no"));
    leagueOptions.push(...leagues.map(l => ({ value:l, label:l })));

    const allSuggested = uniq(items.flatMap(g => suggestPubsForGame(g, pubIndex)));
    const pubsSorted = allSuggested.sort((a,b)=>a.localeCompare(b,"no"));
    pubOptions = [{ value:"__all__", label:"Alle" }, { value:"__unset__", label:"Ikke satt" }]
      .concat(pubsSorted.map(p => ({ value:p, label:p })));

    if (resetFilters){
      leagueSelect.value = "__all__";
      pubSelect.value = "__all__";
      qs("q").value = "";
    }

    fillSelect(leagueSelect, leagueOptions, leagueSelect.value || "__all__");
    fillSelect(pubSelect, pubOptions, pubSelect.value || "__all__");

    renderGames(items, pubIndex);
    controls.style.display = "grid";
    return;
  }

  if (state.tab === "handball"){
    items = state.data[`handball_${state.subtab}`] || [];
    const leagues = uniq(items.map(x => x.league)).sort((a,b)=>a.localeCompare(b,"no"));
    leagueOptions.push(...leagues.map(l => ({ value:l, label:l })));

    const allSuggested = uniq(items.flatMap(g => suggestPubsForGame(g, pubIndex)));
    const pubsSorted = allSuggested.sort((a,b)=>a.localeCompare(b,"no"));
    pubOptions = [{ value:"__all__", label:"Alle" }, { value:"__unset__", label:"Ikke satt" }]
      .concat(pubsSorted.map(p => ({ value:p, label:p })));

    if (resetFilters){
      leagueSelect.value = "__all__";
      pubSelect.value = "__all__";
      qs("q").value = "";
    }

    fillSelect(leagueSelect, leagueOptions, leagueSelect.value || "__all__");
    fillSelect(pubSelect, pubOptions, pubSelect.value || "__all__");

    renderGames(items, pubIndex);
    controls.style.display = "grid";
    return;
  }

  if (state.tab === "wintersport"){
    items = state.data[`wintersport_${state.subtab}`] || [];
    const leagues = uniq(items.map(x => x.league)).sort((a,b)=>a.localeCompare(b,"no"));
    leagueOptions.push(...leagues.map(l => ({ value:l, label:l })));

    // For wintersport, pubs are optional – keep same UI
    const allSuggested = uniq(items.flatMap(g => suggestPubsForGame(g, pubIndex)));
    const pubsSorted = allSuggested.sort((a,b)=>a.localeCompare(b,"no"));
    pubOptions = [{ value:"__all__", label:"Alle" }, { value:"__unset__", label:"Ikke satt" }]
      .concat(pubsSorted.map(p => ({ value:p, label:p })));

    if (resetFilters){
      leagueSelect.value = "__all__";
      pubSelect.value = "__all__";
      qs("q").value = "";
    }

    fillSelect(leagueSelect, leagueOptions, leagueSelect.value || "__all__");
    fillSelect(pubSelect, pubOptions, pubSelect.value || "__all__");

    renderGames(items, pubIndex);
    controls.style.display = "grid";
    return;
  }

  if (state.tab === "vm2026"){
    items = state.data.vm2026 || [];
    const leagues = uniq(items.map(x => x.league)).sort((a,b)=>a.localeCompare(b,"no"));
    leagueOptions.push(...leagues.map(l => ({ value:l, label:l })));

    const allSuggested = uniq(items.flatMap(g => suggestPubsForGame(g, pubIndex)));
    const pubsSorted = allSuggested.sort((a,b)=>a.localeCompare(b,"no"));
    pubOptions = [{ value:"__all__", label:"Alle" }, { value:"__unset__", label:"Ikke satt" }]
      .concat(pubsSorted.map(p => ({ value:p, label:p })));

    if (resetFilters){
      leagueSelect.value = "__all__";
      pubSelect.value = "__all__";
      qs("q").value = "";
    }

    fillSelect(leagueSelect, leagueOptions, leagueSelect.value || "__all__");
    fillSelect(pubSelect, pubOptions, pubSelect.value || "__all__");

    renderGames(items, pubIndex);
    controls.style.display = "grid";
    return;
  }

  if (state.tab === "events"){
    const ev = state.data.events || [];
    const cats = uniq(ev.map(x => x.category)).sort((a,b)=>a.localeCompare(b,"no"));
    leagueOptions = [{ value:"__all__", label:"Alle" }].concat(cats.map(c => ({ value:c, label:c })));

    // pubSelect not used here, but keep it simple
    pubOptions = [{ value:"__all__", label:"Alle" }];

    if (resetFilters){
      leagueSelect.value = "__all__";
      pubSelect.value = "__all__";
      qs("q").value = "";
    }

    fillSelect(leagueSelect, leagueOptions, leagueSelect.value || "__all__");
    fillSelect(pubSelect, pubOptions, "__all__");

    renderEvents(ev);
    controls.style.display = "grid";
    return;
  }

  if (state.tab === "pubs"){
    // leagueSelect not used; keep it simple
    leagueOptions = [{ value:"__all__", label:"Alle" }];
    fillSelect(leagueSelect, leagueOptions, "__all__");

    // pubSelect becomes the pub chooser
    const pubNames = uniq((state.data.pubs||[]).map(p => p.name)).sort((a,b)=>a.localeCompare(b,"no"));
    pubOptions = [{ value:"__all__", label:"Alle pubber" }].concat(pubNames.map(n => ({ value:n, label:n })));

    if (resetFilters){
      pubSelect.value = "__all__";
      qs("q").value = "";
    }

    fillSelect(pubSelect, pubOptions, pubSelect.value || "__all__");
    renderPubs(state.data.pubs || []);
    controls.style.display = "grid";
    return;
  }
}

async function boot(){
  setNetStatus();
  setupControls();
  renderTabs(state.tab);
  renderSubtabs(state.tab, state.subtab);

  // initial selects
  fillSelect(qs("leagueSelect"), [{ value:"__all__", label:"Alle" }], "__all__");
  fillSelect(qs("pubSelect"), [{ value:"__all__", label:"Alle" }], "__all__");

  try{
    await loadAll();
  }catch(e){
    console.error("loadAll failed:", e);
  }

  refresh(true);
}

boot();
