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
