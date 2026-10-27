// Top value : projections précalculées (GitHub Actions) + cotes (The Odds API) → paris classés.
import { MARKETS, negBin, quantile } from "./model.js";
import { evaluate, normName, SHOWN_BOOKS, BOOK_LABEL } from "./value.js";
import { fetchJSON, getGameData } from "./data.js";
import { getGameOdds } from "./odds.js";

const RECENT_IDX = { pts: 0, reb: 1, ast: 2, fg3m: 3, stl: 4, blk: 5 };
const recentValue = (row, key) => MARKETS[key].parts.reduce((s, p) => s + (row[RECENT_IDX[p]] || 0), 0);

export const getProjections = (gameId) => fetchJSON(`proj/${gameId}`, { optional: true, ttl: 300e3 });

// Reconstruit une projection exploitable par evaluate() à partir du fichier précalculé.
export function statFromProj(p, key) {
  const [mean, phi] = p.m[key];
  const dist = negBin(mean, phi);
  const vals = (p.recent || []).map((r) => recentValue(r, key));
  return { mean, phi, dist, median: quantile(dist, 0.5), p25: quantile(dist, 0.25), p75: quantile(dist, 0.75), l10Values: vals.slice(-10), seasonValues: vals };
}

const ls = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* rien */ } },
};

export function cachedTop(scope) {
  const c = ls.get(`astaria-top-${scope}`);
  return c && Date.now() - c.at < 15 * 60e3 ? c : null;
}

/**
 * games : matchs (objets de days/<date>.json). Retourne { picks, errors, quota, at }.
 * Un pari par (joueur, marché, côté) : la meilleure cote parmi les bookmakers.
 */
export async function topValue(scope, games, { oddsKey, wModel, onProgress, force = false, level = "essential" } = {}) {
  const picks = [];
  const targets = [];
  const diag = [];
  const errors = [];
  let quota = null;
  const todo = games.filter((g) => g.state === "pre");
  for (const [i, g] of todo.entries()) {
    onProgress?.(i + 1, todo.length);
    const [proj, gd] = await Promise.all([getProjections(g.id), getGameData(g.id).catch(() => null)]);
    if (!proj || !gd) { errors.push(`${g.away.abbr} @ ${g.home.abbr} : projections pas encore prêtes`); continue; }
    const odds = await getGameOdds(gd.game, oddsKey, { force, level });
    if (!odds.available) {
      errors.push(`${g.away.abbr} @ ${g.home.abbr} : ${odds.reason === "event_not_found" ? "cotes pas encore publiées" : odds.error || odds.reason}`);
      continue;
    }
    if (odds.quota?.remaining) quota = odds.quota.remaining;
    // Diagnostic : nombre de cotes joueurs reçues par bookmaker.
    const count = {};
    for (const op of Object.values(odds.players)) for (const offers of Object.values(op.markets)) for (const o of offers) count[o.book] = (count[o.book] || 0) + 1;
    diag.push({ matchup: `${g.away.abbr} @ ${g.home.abbr}`, count });
    const byName = new Map(Object.entries(proj.players).map(([id, p]) => [normName(p.name), [id, p]]));
    for (const [n, op] of Object.entries(odds.players)) {
      const hit = byName.get(n);
      if (!hit) continue;
      const [pid, p] = hit;
      for (const [mk, offers] of Object.entries(op.markets)) {
        if (!p.m[mk]) continue;
        const sp = statFromProj(p, mk);
        const base = { playerId: pid, player: p.name, headshot: p.headshot, teamId: p.teamId, gameId: g.id,
          matchup: `${g.away.abbr} @ ${g.home.abbr}`, season: gd.game.season, gameDate: gd.game.dateKey, status: p.status, avg: p.avg[mk] };
        // Lignes à viser : d'après les books de référence (Pinnacle, Betfair), quand le modèle est plus optimiste que le marché.
        for (const r of evaluate(mk, sp, offers, { wModel, allBooks: true })) {
          if (SHOWN_BOOKS.has(r.book) || r.pMarket == null) continue;
          const edge = r.pModel - r.pMarket;
          if (r.pFinal < 0.5 || edge < 0.01) continue; // le modèle doit être plus optimiste que le marché
          targets.push({ ...r, ...base, edge, minOdds: Math.round(r.fair * 1.03 * 100) / 100 });
        }
        const list = evaluate(mk, sp, offers, { wModel });
        for (const b of list) {
          picks.push({ ...b, dist: undefined, playerId: pid, player: p.name, headshot: p.headshot, teamId: p.teamId, gameId: g.id,
            matchup: `${g.away.abbr} @ ${g.home.abbr}`, season: gd.game.season, gameDate: gd.game.dateKey, status: p.status, avg: p.avg[mk] });
        }
      }
    }
  }
  // Dédoublonnage : meilleure cote par (joueur, marché, côté, ligne), puis meilleure ligne par (joueur, marché, côté).
  const best = new Map();
  for (const p of picks) {
    if (p.pFinal < 0.4) continue; // paliers trop improbables : hors Top
    const k = `${p.playerId}|${p.key}|${p.side}`;
    const cur = best.get(k);
    if (!cur || p.ev > cur.ev) best.set(k, p);
  }
  const bestT = new Map();
  for (const t of targets) {
    const k = `${t.playerId}|${t.key}|${t.side}`;
    const cur = bestT.get(k);
    if (!cur || t.pFinal > cur.pFinal) bestT.set(k, t);
  }
  const out = { at: Date.now(), picks: [...best.values()].sort((a, b) => b.ev - a.ev), targets: [...bestT.values()].sort((a, b) => b.edge - a.edge), diag, errors, quota, mode: "odds" };
  ls.set(`astaria-top-${scope}`, out);
  return out;
}

// Sans clé de cotes : joueurs dont la projection dépasse le plus leur moyenne (matchup favorable).
export async function topMatchups(scope, games) {
  const rows = [];
  for (const g of games.filter((x) => x.state === "pre")) {
    const proj = await getProjections(g.id);
    if (!proj) continue;
    for (const [pid, p] of Object.entries(proj.players)) {
      if (p.min < 22 || p.gp < 2) continue;
      for (const [mk, minAvg] of [["pts", 10], ["reb", 5], ["ast", 4], ["pra", 20], ["fg3m", 1.5]]) {
        const avg = p.avg[mk], mean = p.m[mk][0];
        if (!(avg >= minAvg)) continue;
        rows.push({ playerId: pid, player: p.name, headshot: p.headshot, teamId: p.teamId, gameId: g.id, matchup: `${g.away.abbr} @ ${g.home.abbr}`,
          key: mk, label: MARKETS[mk].label, mean, avg, edge: mean / avg - 1, status: p.status });
      }
    }
  }
  const best = new Map();
  for (const r of rows.sort((a, b) => b.edge - a.edge)) if (!best.has(r.playerId)) best.set(r.playerId, r);
  const out = { at: Date.now(), rows: [...best.values()], mode: "matchups" };
  ls.set(`astaria-top-${scope}`, out);
  return out;
}

// Résumé lisible du diagnostic : « BKN @ BOS : Winamax 0 · Betclic 0 · réf. Pinnacle 14 ».
export function diagLines(res) {
  return (res.diag || []).map((d) => {
    const fr = ["winamax_fr", "betclic_fr"].map((b) => `${BOOK_LABEL[b]} ${d.count[b] || 0}`).join(" · ");
    const ref = Object.entries(d.count).filter(([b]) => !SHOWN_BOOKS.has(b) && b !== "betclic").map(([b, n]) => `${BOOK_LABEL[b] || b} ${n}`).join(", ");
    return `${d.matchup} : ${fr}${ref ? ` · réf. ${ref}` : ""}`;
  });
}

// Aucune cote Winamax/Betclic reçue sur l'ensemble du scan ?
export const noFrOdds = (res) => (res.diag || []).length > 0 && res.diag.every((d) => !d.count.winamax_fr && !d.count.betclic_fr);
