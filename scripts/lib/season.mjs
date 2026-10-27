// Agrégation de la saison : chaque feuille de match terminée alimente
//  - la défense de chaque équipe par poste (ce qu'elle accorde aux arrières / ailiers / pivots)
//  - le rythme (possessions) et les pertes de balle / tirs à 2 pts de chaque attaque
//  - les journaux de match de chaque joueur
import { scoreboard, summary, parseBoxscore } from "./espn.mjs";
import { posGroup, seasonForDate, etDateKey, shiftDateKey } from "../../js/factors.js";
import { readJSON, writeJSON } from "./store.mjs";

export const STATS = ["min", "pts", "fg2m", "fg2a", "fg3m", "fg3a", "ftm", "fta", "oreb", "dreb", "reb", "ast", "stl", "blk", "tov"];
const GROUPS = ["G", "F", "C"];

const zero = () => Object.fromEntries(STATS.map((k) => [k, 0]));
const addInto = (acc, p) => { for (const k of STATS) acc[k] += p[k] || 0; };

export const coreKey = (season) => `s${season}/core`;
export const teamKey = (season, teamId) => `s${season}/teams/${teamId}`;

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

