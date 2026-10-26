// Scan d'un match : cotes de tous les joueurs → projection → classement des paris par value.
import { loadCore } from "./lib/season.mjs";
import { loadGame, buildContext } from "./lib/context.mjs";
import { getGameOdds, normName } from "./lib/odds.mjs";
import { json } from "./lib/store.mjs";
import { project } from "../../public/js/model.js";
import { evaluate } from "../../public/js/value.js";

export default async (req) => {
  try {
    const gameId = new URL(req.url).searchParams.get("game");
    if (!/^\d+$/.test(gameId || "")) return json({ error: "game manquant" }, { status: 400 });
    const { meta, injuries } = await loadGame(gameId);
    const odds = await getGameOdds(meta);
    if (!odds.available) return json({ game: meta, picks: [], odds: { available: false, reason: odds.reason, error: odds.error } });
    const core = await loadCore(meta.season);
    const byName = new Map();
    for (const [id, p] of Object.entries(core.players)) {
      if (p.teamId === meta.home.id || p.teamId === meta.away.id) byName.set(normName(p.name), id);
    }
    const entries = Object.entries(odds.players).map(([n, p]) => ({ id: byName.get(n), p })).filter((x) => x.id);
    const picks = [];
    const unmatched = Object.keys(odds.players).filter((n) => !byName.has(n));
    await Promise.all(entries.map(async ({ id, p }) => {
      try {
        const ctx = await buildContext({ core, game: meta, injuries, athleteId: id });
        const injured = (injuries[ctx.teamId] || []).find((i) => i.id === id);
        if (injured && /^out/i.test(injured.status)) return;
        const proj = project(ctx);
        if (!proj) return;
        for (const [mk, offers] of Object.entries(p.markets)) {
          if (!proj.stats[mk]) continue;
          const best = evaluate(mk, proj.stats[mk], offers);
          for (const b of best.slice(0, 2)) {
            picks.push({ ...b, playerId: id, player: ctx.player.name, teamId: ctx.teamId, status: injured?.status || null, minutes: proj.minutesUsed });
          }
        }
      } catch (e) { /* joueur ignoré */ }
    }));
    picks.sort((a, b) => b.ev - a.ev);
    return json({ game: meta, picks: picks.slice(0, 60), unmatched, odds: { available: true, fetchedAt: odds.fetchedAt, quota: odds.quota, books: odds.books, cached: !!odds.cached } });
  } catch (e) {
    return json({ error: String(e.message || e), picks: [] }, { status: 502 });
  }
};

export const config = { path: "/api/scan" };
