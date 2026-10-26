import { loadCore, runUpdate } from "./lib/season.mjs";
import { json, errorJSON } from "./lib/store.mjs";

export default async (req) => {
  try {
    if (req.method === "POST") {
      const r = await runUpdate({ budgetMs: 8000 });
      return json(r);
    }
    const core = await loadCore();
    return json({
      season: core.season, updatedAt: core.updatedAt, gamesTotal: Object.keys(core.processed).length,
      teams: Object.keys(core.teams).length, players: Object.keys(core.players).length,
      oddsKey: !!process.env.ODDS_API_KEY, journalProtected: !!process.env.JOURNAL_KEY,
    });
  } catch (e) {
    return errorJSON(e);
  }
};

export const config = { path: "/api/status" };
