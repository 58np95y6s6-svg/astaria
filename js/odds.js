// Cotes joueurs via The Odds API, appelée directement depuis le navigateur avec la clé
// saisie dans les Réglages (stockée uniquement sur l'appareil).
// Coût : ~10 crédits par match (1 par marché). Cache local de 10 min par match :
// ouvrir plusieurs joueurs du même match ne coûte qu'un appel.
import { normName, SHOWN_BOOKS } from "./value.js";

const BASE = "https://api.the-odds-api.com/v4/sports/basketball_nba";
export const MARKET_MAP = {
  player_points: "pts", player_rebounds: "reb", player_assists: "ast", player_threes: "fg3m",
  player_steals: "stl", player_blocks: "blk", player_points_rebounds_assists: "pra",
  player_points_rebounds: "pr", player_points_assists: "pa", player_rebounds_assists: "ra",
  player_blocks_steals: "sb",
};
// Paliers (« Plus de 14,5 / 19,5 / 24,5… » chez Winamax) : marchés « alternate », Over uniquement.
export const ALT_MARKET_MAP = {
  player_points_alternate: "pts", player_rebounds_alternate: "reb", player_assists_alternate: "ast",
  player_threes_alternate: "fg3m", player_steals_alternate: "stl", player_blocks_alternate: "blk",
  player_points_rebounds_assists_alternate: "pra", player_points_rebounds_alternate: "pr",
  player_points_assists_alternate: "pa", player_rebounds_assists_alternate: "ra",
};
const ALL_MARKETS = { ...MARKET_MAP, ...ALT_MARKET_MAP };
// Winamax et Betclic sont les seuls affichés. Les books US (qui publient les cotes joueurs NBA sur la source)
// et Pinnacle/Betfair servent de référence invisible. ≤ 10 bookmakers = même coût qu'une seule région.
const BOOKS = "winamax_fr,betclic_fr,draftkings,fanduel,betmgm,williamhill_us,betrivers,pinnacle,betfair_ex_eu";
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
      const mk = ALL_MARKETS[m.key];
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
      if (!k.startsWith("ibibet-odds-v2-game-")) continue;
      const v = ls.get(k);
      if (!v || Date.now() - v.fetchedAtMs > 2 * 86400e3) localStorage.removeItem(k);
    }
  } catch { /* rien */ }
}

// Cotes déjà en cache (aucun crédit consommé), sinon null.
export function cachedGameOdds(gameId) {
  const c = ls.get(`ibibet-odds-v2-game-${gameId}`);
  return c && Date.now() - c.fetchedAtMs < TTL ? { ...c, cached: true } : null;
}

export function quota() { return ls.get("astaria-odds-quota"); }

// Niveaux de scan : on n'est facturé que pour les marchés renvoyés, mais on limite par défaut.
export const SCAN_LEVELS = {
  essential: { label: "Essentiel", cost: 5, markets: ["player_points", "player_rebounds", "player_assists", "player_threes", "player_points_rebounds_assists"] },
  full: { label: "Complet", cost: 11, markets: Object.keys(MARKET_MAP) },
  paliers: { label: "Complet + paliers", cost: 21, markets: Object.keys(ALL_MARKETS) },
};
const LEVEL_RANK = { essential: 0, full: 1, paliers: 2 };

export async function getGameOdds(game, apiKey, { force = false, level = "essential" } = {}) {
  if (!apiKey) return { available: false, reason: "no_key" };
  if (!SCAN_LEVELS[level]) level = "essential";
  const ck = `ibibet-odds-v2-game-${game.id}`;
  const cached = ls.get(ck);
  const cacheOk = cached && Date.now() - cached.fetchedAtMs < TTL && (LEVEL_RANK[cached.level] ?? 2) >= LEVEL_RANK[level];
  if (cacheOk && !force) return { ...cached, cached: true };
  if (game.state === "post") return cached ? { ...cached, cached: true } : { available: false, reason: "finished" };
  try {
    const ev = await findEvent(apiKey, game);
    if (!ev) return { available: false, reason: "event_not_found" };
    let res;
    try {
      res = await call(apiKey, `/events/${ev.id}/odds`, { markets: SCAN_LEVELS[level].markets.join(","), oddsFormat: "decimal", bookmakers: BOOKS });
    } catch (e) {
      if (e.status !== 422 || level !== "paliers") throw e;
      // Un marché « alternate » refusé : on se rabat sur les marchés classiques.
      level = "full";
      res = await call(apiKey, `/events/${ev.id}/odds`, { markets: SCAN_LEVELS.full.markets.join(","), oddsFormat: "decimal", bookmakers: BOOKS });
    }
    const books = [...new Set((res.body?.bookmakers || []).map((b) => b.key))];
    const out = {
      available: true, level, fetchedAt: new Date().toISOString(), fetchedAtMs: Date.now(), quota: res.quota,
      books, frBooks: books.filter((b) => SHOWN_BOOKS.has(b)), players: normalize(res.body),
    };
    pruneCache();
    ls.set(ck, out);
    return out;
  } catch (e) {
    const msg = e.status === 401 ? "clé The Odds API invalide" : e.status === 429 ? "quota de crédits épuisé" : e.message === "Failed to fetch" ? "connexion impossible au fournisseur de cotes" : e.message;
    return { available: false, reason: "error", error: msg };
  }
}

// Vérifie (≈1 crédit) si Winamax / Betclic publient des cotes joueurs via la source,
// sur le premier match NBA à venir, marché « points » uniquement.
export async function checkCoverage(apiKey) {
  const { body: events } = await call(apiKey, "/events", {});
  const ev = (events || []).find((e) => new Date(e.commence_time).getTime() > Date.now());
  if (!ev) return { ok: false, msg: "Aucun match NBA à venir pour tester." };
  const { body, quota } = await call(apiKey, `/events/${ev.id}/odds`, { markets: "player_points", oddsFormat: "decimal", bookmakers: BOOKS });
  const n = (k) => (body?.bookmakers || []).find((b) => b.key === k)?.markets?.[0]?.outcomes?.length || 0;
  const w = n("winamax_fr"), bc = n("betclic_fr");
  const refs = (body?.bookmakers || []).filter((b) => !["winamax_fr", "betclic_fr"].includes(b.key) && b.markets?.[0]?.outcomes?.length);
  const pin = refs.reduce((t, b) => t + b.markets[0].outcomes.length, 0);
  const match = `${ev.away_team} @ ${ev.home_team}`;
  let verdict;
  if (w || bc) verdict = "✅ Winamax/Betclic disponibles : le scan fonctionnera.";
  else if (pin) verdict = `❌ Pas de cotes joueurs Winamax/Betclic via la source. Les références (${refs.map((b) => b.title).join(", ")}) répondent : le scan te donnera les lignes à viser avec la cote minimale à exiger chez Winamax.`;
  else verdict = "⏳ Aucune cote joueurs publiée pour l'instant sur ce match : réessaie plus près du match.";
  return { ok: true, msg: `${match} — Winamax ${w} · Betclic ${bc} · réf. ${pin}. ${verdict}${quota.remaining ? ` (${quota.remaining} crédits restants)` : ""}` };
}

// Vérifie la clé sans consommer de crédit (la liste des sports est gratuite).
export async function testKey(apiKey) {
  const url = new URL("https://api.the-odds-api.com/v4/sports");
  url.searchParams.set("apiKey", apiKey);
  const res = await fetch(url);
  const remaining = res.headers.get("x-requests-remaining");
  if (res.status === 401) return { ok: false, msg: "Clé invalide" };
  if (!res.ok) return { ok: false, msg: `Erreur ${res.status}` };
  const sports = await res.json();
  const nba = sports.some((x) => x.key === "basketball_nba");
  if (remaining) ls.set("astaria-odds-quota", { remaining });
  return { ok: true, msg: `Clé valide ✓${remaining ? ` · ${remaining} crédits restants` : ""}${nba ? " · NBA disponible" : ""}` };
}

// ---------- Cotes équipe (vainqueur, handicap, total) : ≈3 crédits par match ----------
// Winamax et Betclic les publient sur la source ; Pinnacle / Betfair / books US servent de référence.
const TEAM_BOOKS = "winamax_fr,betclic_fr,pinnacle,betfair_ex_eu,draftkings,fanduel";

export function cachedTeamOdds(gameId) {
  const c = ls.get(`ibibet-team-odds-${gameId}`);
  return c && Date.now() - c.fetchedAtMs < TTL ? { ...c, cached: true } : null;
}

export async function getTeamOdds(game, apiKey, { force = false } = {}) {
  if (!apiKey) return { available: false, reason: "no_key" };
  const ck = `ibibet-team-odds-${game.id}`;
  const cached = ls.get(ck);
  if (cached && !force && Date.now() - cached.fetchedAtMs < TTL) return { ...cached, cached: true };
  try {
    const ev = await findEvent(apiKey, game);
    if (!ev) return { available: false, reason: "event_not_found" };
    const { body, quota } = await call(apiKey, `/events/${ev.id}/odds`, { markets: "h2h,spreads,totals", oddsFormat: "decimal", bookmakers: TEAM_BOOKS });
    const teamOf = (name) => (nickname(name) === nickname(game.home.name) ? game.home.id : nickname(name) === nickname(game.away.name) ? game.away.id : null);
    const offers = [];
    for (const bm of body?.bookmakers || []) {
      for (const m of bm.markets || []) {
        for (const o of m.outcomes || []) {
          if (m.key === "h2h") offers.push({ book: bm.key, market: "ml", teamId: teamOf(o.name), odds: o.price });
          else if (m.key === "spreads") offers.push({ book: bm.key, market: "spread", teamId: teamOf(o.name), line: o.point, odds: o.price });
          else if (m.key === "totals") offers.push({ book: bm.key, market: "total", side: /under/i.test(o.name) ? "under" : "over", line: o.point, odds: o.price });
        }
      }
    }
    const out = { available: true, fetchedAt: new Date().toISOString(), fetchedAtMs: Date.now(), quota, offers: offers.filter((o) => o.market === "total" || o.teamId) };
    ls.set(ck, out);
    return out;
  } catch (e) {
    const msg = e.status === 401 ? "clé The Odds API invalide" : e.status === 429 ? "quota de crédits épuisé" : e.message;
    return { available: false, reason: "error", error: msg };
  }
}
