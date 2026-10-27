// Lecture des données publiées par GitHub Actions (branche "data") et construction
// du contexte d'un joueur pour le modèle.
import { posGroup, shiftDateKey, opponentFactors, teamPace } from "./factors.js";

// Dépôt GitHub qui héberge les données (déduit de l'adresse GitHub Pages).
function dataBase() {
  if (typeof location === "undefined") return globalThis.ASTARIA_DATA_BASE || "";
  const override = new URLSearchParams(location.search).get("data");
  if (override) return override.replace(/\/?$/, "/");
  let owner = "58np95y6s6-svg", repo = "astaria";
  const m = location.hostname.match(/^([^.]+)\.github\.io$/);
  if (m) {
    owner = m[1];
    const seg = location.pathname.split("/").filter(Boolean)[0];
    repo = seg && !seg.includes(".") ? seg : `${m[1]}.github.io`;
  }
  return `https://raw.githubusercontent.com/${owner}/${repo}/data/`;
}
export const DATA_BASE = dataBase();
export const REPO_URL = DATA_BASE.startsWith("https://raw.githubusercontent.com/")
  ? `https://github.com/${DATA_BASE.split("/").slice(3, 5).join("/")}`
  : null;

const mem = new Map();
export async function fetchJSON(key, { ttl = 120e3, optional = false } = {}) {
  const c = mem.get(key);
  if (c && Date.now() - c.at < ttl) return c.data;
  const bust = Math.floor(Date.now() / 120e3);
  const res = await fetch(`${DATA_BASE}${key}.json?v=${bust}`);
  if (!res.ok) {
    if (optional || res.status === 404) { mem.set(key, { at: Date.now(), data: null }); return null; }
    throw new Error(`Données indisponibles (${res.status})`);
  }
  const data = await res.json();
  mem.set(key, { at: Date.now(), data });
  return data;
}

export const getMeta = () => fetchJSON("meta", { optional: true });
export const getDay = (dateKey) => fetchJSON(`days/${dateKey}`, { optional: true });
export const getCore = (season) => fetchJSON(`s${season}/core`, { ttl: 300e3, optional: true });
export const getTeamLogs = async (season, teamId) => (await fetchJSON(`s${season}/teams/${teamId}`, { ttl: 300e3, optional: true })) || { players: {} };

export async function getPrior(season, athleteId) {
  const j = await fetchJSON(`prior/${season - 1}/${athleteId}`, { ttl: 3600e3, optional: true });
  if (!j?.rows?.length) return null;
  return j.rows.map((r) => Object.fromEntries(j.keys.map((k, i) => [k, r[i]])));
}

const emptyCore = (season) => ({ season, teams: {}, players: {}, processed: {}, league: { allowed: { G: {}, F: {}, C: {} }, off: {}, poss: 0, teamGames: 0 } });

export async function getGameData(id) {
  const g = await fetchJSON(`games/${id}`, { optional: true });
  if (!g) throw new Error("Ce match n'est pas encore (ou plus) préparé. Les compositions sont disponibles pour les matchs des 3 prochains jours.");
  const core = (await getCore(g.game.season)) || emptyCore(g.game.season);
  return { ...g, core };
}

export async function playerLogs(core, season, athleteId, beforeDateKey) {
  const idx = core.players[athleteId];
  if (!idx) return [];
  const blobs = await Promise.all(idx.teams.map((t) => getTeamLogs(season, t)));
  return blobs.flatMap((b) => b.players[athleteId] || [])
    .filter((l) => !beforeDateKey || l.d < beforeDateKey)
    .sort((a, b) => (a.d < b.d ? -1 : 1));
}

const r1 = (x) => Math.round(x * 10) / 10;

// Effectif d'une équipe pour l'écran "compositions".
export async function teamRoster(gd, team) {
  const { core, game, injuries } = gd;
  const espn = gd.rosters?.[team.id] || [];
  const blob = await getTeamLogs(game.season, team.id);
  const inj = new Map((injuries[team.id] || []).map((i) => [i.id, i]));
  const ids = espn.length ? espn.map((p) => p.id) : Object.entries(core.players).filter(([, p]) => p.teamId === team.id).map(([id]) => id);
  const espnMap = new Map(espn.map((p) => [p.id, p]));
  const sum = (rows, k) => rows.reduce((s, r) => s + r[k], 0);
  return ids.map((id) => {
    const idx = core.players[id];
    const e = espnMap.get(id);
    const logs = (blob.players[id] || []).filter((l) => l.d < game.dateKey);
    const gp = logs.length;
    const i = inj.get(id);
    return {
      id, name: e?.name || idx?.name || id, pos: e?.pos || idx?.pos || "",
      jersey: e?.jersey || "", headshot: e?.headshot || idx?.headshot || "",
      gp, mpg: gp ? r1(sum(logs, "min") / gp) : 0, ppg: gp ? r1(sum(logs, "pts") / gp) : 0,
      rpg: gp ? r1(sum(logs, "reb") / gp) : 0, apg: gp ? r1(sum(logs, "ast") / gp) : 0,
      starts5: logs.slice(-5).filter((l) => l.start).length,
      status: i?.status || e?.injury || null, injuryDetail: i?.detail || "",
    };
  }).sort((a, b) => b.mpg - a.mpg || b.gp - a.gp || a.name.localeCompare(b.name));
}

export function teamContext(core, game, teamId) {
  const y = shiftDateKey(game.dateKey, -1);
  return {
    b2b: !!core.teams[teamId]?.games.some((g) => g.d === y),
    pace: teamPace(core, teamId).pace,
    leaguePace: teamPace(core, "-").league,
  };
}

const OUT_RE = /^(out|doubtful|suspension|suspended)/i;

function spreadFor(meta, teamId) {
  if (meta.spread == null && !meta.details) return null;
  const team = meta.home.id === teamId ? meta.home : meta.away;
  const m = /([A-Z]{2,4})\s*([-+]?\d+(\.\d+)?)/.exec(meta.details || "");
  const abs = Math.abs(m ? Number(m[2]) : meta.spread);
  if (!Number.isFinite(abs)) return null;
  if (m?.[1]) return m[1] === team.abbr ? -abs : abs;
  return meta.home.id === teamId ? meta.spread : -meta.spread;
}

// Contexte complet pour le modèle (voir model.js -> project()).
export async function buildContext(gd, athleteId, teamId) {
  const { core, game, injuries } = gd;
  const season = game.season;
  const rosterEntry = Object.values(gd.rosters || {}).flat().find((p) => p.id === athleteId);
  const idx = core.players[athleteId] || null;
  const tid = teamId || idx?.teamId || Object.entries(gd.rosters || {}).find(([, r]) => r.some((p) => p.id === athleteId))?.[0];
  const isHome = game.home.id === tid;
  const oppId = isHome ? game.away.id : game.home.id;
  const pos = rosterEntry?.pos || idx?.pos || "";
  const group = posGroup(pos);
  const [logs, prior, teamBlob] = await Promise.all([
    playerLogs(core, season, athleteId, game.dateKey),
    getPrior(season, athleteId),
    getTeamLogs(season, tid),
  ]);
  const opp = opponentFactors(core, oppId, group);
  const pT = teamPace(core, tid);
  const pO = teamPace(core, oppId);
  const yesterday = shiftDateKey(game.dateKey, -1);

  // Absents : seuls les joueurs de la rotation récente comptent
  // (sinon leur absence est déjà intégrée dans les 10 derniers matchs).
  const teamGames = (core.teams[tid]?.games || []).filter((g) => g.d < game.dateKey).slice(-10).map((g) => g.e);
  const outIds = new Set((injuries[tid] || []).filter((i) => OUT_RE.test(i.status) && i.id !== athleteId).map((i) => i.id));
  const rotation = Object.entries(teamBlob.players).map(([id, ls]) => {
    const recent = ls.filter((l) => teamGames.includes(l.e));
    const n = recent.length || 1;
    return {
      id, name: core.players[id]?.name || id, group: posGroup(core.players[id]?.pos),
      recentGames: recent.length,
      mpg: recent.reduce((s, l) => s + l.min, 0) / n,
      usage: recent.reduce((s, l) => s + l.fg2a + l.fg3a + 0.44 * l.fta + l.tov, 0) / n,
      rpg: recent.reduce((s, l) => s + l.reb, 0) / n,
    };
  }).filter((p) => p.recentGames >= Math.min(5, Math.max(1, Math.floor(teamGames.length / 2))) && p.mpg >= 10);
  const missing = rotation.filter((p) => outIds.has(p.id));
  const available = rotation.filter((p) => !outIds.has(p.id));
  const inj = {
    names: missing.filter((p) => p.group === group).map((p) => p.name.split(" ").pop()).join(", "),
    sameGroupMissingMin: missing.filter((p) => p.group === group).reduce((s, p) => s + p.mpg, 0),
    groupAvailableMin: available.filter((p) => p.group === group).reduce((s, p) => s + p.mpg, 0),
    missingUsage: missing.reduce((s, p) => s + p.usage, 0),
    availableUsage: available.reduce((s, p) => s + p.usage, 0),
    missingReb: missing.reduce((s, p) => s + p.rpg, 0),
    availableReb: available.reduce((s, p) => s + p.rpg, 0),
    missing: missing.map((p) => ({ id: p.id, name: p.name, mpg: r1(p.mpg), group: p.group })),
  };
  const teamName = (id) => core.teams[id]?.name || (game.home.id === id ? game.home.name : game.away.name);

  return {
    game,
    player: { id: athleteId, name: rosterEntry?.name || idx?.name || "Joueur", pos, group, headshot: rosterEntry?.headshot || idx?.headshot || "", teamId: tid },
    teamId: tid, oppId, home: isHome,
    b2b: !!core.teams[tid]?.games.some((g) => g.d === yesterday),
    oppB2b: !!core.teams[oppId]?.games.some((g) => g.d === yesterday),
    spread: spreadFor(game, tid), total: game.total ?? null,
    pace: { team: pT.pace, opp: pO.pace, league: pT.league },
    opp, factors: opp.factors, logs, prior, injuries: inj,
    teamName: teamName(tid), oppName: teamName(oppId),
    teamsAbbr: Object.fromEntries(Object.values(core.teams).map((t) => [t.id, t.abbr])),
    playerInjury: (injuries[tid] || []).find((i) => i.id === athleteId) || null,
  };
}
