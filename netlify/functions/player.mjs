import { loadCore } from "./lib/season.mjs";
import { loadGame, buildContext } from "./lib/context.mjs";
import { json, errorJSON } from "./lib/store.mjs";

export default async (req) => {
  try {
    const u = new URL(req.url);
    const id = u.searchParams.get("id");
    const gameId = u.searchParams.get("game");
    const team = u.searchParams.get("team");
    if (!/^\d+$/.test(id || "") || !/^\d+$/.test(gameId || "")) return json({ error: "paramètres manquants" }, { status: 400 });
    const { meta, injuries } = await loadGame(gameId);
    const core = await loadCore(meta.season);
    const ctx = await buildContext({ core, game: meta, injuries, athleteId: id, teamId: team || undefined });
    const teamName = (tid) => core.teams[tid]?.name || (meta.home.id === tid ? meta.home.name : meta.away.name);
    return json({ game: meta, ...ctx, teamName: teamName(ctx.teamId), oppName: teamName(ctx.oppId), teamsAbbr: Object.fromEntries(Object.values(core.teams).map((t) => [t.id, t.abbr])), playerInjury: (injuries[ctx.teamId] || []).find((i) => i.id === id) || null }, { cache: 300 });
  } catch (e) {
    return errorJSON(e, 502);
  }
};

export const config = { path: "/api/player" };
