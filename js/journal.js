// Journal des paris, stocké sur l'appareil (localStorage) + export / import.
// Règlement automatique à partir des feuilles de match publiées par GitHub Actions.
import { getCore, playerLogs } from "./data.js";
import { valueOf } from "./model.js";

const KEY = "astaria-journal";

export function loadBets() {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function save(bets) {
  try { localStorage.setItem(KEY, JSON.stringify(bets)); return true; } catch { return false; }
}

export function addBet(b) {
  const bet = {
    id: (crypto.randomUUID?.() || String(Date.now() + Math.random())), createdAt: new Date().toISOString(), status: "pending",
    eventId: String(b.eventId), season: Number(b.season), gameDate: b.gameDate || null, matchup: String(b.matchup || ""),
    playerId: String(b.playerId), player: String(b.player), market: b.market, side: b.side === "under" ? "under" : "over",
    line: Number(b.line), odds: Number(b.odds), book: b.book || "manual", stake: Number(b.stake) || 1,
    pModel: b.pModel ?? null, pFinal: b.pFinal ?? null, ev: b.ev ?? null, mean: b.mean ?? null,
  };
  const bets = loadBets();
  bets.unshift(bet);
  if (!save(bets)) throw new Error("Stockage du téléphone indisponible (navigation privée ?)");
  return bet;
}

// Règlement manuel (won / lost / push / pending).
export function setStatus(id, status) {
  const bets = loadBets();
  const b = bets.find((x) => x.id === id);
  if (!b) return;
  b.status = status;
  b.manual = status !== "pending";
  b.settledAt = status === "pending" ? null : new Date().toISOString();
  save(bets);
}

export function deleteBet(id) { save(loadBets().filter((b) => b.id !== id)); }

export async function settleAll() {
  const bets = loadBets();
  let changed = false;
  for (const b of bets.filter((x) => x.status === "pending")) {
    const core = await getCore(b.season);
    if (!core?.processed?.[b.eventId]) continue; // match pas encore intégré
    const log = (await playerLogs(core, b.season, b.playerId)).find((l) => l.e === b.eventId);
    if (!log) { b.status = "void"; b.result = null; changed = true; continue; } // n'a pas joué → remboursé
    const v = valueOf(log, b.market);
    b.result = v;
    b.status = v === b.line ? "push" : (b.side === "over" ? v > b.line : v < b.line) ? "won" : "lost";
    b.settledAt = new Date().toISOString();
    changed = true;
  }
  if (changed) save(bets);
  return bets;
}

export function exportBets() {
  const blob = new Blob([JSON.stringify(loadBets(), null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ibibet-journal-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function importBets(file) {
  const list = JSON.parse(await file.text());
  if (!Array.isArray(list)) throw new Error("Fichier invalide");
  const cur = loadBets();
  const ids = new Set(cur.map((b) => b.id));
  const merged = [...cur, ...list.filter((b) => b && b.id && !ids.has(b.id))];
  merged.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  save(merged);
  return merged.length - cur.length;
}
