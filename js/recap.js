// Résumés (semaine / mois / année / tout), séries, records, équivalences en nourriture. Logique pure, testée.

// Calories moyennes (valeurs usuelles, arrondies) — pas besoin d'API : ça marche hors connexion.
export const FOODS = [
  { id: "bigmac", e: "🍔", one: "Big Mac", many: "Big Mac", kcal: 503, fav: true },
  { id: "croissant", e: "🥐", one: "croissant", many: "croissants", kcal: 230, fav: true },
  { id: "painchoc", e: "🍫", one: "pain au chocolat", many: "pains au chocolat", kcal: 280, fav: true },
  { id: "pizza", e: "🍕", one: "part de pizza", many: "parts de pizza", kcal: 285 },
  { id: "frites", e: "🍟", one: "cornet de frites", many: "cornets de frites", kcal: 340 },
  { id: "donut", e: "🍩", one: "donut", many: "donuts", kcal: 260 },
  { id: "fondant", e: "🍰", one: "part de fondant au chocolat", many: "parts de fondant au chocolat", kcal: 370 },
  { id: "crepe", e: "🥞", one: "crêpe au Nutella", many: "crêpes au Nutella", kcal: 300, fav: true },
  { id: "nutella", e: "🥄", one: "cuillère de Nutella", many: "cuillères de Nutella", kcal: 80 },
  { id: "coca", e: "🥤", one: "canette de Coca", many: "canettes de Coca", kcal: 139 },
  { id: "biere", e: "🍺", one: "pinte de bière", many: "pintes de bière", kcal: 250, fav: true },
  { id: "vin", e: "🍷", one: "verre de vin", many: "verres de vin", kcal: 125 },
  { id: "champagne", e: "🥂", one: "coupe de champagne", many: "coupes de champagne", kcal: 85 },
  { id: "banane", e: "🍌", one: "banane", many: "bananes", kcal: 105 },
  { id: "pomme", e: "🍎", one: "pomme", many: "pommes", kcal: 80 },
  { id: "cookie", e: "🍪", one: "cookie", many: "cookies", kcal: 200 },
  { id: "glace", e: "🍨", one: "boule de glace", many: "boules de glace", kcal: 140 },
  { id: "kebab", e: "🥙", one: "kebab", many: "kebabs", kcal: 900, fav: true },
  { id: "tacos", e: "🌮", one: "French tacos", many: "French tacos", kcal: 1100, fav: true },
  { id: "raclette", e: "🧀", one: "assiette de raclette", many: "assiettes de raclette", kcal: 1000, fav: true },
  { id: "tartiflette", e: "🥔", one: "part de tartiflette", many: "parts de tartiflette", kcal: 800 },
  { id: "croque", e: "🥪", one: "croque-monsieur", many: "croque-monsieur", kcal: 400 },
  { id: "chocolat", e: "🍫", one: "carré de chocolat", many: "carrés de chocolat", kcal: 55 },
  { id: "baguette", e: "🥖", one: "baguette entière", many: "baguettes entières", kcal: 710 },
  { id: "sushi", e: "🍣", one: "sushi", many: "sushis", kcal: 45 },
  { id: "galette", e: "👑", one: "part de galette des rois", many: "parts de galette des rois", kcal: 400 },
  { id: "hotdog", e: "🌭", one: "hot-dog", many: "hot-dogs", kcal: 290 },
  { id: "popcorn", e: "🍿", one: "pot de pop-corn au ciné", many: "pots de pop-corn au ciné", kcal: 500 },
  { id: "cupcake", e: "🧁", one: "cupcake", many: "cupcakes", kcal: 300 },
  { id: "avocat", e: "🥑", one: "avocado toast", many: "avocado toasts", kcal: 300 },
  { id: "burrito", e: "🌯", one: "burrito", many: "burritos", kcal: 700 },
];

const hash = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

// Quantité lisible : 0,5 → « ½ », 1,5 → « 1,5 », 12,3 → « 12 ».
export function qty(n) {
  if (n >= 10) return Math.round(n).toLocaleString("fr-FR");
  const r = Math.round(n * 2) / 2;
  if (r === 0.5) return "½";
  return r.toLocaleString("fr-FR");
}
export const foodText = (f, n) => `${qty(n)} ${Math.round(n * 2) / 2 >= 2 ? f.many : f.one}`;

/** Équivalences pour des kcal : jusqu'à `max` aliments, variés mais stables (seed). */
export function foodFor(kcal, seed = "", max = 3) {
  if (!(kcal > 0)) return [];
  const ok = FOODS.map((f) => ({ f, n: kcal / f.kcal })).filter((x) => x.n >= 0.5 && x.n <= 60);
  if (!ok.length) return [];
  const h = hash(seed);
  // Aléatoire stable + bonus aux classiques + bonus aux quantités « parlantes » (2 à 30)
  const score = (x) => (hash(x.f.id + h) % 100) - (x.f.fav ? 25 : 0) - (x.n >= 2 && x.n <= 30 ? 35 : 0);
  ok.sort((a, b) => score(a) - score(b));
  const out = [], used = new Set();
  for (const x of ok) { if (used.has(x.f.e)) continue; used.add(x.f.e); out.push(x); if (out.length >= max) break; }
  return out;
}

// ---------- Périodes ----------
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export function periodRange(kind, offset = 0, now = new Date()) {
  const n = new Date(now);
  if (kind === "week") {
    const s = startOfDay(n); s.setDate(s.getDate() - ((s.getDay() + 6) % 7) + offset * 7);
    const e = new Date(s); e.setDate(e.getDate() + 7);
    return { start: s, end: e, days: 7 };
  }
  if (kind === "month") {
    const s = new Date(n.getFullYear(), n.getMonth() + offset, 1);
    const e = new Date(s.getFullYear(), s.getMonth() + 1, 1);
    return { start: s, end: e, days: Math.round((e - s) / 864e5) };
  }
  if (kind === "year") {
    const s = new Date(n.getFullYear() + offset, 0, 1), e = new Date(s.getFullYear() + 1, 0, 1);
    return { start: s, end: e, days: Math.round((e - s) / 864e5) };
  }
  return { start: new Date(0), end: new Date(8.64e15), days: null };
}

export function periodLabel(kind, r) {
  const f = (d, o) => d.toLocaleDateString("fr-FR", o);
  if (kind === "week") { const last = new Date(r.end - 864e5); return `${f(r.start, { day: "numeric", month: r.start.getMonth() === last.getMonth() ? undefined : "short" })} – ${f(last, { day: "numeric", month: "short" })}`; }
  if (kind === "month") { const s = f(r.start, { month: "long", year: "numeric" }); return s[0].toUpperCase() + s.slice(1); }
  if (kind === "year") return String(r.start.getFullYear());
  return "Depuis le début";
}

/** Totaux d'une période. corr(w) → { km, paceSec }. */
export function summarize(list, r, corr) {
  const ws = list.filter((w) => { const d = new Date(w.date); return d >= r.start && d < r.end; });
  const s = { n: ws.length, km: 0, sec: 0, kcal: 0, days: new Set(), longest: null, bestPace: null, bestDay: null, ws };
  const perDay = new Map();
  for (const w of ws) {
    const c = corr(w);
    s.km += c.km; s.sec += w.durationSec || 0; s.kcal += w.kcalActive || 0;
    const dk = new Date(w.date).toDateString();
    s.days.add(dk);
    perDay.set(dk, (perDay.get(dk) || 0) + c.km);
    if (!s.longest || c.km > s.longest.km) s.longest = { km: c.km, w };
    if (c.paceSec && (!s.bestPace || c.paceSec < s.bestPace.pace)) s.bestPace = { pace: c.paceSec, w };
  }
  for (const [d, km] of perDay) if (!s.bestDay || km > s.bestDay.km) s.bestDay = { km, date: d };
  s.paceSec = s.km > 0 ? s.sec / s.km : null;
  return s;
}

// Séries : jours consécutifs (jusqu'à aujourd'hui ou hier) et semaines consécutives avec au moins une séance.
export function streaks(list, now = new Date()) {
  const days = new Set(list.map((w) => startOfDay(w.date).getTime()));
  let d = startOfDay(now), dayStreak = 0;
  if (!days.has(d.getTime())) d.setDate(d.getDate() - 1);
  while (days.has(d.getTime())) { dayStreak++; d.setDate(d.getDate() - 1); }
  const wk = (x) => { const s = startOfDay(x); s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); return s.getTime(); };
  const weeks = new Set(list.map((w) => wk(w.date)));
  let k = new Date(wk(now)), weekStreak = 0;
  if (!weeks.has(k.getTime())) k.setDate(k.getDate() - 7);
  while (weeks.has(k.getTime())) { weekStreak++; k.setDate(k.getDate() - 7); }
  return { dayStreak, weekStreak };
}

// Message de motivation selon l'objectif et la période précédente.
export function motivation({ kind, cur, prev, goalKm, isCurrent }) {
  const word = { week: "la semaine dernière", month: "le mois dernier", year: "l'an dernier" }[kind] || "";
  if (!cur.n) return isCurrent ? "Aucune séance pour l'instant… le tapis t'attend 😏" : "Période sans séance. On rattrape ça ?";
  if (goalKm && cur.km >= goalKm) return `Objectif atteint 🎯 ${cur.km >= goalKm * 1.25 ? "Et largement dépassé. Machine." : "Tu es une machine."}`;
  if (goalKm && isCurrent && cur.km >= goalKm * 0.7) return `Plus que ${(goalKm - cur.km).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km pour l'objectif, tu y es presque 🔥`;
  if (prev && prev.km > 0 && word) {
    const pct = Math.round(((cur.km - prev.km) / prev.km) * 100);
    if (pct >= 5) return `+${pct} % par rapport à ${word}, ça progresse 📈`;
    if (pct <= -5 && isCurrent) return `${Math.abs(pct)} % de moins que ${word} — une séance de plus et c'est rattrapé 💪`;
    if (pct <= -5) return `${Math.abs(pct)} % de moins que ${word}. On repart de plus belle 💪`;
    return `Aussi régulier que ${word}. La constance, c'est la clé 🔑`;
  }
  return "Chaque pas compte. Continue comme ça 👟";
}
