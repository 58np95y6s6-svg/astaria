// Cotes joueurs via The Odds API, appelée directement depuis le navigateur avec la clé
// saisie dans les Réglages (stockée uniquement sur l'appareil).
// Coût : ~10 crédits par match (1 par marché). Cache local de 10 min par match :
// ouvrir plusieurs joueurs du même match ne coûte qu'un appel.
import { normName, FR_BOOKS } from "./value.js";

const BASE = "https://api.the-odds-api.com/v4/sports/basketball_nba";
export const MARKET_MAP = {
  player_points: "pts", player_rebounds: "reb", player_assists: "ast", player_threes: "fg3m",
  player_steals: "stl", player_blocks: "blk", player_points_rebounds_assists: "pra",
  player_points_rebounds: "pr", player_points_assists: "pa", player_rebounds_assists: "ra",
  player_blocks_steals: "sb",
};
const BOOKS = "winamax_fr,betclic_fr,unibet_fr,pinnacle,draftkings,fanduel,betmgm,williamhill_us,betrivers,bovada";
const TTL = 10 * 60e3;

const ls = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota plein : on ignore */ } },
};
const nickname = (name = "") => normName(name).split(" ").pop();

async function call(apiKey, path, params) {
  const url = new URL(BASE + path);
  url.searchParams.set("apiKey", apiKey);
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
  const res = await fetch(url);
  const quota = { remaining: res.headers.get("x-requests-remaining"), used: res.headers.get("x-requests-used") };
  const body = await res.json().catch(() => null);
  if (!res.ok) { const e = new Error(body?.message || `HTTP ${res.status}`); e.status = res.status; throw e; }
  if (quota.remaining) ls.set("astaria-odds-quota", quota);
  return { body, quota };
}

async function findEvent(apiKey, game) {
  let c = ls.get("astaria-odds-events");
  const t = new Date(game.date).getTime();
  const match = (list) => list.find((e) => nickname(e.home_team) === nickname(game.home.name) && nickname(e.away_team) === nickname(game.away.name) && Math.abs(new Date(e.commence_time).getTime() - t) < 12 * 3600e3);
  if (c && Date.now() - c.at < 3 * 3600e3) { const ev = match(c.events); if (ev) return ev; }
  const { body } = await call(apiKey, "/events", {}); // appel gratuit
  c = { at: Date.now(), events: body || [] };
  ls.set("astaria-odds-events", c);
  return match(c.events) || null;
}

function normalize(body) {
  const players = {};
  for (const bm of body?.bookmakers || []) {
    for (const m of bm.markets || []) {
      const mk = MARKET_MAP[m.key];
      if (!mk) continue;
      const rows = {};
      for (const o of m.outcomes || []) {
        if (!o.description || o.point == null) continue;
        const row = (rows[`${normName(o.description)}|${o.point}`] ||= { name: o.description, line: Number(o.point) });
        if (/over/i.test(o.name)) row.over = Number(o.price);
        else if (/under/i.test(o.name)) row.under = Number(o.price);
      }
      for (const row of Object.values(rows)) {
        const p = (players[normName(row.name)] ||= { name: row.name, markets: {} });
        (p.markets[mk] ||= []).push({ book: bm.key, line: row.line, over: row.over ?? null, under: row.under ?? null });
      }
    }
  }
  return players;
}

function pruneCache() {
  try {
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith("astaria-odds-game-")) continue;
      const v = ls.get(k);
      if (!v || Date.now() - v.fetchedAtMs > 2 * 86400e3) localStorage.removeItem(k);
    }
  } catch { /* rien */ }
}

export function quota() { return ls.get("astaria-odds-quota"); }

export async function getGameOdds(game, apiKey, { force = false } = {}) {
  if (!apiKey) return { available: false, reason: "no_key" };
  const ck = `astaria-odds-game-${game.id}`;
  const cached = ls.get(ck);
  if (cached && !force && Date.now() - cached.fetchedAtMs < TTL) return { ...cached, cached: true };
  if (game.state === "post") return cached ? { ...cached, cached: true } : { available: false, reason: "finished" };
  try {
    const ev = await findEvent(apiKey, game);
    if (!ev) return { available: false, reason: "event_not_found" };
    const markets = Object.keys(MARKET_MAP).join(",");
    let res;
    try {
      res = await call(apiKey, `/events/${ev.id}/odds`, { markets, oddsFormat: "decimal", bookmakers: BOOKS });
    } catch (e) {
      if (e.status !== 422) throw e;
      res = await call(apiKey, `/events/${ev.id}/odds`, { markets, oddsFormat: "decimal", regions: "eu,us" });
    }
    const books = [...new Set((res.body?.bookmakers || []).map((b) => b.key))];
    const out = {
      available: true, fetchedAt: new Date().toISOString(), fetchedAtMs: Date.now(), quota: res.quota,
      books, frBooks: books.filter((b) => FR_BOOKS.has(b) && b !== "manual"), players: normalize(res.body),
    };
    pruneCache();
    ls.set(ck, out);
    return out;
  } catch (e) {
    const msg = e.status === 401 ? "clé The Odds API invalide" : e.status === 429 ? "quota de crédits épuisé" : e.message === "Failed to fetch" ? "connexion impossible au fournisseur de cotes" : e.message;
    return { available: false, reason: "error", error: msg };
  }
}
