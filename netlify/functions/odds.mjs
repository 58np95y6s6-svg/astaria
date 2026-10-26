import { loadGame } from "./lib/context.mjs";
import { getGameOdds } from "./lib/odds.mjs";
import { json, errorJSON } from "./lib/store.mjs";

export default async (req) => {
  try {
    const u = new URL(req.url);
    const gameId = u.searchParams.get("game");
    if (!/^\d+$/.test(gameId || "")) return json({ error: "game manquant" }, { status: 400 });
    const { meta } = await loadGame(gameId);
    const out = await getGameOdds(meta, { force: u.searchParams.get("force") === "1" });
    return json(out);
  } catch (e) {
    return json({ available: false, reason: "error", error: String(e.message || e), quota: e.quota || null }, { status: 200 });
  }
};

export const config = { path: "/api/odds" };
