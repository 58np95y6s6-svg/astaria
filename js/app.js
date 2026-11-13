import { spanSec, ACTIVITIES, corrected, factorFor, parseDuration, fmtDuration, fmtPace, parseWorkoutText, parseImportParams, weekKey, parseSegments, segmentsKm, segmentsMin, segmentsText } from "./core.js";
import { PLACES, placesFor, pickFor, placeSVG, ratioText, nextChallenge, challengePlaces } from "./places.js";
import { renderStory, shareBlob } from "./story.js";
import { foodFor, foodText, periodRange, periodLabel, summarize, streaks, motivation } from "./recap.js";
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
// « 06:42 → 07:30 » : début et fin d'une séance
const spanLabel = (start, sec) => (sec > 0 ? `${timeLabel(start)} → ${timeLabel(new Date(start).getTime() + sec * 1000)}` : timeLabel(start));
const endOf = (date, sec) => { if (!date || !(sec > 0)) return ""; const e = new Date(new Date(date).getTime() + sec * 1000); return `${pad(e.getHours())}:${pad(e.getMinutes())}`; };

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
  [/^#\/import\?(.*)$/, (q) => { draft = { ...emptyDraft(), ...fromParsed(parseImportParams(q)) }; draft.end = endOf(draft.date, (numIn(draft.min) || 0) * 60 + (numIn(draft.sec) || 0)); addOpen = true; history.replaceState(null, "", "#/"); viewHome(); toast("Séance reçue : vérifie puis enregistre"); }],
  [/^#\/stats$/, viewStats],
  [/^#\/resume$/, viewRecap],
  [/^#\/reglages$/, viewSettings],
];
function router() {
  const h = location.hash || "#/";
  const nav = h.startsWith("#/stats") ? "stats" : h.startsWith("#/resume") ? "resume" : h.startsWith("#/reglages") ? "reglages" : "home";
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("on", a.dataset.nav === nav));
  for (const [re, fn] of routes) {
    const m = h.match(re);
    if (m) { document.getElementById("scroller")?.scrollTo(0, 0); fn(...m.slice(1)); return; }
  }
  location.hash = "#/";
}
window.addEventListener("hashchange", router);

// ---------- formulaire de séance (ajout / modification) ----------
const emptyDraft = () => ({ type: "walk_treadmill", date: localInput(Date.now()), min: "", sec: "", watchKm: "", realKm: "", segText: "", kcalActive: "", kcalTotal: "", hrAvg: "", note: "" });
let draft = emptyDraft();
let addOpen = false;
let openId = null; // séance dépliée dans la liste
let editDraft = null;

function fromParsed(p, base = localInput(Date.now())) {
  const d = {};
  if (p.startTime && !p.date) d.date = `${String(base).slice(0, 10)}T${p.startTime}`;
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
  const segments = parseSegments(d.segText);
  const durationSec = (numIn(d.min) || 0) * 60 + (numIn(d.sec) || 0) || Math.round(segmentsMin(segments) * 60);
  return {
    id: d.id, type: d.type, date: new Date(d.date || Date.now()).toISOString(), durationSec,
    watchKm: numIn(d.watchKm), realKm: numIn(d.realKm), segments: segments.length ? segments : undefined, placeId: d.placeId, kcalActive: numIn(d.kcalActive), kcalTotal: numIn(d.kcalTotal),
    hrAvg: numIn(d.hrAvg), note: String(d.note || "").slice(0, 200),
  };
}

function previewHTML(d) {
  const w = draftToWorkout(d);
  const segs = w.segments || [];
  const segInfo = segs.length ? `<div class="seg-prev">${segProfile(segs)}<div class="small"><b>${km(segmentsKm(segs))}</b> d'après les paliers · ${fmtDuration(segmentsMin(segs) * 60)}${w.durationSec && Math.abs(segmentsMin(segs) * 60 - w.durationSec) > 90 ? ` <span class="down">(durée saisie : ${fmtDuration(w.durationSec)})</span>` : ""}</div></div>` : "";
  if (!(w.durationSec > 0) || !(w.watchKm > 0 || w.realKm > 0 || segs.length)) return segInfo + `<div class="small muted">Renseigne au moins la durée et la distance de la montre (ou tes paliers de vitesse).</div>`;
  const c = corrected(w, settings);
  return `<div class="small muted" style="margin-bottom:6px">🕒 ${spanLabel(w.date, w.durationSec)} · ${fmtDuration(w.durationSec)}</div>
    <div class="row between"><div><div class="small muted">Distance retenue</div><div class="big num">${km(c.km)}</div></div>
    <div style="text-align:right"><div class="small muted">Allure · vitesse</div><div class="big num" style="font-size:20px">${fmtPace(c.paceSec)}</div><div class="small num">${c.speed != null ? c.speed.toLocaleString("fr-FR") : "–"} km/h</div></div></div>
    ${segInfo}
    <div class="small muted" style="margin-top:6px">${c.source === "paliers" ? `Calculée avec tes paliers de vitesse${w.watchKm ? ` (montre ${km(w.watchKm)}, rapport ×${c.factor.toLocaleString("fr-FR")})` : ""}` : c.source === "réel" ? `Distance réelle saisie (montre ${km(w.watchKm)}, rapport ×${c.factor.toLocaleString("fr-FR")})`
      : c.source === "corrigé" ? `Montre ${km(w.watchKm)} × ${c.factor.toLocaleString("fr-FR")} (correction ${esc(ACTIVITIES[w.type].label.toLowerCase())})` : "Distance de la montre, sans correction"}</div>`;
}

function formHTML(d, p) {
  const opt = Object.entries(ACTIVITIES).map(([k, a]) => `<option value="${k}"${d.type === k ? " selected" : ""}>${a.icon} ${a.label}</option>`).join("");
  const f = (k, label, ph = "", cls = "") => `<div class="${cls}"><label>${label}</label><input type="text" inputmode="decimal" autocomplete="off" data-f="${p}" data-k="${k}" value="${esc(d[k])}" placeholder="${ph}"></div>`;
  return `<div class="form">
      <div class="full"><label>Activité</label><select data-f="${p}" data-k="type">${opt}</select></div>
      <div class="full"><label>Début</label><input type="datetime-local" data-f="${p}" data-k="date" value="${esc(d.date)}"></div>
      <div class="full"><label>Fin</label><input type="time" data-f="${p}" data-k="end" value="${esc(d.end)}"></div>
      <div class="full"><label>Durée totale</label><div class="dur"><input type="text" inputmode="numeric" autocomplete="off" data-f="${p}" data-k="min" value="${esc(d.min)}" placeholder="min"><span>min</span><input type="text" inputmode="numeric" autocomplete="off" data-f="${p}" data-k="sec" value="${esc(d.sec)}" placeholder="s"><span>s</span></div></div>
      ${f("watchKm", "Distance montre (km)", "0,80")}
      ${f("realKm", "Distance réelle (facultatif)", "tapis")}
      <div class="full"><label>Paliers de vitesse du tapis (facultatif)</label><input type="text" inputmode="text" autocomplete="off" autocapitalize="off" data-f="${p}" data-k="segText" value="${esc(d.segText)}" placeholder="5 min à 3,5 puis 40 min à 6"></div>
      ${f("kcalActive", "Kcal actives", "96")}
      ${f("kcalTotal", "Kcal totales (facultatif)", "")}
      ${f("hrAvg", "FC moyenne (facultatif)", "bpm", "full")}
    </div>
    <div class="preview" data-preview="${p}">${previewHTML(d)}</div>`;
}

function wireForm(p, d, onChange) {
  const q = (k) => document.querySelector(`[data-f="${p}"][data-k="${k}"]`);
  document.querySelectorAll(`[data-f="${p}"]`).forEach((el) => el.addEventListener("input", () => {
    d[el.dataset.k] = el.value;
    const k = el.dataset.k;
    if (k === "end") {
      // Heure de fin saisie → durée recalculée
      const sec = spanSec(String(d.date || "").slice(11, 16), d.end);
      if (sec > 0) { d.min = String(Math.floor(sec / 60)); d.sec = "0"; if (q("min")) q("min").value = d.min; if (q("sec")) q("sec").value = d.sec; }
    } else if (k === "min" || k === "sec" || k === "date") {
      d.end = endOf(d.date, (numIn(d.min) || 0) * 60 + (numIn(d.sec) || 0));
      if (q("end")) q("end").value = d.end;
    }
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
      <div class="grow"><b>${esc(a.label)}</b><div class="small muted">${spanLabel(w.date, w.durationSec)}${c.source !== "montre" ? ` · montre ${km(w.watchKm)} → ${c.source === "réel" ? "réel" : `×${c.factor.toLocaleString("fr-FR")}`}` : ""}</div></div>
      ${c.source !== "montre" ? `<span class="chip good">corrigé</span>` : ""}</div>
    <div class="wk-stats">
      <div><b class="num">${km(c.km)}</b><span>distance</span></div>
      <div><b class="num">${fmtDuration(w.durationSec)}</b><span>durée</span></div>
      <div><b class="num">${fmtPace(c.paceSec).replace(" /km", "")}</b><span>allure /km</span></div>
      <div><b class="num">${int(w.kcalActive)}</b><span>kcal</span></div>
    </div>
    ${compareStrip(w, c)}
    ${w.kcalActive > 0 ? `<div class="food-line">🔥 ${int(w.kcalActive)} kcal = ${foodFor(w.kcalActive, w.id, 2).map((x) => `${x.f.e} ${esc(foodText(x.f, x.n))}`).join(" · ")}</div>` : ""}
    ${open ? `<div class="wk-body" data-stop>
      ${w.segments?.length ? `<div class="seg-prev" style="margin-top:0">${segProfile(w.segments)}<div class="small muted">${esc(segmentsText(w.segments))} km/h</div></div>` : ""}
      <div class="small muted">${c.speed != null ? c.speed.toLocaleString("fr-FR") : "–"} km/h${w.kcalTotal ? ` · ${int(w.kcalTotal)} kcal totales` : ""}${w.hrAvg ? ` · FC moy. ${int(w.hrAvg)} bpm` : ""}</div>
      <h3>Modifier</h3>${formHTML(editDraft, "edit")}
      ${(editDraft.realKm || editDraft.segText) && editDraft.watchKm && c.source !== "corrigé" ? `<button class="link" data-learn style="margin-top:10px">Utiliser ce rapport pour toutes les « ${esc(a.label.toLowerCase())} »</button>` : ""}
      <div class="row" style="margin-top:12px"><button class="btn primary grow" data-save>Enregistrer</button><button class="btn" data-del>Supprimer</button></div>
    </div>` : ""}
  </div>`;
}

// ---------- Comparaison à un lieu connu ----------
function compareFor(w, c) {
  const p = w.placeId && PLACES.find((x) => x.id === w.placeId);
  return p ? { place: p, ratio: c.km / p.km } : pickFor(c.km, w.id);
}
function compareStrip(w, c) {
  if (!(c.km > 0)) return "";
  const { place, ratio } = compareFor(w, c);
  const rt = ratioText(ratio, place);
  return `<div class="cmp">
    <div class="cmp-img">${placeSVG(place, ratio, { id: `t${w.id}` })}</div>
    <div class="grow"><div class="small muted">L'équivalent de</div><b class="cmp-big">${esc(rt.big)}</b> <span class="cmp-line">${esc(rt.line)}</span>${place.quip ? `<div class="cmp-quip">${esc(place.quip)}</div>` : ""}</div>
    <button class="story-btn" data-story="${w.id}" aria-label="Partager en story">${IG}</button>
  </div>`;
}
const IG = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>`;

function segProfile(segs) {
  const tot = segmentsMin(segs) || 1, max = Math.max(...segs.map((s) => s.speed), 1);
  let x = 0;
  return `<svg class="seg-chart" viewBox="0 0 300 64" preserveAspectRatio="none" role="img" aria-label="Paliers de vitesse">${segs.map((s) => {
    const w = (s.min / tot) * 300, h = 14 + (s.speed / max) * 40, r = `<rect x="${(x + 1).toFixed(1)}" y="${(64 - h).toFixed(1)}" width="${Math.max(2, w - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="6" fill="url(#sg)"/>
      ${w > 40 ? `<text x="${(x + w / 2).toFixed(1)}" y="${(64 - h + 15).toFixed(1)}" text-anchor="middle">${String(s.speed).replace(".", ",")}</text>` : ""}`;
    x += w; return r;
  }).join("")}<defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4555a"/><stop offset="1" stop-color="#ff9a7a"/></linearGradient></defs></svg>`;
}

const dateStory = (d) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

function openWorkoutStory(w) {
  const c = corrected(w, settings);
  const a = ACTIVITIES[w.type] || ACTIVITIES.other;
  const first = compareFor(w, c);
  const cands = [first, ...placesFor(c.km).filter((x) => x.place.id !== first.place.id)];
  openStory(cands, (cand) => ({
    place: cand.place, ratio: cand.ratio, date: `${dateStory(w.date)} · ${spanLabel(w.date, w.durationSec).replace(" → ", "–")}`,
    kicker: "Aujourd'hui j'ai parcouru l'équivalent de",
    subtitle: `${km(c.km)} · ${a.label.toLowerCase()}`,
    stats: [[km(c.km, c.km >= 10 ? 1 : 2).replace(" km", ""), "km"], [fmtDuration(w.durationSec), "durée"], [fmtPace(c.paceSec).replace(" /km", ""), "allure /km"], [int(w.kcalActive), "kcal"]],
  }), (cand) => { upsertWorkout({ ...w, placeId: cand.place.id }); if ((location.hash || "#/") === "#/") viewHome(); });
}

// Fenêtre « story » : aperçu, autre lieu, partager.
function openStory(cands, build, onPick) {
  // À chaque ouverture : une comparaison tirée au hasard (différente de celle affichée), modifiable ensuite.
  const pool = Math.min(cands.length, 30);
  let i = pool > 1 ? 1 + Math.floor(Math.random() * (pool - 1)) : 0, blob = null, url = null, busy = false;
  if (i) onPick?.(cands[i]);
  const el = document.createElement("div");
  el.className = "modal";
  el.innerHTML = `<div class="modal-sheet">
      <div class="row between"><b style="font-size:17px">Story Instagram</b><button class="icon-close" data-x aria-label="Fermer">✕</button></div>
      <div class="story-frame"><div class="loader">Création de l'image…</div></div>
      <div class="row between" style="margin-bottom:4px"><span class="small muted">Comparaison</span><button class="link" data-rand>🎲 Une autre</button></div>
      <div class="place-chips"></div>
      <button class="btn primary block" data-share disabled>${IG} Partager en story</button>
      <div class="small muted" style="text-align:center;margin-top:8px">Dans la feuille de partage, choisis <b>Instagram</b> → <b>Story</b>.</div>
    </div>`;
  document.body.appendChild(el);
  const close = () => { el.remove(); if (url) URL.revokeObjectURL(url); };
  el.addEventListener("click", (e) => { if (e.target === el || e.target.closest("[data-x]")) close(); });
  const chips = el.querySelector(".place-chips");
  const drawChips = () => {
    chips.innerHTML = cands.slice(0, 40).map((x, j) => `<button class="pchip${j === i ? " on" : ""}" data-pi="${j}">${x.place.flag} ${esc(x.place.short)}</button>`).join("");
    chips.querySelectorAll("[data-pi]").forEach((b) => b.addEventListener("click", () => { if (busy) return; i = +b.dataset.pi; onPick?.(cands[i]); draw(); }));
    const on = chips.querySelector(".pchip.on");
    if (on) chips.scrollLeft = on.offsetLeft - chips.clientWidth / 2 + on.offsetWidth / 2;
  };
  const draw = async () => {
    busy = true; drawChips();
    const btn = el.querySelector("[data-share]"); btn.disabled = true;
    try {
      blob = await renderStory(build(cands[i]));
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(blob);
      el.querySelector(".story-frame").innerHTML = `<img src="${url}" alt="Aperçu de la story">`;
      btn.disabled = false;
    } catch (e) { el.querySelector(".story-frame").innerHTML = `<div class="empty down">${esc(e.message)}</div>`; }
    busy = false;
  };
  el.querySelector("[data-rand]").addEventListener("click", () => {
    if (busy || pool < 2) return;
    let j; do { j = Math.floor(Math.random() * pool); } while (j === i);
    i = j; onPick?.(cands[i]); draw();
  });
  el.querySelector("[data-share]").addEventListener("click", async () => {
    if (!blob) return;
    const r = await shareBlob(blob, `ibifit-${cands[i].place.id}.png`);
    if (r === "download") toast("Image enregistrée");
  });
  draw();
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
    if (!(w.durationSec > 0) || !(w.watchKm > 0 || w.realKm > 0 || w.segments)) { toast("Durée et distance obligatoires"); return; }
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
      draft = { ...draft, ...fromParsed(p, draft.date) };
      draft.end = endOf(draft.date, (numIn(draft.min) || 0) * 60 + (numIn(draft.sec) || 0));
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
  $app.querySelectorAll("[data-story]").forEach((b) => b.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const w = loadWorkouts().find((x) => x.id === b.dataset.story);
    if (w) openWorkoutStory(w);
  }));
  $app.querySelectorAll("[data-open]").forEach((el) => el.addEventListener("click", (ev) => {
    if (ev.target.closest("[data-stop]")) return;
    const id = el.dataset.open;
    if (openId === id) { openId = null; editDraft = null; } else {
      const w = loadWorkouts().find((x) => x.id === id);
      openId = id;
      editDraft = { id: w.id, type: w.type, date: localInput(w.date), end: endOf(w.date, w.durationSec), min: String(Math.floor(w.durationSec / 60)), sec: String(Math.round(w.durationSec % 60)),
        watchKm: w.watchKm ?? "", realKm: w.realKm ?? "", segText: segmentsText(w.segments), placeId: w.placeId, kcalActive: w.kcalActive ?? "", kcalTotal: w.kcalTotal ?? "", hrAvg: w.hrAvg ?? "", note: w.note || "" };
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
      const f = corrected(draftToWorkout(editDraft), settings).km / numIn(editDraft.watchKm);
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

  const allKm = all.reduce((t, w) => t + corrected(w, settings).km, 0);
  const ch = nextChallenge(allKm);
  const chRt = ratioText(ch.ratio, ch.place);
  const done = challengePlaces().filter((p) => p.km <= allKm);
  $app.innerHTML = `
    ${all.length ? `<div class="challenge">
      <div class="ch-img">${placeSVG(ch.place, ch.ratio, { id: "ch" })}<span class="ch-where">📍 ${esc(ch.place.where)} ${ch.place.flag}</span></div>
      <div class="ch-body">
        <div class="small" style="opacity:.7">Défi en cours · depuis le début</div>
        <div class="ch-big">${esc(chRt.big)}</div>
        <div class="ch-line">${esc(chRt.line)}</div>
        <div class="ch-bar"><i style="width:${Math.max(2, Math.min(100, ch.ratio * 100)).toFixed(1)}%"></i></div>
        <div class="row between small" style="opacity:.75;margin-top:6px"><span>${km(allKm, 1)}</span><span>${ch.place.km.toLocaleString("fr-FR")} km</span></div>
        ${done.length ? `<div class="small" style="opacity:.75;margin-top:10px">🏁 ${done.length} lieu${done.length > 1 ? "x" : ""} déjà bouclé${done.length > 1 ? "s" : ""}, dont ${done.slice(-2).reverse().map((p) => `${p.flag} ${esc(p.short)}`).join(" et ")}</div>` : ""}
        <button class="btn primary block" id="chStory" style="margin-top:14px">${IG} Partager en story</button>
      </div>
    </div>` : ""}
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
  document.getElementById("chStory")?.addEventListener("click", () => {
    const cands = [ch, ...placesFor(allKm).filter((x) => x.place.id !== ch.place.id)];
    const allSec = all.reduce((t, w) => t + (w.durationSec || 0), 0);
    openStory(cands, (cand) => ({
      place: cand.place, ratio: cand.ratio, date: dateStory(Date.now()),
      kicker: "Depuis le début, j'ai parcouru l'équivalent de",
      subtitle: `${km(allKm, 1)} en ${all.length} séance${all.length > 1 ? "s" : ""}`,
      stats: [[km(allKm, 1).replace(" km", ""), "km"], [`${Math.round(allSec / 3600)} h`, "en tout"], [String(all.length), "séances"], [int(all.reduce((t, w) => t + (w.kcalActive || 0), 0)), "kcal"]],
    }));
  });
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

// ---------- Résumés ----------
let recapKind = "week", recapOffset = 0;
const goalKm = (kind) => {
  const g = settings.goalWeekKm > 0 ? settings.goalWeekKm : 12;
  return kind === "week" ? g : kind === "month" ? Math.round(g * 4.35) : kind === "year" ? Math.round(g * 52) : null;
};
function ring(pct) {
  const r = 52, C = 2 * Math.PI * r, v = Math.max(0, Math.min(1, pct));
  return `<svg viewBox="0 0 128 128" class="ring"><circle cx="64" cy="64" r="${r}" stroke="rgba(255,255,255,.14)" stroke-width="14" fill="none"/>
    <circle cx="64" cy="64" r="${r}" stroke="url(#rg)" stroke-width="14" fill="none" stroke-linecap="round" stroke-dasharray="${(v * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 64 64)"/>
    <defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9a7a"/><stop offset="1" stop-color="#f4555a"/></linearGradient></defs>
    <text x="64" y="70" text-anchor="middle" font-size="24" font-weight="800" fill="#fff">${Math.round(pct * 100)}%</text></svg>`;
}
function recapBars(kind, r, ws) {
  let keys = [], lab = [], val = [];
  const corrKm = (w) => corrected(w, settings).km;
  if (kind === "week" || kind === "month") {
    for (let i = 0; i < r.days; i++) { const d = new Date(r.start); d.setDate(d.getDate() + i); keys.push(d.toDateString()); lab.push(kind === "week" ? "LMMJVSD"[i] : (i % 5 === 0 ? String(i + 1) : "")); }
    val = keys.map((k) => ws.filter((w) => new Date(w.date).toDateString() === k).reduce((t, w) => t + corrKm(w), 0));
  } else {
    const months = kind === "year" ? [...Array(12)].map((_, i) => [r.start.getFullYear(), i]) : [...new Set(ws.map((w) => { const d = new Date(w.date); return `${d.getFullYear()}-${d.getMonth()}`; }))].sort().map((x) => x.split("-").map(Number)).slice(-12);
    lab = months.map(([, m]) => "JFMAMJJASOND"[m]);
    val = months.map(([y, m]) => ws.filter((w) => { const d = new Date(w.date); return d.getFullYear() === y && d.getMonth() === m; }).reduce((t, w) => t + corrKm(w), 0));
  }
  if (!val.some((v) => v > 0)) return "";
  const W = 320, H = 110, n = val.length, bw = W / n, max = Math.max(...val);
  const today = new Date().toDateString();
  return `<svg class="chart" style="height:120px" viewBox="0 0 ${W} ${H}">${val.map((v, i) => {
    const h = v > 0 ? Math.max(4, (v / max) * (H - 26)) : 3;
    const on = keys[i] === today;
    return `<rect x="${(i * bw + bw * 0.18).toFixed(1)}" y="${(H - 14 - h).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(6, bw * 0.3).toFixed(1)}" fill="${v > 0 ? (on ? "#f4555a" : "#1e2342") : "#e6e8f2"}"/>`
      + (lab[i] ? `<text x="${(i * bw + bw / 2).toFixed(1)}" y="${H - 2}" text-anchor="middle">${lab[i]}</text>` : "");
  }).join("")}</svg>`;
}

function viewRecap() {
  const all = loadWorkouts();
  const corr = (w) => corrected(w, settings);
  const r = periodRange(recapKind, recapOffset);
  const cur = summarize(all, r, corr);
  const prev = recapKind === "all" ? null : summarize(all, periodRange(recapKind, recapOffset - 1), corr);
  const goal = goalKm(recapKind);
  const isCurrent = recapOffset === 0;
  const st = streaks(all);
  const word = { week: "semaine", month: "mois", year: "année", all: "" }[recapKind];
  const delta = prev && prev.km > 0 ? Math.round(((cur.km - prev.km) / prev.km) * 100) : null;
  const foods = foodFor(cur.kcal, `${recapKind}${r.start.getTime()}`, 4);
  const cmp = cur.km > 0 ? pickFor(cur.km, `${recapKind}${r.start.getTime()}`) : null;
  const cmpRt = cmp && ratioText(cmp.ratio, cmp.place);
  $app.innerHTML = `
    <div class="tabs">${[["week", "Semaine"], ["month", "Mois"], ["year", "Année"], ["all", "Tout"]].map(([k, l]) => `<button data-kind="${k}" class="${recapKind === k ? "on" : ""}">${l}</button>`).join("")}</div>
    ${recapKind !== "all" ? `<div class="period-nav"><button data-off="-1" aria-label="Précédent">‹</button><b>${esc(periodLabel(recapKind, r))}</b><button data-off="1" aria-label="Suivant"${isCurrent ? " disabled" : ""}>›</button></div>` : ""}
    <div class="recap-hero">
      <div class="grow">
        <div class="small" style="opacity:.7">${recapKind === "all" ? "Depuis le début" : isCurrent ? { week: "Cette semaine", month: "Ce mois-ci", year: "Cette année" }[recapKind] : esc(periodLabel(recapKind, r))}</div>
        <div class="rh-big num">${km(cur.km, 1)}</div>
        ${delta != null ? `<span class="rh-chip ${delta >= 0 ? "up" : "down"}">${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)} % vs ${recapKind === "week" ? "sem. passée" : recapKind === "month" ? "mois dernier" : "an dernier"}</span>` : ""}
        <div class="rh-msg">${esc(motivation({ kind: recapKind, cur, prev, goalKm: goal, isCurrent }))}</div>
      </div>
      ${goal ? `<div class="rh-goal">${ring(cur.km / goal)}<div class="small" style="opacity:.75">${km(cur.km, 1).replace(" km", "")} / ${goal} km</div></div>` : ""}
    </div>
    <div class="kpis">
      <div class="kpi"><b class="num">${cur.n}</b><span>séance${cur.n > 1 ? "s" : ""} · ${cur.days.size} jour${cur.days.size > 1 ? "s" : ""}</span></div>
      <div class="kpi"><b class="num">${fmtDuration(cur.sec)}</b><span>temps total</span></div>
      <div class="kpi"><b class="num">${int(cur.kcal)}</b><span>kcal brûlées</span></div>
      <div class="kpi"><b class="num">${fmtPace(cur.paceSec).replace(" /km", "")}</b><span>allure moy. /km</span></div>
    </div>
    ${recapBars(recapKind, r, cur.ws) ? `<div class="card"><h2>Kilomètres ${recapKind === "week" ? "par jour" : recapKind === "month" ? "par jour" : "par mois"}</h2>${recapBars(recapKind, r, cur.ws)}</div>` : ""}
    ${foods.length ? `<div class="card food-card"><h2>🔥 ${int(cur.kcal)} kcal brûlées, c'est l'équivalent de</h2>
      <div class="foods">${foods.map((x) => `<div class="food"><span class="fe">${x.f.e}</span><b class="num">${qtyHTML(x.n)}</b><span>${esc(x.n >= 1.75 ? x.f.many : x.f.one)}</span></div>`).join("")}</div>
      <div class="small muted" style="margin-top:8px">Valeurs moyennes, pour le fun. Ça ne veut pas dire qu'il faut les manger 😇</div></div>` : ""}
    ${cmp ? `<div class="cmp" style="margin:12px 0"><div class="cmp-img">${placeSVG(cmp.place, cmp.ratio, { id: "rc" })}</div>
      <div class="grow"><div class="small muted">Distance en vrai</div><b class="cmp-big">${esc(cmpRt.big)}</b> <span class="cmp-line">${esc(cmpRt.line)}</span></div>
      <button class="story-btn" id="recapStory" aria-label="Partager en story">${IG}</button></div>` : ""}
    <div class="card"><h2>Séries</h2>
      <div class="streaks"><div><b class="num">🔥 ${st.dayStreak}</b><span>jour${st.dayStreak > 1 ? "s" : ""} d'affilée</span></div><div><b class="num">📅 ${st.weekStreak}</b><span>semaine${st.weekStreak > 1 ? "s" : ""} d'affilée</span></div></div>
      <div class="small muted" style="margin-top:8px">${st.dayStreak ? "Ne casse pas la série demain 😉" : "Une séance aujourd'hui pour lancer une série ?"}</div></div>
    ${cur.n ? `<div class="card"><h2>Records de la période</h2>
      <div class="rec"><span>🏅 Plus longue séance</span><b>${km(cur.longest.km)} · ${new Date(cur.longest.w.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</b></div>
      ${cur.bestPace ? `<div class="rec"><span>⚡ Meilleure allure</span><b>${fmtPace(cur.bestPace.pace)}</b></div>` : ""}
      ${cur.bestDay ? `<div class="rec"><span>📆 Plus grosse journée</span><b>${km(cur.bestDay.km)} · ${new Date(cur.bestDay.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })}</b></div>` : ""}
    </div>` : ""}
    <div class="card"><div class="row between"><div><h2 style="margin:0">Objectif hebdo</h2><div class="small muted">${goalKm("month")} km / mois · ${goalKm("year")} km / an</div></div>
      <div class="row" style="gap:6px"><input type="text" inputmode="decimal" id="goal" value="${String(goalKm("week")).replace(".", ",")}" style="width:70px;text-align:center"><span class="muted">km</span><button class="btn sm" id="goalOk">OK</button></div></div></div>`;
  $app.querySelectorAll("[data-kind]").forEach((b) => b.addEventListener("click", () => { recapKind = b.dataset.kind; recapOffset = 0; viewRecap(); }));
  $app.querySelectorAll("[data-off]").forEach((b) => b.addEventListener("click", () => { recapOffset = Math.min(0, recapOffset + +b.dataset.off); viewRecap(); }));
  document.getElementById("goalOk").addEventListener("click", () => {
    const g = numIn(document.getElementById("goal").value);
    if (!(g > 0)) { toast("Objectif invalide"); return; }
    settings.goalWeekKm = g; saveSettings(settings); toast(`Objectif : ${g.toLocaleString("fr-FR")} km / semaine 🎯`); viewRecap();
  });
  document.getElementById("recapStory")?.addEventListener("click", () => {
    const cands = [cmp, ...placesFor(cur.km).filter((x) => x.place.id !== cmp.place.id)];
    const f = foods[0];
    const per = recapKind === "week" ? "Cette semaine" : recapKind === "month" ? "Ce mois-ci" : recapKind === "year" ? "Cette année" : "Depuis le début";
    openStory(cands, (cand) => ({
      place: cand.place, ratio: cand.ratio, date: recapKind === "all" ? dateStory(Date.now()) : periodLabel(recapKind, r),
      kicker: `${isCurrent || recapKind === "all" ? per : recapKind === "week" ? `Du ${periodLabel(recapKind, r).replace(" – ", " au ")}` : `En ${periodLabel(recapKind, r).toLowerCase()}`}, j'ai parcouru l'équivalent de`,
      subtitle: `${km(cur.km, 1)}${f ? ` · 🔥 ${int(cur.kcal)} kcal = ${f.f.e} ${foodText(f.f, f.n)}` : ""}`,
      stats: [[km(cur.km, 1).replace(" km", ""), "km"], [String(cur.n), `séance${cur.n > 1 ? "s" : ""}`], [cur.sec >= 36000 ? `${Math.floor(cur.sec / 3600)} h ${pad(Math.floor((cur.sec % 3600) / 60))}` : fmtDuration(cur.sec), "durée"], [int(cur.kcal), "kcal"]],
    }));
  });
}
const qtyHTML = (n) => { const r = Math.round(n * 2) / 2; return n >= 10 ? Math.round(n).toLocaleString("fr-FR") : r === 0.5 ? "½" : r.toLocaleString("fr-FR"); };

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
