async function loadJSON(path) {
  const res = await fetch(path);
  return await res.json();
}

async function init() {
  const data = await loadJSON("./data/pubs.json");
  const pubs = data.places;

  const select = document.getElementById("pubSelect");
  const info = document.getElementById("pubInfo");

  pubs.forEach((p, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = `${p.name} (${p.city})`;
    select.appendChild(opt);
  });

  select.addEventListener("change", () => {
    const p = pubs[select.value];
    if (!p) {
      info.innerHTML = "";
      return;
    }

    info.innerHTML = `
      <div><strong>${p.name}</strong> – ${p.city}</div>
      <div>${p.tags.join(" • ")}</div>
      ${p.website ? `<a class="glLink" href="${p.website}" target="_blank">🔗 Nettside / SoMe</a>` : ""}
      ${p.map ? `<a class="glLink" href="${p.map}" target="_blank">🗺️ Kart</a>` : ""}
    `;
  });
}

document.addEventListener("DOMContentLoaded", init);
