// ===== Grenland Live – Stabilisering helpers (NO DESIGN CHANGES) =====
const ONLY_YEAR = 2026;

// Default pubs (alltid først)
const DEFAULT_PUBS = ["Gimle Pub", "Vikinghjørnet"];

// Default channel fallback (kun når data mangler channel/tv)
function defaultChannelForLeague(leagueRaw=""){
  const s = (leagueRaw || "").toLowerCase();
  if (s.includes("premier")) return "Viaplay / V Sport";
  if (s.includes("champions")) return "TV 2 / TV 2 Play";
  if (s.includes("la liga") || s.includes("laliga")) return "TV 2 / TV 2 Play";
  if (s.includes("eliteserien") || s.includes("obos")) return "TV 2 / TV 2 Play";
  return "Ukjent";
}

function pick(obj, keys){
  for (const k of keys){
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return null;
}

function toIsoMaybe(v){
  if (!v) return null;
  // Hvis det allerede er ISO med timezone: bruk som det er
  if (typeof v === "string" && (v.includes("T") && (v.includes("+") || v.endsWith("Z")))) return v;
  // Hvis det er ISO uten tz: anta lokal (Oslo) ved å bare legge til +01:00/+02:00 blir feil pga DST,
  // så vi lar Date parse og bruker toISOString (UTC) – visning formatter du allerede med Oslo-locale.
  try {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toISOString();
  } catch(e){}
  return null;
}

function yearFromIso(iso){
  try { return new Date(iso).getFullYear(); } catch(e){ return null; }
}

function uniqPreserve(arr){
  const out = [];
  const seen = new Set();
  for (const x of (arr || [])){
    const k = String(x);
    if (!seen.has(k)){
      seen.add(k);
      out.push(x);
    }
  }
  return out;
}

// Normaliser til én intern match-form som UI kan bruke
function normalizeMatch(item, fallbackLeague){
  // fotball-skjemaer (du har flere varianter i repoet)
  const league = pick(item, ["league","competition","tournament"]) || fallbackLeague || "Ukjent";

  const home = pick(item, ["home","homeTeam","hjemme","team1"]) || "";
  const away = pick(item, ["away","awayTeam","borte","team2"]) || "";

  const kickoffRaw = pick(item, ["kickoff","start","date","datetime","time","utcDate"]);
  const kickoff = toIsoMaybe(kickoffRaw);

  const channel = pick(item, ["channel","tv","broadcaster"]) || "";

  // pubs kan ligge som where[], pubs[], eller pubs:[{name,city,url}]
  let where = pick(item, ["where","pubs","venues"]) || [];
  // normaliser pubs-objekter til tekst (men behold url via data-attributt senere)
  // vi lar where være array av enten string eller object, og håndterer i renderer.
  if (!Array.isArray(where)) where = [];

  // vintersport: ofte finnes navn/tittel og ikke home/away
  const title = pick(item, ["name","title","event","race","summary"]) || "";

  return { league, home, away, kickoff, channel, where, title, raw: item };
}

// 2026-filter (KRITISK)
function isInOnlyYear(m){
  if (!m || !m.kickoff) return false;
  return yearFromIso(m.kickoff) === ONLY_YEAR;
}

// Enrich: sett default channel hvis mangler + default pubs først
function enrichMatch(m){
  // Kanal
  if (!m.channel || String(m.channel).trim() === "" || String(m.channel).toLowerCase() === "ukjent"){
    m.channel = defaultChannelForLeague(m.league);
  }

  // Pubs – alltid Gimle + Vikinghjørnet først, så resten (hvis finnes)
  const strings = [];
  const objs = [];

  for (const p of (m.where || [])){
    if (typeof p === "string") strings.push(p);
    else if (p && typeof p === "object") objs.push(p);
  }

  const restStrings = strings.filter(x => !DEFAULT_PUBS.includes(x));
  const restObjs = objs.filter(o => !DEFAULT_PUBS.includes(o.name));

  // Rebuild where: default pubs først (strings), deretter resten
  m.where = [
    ...DEFAULT_PUBS,
    ...restStrings,
    ...restObjs
  ];

  // fjern duplikater i string-delen (objekter beholdes)
  const rebuilt = [];
  const seen = new Set();
  for (const p of m.where){
    if (typeof p === "string"){
      if (!seen.has(p)){
        seen.add(p);
        rebuilt.push(p);
      }
    } else {
      rebuilt.push(p);
    }
  }
  m.where = rebuilt;

  return m;
}
