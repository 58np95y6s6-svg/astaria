// Journal des paris, stocké sur l'appareil (localStorage) + export / import.
// Règlement automatique à partir des feuilles de match publiées par GitHub Actions.
import { getCore, playerLogs, getTeamLogs } from "./data.js";
import { gradeTeam } from "./team.js";
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
  if (b.kind === "team") {
    // Pari équipe : vainqueur, handicap, total du match, total d'une équipe.
    Object.assign(bet, { kind: "team", teamId: b.teamId ?? null, oppId: b.oppId ?? null, label: String(b.label || ""),
      side: b.side ?? null, line: b.line == null ? null : Number(b.line), playerId: "team" });
  }
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
  for (const k of b.type === "combo" ? ["stake", "odds"] : ["stake", "odds", "line"]) if (Number.isFinite(patch[k]) && patch[k] > 0) b[k] = patch[k];
  if (b.type === "combo") { save(bets); return; }
  if (patch.side === "over" || patch.side === "under") b.side = patch.side;
  if (patch.book) b.book = patch.book;
  if (b.kind === "team") {
    if (b.scoreT != null && !b.manual) { const st = gradeTeam(b, b.scoreT, b.scoreO); if (st !== "check") b.status = st; }
    save(bets); return;
  }
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

// Pari équipe : score final reconstitué à partir des feuilles de match des deux équipes.
async function settleTeam(b) {
  const core = await getCore(b.season);
  if (!core?.processed?.[b.eventId]) return false;
  const score = async (tid) => Object.values((await getTeamLogs(b.season, tid)).players || {}).flat()
    .filter((l) => l.e === b.eventId).reduce((t, l) => t + l.pts, 0);
  const [sT, sO] = await Promise.all([score(b.teamId), score(b.oppId)]);
  if (!sT || !sO) return false;
  b.scoreT = sT; b.scoreO = sO;
  b.resultText = `${sT}-${sO}`;
  const st = gradeTeam(b, sT, sO);
  if (st === "check") { b.check = true; return true; } // défaite : l'avance de X points se vérifie à la main
  b.status = st;
  b.settledAt = new Date().toISOString();
  b.auto = true;
  return true;
}

// Règle un pari simple ou une sélection de combiné (même forme). Renvoie true si quelque chose a changé.
async function settleOne(b) {
  if (b.kind === "team") return settleTeam(b);
  if (b.eventId === "manual" || b.playerId === "manual") return settleFree(b);
  const core = await getCore(b.season);
  if (!core?.processed?.[b.eventId]) return false; // match pas encore intégré
  const log = (await playerLogs(core, b.season, b.playerId)).find((l) => l.e === b.eventId);
  if (!log) { b.status = "void"; b.result = null; b.settledAt = new Date().toISOString(); return true; } // n'a pas joué → remboursé
  grade(b, log);
  return true;
}

// Statut d'un combiné à partir de ses sélections (règles des bookmakers : remboursé/annulé = cote 1).
export function comboOutcome(legs) {
  if (legs.some((l) => l.status === "lost")) return { status: "lost", odds: null };
  if (legs.some((l) => l.status === "pending")) return { status: "pending", odds: null };
  const won = legs.filter((l) => l.status === "won");
  if (!won.length) return { status: "push", odds: 1 };
  return { status: "won", odds: Math.round(won.reduce((t, l) => t * l.odds, 1) * 100) / 100 };
}

export async function settleAll() {
  const bets = loadBets();
  let changed = false;
  for (const b of bets.filter((x) => x.status === "pending")) {
    try {
      if (b.type === "combo") {
        for (const leg of b.legs.filter((l) => l.status === "pending")) if (await settleOne(leg)) changed = true;
        const o = comboOutcome(b.legs);
        if (o.status !== "pending") {
          b.status = o.status;
          if (o.odds != null && o.odds !== b.odds) { b.origOdds = b.odds; b.odds = o.odds; }
          b.settledAt = new Date().toISOString();
          changed = true;
        }
        continue;
      }
      if (await settleOne(b)) changed = true;
    } catch { /* données indisponibles : on réessaiera */ }
  }
  if (changed) save(bets);
  return bets;
}

const LEG_FIELDS = ["kind", "teamId", "oppId", "label", "resultText", "scoreT", "scoreO", "player", "playerId", "eventId", "season", "gameDate", "matchup", "market", "side", "line", "odds", "book", "pFinal", "pModel", "status", "result", "settledAt"];

// Regroupe des paris simples en cours en un combiné (cote = produit des cotes).
export function createCombo(ids, stake) {
  const bets = loadBets();
  const legs = ids.map((id) => bets.find((b) => b.id === id)).filter((b) => b && b.status === "pending" && b.type !== "combo");
  if (legs.length < 2) throw new Error("Sélectionne au moins 2 paris en cours");
  const odds = Math.round(legs.reduce((t, l) => t * l.odds, 1) * 100) / 100;
  const allP = legs.every((l) => l.pFinal != null);
  const books = [...new Set(legs.map((l) => l.book))];
  const combo = {
    id: crypto.randomUUID?.() || String(Date.now() + Math.random()), createdAt: new Date().toISOString(), status: "pending", type: "combo",
    legs: legs.map((l) => Object.fromEntries(LEG_FIELDS.map((k) => [k, l[k] ?? null]))),
    player: `Combiné · ${legs.length} sélections`, market: "combo", side: null, line: null,
    odds, stake: Number(stake) > 0 ? Number(stake) : legs[0].stake, book: books.length === 1 ? books[0] : "mixed",
    pFinal: allP ? legs.reduce((t, l) => t * l.pFinal, 1) : null,
    gameDate: legs.map((l) => l.gameDate).filter(Boolean).sort()[0] || null,
    matchup: [...new Set(legs.map((l) => l.matchup).filter(Boolean))].join(", "),
  };
  const rest = bets.filter((b) => !legs.includes(b));
  rest.unshift(combo);
  if (!save(rest)) throw new Error("Stockage du téléphone indisponible");
  return combo;
}

// Défait un combiné en cours : ses sélections redeviennent des paris simples (mise du combiné sur chacune).
export function splitCombo(id) {
  const bets = loadBets();
  const c = bets.find((b) => b.id === id && b.type === "combo");
  if (!c) return;
  const singles = c.legs.map((l) => ({ ...l, id: crypto.randomUUID?.() || String(Date.now() + Math.random()), createdAt: c.createdAt, status: l.status === "pending" ? "pending" : l.status, stake: c.stake }));
  save([...singles, ...bets.filter((b) => b.id !== id)]);
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
