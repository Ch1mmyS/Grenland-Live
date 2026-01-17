 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/app.js b/app.js
index 8b8db4c9feeebaf56a6eb101cc00ddf49e685ae9..9596b13d92ce066ad6f101d5a2732134309b1260 100644
--- a/app.js
+++ b/app.js
@@ -5,56 +5,70 @@ async function loadJSON(path){
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
 
-function renderInfoBox(el, p){
-  if(!p){ el.innerHTML = ""; return; }
-
-  const tags = (p.tags || []).map(t => esc(t)).join(" • ");
-  const website = p.website ? `<a class="glLink" href="${p.website}" target="_blank" rel="noopener">Nettside / SoMe</a>` : "";
-  const map = `<a class="glLink" href="${p.map || mapLink(p.name + " " + p.city)}" target="_blank" rel="noopener">Kart</a>`;
+function resolvePubLink(p, sources = []){
+  const sourceMatch = sources.find(s => s.name === p.name && s.city === p.city);
+  const sourceLink = sourceMatch && sourceMatch.link ? sourceMatch.link : "";
+  if (p.website) return { href: p.website, label: "Nettside / SoMe" };
+  if (sourceLink) return { href: sourceLink, label: "Program / SoMe" };
+  return {
+    href: `https://www.google.com/search?q=${encodeURIComponent(p.name + " " + p.city)}`,
+    label: "Søk etter pub",
+  };
+}
+
+function renderInfoBox(el, p, sources){
+  if(!p){ el.innerHTML = ""; return; }
+
+  const tags = (p.tags || []).map(t => esc(t)).join(" • ");
+  const websiteInfo = resolvePubLink(p, sources);
+  const websiteHref = websiteInfo.href;
+  const websiteLabel = websiteInfo.label;
+  const website = `<a class="glLink" href="${websiteHref}" target="_blank" rel="noopener">${websiteLabel}</a>`;
+  const map = `<a class="glLink" href="${p.map || mapLink(p.name + " " + p.city)}" target="_blank" rel="noopener">Kart</a>`;
 
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
 
@@ -146,69 +160,84 @@ document.addEventListener("DOMContentLoaded", async () => {
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
 
-    pubSelect.addEventListener("change", () => renderInfoBox(pubInfo, pubs[pubSelect.value]));
-    jamSelect.addEventListener("change", () => renderInfoBox(jamInfo, pubs.filter(p => (p.tags||[]).includes("Jam") || (p.tags||[]).includes("Jam nights"))[jamSelect.value]));
-    quizSelect.addEventListener("change", () => renderInfoBox(quizInfo, pubs.filter(p => (p.tags||[]).includes("Quiz"))[quizSelect.value]));
+    pubSelect.addEventListener("change", () => renderInfoBox(pubInfo, pubs[pubSelect.value], sources));
+    jamSelect.addEventListener("change", () => renderInfoBox(jamInfo, pubs.filter(p => (p.tags||[]).includes("Jam") || (p.tags||[]).includes("Jam nights"))[jamSelect.value], sources));
+    quizSelect.addEventListener("change", () => renderInfoBox(quizInfo, pubs.filter(p => (p.tags||[]).includes("Quiz"))[quizSelect.value], sources));
 
     // ARRANGEMENT-KILDER (programsider)
     const srcData = await loadJSON("./data/event_sources.json");
     sources = srcData.sources || [];
     eventsSelect.innerHTML = `<option value="">Velg program …</option>` + sources.map((s,i)=>`<option value="${i}">${esc(s.name)} (${esc(s.city)})</option>`).join("");
-    eventsSelect.addEventListener("change", () => {
-      const s = sources[eventsSelect.value];
-      if(!s){ eventsInfo.innerHTML = ""; return; }
-      eventsInfo.innerHTML = `
-        <div class="item">
-          <strong>${esc(s.name)} <span class="badge">${esc(s.city)}</span></strong>
-          <div class="meta">${esc(s.details || "")}</div>
-          ${s.link ? `<a class="glLink" href="${s.link}" target="_blank" rel="noopener">Åpne program</a>` : ""}
-        </div>
-      `;
-    });
+    eventsSelect.addEventListener("change", () => {
+      const s = sources[eventsSelect.value];
+      if(!s){ eventsInfo.innerHTML = ""; return; }
+      const pubMatch = pubs.find(p => p.name === s.name && p.city === s.city);
+      const pubWebsite = pubMatch && pubMatch.website ? pubMatch.website : "";
+      const pubMap = pubMatch && pubMatch.map ? pubMatch.map : mapLink(`${s.name} ${s.city}`);
+      const programLink = s.link || "";
+      const programLabel = programLink ? "Åpne program" : "";
+      const fallbackLabel = !programLink && pubWebsite ? "Åpne pub" : "";
+      const searchHref = `https://www.google.com/search?q=${encodeURIComponent(`${s.name} ${s.city}`)}`;
+      const searchLabel = !programLink && !pubWebsite ? "Søk etter pub" : "";
+      const programHtml = programLink
+        ? `<a class="glLink" href="${programLink}" target="_blank" rel="noopener">${programLabel}</a>`
+        : (pubWebsite
+          ? `<a class="glLink" href="${pubWebsite}" target="_blank" rel="noopener">${fallbackLabel}</a>`
+          : `<a class="glLink" href="${searchHref}" target="_blank" rel="noopener">${searchLabel}</a>`);
+      const mapHtml = pubMap ? `<a class="glLink" href="${pubMap}" target="_blank" rel="noopener">Kart</a>` : "";
+
+      eventsInfo.innerHTML = `
+        <div class="item">
+          <strong>${esc(s.name)} <span class="badge">${esc(s.city)}</span></strong>
+          <div class="meta">${esc(s.details || "")}</div>
+          ${programHtml}${mapHtml}
+        </div>
+      `;
+    });
 
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
 
EOF
)
