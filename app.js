:root{
  --bg:#0b0f17;
  --panel:#111827;
  --card:#0f172a;
  --text:#e5e7eb;
  --muted:rgba(229,231,235,.65);
  --line:rgba(229,231,235,.12);
  --accent:#60a5fa;
  --good:#22c55e;
  --bad:#ef4444;
}

*{ box-sizing:border-box; }
html,body{ height:100%; }
body{
  margin:0;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
  background:
    radial-gradient(1200px 600px at 20% -10%, rgba(96,165,250,.20), transparent),
    radial-gradient(900px 500px at 100% 0%, rgba(34,197,94,.12), transparent),
    var(--bg);
  color:var(--text);
}

.wrap{ max-width:1100px; margin:0 auto; padding:0 16px; }

.topbar{
  position:sticky; top:0;
  background: rgba(11,15,23,.72);
  backdrop-filter: blur(10px);
  border-bottom:1px solid var(--line);
  z-index:50;
}

/* Header grid */
.header-grid{
  display:grid;
  grid-template-columns: 1fr auto 1fr;
  grid-template-rows: auto auto;
  align-items:center;
  gap:10px 14px;
  padding:14px 0 12px 0;
}

.brand{ grid-column:1; grid-row:1; min-height:1px; }
.status{ grid-column:3; grid-row:1; min-height:1px; }

/* Center title */
.hero{
  grid-column:2;
  grid-row:1;
  justify-self:center;
  text-align:center;
  pointer-events:none;
}
.hero-title{
  font-weight:950;
  letter-spacing:.3px;
  font-size:34px;
  line-height:1.05;
}
.hero-sub{
  margin-top:6px;
  font-size:13px;
  line-height:1.35;
  color:var(--muted);
  max-width:820px;
}

/* Tabs under title */
.tabs{
  grid-column:1 / 4;
  grid-row:2;
  justify-self:center;
  display:flex;
  gap:8px;
  align-items:center;
  flex-wrap:wrap;
}

.tab{
  border:1px solid var(--line);
  background: rgba(15,23,42,.55);
  color: var(--text);
  border-radius:999px;
  padding:8px 12px;
  cursor:pointer;
  font-weight:700;
  font-size:13px;
}
.tab:hover{ border-color: rgba(96,165,250,.35); }
.tab.active{
  border-color: rgba(96,165,250,.55);
  background: rgba(96,165,250,.18);
}

.main{ padding:18px 0 32px; display:grid; gap:14px; }

.panel{
  background:rgba(17,24,39,.75);
  border:1px solid var(--line);
  border-radius:18px;
  padding:14px;
  box-shadow: 0 18px 50px rgba(0,0,0,.25);
}

.controls{
  display:grid;
  grid-template-columns: 1.1fr .8fr 1.4fr .5fr;
  gap:12px;
}
@media (max-width: 900px){
  .controls{ grid-template-columns:1fr 1fr; }
}
@media (max-width: 520px){
  .controls{ grid-template-columns:1fr; }
}

.control label{ display:block; font-size:12px; color:var(--muted); margin:0 0 6px 2px; }

select, input{
  width:100%;
  padding:10px 10px;
  border-radius:14px;
  border:1px solid var(--line);
  background: rgba(15,23,42,.8);
  color:var(--text);
  outline:none;
}
select:focus, input:focus{
  border-color: rgba(96,165,250,.55);
  box-shadow:0 0 0 4px rgba(96,165,250,.18);
}

.control.right{ display:flex; flex-direction:column; justify-content:flex-end; }

.btn{
  width:100%;
  padding:10px 12px;
  border-radius:14px;
  border:1px solid rgba(96,165,250,.35);
  background: rgba(96,165,250,.15);
  color:var(--text);
  font-weight:700;
  cursor:pointer;
}
.btn:hover{ background: rgba(96,165,250,.22); }

.meta{ display:flex; justify-content:space-between; gap:12px; }
.hint{ font-size:13px; color:var(--muted); }
.muted{ color:var(--muted); }
.small{ font-size:12px; }

.list{ display:grid; gap:10px; }

/* ✅ IMPORTANT: buttons får ofte "default" svart tekst -> tving farge */
.card{
  border:1px solid var(--line);
  background: rgba(15,23,42,.7);
  border-radius:16px;
  padding:12px;
  cursor:pointer;
  transition: transform .08s ease, border-color .08s ease;
  text-align:left;

  /* FIX: lesbar tekst */
  color: var(--text);
}
.card *{ color: inherit; } /* FIX: alt inni arver hvit */
.card:hover{ transform: translateY(-1px); border-color: rgba(96,165,250,.35); }

.row{ display:flex; justify-content:space-between; gap:10px; align-items:flex-start; }
.teams{ font-weight:800; }
.badges{ display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
.badge{
  font-size:12px; padding:6px 10px; border-radius:999px;
  border:1px solid var(--line);
  color:var(--muted);
  background: rgba(11,15,23,.35);
}
.badge.accent{ border-color: rgba(96,165,250,.35); color: rgba(229,231,235,.92); }

.error{
  border:1px solid rgba(239,68,68,.35);
  background: rgba(239,68,68,.10);
  color: rgba(255,220,220,.95);
  padding:12px;
  border-radius:16px;
  white-space:pre-wrap;
}

.empty{
  border:1px dashed rgba(229,231,235,.25);
  padding:14px;
  border-radius:16px;
  color:var(--muted);
}

.hidden{ display:none !important; }

/* Modal */
.modal-backdrop{
  position:fixed; inset:0;
  background: rgba(0,0,0,.55);
  display:grid; place-items:center;
  padding:18px;
  z-index:200;
}
.modal{
  width:min(680px, 100%);
  border-radius:20px;
  background: rgba(17,24,39,.95);
  border:1px solid var(--line);
  box-shadow: 0 30px 90px rgba(0,0,0,.55);
}
.modal-head{
  display:flex; align-items:flex-start; justify-content:space-between; gap:12px;
  padding:14px 14px 10px 14px;
  border-bottom:1px solid var(--line);
}
.modal-title{ font-weight:900; font-size:18px; }
.modal-sub{ font-size:13px; margin-top:4px; }
.iconbtn{
  background: transparent;
  border:1px solid var(--line);
  color: var(--text);
  border-radius:12px;
  padding:8px 10px;
  cursor:pointer;
}
.iconbtn:hover{ border-color: rgba(96,165,250,.35); }
.modal-body{ padding:14px; }
.kv{
  display:grid;
  grid-template-columns: 140px 1fr;
  gap:10px 12px;
  margin-bottom:12px;
}
.k{ color:var(--muted); font-size:13px; }
.v{ font-weight:700; }

.h2{ margin:0; font-weight:900; font-size:14px; }

/* Calendar layout */
.calendar-layout{
  display:grid;
  grid-template-columns: 1.6fr .9fr;
  gap:12px;
}
@media (max-width: 900px){
  .calendar-layout{ grid-template-columns:1fr; }
}

.calendar-root{
  border:1px solid var(--line);
  border-radius:16px;
  padding:12px;
  background: rgba(15,23,42,.55);

  /* ✅ FIX: kalender “forsvinner” ikke */
  min-height: 340px;
  overflow:auto;
}
.calendar-side{
  border:1px solid var(--line);
  border-radius:16px;
  padding:12px;
  background: rgba(15,23,42,.55);
  min-height: 340px;
}

/* Calendar month */
.cal-month{ margin-bottom:14px; }
.cal-head{ font-weight:900; margin:4px 0 8px; }
.cal-dow{
  display:grid;
  grid-template-columns: repeat(7, 1fr);
  gap:6px;
  color:var(--muted);
  font-size:12px;
  margin-bottom:6px;
}
.cal-grid{
  display:grid;
  grid-template-columns: repeat(7, 1fr);
  gap:6px;
}
.cal-cell{
  border:1px solid var(--line);
  background: rgba(11,15,23,.35);
  color:var(--text);
  border-radius:12px;
  padding:8px 8px;
  cursor:pointer;
  min-height:56px;
  display:flex;
  flex-direction:column;
  justify-content:space-between;
}
.cal-cell:hover{ border-color: rgba(96,165,250,.35); }
.cal-empty{ opacity:.35; cursor:default; }
.cal-day{ font-weight:900; font-size:12px; }
.cal-dots{ font-size:12px; letter-spacing:1px; opacity:.95; }

/* Mobile */
@media (max-width: 760px){
  .hero-title{ font-size:26px; }
  .hero-sub{ font-size:12px; }
  .tabs{ justify-content:center; }
}
