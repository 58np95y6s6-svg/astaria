import { ACTIVITIES, corrected, factorFor, parseDuration, fmtDuration, fmtPace, parseWorkoutText, parseImportParams, weekKey } from "./core.js";
import { loadWorkouts, loadSettings, saveSettings, upsertWorkout, deleteWorkout, exportAll, importAll } from "./store.js";
import { ocrImage } from "./ocr.js";

// ---------- utilitaires ----------
const $app = document.getElementById("app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const km = (x, d = 2) => (x == null || !Number.isFinite(x) ? "–" : `${x.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d })} km`);
const int = (x) => (x == null || !Number.isFinite(+x) ? "–" : Math.round(+x).toLocaleString("fr-FR"));
const numIn = (v) => { const n = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
const pad = (n) => String(n).padStart(2, "0");
const localInput = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`; };
const dayLabel = (d) => new Date(d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const timeLabel = (d) => new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

let settings = loadSettings();

// ---------- routeur ----------
const routes = [
  [/^#?\/?$/, viewHome],
  [/^#\/import\?(.*)$/, (q) => { draft = { ...emptyDraft(), ...fromParsed(parseImportParams(q)) }; addOpen = true; history.replaceState(null, "", "#/"); viewHome(); toast("Séance reçue : vérifie puis enregistre"); }],
  [/^#\/stats$/, viewStats],
  [/^#\/reglages$/, viewSettings],
];
function router() {
  const h = location.hash || "#/";
  const nav = h.startsWith("#/stats") ? "stats" : h.startsWith("#/reglages") ? "reglages" : "home";
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("on", a.dataset.nav === nav));
  for (const [re, fn] of routes) {
    const m = h.match(re);
    if (m) { document.getElementById("scroller")?.scrollTo(0, 0); fn(...m.slice(1)); return; }
  }
  location.hash = "#/";
}
window.addEventListener("hashchange", router);

// ---------- formulaire de séance (ajout / modification) ----------
const emptyDraft = () => ({ type: "walk_treadmill", date: localInput(Date.now()), min: "", sec: "", watchKm: "", realKm: "", kcalActive: "", kcalTotal: "", hrAvg: "", note: "" });
let draft = emptyDraft();
let addOpen = false;
let openId = null; // séance dépliée dans la liste
let editDraft = null;

function fromParsed(p) {
  const d = {};
  if (p.type) d.type = p.type;
  if (p.durationSec != null) { d.min = String(Math.floor(p.durationSec / 60)); d.sec = String(p.durationSec % 60); }
  if (p.watchKm != null) d.watchKm = String(p.watchKm).replace(".", ",");
  if (p.kcalActive != null) d.kcalActive = String(p.kcalActive);
  if (p.kcalTotal != null) d.kcalTotal = String(p.kcalTotal);
  if (p.hrAvg != null) d.hrAvg = String(p.hrAvg);
  if (p.date) { const x = new Date(p.date); if (!isNaN(x)) d.date = localInput(x); }
  return d;
}

function draftToWorkout(d) {
  const durationSec = (numIn(d.min) || 0) * 60 + (numIn(d.sec) || 0);
  return {
    id: d.id, type: d.type, date: new Date(d.date || Date.now()).toISOString(), durationSec,
    watchKm: numIn(d.watchKm), realKm: numIn(d.realKm), kcalActive: numIn(d.kcalActive), kcalTotal: numIn(d.kcalTotal),
    hrAvg: numIn(d.hrAvg), note: String(d.note || "").slice(0, 200),
  };
}

function previewHTML(d) {
  const w = draftToWorkout(d);
  if (!(w.durationSec > 0) || !(w.watchKm > 0 || w.realKm > 0)) return `<div class="small muted">Renseigne au moins la durée et la distance de la montre.</div>`;
  const c = corrected(w, settings);
  return `<div class="row between"><div><div class="small muted">Distance retenue</div><div class="big num">${km(c.km)}</div></div>
    <div style="text-align:right"><div class="small muted">Allure · vitesse</div><div class="big num" style="font-size:20px">${fmtPace(c.paceSec)}</div><div class="small num">${c.speed ?? "–"} km/h</div></div></div>
    <div class="small muted" style="margin-top:6px">${c.source === "réel" ? `Distance réelle saisie (montre ${km(w.watchKm)}, rapport ×${c.factor.toLocaleString("fr-FR")})`
      : c.source === "corrigé" ? `Montre ${km(w.watchKm)} × ${c.factor.toLocaleString("fr-FR")} (correction ${esc(ACTIVITIES[w.type].label.toLowerCase())})` : "Distance de la montre, sans correction"}</div>`;
}

function formHTML(d, p) {
  const opt = Object.entries(ACTIVITIES).map(([k, a]) => `<option value="${k}"${d.type === k ? " selected" : ""}>${a.icon} ${a.label}</option>`).join("");
  const f = (k, label, ph = "", cls = "") => `<div class="${cls}"><label>${label}</label><input type="text" inputmode="decimal" autocomplete="off" data-f="${p}" data-k="${k}" value="${esc(d[k])}" placeholder="${ph}"></div>`;
  return `<div class="form">
      <div class="full"><label>Activité</label><select data-f="${p}" data-k="type">${opt}</select></div>
      <div class="full"><label>Date et heure</label><input type="datetime-local" data-f="${p}" data-k="date" value="${esc(d.date)}"></div>
      <div class="full"><label>Durée totale</label><div class="dur"><input type="text" inputmode="numeric" autocomplete="off" data-f="${p}" data-k="min" value="${esc(d.min)}" placeholder="min"><span>min</span><input type="text" inputmode="numeric" autocomplete="off" data-f="${p}" data-k="sec" value="${esc(d.sec)}" placeholder="s"><span>s</span></div></div>
      ${f("watchKm", "Distance montre (km)", "0,80")}
      ${f("realKm", "Distance réelle (facultatif)", "tapis")}
      ${f("kcalActive", "Kcal actives", "96")}
      ${f("kcalTotal", "Kcal totales (facultatif)", "")}
      ${f("hrAvg", "FC moyenne (facultatif)", "bpm", "full")}
    </div>
    <div class="preview" data-preview="${p}">${previewHTML(d)}</div>`;
}

function wireForm(p, d, onChange) {
  document.querySelectorAll(`[data-f="${p}"]`).forEach((el) => el.addEventListener("input", () => {
    d[el.dataset.k] = el.value;
    const pv = document.querySelector(`[data-preview="${p}"]`);
    if (pv) pv.innerHTML = previewHTML(d);
    onChange?.();
  }));
}

// ---------- Séances ----------
function workoutCard(w) {
  const c = corrected(w, settings);
  const a = ACTIVITIES[w.type] || ACTIVITIES.other;
  const open = openId === w.id;
  return `<div class="wk" data-open="${w.id}">
    <div class="wk-head"><div class="wk-ico">${a.icon}</div>
      <div class="grow"><b>${esc(a.label)}</b><div class="small muted">${timeLabel(w.date)}${c.source !== "montre" ? ` · montre ${km(w.watchKm)} → ${c.source === "réel" ? "réel" : `×${c.factor.toLocaleString("fr-FR")}`}` : ""}</div></div>
      ${c.source !== "montre" ? `<span class="chip good">corrigé</span>` : ""}</div>
    <div class="wk-stats">
      <div><b class="num">${km(c.km)}</b><span>distance</span></div>
      <div><b class="num">${fmtDuration(w.durationSec)}</b><span>durée</span></div>
      <div><b class="num">${fmtPace(c.paceSec).replace(" /km", "")}</b><span>allure /km</span></div>
      <div><b class="num">${int(w.kcalActive)}</b><span>kcal</span></div>
    </div>
    ${open ? `<div class="wk-body" data-stop>
      <div class="small muted">${c.speed ?? "–"} km/h${w.kcalTotal ? ` · ${int(w.kcalTotal)} kcal totales` : ""}${w.hrAvg ? ` · FC moy. ${int(w.hrAvg)} bpm` : ""}</div>
      <h3>Modifier</h3>${formHTML(editDraft, "edit")}
      ${editDraft.realKm && editDraft.watchKm ? `<button class="link" data-learn style="margin-top:10px">Utiliser ce rapport pour toutes les « ${esc(a.label.toLowerCase())} »</button>` : ""}
      <div class="row" style="margin-top:12px"><button class="btn primary grow" data-save>Enregistrer</button><button class="btn" data-del>Supprimer</button></div>
    </div>` : ""}
  </div>`;
}

function viewHome() {
  const list = loadWorkouts();
  const wk = weekKey(Date.now());
  const thisWeek = list.filter((w) => weekKey(w.date) === wk);
  const sum = (arr, f) => arr.reduce((t, w) => t + (f(w) || 0), 0);
  const kmWeek = sum(thisWeek, (w) => corrected(w, settings).km);
  const byDay = new Map();
  for (const w of list) { const k = new Date(w.date).toDateString(); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(w); }
  $app.innerHTML = `
    <div class="kpis">
      <div class="kpi"><b class="num">${km(kmWeek, 1)}</b><span>cette semaine (corrigés)</span></div>
      <div class="kpi"><b class="num">${fmtDuration(sum(thisWeek, (w) => w.durationSec))}</b><span>temps total</span></div>
      <div class="kpi"><b class="num">${int(sum(thisWeek, (w) => w.kcalActive))}</b><span>kcal actives</span></div>
      <div class="kpi"><b class="num">${thisWeek.length}</b><span>séance${thisWeek.length > 1 ? "s" : ""}</span></div>
    </div>
    <details class="acc" id="addAcc"${addOpen || !list.length ? " open" : ""}>
      <summary><span class="acc-ico">+</span><div class="grow"><b>Ajouter une séance</b><div class="small muted">capture Forme / Santé, lien Raccourci ou saisie</div></div><span class="chev" aria-hidden="true"></span></summary>
      <div class="acc-body">
        <label class="btn primary block" style="margin:0;color:#fff;font-size:15px">📸 Importer une capture de la séance<input type="file" accept="image/*" id="shot" hidden></label>
        <div class="small muted" id="shotStatus" style="margin:8px 2px 4px">App Forme (ou Santé) → la séance → capture d'écran du détail.</div>
        ${formHTML(draft, "add")}
        <button class="btn primary block" id="addSave" style="margin-top:12px">Enregistrer la séance</button>
      </div>
    </details>
    <div class="section-title"><b>Séances</b><span class="small muted">${list.length} au total</span></div>
    ${list.length ? [...byDay.entries()].map(([, ws]) => `<div class="day">${dayLabel(ws[0].date)}</div>${ws.map(workoutCard).join("")}`).join("")
      : `<div class="card empty">Aucune séance pour l'instant.<br><span class="small">Ajoute ta première séance ci-dessus.</span></div>`}`;

  const acc = document.getElementById("addAcc");
  acc.addEventListener("toggle", () => { addOpen = acc.open; });
  wireForm("add", draft);
  document.getElementById("addSave").addEventListener("click", () => {
    const w = draftToWorkout(draft);
    if (!(w.durationSec > 0) || !(w.watchKm > 0 || w.realKm > 0)) { toast("Durée et distance obligatoires"); return; }
    try { upsertWorkout(w); } catch (e) { toast(e.message); return; }
    draft = emptyDraft(); addOpen = false;
    toast(`Séance enregistrée ✓ ${km(corrected(w, settings).km)}`);
    viewHome();
  });
  document.getElementById("shot").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const st = document.getElementById("shotStatus");
    try {
      const text = await ocrImage(file, (m) => { st.textContent = m; });
      const p = parseWorkoutText(text);
      draft = { ...draft, ...fromParsed(p) };
      addOpen = true;
      viewHome();
      const s2 = document.getElementById("shotStatus");
      const labels = { durationSec: "durée", watchKm: "distance", kcalActive: "kcal", kcalTotal: "kcal totales", hrAvg: "FC" };
      const miss = ["durationSec", "watchKm", "kcalActive"].filter((k) => !p.found.includes(k)).map((k) => labels[k]);
      s2.innerHTML = p.found.length ? `✓ Lu : ${p.found.map((k) => labels[k]).join(", ")}${miss.length ? ` · <span class="down">à compléter : ${miss.join(", ")}</span>` : ""}. Vérifie puis enregistre.`
        : `<span class="down">Rien de lisible sur cette capture.</span> Essaie le détail de la séance dans l'app Forme, ou saisis à la main.`;
    } catch (er) { st.innerHTML = `<span class="down">Erreur : ${esc(er.message)}</span>`; }
  });
  // Cartes : déplier pour modifier / supprimer
  $app.querySelectorAll("[data-open]").forEach((el) => el.addEventListener("click", (ev) => {
    if (ev.target.closest("[data-stop]")) return;
    const id = el.dataset.open;
    if (openId === id) { openId = null; editDraft = null; } else {
      const w = loadWorkouts().find((x) => x.id === id);
      openId = id;
      editDraft = { id: w.id, type: w.type, date: localInput(w.date), min: String(Math.floor(w.durationSec / 60)), sec: String(Math.round(w.durationSec % 60)),
        watchKm: w.watchKm ?? "", realKm: w.realKm ?? "", kcalActive: w.kcalActive ?? "", kcalTotal: w.kcalTotal ?? "", hrAvg: w.hrAvg ?? "", note: w.note || "" };
    }
    viewHome();
  }));
  if (editDraft) {
    wireForm("edit", editDraft);
    $app.querySelector("[data-save]")?.addEventListener("click", () => {
      upsertWorkout(draftToWorkout(editDraft)); openId = null; editDraft = null; toast("Séance modifiée ✓"); viewHome();
    });
    $app.querySelector("[data-del]")?.addEventListener("click", () => {
      if (!confirm("Supprimer cette séance ?")) return;
      deleteWorkout(editDraft.id); openId = null; editDraft = null; toast("Séance supprimée"); viewHome();
    });
    $app.querySelector("[data-learn]")?.addEventListener("click", () => {
      const f = numIn(editDraft.realKm) / numIn(editDraft.watchKm);
      settings.factors = { ...settings.factors, [editDraft.type]: Math.round(f * 1000) / 1000 };
      saveSettings(settings);
      toast(`Correction ${ACTIVITIES[editDraft.type].label.toLowerCase()} : ×${f.toFixed(2).replace(".", ",")}`);
      viewHome();
    });
  }
}

// ---------- Stats ----------
let statsRange = "12";
let statsMetric = "km";
function viewStats() {
  const all = loadWorkouts();
  const weeks = statsRange === "all" ? null : +statsRange;
  const now = new Date();
  const keys = [];
  if (weeks) for (let i = weeks - 1; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i * 7); keys.push(weekKey(d)); }
  else { const set = new Set(all.map((w) => weekKey(w.date))); keys.push(...[...set].sort()); }
  const list = weeks ? all.filter((w) => weekKey(w.date) >= keys[0]) : all;
  const per = new Map(keys.map((k) => [k, { km: 0, kcal: 0, sec: 0, n: 0 }]));
  for (const w of list) {
    const r = per.get(weekKey(w.date)); if (!r) continue;
    const c = corrected(w, settings);
    r.km += c.km; r.kcal += w.kcalActive || 0; r.sec += w.durationSec || 0; r.n++;
  }
  const tot = [...per.values()].reduce((t, r) => ({ km: t.km + r.km, kcal: t.kcal + r.kcal, sec: t.sec + r.sec, n: t.n + r.n }), { km: 0, kcal: 0, sec: 0, n: 0 });
  const metric = { km: ["Distance (km corrigés)", (r) => r.km, (v) => v.toFixed(1).replace(".", ",")], kcal: ["Kcal actives", (r) => r.kcal, (v) => Math.round(v)], min: ["Minutes", (r) => r.sec / 60, (v) => Math.round(v)] }[statsMetric];
  // Allure moyenne par semaine (marche sur tapis, ou l'activité la plus fréquente)
  const counts = {};
  for (const w of list) counts[w.type] = (counts[w.type] || 0) + 1;
  const mainType = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const paceRows = keys.map((k) => {
    const ws = list.filter((w) => w.type === mainType && weekKey(w.date) === k);
    const d = ws.reduce((t, w) => t + corrected(w, settings).km, 0), s = ws.reduce((t, w) => t + w.durationSec, 0);
    return d > 0 ? s / d : null;
  });

  $app.innerHTML = `
    <div class="tabs">${[["4", "4 semaines"], ["12", "12 semaines"], ["all", "Tout"]].map(([k, l]) => `<button data-range="${k}" class="${statsRange === k ? "on" : ""}">${l}</button>`).join("")}</div>
    <div class="kpis" style="margin-top:6px">
      <div class="kpi"><b class="num">${km(tot.km, 1)}</b><span>distance corrigée</span></div>
      <div class="kpi"><b class="num">${fmtDuration(tot.sec)}</b><span>temps total</span></div>
      <div class="kpi"><b class="num">${int(tot.kcal)}</b><span>kcal actives</span></div>
      <div class="kpi"><b class="num">${tot.n}</b><span>séances · ${tot.n ? fmtPace(tot.sec / tot.km) : "–"}</span></div>
    </div>
    <div class="card">
      <div class="row between"><h2 style="margin:0">Par semaine</h2>
        <div class="tabs" style="padding:0">${[["km", "km"], ["kcal", "kcal"], ["min", "min"]].map(([k, l]) => `<button data-metric="${k}" class="${statsMetric === k ? "on" : ""}">${l}</button>`).join("")}</div></div>
      <div class="small muted" style="margin:4px 0 8px">${metric[0]}</div>
      ${barChart(keys, keys.map((k) => metric[1](per.get(k))), metric[2])}
    </div>
    <div class="card">
      <h2>Allure moyenne${mainType ? ` · ${esc(ACTIVITIES[mainType].label.toLowerCase())}` : ""}</h2>
      ${paceChart(keys, paceRows)}
      <div class="small muted">Plus la courbe descend, plus tu vas vite. Calculée avec la distance corrigée.</div>
    </div>`;
  $app.querySelectorAll("[data-range]").forEach((b) => b.addEventListener("click", () => { statsRange = b.dataset.range; viewStats(); }));
  $app.querySelectorAll("[data-metric]").forEach((b) => b.addEventListener("click", () => { statsMetric = b.dataset.metric; viewStats(); }));
}

const wkShort = (k) => { const d = new Date(`${k}T12:00:00`); return `${d.getDate()}/${d.getMonth() + 1}`; };

function barChart(keys, vals, fmt) {
  if (!vals.some((v) => v > 0)) return `<div class="empty">Pas encore de données sur la période.</div>`;
  const W = 320, H = 160, B = 18, T = 14, n = vals.length, max = Math.max(...vals) || 1, bw = W / n;
  const step = Math.ceil(n / 8);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Valeurs par semaine">${vals.map((v, i) => {
    const h = (v / max) * (H - B - T);
    return `<rect x="${(i * bw + bw * 0.15).toFixed(1)}" y="${(H - B - h).toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${h.toFixed(1)}" rx="4" fill="${i === n - 1 ? "#f4555a" : "#1e2342"}"/>`
      + (v > 0 && n <= 12 ? `<text x="${(i * bw + bw / 2).toFixed(1)}" y="${(H - B - h - 3).toFixed(1)}" text-anchor="middle">${fmt(v)}</text>` : "")
      + (i % step === 0 ? `<text x="${(i * bw + bw / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle">${wkShort(keys[i])}</text>` : "");
  }).join("")}</svg>`;
}

function paceChart(keys, vals) {
  const pts = vals.map((v, i) => [i, v]).filter(([, v]) => v);
  if (pts.length < 2) return `<div class="empty">La courbe apparaîtra avec au moins 2 semaines de séances.</div>`;
  const W = 320, H = 160, L = 40, R = 10, T = 12, B = 18;
  const lo = Math.min(...pts.map((p) => p[1])) * 0.97, hi = Math.max(...pts.map((p) => p[1])) * 1.03;
  const X = (i) => L + (i * (W - L - R)) / Math.max(1, keys.length - 1), Y = (v) => T + ((v - lo) * (H - T - B)) / (hi - lo || 1);
  const d = pts.map(([i, v], j) => `${j ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  const lab = (v) => fmtPace(v).replace(" /km", "");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Allure moyenne par semaine">
    <text x="${L - 6}" y="${T + 4}" text-anchor="end">${lab(lo)}</text><text x="${L - 6}" y="${H - B}" text-anchor="end">${lab(hi)}</text>
    <path d="${d}" fill="none" stroke="#f4555a" stroke-width="2.5" stroke-linejoin="round"/>
    ${pts.map(([i, v]) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="3.5" fill="#1e2342"/>`).join("")}
    <text x="${L}" y="${H - 4}">${wkShort(keys[pts[0][0]])}</text><text x="${W - R}" y="${H - 4}" text-anchor="end">${wkShort(keys[pts[pts.length - 1][0]])}</text>
  </svg>`;
}

// ---------- Réglages ----------
function viewSettings() {
  const base = location.href.split("#")[0];
  const example = `${base}#/import?type=walk_treadmill&min=25.2&km=0.8&kcal=96`;
  $app.innerHTML = `
    <div class="card">
      <h2>Correction de distance</h2>
      <div class="small muted" style="margin-bottom:10px">Indique ce que dit la montre et la vraie distance (affichage du tapis). L'app applique ce rapport à toutes les séances de ce type, sauf si tu saisis la distance réelle d'une séance.</div>
      ${Object.entries(ACTIVITIES).map(([k, a]) => {
        const f = factorFor(k, settings);
        return `<div class="row" style="margin:10px 0;gap:8px"><div class="grow"><b>${a.icon} ${a.label}</b><div class="small muted">×${f.toLocaleString("fr-FR", { maximumFractionDigits: 3 })}${f !== 1 ? ` · 1 km montre = ${f.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} km réel` : " · pas de correction"}</div></div>
          <input type="text" inputmode="decimal" autocomplete="off" data-cw="${k}" placeholder="montre" style="width:76px"><input type="text" inputmode="decimal" autocomplete="off" data-cr="${k}" placeholder="réel" style="width:76px">
          <button class="btn sm" data-cal="${k}">OK</button></div>`;
      }).join("")}
      <div class="note">Exemple : montre 0,8 km, tapis 1,2 km → ×1,5. Tu peux aussi saisir la distance du tapis dans chaque séance.</div>
    </div>
    <details class="acc"><summary><span class="acc-ico" style="background:var(--navy)">⚡</span><div class="grow"><b>Import automatique (Raccourci iPhone)</b><div class="small muted">envoyer une séance en un geste</div></div><span class="chev" aria-hidden="true"></span></summary>
      <div class="acc-body small">
        <p>Une app web ne peut pas lire l'app Santé directement (Apple le réserve aux apps de l'App Store). Un <b>Raccourci</b> peut lire tes données Santé et les envoyer à iBiFit en ouvrant ce lien :</p>
        <p style="word-break:break-all;background:var(--soft);padding:10px;border-radius:12px">${esc(example)}</p>
        <p>Paramètres : <b>type</b> (walk_treadmill, run_treadmill, walk_out, run_out, bike), <b>min</b> (durée en minutes) ou <b>dur</b> (« 25:12 »), <b>km</b>, <b>kcal</b>, <b>kcaltot</b>, <b>bpm</b>, <b>date</b>.</p>
        <p>Dans l'app Raccourcis : « Rechercher des échantillons de santé » (Énergie active, Distance marche et course, sur la période de la séance) → calculer la somme → « Ouvrir l'URL » avec ce lien. Les actions Santé disponibles varient selon la version d'iOS : je peux t'aider à monter le Raccourci pas à pas.</p>
        <button class="btn sm" id="copyLink">Copier le lien d'exemple</button>
      </div></details>
    <div class="card">
      <h2>Sauvegarde</h2>
      <div class="small muted" style="margin-bottom:10px">Les séances sont enregistrées sur ce téléphone. Exporte-les pour les sauvegarder ou les transférer.</div>
      <div class="row"><button class="btn grow" id="exp">⬇︎ Exporter</button><label class="btn grow" style="margin:0;color:inherit;font-size:15px">⬆︎ Importer<input type="file" accept="application/json" id="imp" hidden></label></div>
    </div>`;
  $app.querySelectorAll("[data-cal]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.cal, w = numIn($app.querySelector(`[data-cw="${k}"]`).value), r = numIn($app.querySelector(`[data-cr="${k}"]`).value);
    if (!(w > 0 && r > 0)) { toast("Saisis la distance montre et la distance réelle"); return; }
    settings.factors = { ...settings.factors, [k]: Math.round((r / w) * 1000) / 1000 };
    saveSettings(settings);
    toast(`Correction enregistrée : ×${(r / w).toFixed(2).replace(".", ",")}`);
    viewSettings();
  }));
  document.getElementById("copyLink").addEventListener("click", () => { navigator.clipboard?.writeText(example).then(() => toast("Lien copié ✓"), () => toast("Copie impossible")); });
  document.getElementById("exp").addEventListener("click", exportAll);
  document.getElementById("imp").addEventListener("change", async (e) => {
    try { const n = await importAll(e.target.files[0]); settings = loadSettings(); toast(`${n} séance(s) importée(s)`); } catch (er) { toast(er.message); }
  });
}

router();

// ---------- comportement d'app native ----------
["gesturestart", "gesturechange", "gestureend"].forEach((t) => document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
let lastTouch = 0;
document.addEventListener("touchend", (e) => {
  const now = Date.now();
  if (now - lastTouch < 300 && !e.target.closest("input, select, textarea")) e.preventDefault();
  lastTouch = now;
}, { passive: false });
document.addEventListener("touchmove", (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

// ---------- PWA ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((r) => {
      r.update().catch(() => {});
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") r.update().catch(() => {}); });
    }).catch(() => {});
  });
  let reloaded = false;
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (had && !reloaded) { reloaded = true; location.reload(); } });
}
(function installHint() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  let dismissed = false;
  try { dismissed = localStorage.getItem("ibifit-install-hint") === "0"; } catch {}
  if (standalone || !/iphone|ipad|ipod/i.test(navigator.userAgent) || dismissed) return;
  const el = document.getElementById("installHint");
  el.className = "install";
  el.innerHTML = `<div class="card"><img src="icons/apple-touch-icon.png" alt=""><div class="grow">Installe l'app : touche <b>Partager</b> ⬆︎ puis <b>« Sur l'écran d'accueil »</b>.</div><button aria-label="Fermer">✕</button></div>`;
  el.querySelector("button").addEventListener("click", () => { el.remove(); try { localStorage.setItem("ibifit-install-hint", "0"); } catch {} });
})();
