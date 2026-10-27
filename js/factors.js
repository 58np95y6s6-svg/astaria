// Fonctions pures partagées entre le navigateur et la tâche de mise à jour (GitHub Actions).

// Saison ESPN = année de fin (2026-27 -> 2027).
export function seasonForDate(d = new Date()) {
  const y = d.getUTCFullYear();
  return d.getUTCMonth() >= 7 ? y + 1 : y;
}

// Date "jour NBA" (heure de New York) au format YYYYMMDD.
export function etDateKey(d = new Date()) {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
  return s.replaceAll("-", "");
}

export function shiftDateKey(key, days) {
  const d = new Date(Date.UTC(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8)));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10).replaceAll("-", "");
}

export function posGroup(abbr = "") {
  const a = String(abbr).toUpperCase();
  if (a === "C" || a === "FC" || a === "CF") return "C";
  if (a.includes("G")) return "G";
  if (a.includes("F")) return "F";
  return "F";
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
