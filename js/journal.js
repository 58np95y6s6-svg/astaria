// Journal des paris, stocké sur l'appareil (localStorage) + export / import.
// Règlement automatique à partir des feuilles de match publiées par GitHub Actions.
import { getCore, playerLogs } from "./data.js";
import { valueOf } from "./model.js";
import { normName } from "./value.js";
import { seasonForDate, shiftDateKey } from "./factors.js";

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

// Modification d'un pari (mise en €, cote, ligne, côté, bookmaker).
export function updateBet(id, patch) {
  const bets = loadBets();
  const b = bets.find((x) => x.id === id);
  if (!b) return;
  for (const k of ["stake", "odds", "line"]) if (Number.isFinite(patch[k]) && patch[k] > 0) b[k] = patch[k];
  if (patch.side === "over" || patch.side === "under") b.side = patch.side;
  if (patch.book) b.book = patch.book;
  // Si le pari était réglé automatiquement, on recalcule son statut avec la nouvelle ligne.
  if (b.result != null && !b.manual && b.status !== "void") b.status = b.result === b.line ? "push" : (b.side === "over" ? b.result > b.line : b.result < b.line) ? "won" : "lost";
  save(bets);
}

export function deleteBet(id) { save(loadBets().filter((b) => b.id !== id)); }

function grade(b, log) {
  const v = valueOf(log, b.market);
  b.result = v;
  b.status = v === b.line ? "push" : (b.side === "over" ? v > b.line : v < b.line) ? "won" : "lost";
  b.settledAt = new Date().toISOString();
  b.auto = true;
}

// Pari libre : on retrouve le joueur par son nom et son match à la date du pari (ou le lendemain).
async function settleFree(b) {
  if (!b.gameDate) return false;
  const season = seasonForDate(new Date(Date.UTC(+b.gameDate.slice(0, 4), +b.gameDate.slice(4, 6) - 1, +b.gameDate.slice(6, 8))));
  const core = await getCore(season);
  if (!core?.players) return false;
  const target = normName(b.player);
  const hit = Object.entries(core.players).find(([, p]) => normName(p.name) === target)
    || Object.entries(core.players).find(([, p]) => normName(p.name).endsWith(` ${target.split(" ").pop()}`) && normName(p.name)[0] === target[0]);
  if (!hit) return false;
  const [pid, idx] = hit;
  const until = shiftDateKey(b.gameDate, 1);
  const log = (await playerLogs(core, season, pid)).find((l) => l.d >= b.gameDate && l.d <= until);
  if (log) { b.playerId = pid; b.eventId = log.e; b.season = season; grade(b, log); return true; }
  // Son équipe a joué (match intégré) mais pas lui → remboursé.
  const team = core.teams[idx.teamId];
  const played = team?.games.find((g) => g.d >= b.gameDate && g.d <= until && core.processed[g.e]);
  if (played) { b.playerId = pid; b.eventId = played.e; b.season = season; b.status = "void"; b.result = null; b.settledAt = new Date().toISOString(); return true; }
  return false;
}

export async function settleAll() {
  const bets = loadBets();
  let changed = false;
  for (const b of bets.filter((x) => x.status === "pending")) {
    try {
      if (b.eventId === "manual" || b.playerId === "manual") { if (await settleFree(b)) changed = true; continue; }
      const core = await getCore(b.season);
      if (!core?.processed?.[b.eventId]) continue; // match pas encore intégré
      const log = (await playerLogs(core, b.season, b.playerId)).find((l) => l.e === b.eventId);
      if (!log) { b.status = "void"; b.result = null; b.settledAt = new Date().toISOString(); changed = true; continue; } // n'a pas joué → remboursé
      grade(b, log);
      changed = true;
    } catch { /* données indisponibles : on réessaiera */ }
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
