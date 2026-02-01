// encoding-fix.js (ROOT)
// Fixer typisk mojibake fra UTF-8 (Ã¸, Ã¥, Ã¦ osv.) når JSON er blitt tolket feil.
// Brukes via fetchJson() som parser tekst -> fikser -> JSON.parse.

(function () {
  "use strict";

  // bytt ut vanlige feilsekvenser
  const REPLACEMENTS = [
    ["Ã¸", "ø"],
    ["Ã¥", "å"],
    ["Ã¦", "æ"],
    ["Ã˜", "Ø"],
    ["Ã…", "Å"],
    ["Ã†", "Æ"],
    ["â€“", "–"],
    ["â€”", "—"],
    ["â€™", "’"],
    ["â€œ", "“"],
    ["â€�", "”"],
    ["â€¦", "…"],
    ["Â", ""], // fjerner ofte "Â " (non-breaking space artefakter)
  ];

  function fixString(s) {
    if (typeof s !== "string") return s;
    let out = s;
    for (const [from, to] of REPLACEMENTS) out = out.split(from).join(to);
    return out;
  }

  function deepFix(value) {
    if (typeof value === "string") return fixString(value);

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) value[i] = deepFix(value[i]);
      return value;
    }

    if (value && typeof value === "object") {
      for (const k of Object.keys(value)) {
        const fixedKey = fixString(k);
        const v = value[k];

        // hvis nøkkel endrer seg, flytt verdi over
        if (fixedKey !== k) {
          delete value[k];
          value[fixedKey] = deepFix(v);
        } else {
          value[k] = deepFix(v);
        }
      }
      return value;
    }

    return value;
  }

  async function fetchJson(url, opts = {}) {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`fetchJson failed ${res.status} for ${url}`);

    // les som tekst først -> fixer -> parse
    const txt = await res.text();

    // fix på råtekst (fanger også opp feil inni JSON-stringer)
    let fixedTxt = txt;
    for (const [from, to] of REPLACEMENTS) fixedTxt = fixedTxt.split(from).join(to);

    let data;
    try {
      data = JSON.parse(fixedTxt);
    } catch (e) {
      // fallback: prøv å parse original hvis noe rart
      data = JSON.parse(txt);
    }

    // deep-fix på alle strenger og keys
    return deepFix(data);
  }

  // eksponer globalt (så app.js kan bruke den uten å endre alt)
  window.fetchJson = fetchJson;
})();
