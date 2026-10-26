import { teamRoster, shiftDateKey, posGroup } from "./lib/espn.mjs";
import { loadCore, loadTeamLogs, teamPace } from "./lib/season.mjs";
import { loadGame } from "./lib/context.mjs";
import { json, errorJSON } from "./lib/store.mjs";

const r1 = (x) => Math.round(x * 10) / 10;

async function roster(core, season, team, injuries, dateKey) {
  const [espn, blob] = await Promise.all([teamRoster(team.id).catch(() => []), loadTeamLogs(season, team.id)]);
  const inj = new Map((injuries[team.id] || []).map((i) => [i.id, i]));
  const byId = new Map();
  // Joueurs de l'effectif ESPN actuel (gère les transferts) + joueurs vus dans les feuilles de match.
  const ids = new Set([...espn.map((p) => p.id), ...Object.entries(core.players).filter(([, p]) => p.teamId === team.id).map(([id]) => id)]);
  const espnMap = new Map(espn.map((p) => [p.id, p]));
  for (const id of ids) {
    const idx = core.players[id];
    const e = espnMap.get(id);
    if (espn.length && !e) continue; // n'est plus dans l'effectif
    const allLogs = (blob.players[id] || []).filter((l) => l.d < dateKey);
    const gp = allLogs.length;
    const l5 = allLogs.slice(-5);
    const sum = (rows, k) => rows.reduce((s, r) => s + r[k], 0);
    const i = inj.get(id);
    byId.set(id, {
      id, name: e?.name || idx?.name || id, pos: e?.pos || idx?.pos || "", group: posGroup(e?.pos || idx?.pos),
      jersey: e?.jersey || "", headshot: e?.headshot || idx?.headshot || "",
      gp, mpg: gp ? r1(sum(allLogs, "min") / gp) : 0, ppg: gp ? r1(sum(allLogs, "pts") / gp) : 0,
      rpg: gp ? r1(sum(allLogs, "reb") / gp) : 0, apg: gp ? r1(sum(allLogs, "ast") / gp) : 0,
      starts5: l5.filter((l) => l.start).length,
      status: i?.status || e?.injury || null, injuryDetail: i?.detail || "",
    });
  }
  return [...byId.values()].sort((a, b) => b.mpg - a.mpg || b.gp - a.gp || a.name.localeCompare(b.name));
}

export default async (req) => {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!/^\d+$/.test(id || "")) return json({ error: "id manquant" }, { status: 400 });
    const { meta, injuries } = await loadGame(id);
    const core = await loadCore(meta.season);
    const y = shiftDateKey(meta.dateKey, -1);
    const [homeRoster, awayRoster] = await Promise.all([
      roster(core, meta.season, meta.home, injuries, meta.dateKey),
      roster(core, meta.season, meta.away, injuries, meta.dateKey),
    ]);
    const ctx = (t) => ({
      b2b: !!core.teams[t.id]?.games.some((g) => g.d === y),
      pace: r1(teamPace(core, t.id).pace), games: core.teams[t.id]?.games.length || 0,
    });
    return json({
      game: meta, injuries,
      teams: { [meta.home.id]: { ...meta.home, ...ctx(meta.home), roster: homeRoster }, [meta.away.id]: { ...meta.away, ...ctx(meta.away), roster: awayRoster } },
      data: { gamesTotal: Object.keys(core.processed).length, updatedAt: core.updatedAt, leaguePace: r1(teamPace(core, "-").league) },
    }, { cache: 300 });
  } catch (e) {
    return errorJSON(e, 502);
  }
};

export const config = { path: "/api/game" };
