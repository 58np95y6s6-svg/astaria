// Agrégation de la saison : chaque feuille de match terminée alimente
//  - la défense de chaque équipe par poste (ce qu'elle accorde aux arrières / ailiers / pivots)
//  - le rythme (possessions) et les pertes de balle / tirs à 2 pts de chaque attaque
//  - les journaux de match de chaque joueur
import { scoreboard, summary, parseBoxscore, posGroup, seasonForDate, etDateKey, shiftDateKey } from "./espn.mjs";
import { readJSON, writeJSON } from "./store.mjs";

export const STATS = ["min", "pts", "fg2m", "fg2a", "fg3m", "fg3a", "ftm", "fta", "oreb", "dreb", "reb", "ast", "stl", "blk", "tov"];
const GROUPS = ["G", "F", "C"];

const zero = () => Object.fromEntries(STATS.map((k) => [k, 0]));
const addInto = (acc, p) => { for (const k of STATS) acc[k] += p[k] || 0; };

export const coreKey = (season) => `s${season}/core`;
export const teamKey = (season, teamId) => `s${season}/team-${teamId}`;

function emptyCore(season) {
  return {
    season, version: 1, updatedAt: null,
    dates: {}, processed: {},
    teams: {},
    league: { allowed: Object.fromEntries(GROUPS.map((g) => [g, zero()])), off: zero(), poss: 0, teamGames: 0 },
    players: {},
  };
}

export async function loadCore(season = seasonForDate()) {
  return (await readJSON(coreKey(season))) || emptyCore(season);
}

export async function loadTeamLogs(season, teamId) {
  return (await readJSON(teamKey(season, teamId))) || { players: {} };
}

function possessions(players) {
  const t = zero();
  for (const p of players) addInto(t, p);
  return { totals: t, poss: t.fg2a + t.fg3a - t.oreb + t.tov + 0.44 * t.fta };
}

function ensureTeam(core, teamId, info) {
  if (!core.teams[teamId]) {
    core.teams[teamId] = {
      id: teamId, abbr: info?.abbr || "", name: info?.name || "",
      games: [], allowed: Object.fromEntries(GROUPS.map((g) => [g, zero()])), off: zero(), poss: 0,
    };
  }
  if (info?.abbr) core.teams[teamId].abbr = info.abbr;
  if (info?.name) core.teams[teamId].name = info.name;
  return core.teams[teamId];
}

function applyGame(core, teamBlobs, box, meta) {
  const [A, B] = box.teams;
  const pa = possessions(A.players);
  const pb = possessions(B.players);
  const gamePoss = (pa.poss + pb.poss) / 2;
  const dateKey = meta.dateKey;
  for (const [side, opp, own] of [[A, B, pa], [B, A, pb]]) {
    const team = ensureTeam(core, side.teamId, side.teamId === meta.home.id ? meta.home : meta.away);
    team.games.push({ e: box.eventId, d: dateKey, opp: opp.teamId, home: side.home, poss: Math.round(gamePoss * 10) / 10 });
    team.poss += gamePoss;
    addInto(team.off, own.totals);
    addInto(core.league.off, own.totals);
    core.league.poss += gamePoss;
    core.league.teamGames += 1;
    // Ce que l'adversaire a produit contre "team", par poste
    for (const p of opp.players) {
      const g = posGroup(p.pos);
      addInto(team.allowed[g], p);
      addInto(core.league.allowed[g], p);
    }
    // Journaux joueurs (stockés dans le blob de l'équipe pour laquelle ils ont joué)
    const blob = teamBlobs[side.teamId];
    for (const p of side.players) {
      const log = { e: box.eventId, d: dateKey, opp: opp.teamId, home: side.home, start: p.start };
      for (const k of STATS) log[k] = p[k];
      (blob.players[p.id] ||= []).push(log);
      const idx = (core.players[p.id] ||= { id: p.id, name: p.name, pos: p.pos, teamId: side.teamId, teams: [], headshot: p.headshot, gp: 0, min: 0, pts: 0, reb: 0, ast: 0, last: "" });
      idx.name = p.name || idx.name;
      idx.pos = p.pos || idx.pos;
      if (p.headshot) idx.headshot = p.headshot;
      if (!idx.teams.includes(side.teamId)) idx.teams.push(side.teamId);
      if (dateKey >= idx.last) { idx.teamId = side.teamId; idx.last = dateKey; }
      idx.gp += 1; idx.min += p.min; idx.pts += p.pts; idx.reb += p.reb; idx.ast += p.ast;
    }
  }
}

// Traite les matchs terminés non encore agrégés, dans la limite de budgetMs.
export async function runUpdate({ budgetMs = 8000, season = seasonForDate() } = {}) {
  const t0 = Date.now();
  const left = () => budgetMs - (Date.now() - t0);
  const core = await loadCore(season);
  const teamBlobs = {};
  const touched = new Set();
  const getBlob = async (id) => {
    if (!teamBlobs[id]) teamBlobs[id] = await loadTeamLogs(season, id);
    touched.add(id);
    return teamBlobs[id];
  };

  const today = etDateKey();
  let d = `${season - 1}1001`;
  const pending = [];
  while (d <= today) {
    if (!core.dates[d]?.done) pending.push(d);
    d = shiftDateKey(d, 1);
  }

  let processedNow = 0;
  let datesScanned = 0;
  outer: for (const dateKey of pending) {
    if (left() < 2500) break;
    let games;
    try { games = await scoreboard(dateKey); } catch { break; }
    datesScanned++;
    const relevant = games.filter((g) => Number(g.seasonType) !== 1); // hors pré-saison
    const todo = relevant.filter((g) => g.completed && !core.processed[g.id]);
    for (let i = 0; i < todo.length; i += 6) {
      if (left() < 2500) break outer;
      const batch = todo.slice(i, i + 6);
      const sums = await Promise.allSettled(batch.map((g) => summary(g.id)));
      for (let j = 0; j < batch.length; j++) {
        const g = batch[j];
        if (sums[j].status !== "fulfilled") continue;
        const box = parseBoxscore(sums[j].value);
        if (!box || box.teams.some((t) => t.players.length === 0)) { core.processed[g.id] = dateKey; continue; }
        await Promise.all(box.teams.map((t) => getBlob(t.teamId)));
        applyGame(core, teamBlobs, box, { dateKey, home: g.home, away: g.away });
        core.processed[g.id] = dateKey;
        processedNow++;
      }
    }
    const allDone = relevant.every((g) => core.processed[g.id]);
    if (dateKey < today && allDone) core.dates[dateKey] = { done: true, n: relevant.length };
  }

  core.updatedAt = new Date().toISOString();
  await Promise.all([...touched].map((id) => writeJSON(teamKey(season, id), teamBlobs[id])));
  await writeJSON(coreKey(season), core);
  return {
    season, processedNow, datesScanned,
    gamesTotal: Object.keys(core.processed).length,
    pendingDates: pending.filter((x) => !core.dates[x]?.done && x < today).length,
    updatedAt: core.updatedAt,
  };
}

// --- Facteurs adversaire ---
const per = (acc, k) => (acc.min > 0 ? acc[k] / acc.min : 0);

// Rapport (équipe / ligue) avec rétrécissement vers 1 tant que l'échantillon est petit.
function shrunk(raw, nGames, k = 6) {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const w = nGames / (nGames + k);
  return 1 + (raw - 1) * w;
}

export function teamPace(core, teamId) {
  const t = core.teams[teamId];
  const lg = core.league.teamGames ? core.league.poss / core.league.teamGames : 100;
  if (!t || !t.games.length) return { pace: lg, league: lg, games: 0 };
  return { pace: t.poss / t.games.length, league: lg, games: t.games.length };
}

// Facteurs défensifs de "oppId" contre le poste "group" (G/F/C) + contexte d'attaque adverse.
export function opponentFactors(core, oppId, group) {
  const t = core.teams[oppId];
  const lgA = core.league.allowed[group];
  const n = t?.games.length || 0;
  const keys = ["pts", "fg2m", "fg2a", "fg3m", "fg3a", "ftm", "fta", "reb", "oreb", "dreb", "ast", "stl", "blk", "tov"];
  const factors = {};
  const raw = {};
  for (const k of keys) {
    const r = t ? per(t.allowed[group], k) / (per(lgA, k) || 1) : 1;
    raw[k] = Number.isFinite(r) && r > 0 ? r : 1;
    factors[k] = shrunk(raw[k], n);
  }
  // Interceptions : dépendent des pertes de balle de l'attaque adverse.
  // Contres : dépendent du volume de tirs à 2 pts de l'attaque adverse.
  const lgOff = core.league.off;
  const offPerPoss = (acc, poss, k) => (poss > 0 ? acc[k] / poss : 0);
  const tovRaw = t ? offPerPoss(t.off, t.poss, "tov") / (offPerPoss(lgOff, core.league.poss, "tov") || 1) : 1;
  const fg2aRaw = t ? offPerPoss(t.off, t.poss, "fg2a") / (offPerPoss(lgOff, core.league.poss, "fg2a") || 1) : 1;
  factors.oppTov = shrunk(tovRaw, n);
  factors.oppFg2a = shrunk(fg2aRaw, n);
  raw.oppTov = tovRaw; raw.oppFg2a = fg2aRaw;

  // Classements (1 = défense la plus généreuse) pour l'affichage
  const ranks = {};
  const teams = Object.values(core.teams).filter((x) => x.games.length > 0);
  for (const k of ["pts", "fg2m", "fg3m", "ftm", "reb", "ast", "stl", "blk"]) {
    const sorted = teams.map((x) => ({ id: x.id, v: per(x.allowed[group], k) })).sort((a, b) => b.v - a.v);
    const i = sorted.findIndex((x) => x.id === oppId);
    ranks[k] = i >= 0 ? i + 1 : null;
  }
  return { games: n, factors, raw, ranks, nTeams: teams.length };
}
