(() => {
  const FEED = "data/2026/calendar_feed.json";
  const TZ = "Europe/Oslo";

  const grid = document.getElementById("grid");
  const dayList = document.getElementById("dayList");
  const monthLabel = document.getElementById("monthLabel");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const todayBtn = document.getElementById("todayBtn");

  const pad = (n) => String(n).padStart(2, "0");
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

  const dot = (color) => ({ red:"🔴", yellow:"🟡", green:"🟢", gray:"⚪" }[color] || "⚪");

  const fmtOslo = (iso) => {
    try {
      return new Date(iso).toLocaleString("no-NO", {
        timeZone: TZ,
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return iso;
    }
  };

  async function fetchJSON(path){
    const url = new URL(`./${path}`, window.location.href).toString();
    const res = await fetch(url, { cache:"no-store" });
    if(!res.ok) throw new Error(`Kunne ikke laste ${path} (${res.status})`);
    return await res.json();
  }

  let items = [];
  let cursor = new Date();

  function itemsForDay(ymd){
    return items.filter(x => x.date === ymd).sort((a,b)=> (a.kickoff||"").localeCompare(b.kickoff||""));
  }

  function renderDay(ymd){
    const list = itemsForDay(ymd);
    if(!list.length){
      dayList.className = "empty";
      dayList.textContent = "Ingen events denne dagen (enda).";
      return;
    }

    dayList.className = "";
    dayList.innerHTML = list.map(x => `
      <div class="card" style="cursor:default;">
        <div class="row">
          <div>
            <div class="teams">${(x.home||"")}${x.away ? " – "+x.away : ""}</div>
            <div class="muted small">${x.league} • ${x.sport}</div>
          </div>
          <div class="muted small" style="text-align:right;min-width:140px;">${fmtOslo(x.kickoff)}</div>
        </div>
        <div class="badges">
          <div class="badge accent">${x.channel || "Ukjent"}</div>
          <div class="badge">${(x.where && x.where[0]) ? x.where[0] : "Ukjent"}</div>
        </div>
      </div>
    `).join("");
  }

  function renderMonth(){
    grid.innerHTML = "";

    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month+1, 0);

    monthLabel.textContent = first.toLocaleString("no-NO", { month:"long", year:"numeric" });

    const startDow = (first.getDay()+6)%7; // mon=0
    const daysInMonth = last.getDate();

    const headers = ["MAN","TIR","ONS","TOR","FRE","LØR","SØN"];
    for(const h of headers){
      const el = document.createElement("div");
      el.style.color = "var(--muted)";
      el.style.fontSize = "12px";
      el.style.fontWeight = "800";
      el.textContent = h;
      grid.appendChild(el);
    }

    for(let i=0;i<startDow;i++){
      const blank = document.createElement("div");
      blank.className = "empty";
      blank.style.minHeight = "70px";
      grid.appendChild(blank);
    }

    for(let d=1; d<=daysInMonth; d++){
      const day = new Date(year, month, d);
      const ymd = isoDate(day);
      const list = itemsForDay(ymd);

      const dots = [...new Set(list.map(x => x.color))].map(dot).join(" ");

      const cell = document.createElement("div");
      cell.className = "card";
      cell.style.minHeight = "70px";
      cell.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:8px;">
          <div style="font-weight:900;">${d}</div>
          <div style="color:var(--muted);font-size:12px;">${dots}</div>
        </div>
      `;
      cell.addEventListener("click", () => renderDay(ymd));
      grid.appendChild(cell);
    }
  }

  function stepMonth(delta){
    cursor = new Date(cursor.getFullYear(), cursor.getMonth()+delta, 1);
    renderMonth();
    dayList.className="empty";
    dayList.textContent="Klikk på en dato for detaljer.";
  }

  (async () => {
    const feed = await fetchJSON(FEED);
    items = Array.isArray(feed.items) ? feed.items : [];
    renderMonth();

    prevBtn.addEventListener("click", () => stepMonth(-1));
    nextBtn.addEventListener("click", () => stepMonth(1));
    todayBtn.addEventListener("click", () => {
      cursor = new Date();
      renderMonth();
    });
  })();
})();
