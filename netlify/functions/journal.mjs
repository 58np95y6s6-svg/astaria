// Journal des paris : ajout, suppression, règlement automatique à partir des feuilles de match.
import { loadCore } from "./lib/season.mjs";
import { playerLogs } from "./lib/context.mjs";
import { readJSON, writeJSON, json, errorJSON } from "./lib/store.mjs";
import { valueOf } from "../../public/js/model.js";

const KEY = "journal/bets";

function authorized(req) {
  const k = process.env.JOURNAL_KEY;
  return !k || req.headers.get("x-journal-key") === k;
}

async function settle(bets) {
  const pending = bets.filter((b) => b.status === "pending");
  if (!pending.length) return false;
  const bySeason = new Map();
  let changed = false;
  for (const b of pending) {
    const season = b.season;
    if (!bySeason.has(season)) bySeason.set(season, await loadCore(season));
    const core = bySeason.get(season);
    if (!core.processed[b.eventId]) continue; // match pas encore agrégé
    const logs = await playerLogs(core, season, b.playerId);
    const log = logs.find((l) => l.e === b.eventId);
    if (!log) { b.status = "void"; b.result = null; changed = true; continue; } // n'a pas joué → remboursé
    const v = valueOf(log, b.market);
    b.result = v;
    b.status = v === b.line ? "push" : (b.side === "over" ? v > b.line : v < b.line) ? "won" : "lost";
    b.settledAt = new Date().toISOString();
    changed = true;
  }
  return changed;
}

export default async (req) => {
  try {
    if (!authorized(req)) return json({ error: "clé journal invalide" }, { status: 401 });
    const data = (await readJSON(KEY)) || { bets: [] };
    if (req.method === "POST") {
      const b = await req.json();
      const required = ["eventId", "playerId", "player", "market", "side", "line", "odds", "season"];
      for (const k of required) if (b[k] == null || b[k] === "") return json({ error: `champ manquant : ${k}` }, { status: 400 });
      const bet = {
        id: crypto.randomUUID(), createdAt: new Date().toISOString(), status: "pending",
        eventId: String(b.eventId), season: Number(b.season), gameDate: b.gameDate || null, matchup: String(b.matchup || "").slice(0, 80),
        playerId: String(b.playerId), player: String(b.player).slice(0, 80), market: String(b.market),
        side: b.side === "under" ? "under" : "over", line: Number(b.line), odds: Number(b.odds),
        book: String(b.book || "manual").slice(0, 40), stake: Number(b.stake) || 1,
        pModel: b.pModel != null ? Number(b.pModel) : null, pFinal: b.pFinal != null ? Number(b.pFinal) : null,
        ev: b.ev != null ? Number(b.ev) : null, mean: b.mean != null ? Number(b.mean) : null,
      };
      data.bets.unshift(bet);
      await writeJSON(KEY, data);
      return json({ ok: true, bet });
    }
    if (req.method === "DELETE") {
      const id = new URL(req.url).searchParams.get("id");
      data.bets = data.bets.filter((b) => b.id !== id);
      await writeJSON(KEY, data);
      return json({ ok: true });
    }
    if (await settle(data.bets)) await writeJSON(KEY, data);
    return json(data);
  } catch (e) {
    return errorJSON(e);
  }
};

export const config = { path: "/api/journal" };
