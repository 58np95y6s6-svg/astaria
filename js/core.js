// Logique pure (testée) : activités, correction de distance, allure, durées, lecture d'une capture.

export const ACTIVITIES = {
  walk_treadmill: { label: "Marche sur tapis", icon: "🚶", factor: 1.5 },
  run_treadmill: { label: "Course sur tapis", icon: "🏃", factor: 1 },
  walk_out: { label: "Marche extérieure", icon: "🚶", factor: 1 },
  run_out: { label: "Course extérieure", icon: "🏃", factor: 1 },
  bike: { label: "Vélo", icon: "🚴", factor: 1 },
  other: { label: "Autre", icon: "💪", factor: 1 },
};

const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

// Facteur de correction de distance (montre → réel) pour un type d'activité.
export function factorFor(type, settings = {}) {
  const f = settings.factors?.[type];
  return f > 0 ? f : ACTIVITIES[type]?.factor ?? 1;
}

/**
 * Valeurs retenues d'une séance : distance corrigée, allure, vitesse.
 * La distance réelle saisie (affichage du tapis) prime sur le facteur.
 */
export function corrected(w, settings = {}) {
  const watchKm = Number(w.watchKm) || 0;
  const segKm = segmentsKm(w.segments);
  const real = w.realKm > 0 ? Number(w.realKm) : segKm > 0 ? segKm : 0;
  const factor = real > 0 && watchKm > 0 ? real / watchKm : real > 0 ? 1 : factorFor(w.type, settings);
  const km = real > 0 ? real : watchKm * factor;
  const sec = Number(w.durationSec) || segmentsMin(w.segments) * 60 || 0;
  return {
    km: round(km, 2),
    factor: round(factor, 3),
    paceSec: km > 0 && sec > 0 ? sec / km : null, // secondes par km
    speed: km > 0 && sec > 0 ? round(km / (sec / 3600), 1) : null, // km/h
    source: w.realKm > 0 ? "réel" : segKm > 0 ? "paliers" : factor !== 1 ? "corrigé" : "montre",
  };
}

// Paliers de vitesse du tapis : « 5 min à 3,5 puis 40 min à 6 » → [{min:5, speed:3.5}, {min:40, speed:6}].
export function parseSegments(text) {
  const t = norm(text || "").replace(/km\s*\/?\s*h/g, " ");
  const re = /(?:(\d+)\s*h\s*)?(\d+(?:[.,]\d+)?)\s*(?:minutes?|min|mn|')?\s*(?:a|@|x|en|:)\s*(\d+(?:[.,]\d+)?)/g;
  const out = [];
  for (const m of t.matchAll(re)) {
    const min = (+m[1] || 0) * 60 + num(m[2]), speed = num(m[3]);
    if (min > 0 && min <= 600 && speed > 0 && speed <= 30) out.push({ min, speed });
  }
  return out;
}
export const segmentsKm = (segs) => (Array.isArray(segs) ? segs.reduce((t, s) => t + (s.min / 60) * s.speed, 0) : 0);
export const segmentsMin = (segs) => (Array.isArray(segs) ? segs.reduce((t, s) => t + s.min, 0) : 0);
export const segmentsText = (segs) => (segs || []).map((s) => `${String(s.min).replace(".", ",")} min à ${String(s.speed).replace(".", ",")}`).join(" puis ");

// « 25:12 », « 0:25:12 », « 1h05 », « 25 min 12 s », « 25' 12" » → secondes.
export function parseDuration(s) {
  if (s == null) return null;
  const t = String(s).trim().toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ");
  let m = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(t);
  if (m) return +m[1] * 3600 + +m[2] * 60 + +m[3];
  m = /^(\d{1,2})\s*h\s*(\d{1,2})$/.exec(t); // « 1h05 »
  if (m) return +m[1] * 3600 + +m[2] * 60;
  m = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(t);
  if (m) return +m[1] * 3600 + +m[2] * 60 + +m[3];
  m = /^(\d{1,3}):(\d{2})$/.exec(t);
  if (m) return +m[1] * 60 + +m[2];
  m = /^(?:(\d+)\s*h)?\s*(?:(\d+)\s*(?:min|mn|m|'))?\s*(?:(\d+)\s*(?:s|sec|"|''))?$/.exec(t);
  if (m && (m[1] || m[2] || m[3])) return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
  return null;
}

export function fmtDuration(sec) {
  if (!(sec >= 0)) return "–";
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p = (x) => String(x).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

// Allure : secondes par km → « 21'00 /km ».
export function fmtPace(secPerKm) {
  if (!(secPerKm > 0) || !Number.isFinite(secPerKm)) return "–";
  const s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}'${String(s % 60).padStart(2, "0")} /km`;
}

const num = (s) => (s == null ? null : parseFloat(String(s).replace(",", ".")));
const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Lecture du texte d'une capture (app Forme / Santé / montre, en français ou en anglais).
 * Retourne { type, durationSec, watchKm, kcalActive, kcalTotal, hrAvg, found: [...] }.
 */
export function parseWorkoutText(text) {
  const raw = String(text || "");
  const t = norm(raw).replace(/\r/g, "");
  const lines = t.split("\n").map((l) => l.trim()).filter(Boolean);
  const out = { type: null, durationSec: null, watchKm: null, kcalActive: null, kcalTotal: null, hrAvg: null, found: [] };

  // Type d'activité
  // « Marche » seul (carte Résumé de Santé) = marche sur tapis ; l'extérieur est toujours précisé.
  const t1 = t.replace(/distance \(marche et course\)|walking \+ running distance/g, "");
  if (/marche (en )?exterieur|outdoor walk/.test(t1)) out.type = "walk_out";
  else if (/course (en )?exterieur|outdoor run/.test(t1)) out.type = "run_out";
  else if (/course (en )?interieur|indoor run/.test(t1)) out.type = "run_treadmill";
  else if (/marche|walk|tapis/.test(t1)) out.type = "walk_treadmill";
  else if (/course|run/.test(t1)) out.type = "run_out";
  else if (/velo|cycl/.test(t)) out.type = "bike";

  // Valeur sur la même ligne que le libellé, ou sur la ligne suivante (grille de l'app Forme).
  // L'app Forme affiche souvent une grille : deux libellés côte à côte, puis leurs deux valeurs.
  const isLabel = (l) => !/\d/.test(l);
  // Deux colonnes sur une même ligne (« 96KCAL 131KCAL ») : on prend la valeur du côté du libellé.
  const pick = (line, valueRe, right) => {
    const all = [...line.matchAll(new RegExp(valueRe.source, "g"))];
    return all.length ? all[right ? all.length - 1 : 0] : null;
  };
  const near = (labelRe, valueRe) => {
    for (let i = 0; i < lines.length; i++) {
      const lm = labelRe.exec(lines[i]);
      if (!lm) continue;
      const right = lm.index > lines[i].length * 0.35;
      const same = pick(lines[i].slice(lm.index), valueRe, false);
      if (same) return same;
      let s = i, e = i;
      while (s > 0 && isLabel(lines[s - 1])) s--;
      while (e + 1 < lines.length && isLabel(lines[e + 1])) e++;
      const k = i - s;
      const vals = [];
      for (let j = e + 1; j < lines.length && vals.length < e - s + 1 && !isLabel(lines[j]); j++) vals.push(lines[j]);
      for (const l of [vals[k], ...vals].filter(Boolean)) { const m = pick(l, valueRe, right); if (m) return m; }
    }
    return null;
  };

  // Plage horaire « 17:02-17:28 » (en-tête de la séance dans l'app Forme)
  const range = /(?:^|\s)(\d{1,2})[:h](\d{2})\s*[-–—]\s*(\d{1,2})[:h](\d{2})(?:\s|$)/m.exec(t);
  if (range) {
    out.startTime = `${range[1].padStart(2, "0")}:${range[2]}`;
    out.endTime = `${range[3].padStart(2, "0")}:${range[4]}`;
  }

  // Carte « Exercices » de l'app Santé (Résumé) : « 48 min | 255 kcal | 2,9 km » sur une ligne.
  const KCAL = "k[ce][ae]l";
  const card = new RegExp(`(?:(\\d{1,2})\\s*h\\s*)?(\\d{1,3})\\s*min\\b.*?(\\d{1,4})\\s*${KCAL}.*?(\\d+(?:[.,]\\d+)?)\\s*km\\b`).exec(t);
  if (card) {
    out.durationSec = (+card[1] || 0) * 3600 + +card[2] * 60;
    out.kcalActive = +card[3];
    out.watchKm = num(card[4]);
  }

  // Durée : libellé « temps d'entraînement / durée », sinon un H:MM:SS (l'heure de la barre d'état est en H:MM).
  let m = out.durationSec != null ? null : near(/temps d.?entrainement|duree|workout time|total time|temps total/, /(\d{1,2}:\d{2}:\d{2}|\d{1,3}:\d{2})(?!\s*(?:am|pm))/);
  if (!m && out.durationSec == null) m = /(?:^|\s)(\d{1,2}:\d{2}:\d{2})(?:\s|$)/m.exec(t);
  if (m) out.durationSec = parseDuration(m[1]);

  // Distance
  m = out.watchKm != null ? null : near(/distance/, /(\d+(?:[.,]\d+)?)\s*(km|m)\b/) || /(\d+[.,]\d+)\s*km\b/.exec(t);
  if (m) out.watchKm = m[2] === "m" ? num(m[1]) / 1000 : num(m[1]);

  // Calories actives / totales
  const kcalRe = new RegExp(`(\\d{1,4}(?:[.,]\\d)?)\\s*(?:${KCAL}|cal)`);
  m = out.kcalActive != null ? null : near(/calories actives|active cal|energie active|active energy/, kcalRe);
  if (m) out.kcalActive = num(m[1]);
  m = near(/calories totales|total cal|energie totale/, kcalRe);
  if (m) out.kcalTotal = num(m[1]);
  if (out.kcalActive == null) {
    const all = [...t.matchAll(new RegExp(`(\\d{1,4})\\s*${KCAL}`, "g"))].map((x) => +x[1]);
    if (all.length) out.kcalActive = all[0];
  }

  // Fréquence cardiaque moyenne
  m = near(/frequence cardiaque moy|freq\.? card(?:iaque)? moy|fc moy|avg\.? heart|heart rate/, /(\d{2,3})\s*(?:bpm|bat)/);
  if (m) out.hrAvg = +m[1];

  if (out.durationSec == null && out.startTime) out.durationSec = spanSec(out.startTime, out.endTime);
  for (const k of ["durationSec", "watchKm", "kcalActive", "kcalTotal", "hrAvg"]) if (out[k] != null) out.found.push(k);
  return out;
}

// Écart entre deux heures « HH:MM » (passe minuit si besoin).
export function spanSec(a, b) {
  const m = (x) => { const r = /^(\d{1,2}):(\d{2})$/.exec(String(x || "").trim()); return r ? +r[1] * 60 + +r[2] : null; };
  const x = m(a), y = m(b);
  if (x == null || y == null) return null;
  return (((y - x) + 1440) % 1440) * 60;
}

// Import par lien (Raccourci iPhone) : #/import?type=…&min=…&km=…&kcal=…
export function parseImportParams(qs) {
  const p = new URLSearchParams(qs);
  const g = (k) => (p.get(k) != null && p.get(k) !== "" ? num(p.get(k)) : null);
  let durationSec = p.get("dur") ? parseDuration(p.get("dur")) : null;
  if (durationSec == null && g("min") != null) durationSec = Math.round(g("min") * 60);
  if (durationSec == null && g("sec") != null) durationSec = Math.round(g("sec"));
  let km = g("km");
  if (km == null && g("m") != null) km = g("m") / 1000;
  const type = ACTIVITIES[p.get("type")] ? p.get("type") : null;
  return { type, durationSec, watchKm: km, kcalActive: g("kcal"), kcalTotal: g("kcaltot"), hrAvg: g("bpm"), date: p.get("date") || null };
}

// Lundi (YYYY-MM-DD) de la semaine d'une date.
export function weekKey(d) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setHours(12, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x.toISOString().slice(0, 10);
}

// ---------- Export de l'app Santé (export.xml / exportation.xml) ----------
// « 2026-11-13 06:42:01 +0100 » → ISO
export function healthDate(s) {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/.exec(String(s || "").trim());
  return m ? new Date(`${m[1]}T${m[2]}${m[3]}:${m[4]}`).toISOString() : null;
}
const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([\w:]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
const toKm = (v, u) => (v == null ? null : u === "mi" ? v * 1.609344 : u === "m" ? v / 1000 : u === "yd" ? v * 0.0009144 : v);
const toKcal = (v, u) => (v == null ? null : u === "kJ" ? v / 4.184 : v);

/** Un bloc <Workout …>…</Workout> de l'export Santé → séance iBiFit (ou null). */
export function parseHealthWorkout(block) {
  const open = /<Workout\s[^>]*>/.exec(block);
  if (!open) return null;
  const a = attrs(open[0]);
  const start = healthDate(a.startDate), end = healthDate(a.endDate);
  if (!start) return null;
  let durationSec = a.duration != null ? +a.duration * ({ min: 60, s: 1, h: 3600 }[a.durationUnit] || 60) : null;
  if (!(durationSec > 0) && end) durationSec = (new Date(end) - new Date(start)) / 1000;
  const indoor = /key="HKIndoorWorkout"\s+value="1"/.test(block);
  const act = (a.workoutActivityType || "").replace("HKWorkoutActivityType", "");
  const type = act === "Walking" ? (indoor ? "walk_treadmill" : "walk_out")
    : act === "Running" ? (indoor ? "run_treadmill" : "run_out")
    : act === "Cycling" ? "bike" : "other";
  const stat = (id) => { const m = new RegExp(`<WorkoutStatistics[^>]*type="HKQuantityTypeIdentifier${id}"[^>]*>`).exec(block); return m ? attrs(m[0]) : null; };
  const dist = stat("DistanceWalkingRunning") || stat("DistanceCycling");
  const act_ = stat("ActiveEnergyBurned"), basal = stat("BasalEnergyBurned"), hr = stat("HeartRate");
  let km = dist?.sum != null ? toKm(+dist.sum, dist.unit) : a.totalDistance != null ? toKm(+a.totalDistance, a.totalDistanceUnit) : null;
  let kcal = act_?.sum != null ? toKcal(+act_.sum, act_.unit) : a.totalEnergyBurned != null ? toKcal(+a.totalEnergyBurned, a.totalEnergyBurnedUnit) : null;
  const kcalB = basal?.sum != null ? toKcal(+basal.sum, basal.unit) : null;
  const r = (x, d) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
  return {
    id: "h" + new Date(start).getTime().toString(36), source: "sante", activity: act,
    type, date: start, durationSec: Math.round(durationSec || 0),
    watchKm: r(km, 2), kcalActive: r(kcal, 0), kcalTotal: kcal != null && kcalB != null ? r(kcal + kcalB, 0) : null,
    hrAvg: hr?.average != null ? r(+hr.average, 0) : null,
  };
}

// ---------- Synchro par Raccourci : #/sync?w=début~fin~type~distance~kcal;… ----------
const frNum = (s) => { const m = /(-?\d+(?:[.,]\d+)?)/.exec(String(s || "").replace(/\s/g, "")); return m ? parseFloat(m[1].replace(",", ".")) : null; };
function looseDate(s) {
  s = String(s || "").trim();
  if (!s) return null;
  const h = healthDate(s);
  if (h) return h;
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ ,à]*(\d{1,2})[:h](\d{2})(?::(\d{2}))?/.exec(s); // 13/11/2026 06:42
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0)).toISOString();
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString();
}
export function syncType(s) {
  const t = norm(s || "");
  const indoor = /interieur|indoor|tapis|treadmill/.test(t), outdoor = /exterieur|outdoor/.test(t);
  if (/marche|walk/.test(t)) return outdoor ? "walk_out" : "walk_treadmill"; // « Marche » seul = tapis (comme pour les captures)
  if (/course|run/.test(t)) return indoor ? "run_treadmill" : "run_out";
  if (/velo|cycl|bike/.test(t)) return "bike";
  return "other";
}
export function parseSyncParam(w) {
  return String(w || "").split(/[;\n]+/).map((row) => {
    const [a, b, type, dist, kcal] = row.split("~");
    const start = looseDate(a), end = looseDate(b);
    if (!start) return null;
    let km = frNum(dist);
    if (km != null) { const u = norm(dist); km = /\bmi\b|mile/.test(u) ? km * 1.609344 : /\bm\b/.test(u) && !/km/.test(u) ? km / 1000 : km; km = Math.round(km * 100) / 100; }
    let k = frNum(kcal);
    if (k != null && /kj/.test(norm(kcal))) k = k / 4.184;
    return {
      id: "h" + new Date(start).getTime().toString(36), source: "sante", type: syncType(type), date: start,
      durationSec: end ? Math.max(0, Math.round((new Date(end) - new Date(start)) / 1000)) : 0,
      watchKm: km, kcalActive: k != null ? Math.round(k) : null, kcalTotal: null, hrAvg: null,
    };
  }).filter((x) => x && x.durationSec > 0);
}

// ---------- Synchro par échantillons bruts (Distance de marche et de course + Énergie active) ----------
// Une ligne par échantillon : début~fin~valeur~source, séparées par « ; ».
export function parseSamples(s) {
  return String(s || "").split(/[;\n]+/).map((row) => {
    const [a, b, v, src = ""] = row.split("~");
    const start = looseDate(a), end = looseDate(b) || start, value = frNum(v);
    if (!start || value == null) return null;
    return { s: new Date(start).getTime(), e: new Date(end).getTime(), v: value, src: src.trim(), unit: norm(v) };
  }).filter(Boolean);
}
const watchOnly = (list) => { const w = list.filter((x) => /watch/i.test(x.src)); return w.length ? w : list; };

/**
 * Retrouve les séances : distance enregistrée en continu (trous ≤ 3 min) pendant ≥ 8 min, ≥ 0,3 km, entre 2 et 25 km/h.
 * Les kcal = énergie active de la montre sur la même période.
 */
export function sessionsFromSamples(dist, energy = [], { gapSec = 180, minSec = 480, minKm = 0.3 } = {}) {
  const toKmV = (x) => (/\bmi\b|mile/.test(x.unit) ? x.v * 1.609344 : /\bm\b/.test(x.unit) && !/km/.test(x.unit) ? x.v / 1000 : x.v);
  const d = watchOnly(dist).sort((a, b) => a.s - b.s);
  const en = watchOnly(energy);
  const groups = [];
  for (const x of d) {
    const g = groups[groups.length - 1];
    if (g && x.s - g.e <= gapSec * 1000) { g.e = Math.max(g.e, x.e); g.km += toKmV(x); }
    else groups.push({ s: x.s, e: x.e, km: toKmV(x) });
  }
  return groups.filter((g) => {
    const sec = (g.e - g.s) / 1000, v = g.km / (sec / 3600);
    return sec >= minSec && g.km >= minKm && v >= 2 && v <= 25;
  }).map((g) => {
    let kcal = 0;
    for (const x of en) {
      const ov = Math.min(g.e, x.e) - Math.max(g.s, x.s);
      if (ov > 0) kcal += x.e > x.s ? (x.v * ov) / (x.e - x.s) : x.v;
      else if (x.e === x.s && x.s >= g.s && x.s <= g.e) kcal += x.v;
    }
    const start = new Date(g.s).toISOString(), sec = Math.round((g.e - g.s) / 1000);
    const v = g.km / (sec / 3600);
    return {
      id: "h" + g.s.toString(36), source: "sante", type: v > 7.5 ? "run_treadmill" : "walk_treadmill",
      date: start, durationSec: sec, watchKm: Math.round(g.km * 100) / 100,
      kcalActive: en.length ? Math.round(kcal) : null, kcalTotal: null, hrAvg: null,
    };
  });
}
