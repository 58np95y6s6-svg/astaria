// Cotes joueurs via The Odds API (https://the-odds-api.com).
// Coût : (nb de marchés) crédits par match et par appel, quand on liste ≤ 10 bookmakers.
// On met en cache par match (10 min par défaut) : ouvrir plusieurs joueurs du même match ne coûte qu'un appel.
import { readJSON, writeJSON } from "./store.mjs";
import { normName } from "../../../public/js/value.js";

const BASE = "https://api.the-odds-api.com/v4/sports/basketball_nba";

export const MARKET_MAP = {
  player_points: "pts",
  player_rebounds: "reb",
  player_assists: "ast",
  player_threes: "fg3m",
  player_steals: "stl",
  player_blocks: "blk",
  player_points_rebounds_assists: "pra",
  player_points_rebounds: "pr",
  player_points_assists: "pa",
  player_rebounds_assists: "ra",
  player_blocks_steals: "sb",
};

// Bookmakers français mis en avant ; les autres servent de référence de marché (consensus).
export const FR_BOOKS = ["winamax_fr", "betclic_fr", "betclic", "unibet_fr", "parionssport_fr", "pmu_fr", "zebet_fr"];
const DEFAULT_BOOKS = "winamax_fr,betclic_fr,unibet_fr,pinnacle,draftkings,fanduel,betmgm,williamhill_us,betrivers,bovada";
// Le poids "sharp" sert au consensus : Pinnacle et les grands books US sont les plus efficients sur les props.
export const SHARP_WEIGHT = { pinnacle: 3, draftkings: 1.5, fanduel: 1.5 };

export { normName };

const nickname = (name = "") => normName(name).split(" ").pop(); // "Lakers", "Blazers", "76ers"…

function key() {
  return process.env.ODDS_API_KEY || "";
}

async function call(path, params) {
  const url = new URL(BASE + path);
  url.searchParams.set("apiKey", key());
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const quota = {
    remaining: res.headers.get("x-requests-remaining"),
    used: res.headers.get("x-requests-used"),
    last: res.headers.get("x-requests-last"),
  };
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = body?.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status; err.quota = quota;
    throw err;
  }
  return { body, quota };
}

// Retrouve l'identifiant The Odds API d'un match ESPN (nom d'équipe + heure). Appel gratuit.
async function findEvent(game) {
  const cacheKey = `odds/events`;
  let cached = await readJSON(cacheKey);
  if (!cached || Date.now() - cached.at > 3 * 3600e3) {
    const { body } = await call("/events", {});
    cached = { at: Date.now(), events: body || [] };
    await writeJSON(cacheKey, cached);
  }
  const t = new Date(game.date).getTime();
  const hn = nickname(game.home.name), an = nickname(game.away.name);
  return cached.events.find((e) =>
    nickname(e.home_team) === hn && nickname(e.away_team) === an && Math.abs(new Date(e.commence_time).getTime() - t) < 12 * 3600e3,
  ) || null;
}

function normalize(body) {
  const players = {};
  for (const bm of body?.bookmakers || []) {
    for (const m of bm.markets || []) {
      const mk = MARKET_MAP[m.key];
      if (!mk) continue;
      const rows = {};
      for (const o of m.outcomes || []) {
        const pname = o.description || "";
        if (!pname || o.point == null) continue;
        const id = `${normName(pname)}|${o.point}`;
        const row = (rows[id] ||= { name: pname, line: Number(o.point) });
        if (/over/i.test(o.name)) row.over = Number(o.price);
        else if (/under/i.test(o.name)) row.under = Number(o.price);
      }
      for (const row of Object.values(rows)) {
        const p = (players[normName(row.name)] ||= { name: row.name, markets: {} });
        (p.markets[mk] ||= []).push({ book: bm.key, title: bm.title, line: row.line, over: row.over ?? null, under: row.under ?? null, updated: bm.last_update });
      }
    }
  }
  return players;
}

export async function getGameOdds(game, { force = false } = {}) {
  if (!key()) return { available: false, reason: "no_key" };
  const ttl = Number(process.env.ODDS_TTL_MIN || 10) * 60e3;
  const cacheKey = `odds/game-${game.id}`;
  const cached = await readJSON(cacheKey);
  if (cached && !force && Date.now() - cached.fetchedAtMs < ttl) return { ...cached, cached: true };
  if (game.state === "post") return cached ? { ...cached, cached: true } : { available: false, reason: "finished" };

  const ev = await findEvent(game);
  if (!ev) return { available: false, reason: "event_not_found" };
  const markets = (process.env.ODDS_MARKETS || Object.keys(MARKET_MAP).join(",")).split(",").map((s) => s.trim()).filter(Boolean);
  let res;
  try {
    res = await call(`/events/${ev.id}/odds`, {
      markets: markets.join(","), oddsFormat: "decimal",
      bookmakers: process.env.ODDS_BOOKMAKERS || DEFAULT_BOOKS,
    });
  } catch (e) {
    // Si une clé de bookmaker est refusée, on retente par régions.
    if (e.status === 422) {
      res = await call(`/events/${ev.id}/odds`, { markets: markets.join(","), oddsFormat: "decimal", regions: process.env.ODDS_REGIONS || "eu,us" });
    } else throw e;
  }
  const players = normalize(res.body);
  const books = [...new Set((res.body?.bookmakers || []).map((b) => b.key))];
  const out = {
    available: true, oddsEventId: ev.id, fetchedAt: new Date().toISOString(), fetchedAtMs: Date.now(),
    quota: res.quota, books, frBooks: books.filter((b) => FR_BOOKS.includes(b)), players,
  };
  await writeJSON(cacheKey, out);
  return out;
}
