import { summary, parseInjuries, parsePickcenter, priorSeason, posGroup, shiftDateKey, seasonForDate, etDateKey } from "./espn.mjs";
import { loadTeamLogs, opponentFactors, teamPace } from "./season.mjs";
import { readJSON, writeJSON } from "./store.mjs";

const OUT_RE = /^(out|doubtful|suspension|suspended)/i;

function teamFromComp(c) {
  const t = c?.team || {};
  return {
    id: String(t.id ?? c?.id ?? ""), abbr: t.abbreviation || "", name: t.displayName || "",
    short: t.shortDisplayName || t.name || "", logo: t.logos?.[0]?.href || t.logo || "",
    color: t.color ? `#${t.color}` : null, record: c?.record?.[0]?.displayValue || c?.records?.[0]?.summary || "",
    score: c?.score != null ? Number(c.score) : null,
  };
}

export async function loadGame(gameId) {
  const sum = await summary(gameId);
  if (!sum?.header) throw new Error("Match introuvable");
  const comp = sum.header.competitions?.[0] || {};
  const home = teamFromComp(comp.competitors?.find((c) => c.homeAway === "home"));
  const away = teamFromComp(comp.competitors?.find((c) => c.homeAway === "away"));
  const date = comp.date;
  const dateKey = etDateKey(new Date(date));
  const st = comp.status?.type || sum.header?.competitions?.[0]?.status?.type || {};
  const odds = parsePickcenter(sum);
  return {
    meta: {
      id: String(gameId), date, dateKey, season: seasonForDate(new Date(date)),
      state: st.state || "pre", statusText: st.shortDetail || "", home, away, ...odds,
    },
    injuries: parseInjuries(sum),
  };
}

export async function playerLogs(core, season, athleteId, beforeDateKey) {
  const idx = core.players[athleteId];
  if (!idx) return [];
  const blobs = await Promise.all(idx.teams.map((t) => loadTeamLogs(season, t)));
  const logs = blobs.flatMap((b) => b.players[athleteId] || []);
  return logs.filter((l) => !beforeDateKey || l.d < beforeDateKey).sort((a, b) => (a.d < b.d ? -1 : 1));
}

export async function getPrior(season, athleteId) {
  const prevSeason = season - 1;
  const k = `prior/${prevSeason}/${athleteId}`;
  const cached = await readJSON(k);
  if (cached) return cached.rows || null;
  let rows = null;
  try { rows = await priorSeason(athleteId, prevSeason); } catch { return null; }
  await writeJSON(k, { rows });
  return rows;
}

function spreadFor(meta, teamId) {
  if (meta.spread == null && !meta.details) return null;
  const team = meta.home.id === teamId ? meta.home : meta.away;
  const m = /([A-Z]{2,4})\s*([-+]?\d+(\.\d+)?)/.exec(meta.details || "");
  const abs = Math.abs(m ? Number(m[2]) : meta.spread);
  if (!Number.isFinite(abs)) return null;
  const favAbbr = m?.[1];
  if (favAbbr) return favAbbr === team.abbr ? -abs : abs;
  return meta.home.id === teamId ? meta.spread : -meta.spread;
}

// Contexte complet pour le modèle (voir public/js/model.js -> project()).
export async function buildContext({ core, game, injuries, athleteId, teamId, withPrior = true }) {
  const season = game.season;
  const idx = core.players[athleteId] || null;
  const tid = teamId || idx?.teamId;
  const isHome = game.home.id === tid;
  const oppId = isHome ? game.away.id : game.home.id;
  const group = posGroup(idx?.pos);
  const [logs, prior] = await Promise.all([
    playerLogs(core, season, athleteId, game.dateKey),
    withPrior ? getPrior(season, athleteId) : null,
  ]);
  const opp = opponentFactors(core, oppId, group);
  const pT = teamPace(core, tid);
  const pO = teamPace(core, oppId);
  const yesterday = shiftDateKey(game.dateKey, -1);
  const b2b = !!core.teams[tid]?.games.some((g) => g.d === yesterday);
  const oppB2b = !!core.teams[oppId]?.games.some((g) => g.d === yesterday);

  // Absents : on ne compte que les joueurs qui faisaient partie de la rotation récente
  // (sinon leur absence est déjà intégrée dans les 10 derniers matchs).
  const teamBlob = await loadTeamLogs(season, tid);
  const teamGames = (core.teams[tid]?.games || []).filter((g) => g.d < game.dateKey).slice(-10).map((g) => g.e);
  const out = (injuries[tid] || []).filter((i) => OUT_RE.test(i.status) && i.id !== athleteId);
  const outIds = new Set(out.map((i) => i.id));
  const rotation = Object.entries(teamBlob.players).map(([id, logs]) => {
    const recent = logs.filter((l) => teamGames.includes(l.e));
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
    missing: missing.map((p) => ({ id: p.id, name: p.name, mpg: Math.round(p.mpg * 10) / 10, group: p.group })),
  };

  return {
    player: idx ? { id: athleteId, name: idx.name, pos: idx.pos, group, headshot: idx.headshot, teamId: tid } : { id: athleteId, teamId: tid, group },
    teamId: tid, oppId, home: isHome, b2b, oppB2b,
    spread: spreadFor(game, tid), total: game.total ?? null,
    pace: { team: pT.pace, opp: pO.pace, league: pT.league },
    opp, factors: opp.factors, logs, prior: prior || null, injuries: inj,
  };
}
