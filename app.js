async function loadJSON(path) {
  const res = await fetch(path);
  return await res.json();
}

function card(title, body) {
  return `
    <div class="card">
      <div class="title">${title}</div>
      <div class="meta">${body}</div>
    </div>
  `;
}

async function init() {
  const pubsData = await loadJSON("./data/pubs.json");
  const pubs = pubsData.places;

  const out = document.getElementById("results");

  let options = pubs.map((p, i) =>
    `<option value="${i}">${p.name} (${p.city})</option>`
  ).join("");

  out.innerHTML = `
    ${card("Puber i Grenland", `
      <select id="pubSelect" class="glSelect">
        <option value="">Velg pub…</option>
        ${options}
      </select>
      <div id="pubInfo"></div>
    `)}
  `;

  document.getElementById("pubSelect").addEventListener("change", e => {
    const p = pubs[e.target.value];
    if (!p) return;

    document.getElementById("pubInfo").innerHTML = `
      <div><strong>${p.name}</strong> – ${p.city}</div>
      <div>${p.tags.join(" • ")}</div>
      ${p.website ? `<a class="glLink" href="${p.website}" target="_blank">🔗 Nettside / SoMe</a>` : ""}
      ${p.map ? `<a class="glLink" href="${p.map}" target="_blank">🗺️ Kart</a>` : ""}
    `;
  });
}

document.addEventListener("DOMContentLoaded", init);
