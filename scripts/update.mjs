// Mise à jour des données (lancée par GitHub Actions toutes les 30 min).
// Produit, dans DATA_DIR :
//   meta.json                      état général
//   s<saison>/core.json            défense par poste, rythme, index des joueurs
//   s<saison>/teams/<id>.json      journaux de match des joueurs de l'équipe
//   days/<YYYYMMDD>.json           matchs du jour (hier → J+7)
//   games/<id>.json                match à venir : blessés, écart, effectifs
//   prior/<saison>/<joueur>.json   saison précédente (a priori en début de saison)
import { scoreboard, summary, teamRoster, parseInjuries, parsePickcenter, priorSeason } from "./lib/espn.mjs";
import { seasonForDate, etDateKey, shiftDateKey } from "../js/factors.js";
import { runUpdate } from "./lib/season.mjs";
import { readJSON, writeJSON, exists, DATA_DIR } from "./lib/store.mjs";

const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

function teamFromComp(c) {
  const t = c?.team || {};
  return {
    id: String(t.id ?? c?.id ?? ""), abbr: t.abbreviation || "", name: t.displayName || "",
    short: t.shortDisplayName || t.name || "", logo: t.logos?.[0]?.href || t.logo || "",
    record: c?.record?.[0]?.displayValue || c?.records?.[0]?.summary || "",
    score: c?.score != null ? Number(c.score) : null,
  };
}

async function pool(items, n, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]).catch((e) => { log("erreur", e.message); return null; }); }
  }));
  return out;
}

const season = seasonForDate();
const today = etDateKey();
log("dossier", DATA_DIR, "saison", season, "jour", today);

// 1) Agrégation des feuilles de match terminées
let up;
do {
  up = await runUpdate({ budgetMs: 10 * 60e3, season });
  log("agrégation", JSON.stringify(up));
} while (up.pendingDates > 0 && up.processedNow > 0 && Date.now() - t0 < 30 * 60e3);

// 2) Calendrier : hier → J+7
const days = Array.from({ length: 9 }, (_, i) => shiftDateKey(today, i - 1));
const boards = await pool(days, 4, async (d) => ({ d, games: await scoreboard(d) }));
for (const b of boards) if (b) await writeJSON(`days/${b.d}`, { date: b.d, games: b.games, updatedAt: new Date().toISOString() });

// 3) Matchs à venir (aujourd'hui → J+2) : blessés, écart, effectifs
const upcoming = boards.filter((b) => b && b.d >= today && b.d <= shiftDateKey(today, 2)).flatMap((b) => b.games).filter((g) => !g.completed);
const rosterCache = new Map();
const getRoster = (id) => { if (!rosterCache.has(id)) rosterCache.set(id, teamRoster(id).catch(() => [])); return rosterCache.get(id); };
const playerIds = new Set();
await pool(upcoming, 4, async (g) => {
  const sum = await summary(g.id);
  const comp = sum?.header?.competitions?.[0] || {};
  const home = { ...g.home, ...teamFromComp(comp.competitors?.find((c) => c.homeAway === "home")) };
  const away = { ...g.away, ...teamFromComp(comp.competitors?.find((c) => c.homeAway === "away")) };
  home.logo ||= g.home.logo; away.logo ||= g.away.logo;
  const [rh, ra] = await Promise.all([getRoster(home.id), getRoster(away.id)]);
  for (const p of [...rh, ...ra]) playerIds.add(p.id);
  const pc = parsePickcenter(sum);
  const st = comp.status?.type || {};
  await writeJSON(`games/${g.id}`, {
    game: {
      id: g.id, date: g.date, dateKey: g.dateKey, season: seasonForDate(new Date(g.date)),
      state: st.state || g.state, statusText: st.shortDetail || g.statusText, home, away,
      spread: pc.spread ?? g.spread, total: pc.total ?? g.total, details: pc.details ?? g.details,
    },
    injuries: parseInjuries(sum),
    rosters: { [home.id]: rh, [away.id]: ra },
    updatedAt: new Date().toISOString(),
  });
});
log("matchs à venir", upcoming.length, "joueurs", playerIds.size);

// 4) Saison précédente des joueurs concernés (une seule fois par joueur)
const prev = season - 1;
const missing = [];
for (const id of playerIds) if (!(await exists(`prior/${prev}/${id}`))) missing.push(id);
await pool(missing, 6, async (id) => {
  const rows = await priorSeason(id, prev).catch(() => null);
  // Format compact : [min, pts, fg2m, fg2a, fg3m, fg3a, ftm, fta, reb, ast, stl, blk, tov]
  const K = ["min", "pts", "fg2m", "fg2a", "fg3m", "fg3a", "ftm", "fta", "reb", "ast", "stl", "blk", "tov"];
  await writeJSON(`prior/${prev}/${id}`, { keys: K, rows: (rows || []).map((r) => K.map((k) => Math.round((r[k] || 0) * 10) / 10)) });
});
log("saisons précédentes récupérées", missing.length);

const core = await readJSON(`s${season}/core`);
await writeJSON("meta", {
  season, updatedAt: new Date().toISOString(),
  gamesTotal: Object.keys(core?.processed || {}).length,
  teams: Object.keys(core?.teams || {}).length, players: Object.keys(core?.players || {}).length,
});
log("terminé");
