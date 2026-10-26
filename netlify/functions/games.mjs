import { scoreboard, etDateKey } from "./lib/espn.mjs";
import { json, errorJSON } from "./lib/store.mjs";

export default async (req) => {
  try {
    const url = new URL(req.url);
    const date = url.searchParams.get("date") || etDateKey();
    if (!/^\d{8}$/.test(date)) return json({ error: "date invalide (YYYYMMDD)" }, { status: 400 });
    const games = await scoreboard(date);
    return json({ date, games }, { cache: 120 });
  } catch (e) {
    return errorJSON(e, 502);
  }
};

export const config = { path: "/api/games" };
