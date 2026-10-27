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
import fs from "node:fs/promises";
import path from "node:path";

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

// 5) Projections précalculées (même modèle que l'app) pour chaque joueur des matchs à venir.
//    Le téléphone n'a plus qu'à récupérer les cotes et comparer : le Top value s'affiche vite.
if (!globalThis.ASTARIA_DATA_BASE) {
  globalThis.ASTARIA_DATA_BASE = "https://local.data/";
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, o) => {
    const s = String(u);
    if (!s.startsWith("https://local.data/")) return realFetch(u, o);
    try { return new Response(await fs.readFile(path.join(DATA_DIR, s.slice(19).split("?")[0]), "utf8"), { status: 200 }); }
    catch { return new Response("", { status: 404 }); }
  };
}
const D = await import("../js/data.js");
const { project, MARKETS, averages } = await import("../js/model.js");
const r2 = (x) => Math.round(x * 100) / 100;
let projCount = 0;
for (const g of upcoming) {
  try {
    const gd = await D.getGameData(g.id);
    const players = {};
    for (const [teamId, roster] of Object.entries(gd.rosters || {})) {
      for (const p of roster) {
        const inj = (gd.injuries[teamId] || []).find((i) => i.id === p.id);
        if (inj && /^out|suspen/i.test(inj.status)) continue;
        const ctx = await D.buildContext(gd, p.id, teamId);
        if (!ctx.logs.length && !ctx.prior) continue;
        const proj = project(ctx);
        if (!proj || proj.minutesUsed < 8) continue;
        const base = ctx.logs.length >= 3 ? ctx.logs : [...(ctx.prior || []), ...ctx.logs];
        const avg = averages(base.slice(-30));
        players[p.id] = {
          name: ctx.player.name, teamId, pos: ctx.player.pos, headshot: ctx.player.headshot,
          status: inj?.status || null, min: r2(proj.minutesUsed), gp: ctx.logs.length,
          m: Object.fromEntries(Object.keys(MARKETS).map((k) => [k, [r2(proj.stats[k].mean), r2(proj.stats[k].phi)]])),
          avg: Object.fromEntries(Object.keys(MARKETS).map((k) => [k, r2(avg[k])])),
          // 30 derniers matchs (saison en cours) : pts, reb, ast, 3pts, int, ctr
          recent: ctx.logs.slice(-30).map((l) => [l.pts, l.reb, l.ast, l.fg3m, l.stl, l.blk]),
        };
        projCount++;
      }
    }
    await writeJSON(`proj/${g.id}`, { gameId: g.id, updatedAt: new Date().toISOString(), players });
  } catch (e) { log("projections", g.id, e.message); }
}
log("projections", projCount);

const core = await readJSON(`s${season}/core`);
await writeJSON("meta", {
  season, updatedAt: new Date().toISOString(),
  gamesTotal: Object.keys(core?.processed || {}).length,
  teams: Object.keys(core?.teams || {}).length, players: Object.keys(core?.players || {}).length,
});
log("terminé");
