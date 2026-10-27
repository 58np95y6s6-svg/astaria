// Accès aux API publiques ESPN (non officielles) + normalisation des données.
const SITE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const WEB = "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba";

const UA = { "User-Agent": "Mozilla/5.0 (ibibet)", Accept: "application/json" };

export async function getJSON(url, { retries = 2, timeoutMs = 8000 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: UA, signal: ctrl.signal });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr;
}

export { seasonForDate, etDateKey, shiftDateKey, posGroup } from "../../js/factors.js";
import { posGroup } from "../../js/factors.js";

function teamLite(c) {
  const t = c?.team || {};
  return {
    id: String(t.id ?? c?.id ?? ""),
    abbr: t.abbreviation || "",
    name: t.displayName || t.name || "",
    short: t.shortDisplayName || t.name || "",
    logo: t.logo || t.logos?.[0]?.href || "",
    color: t.color ? `#${t.color}` : null,
    record: c?.records?.[0]?.summary || c?.record?.[0]?.displayValue || "",
    score: c?.score != null ? Number(c.score?.value ?? c.score) : null,
  };
}

function parseOdds(o) {
  if (!o) return { spread: null, total: null, favorite: null, details: null };
  const details = o.details || null;
  let spread = o.spread != null ? Number(o.spread) : null;
  const total = o.overUnder != null ? Number(o.overUnder) : null;
  let favorite = null;
  if (details && /^[A-Z]{2,4}\s/.test(details)) favorite = details.split(" ")[0];
  return { spread, total, favorite, details };
}

export async function scoreboard(dateKey) {
  const j = await getJSON(`${SITE}/scoreboard?dates=${dateKey}&limit=100`);
  const events = j?.events || [];
  return events.map((ev) => {
    const comp = ev.competitions?.[0] || {};
    const cs = comp.competitors || [];
    const home = cs.find((c) => c.homeAway === "home");
    const away = cs.find((c) => c.homeAway === "away");
    return {
      id: String(ev.id),
      date: ev.date,
      dateKey,
      seasonType: ev.season?.type ?? comp.type?.id ?? null,
      state: ev.status?.type?.state || "pre", // pre | in | post
      completed: !!ev.status?.type?.completed,
      statusText: ev.status?.type?.shortDetail || "",
      venue: comp.venue?.fullName || "",
      broadcast: comp.broadcasts?.[0]?.names?.[0] || "",
      home: teamLite(home),
      away: teamLite(away),
      ...parseOdds(comp.odds?.[0]),
    };
  });
}

export async function summary(eventId) {
  return getJSON(`${SITE}/summary?event=${eventId}`);
}

export async function teamRoster(teamId) {
  const j = await getJSON(`${SITE}/teams/${teamId}/roster`);
  const list = Array.isArray(j?.athletes) ? j.athletes : [];
  // Selon les versions : liste plate ou groupée par poste ({items:[...]})
  const flat = list.flatMap((a) => (Array.isArray(a.items) ? a.items : [a]));
  return flat.map((a) => ({
    id: String(a.id),
    name: a.displayName || a.fullName,
    pos: a.position?.abbreviation || "",
    jersey: a.jersey || "",
    headshot: a.headshot?.href || "",
    injury: a.injuries?.[0]?.status || null,
  }));
}

// --- Parsing de la feuille de match (boxscore) ---
function splitMA(v) {
  const [m, a] = String(v || "0-0").split("-").map((x) => Number(x) || 0);
  return [m, a];
}

function num(v) {
  const n = Number(String(v ?? "").replace("+", ""));
  return Number.isFinite(n) ? n : 0;
}

function parseMinutes(v) {
  if (v == null) return 0;
  const s = String(v);
  if (s.includes(":")) {
    const [m, sec] = s.split(":").map(Number);
    return (m || 0) + (sec || 0) / 60;
  }
  return num(s);
}

// Retourne {eventId, date, teams:[{teamId, home, players:[...]}]} ou null si pas de boxscore.
export function parseBoxscore(sum) {
  const comp = sum?.header?.competitions?.[0];
  const groups = sum?.boxscore?.players;
  if (!comp || !Array.isArray(groups) || groups.length !== 2) return null;
  const homeId = String(comp.competitors?.find((c) => c.homeAway === "home")?.team?.id ?? comp.competitors?.find((c) => c.homeAway === "home")?.id ?? "");
  const out = { eventId: String(sum.header.id), date: comp.date, teams: [] };
  for (const g of groups) {
    const teamId = String(g.team?.id);
    const st = g.statistics?.[0];
    if (!st) return null;
    const labels = (st.labels || st.names || []).map((l) => String(l).toUpperCase());
    const keys = st.keys || [];
    const idx = (lab, key) => {
      let i = labels.indexOf(lab);
      if (i < 0 && key) i = keys.indexOf(key);
      return i;
    };
    const I = {
      min: idx("MIN", "minutes"), pts: idx("PTS", "points"),
      fg: idx("FG", "fieldGoalsMade-fieldGoalsAttempted"),
      fg3: idx("3PT", "threePointFieldGoalsMade-threePointFieldGoalsAttempted"),
      ft: idx("FT", "freeThrowsMade-freeThrowsAttempted"),
      oreb: idx("OREB", "offensiveRebounds"), dreb: idx("DREB", "defensiveRebounds"),
      reb: idx("REB", "rebounds"), ast: idx("AST", "assists"), stl: idx("STL", "steals"),
      blk: idx("BLK", "blocks"), tov: idx("TO", "turnovers"), pf: idx("PF", "fouls"),
    };
    const players = [];
    for (const a of st.athletes || []) {
      const s = a.stats || [];
      if (a.didNotPlay || !s.length) continue;
      const min = parseMinutes(s[I.min]);
      if (!(min > 0)) continue;
      const [fgm, fga] = splitMA(s[I.fg]);
      const [fg3m, fg3a] = splitMA(s[I.fg3]);
      const [ftm, fta] = splitMA(s[I.ft]);
      const oreb = num(s[I.oreb]);
      const dreb = num(s[I.dreb]);
      players.push({
        id: String(a.athlete?.id),
        name: a.athlete?.displayName || a.athlete?.shortName || "",
        pos: a.athlete?.position?.abbreviation || "",
        headshot: a.athlete?.headshot?.href || "",
        start: !!a.starter,
        min: Math.round(min * 10) / 10,
        pts: I.pts >= 0 ? num(s[I.pts]) : 2 * (fgm - fg3m) + 3 * fg3m + ftm,
        fg2m: fgm - fg3m, fg2a: fga - fg3a, fg3m, fg3a, ftm, fta,
        oreb, dreb, reb: I.reb >= 0 ? num(s[I.reb]) : oreb + dreb,
        ast: num(s[I.ast]), stl: num(s[I.stl]), blk: num(s[I.blk]), tov: num(s[I.tov]),
      });
    }
    out.teams.push({ teamId, home: teamId === homeId, players });
  }
  return out;
}

export function parseInjuries(sum) {
  const res = {};
  for (const t of sum?.injuries || []) {
    const id = String(t.team?.id ?? "");
    res[id] = (t.injuries || []).map((i) => ({
      id: String(i.athlete?.id ?? ""),
      name: i.athlete?.displayName || "",
      status: i.status || i.type?.description || "",
      detail: [i.details?.type, i.details?.detail, i.details?.returnDate ? `retour ${i.details.returnDate}` : ""]
        .filter(Boolean).join(" · ") || i.longComment || i.shortComment || "",
    }));
  }
  return res;
}

export function parsePickcenter(sum) {
  const p = sum?.pickcenter?.[0];
  if (!p) return { spread: null, total: null, details: null };
  return { spread: p.spread != null ? Number(p.spread) : null, total: p.overUnder != null ? Number(p.overUnder) : null, details: p.details || null };
}

// Moyennes d'une saison précédente via le game log ESPN (sert d'a priori en début de saison).
export async function priorSeason(athleteId, season) {
  const j = await getJSON(`${WEB}/athletes/${athleteId}/gamelog?season=${season}`, { retries: 1 });
  if (!j) return null;
  const labels = (j.labels || []).map((l) => String(l).toUpperCase());
  const at = (l) => labels.indexOf(l);
  const I = { min: at("MIN"), fg: at("FG"), fg3: at("3PT"), ft: at("FT"), reb: at("REB"), ast: at("AST"), blk: at("BLK"), stl: at("STL"), tov: at("TO"), pts: at("PTS") };
  if (I.min < 0 || I.pts < 0) return null;
  const rows = [];
  for (const st of j.seasonTypes || []) {
    if (!/regular/i.test(st.displayName || "")) continue;
    for (const cat of st.categories || []) {
      for (const e of cat.events || []) {
        const s = e.stats || [];
        const min = parseMinutes(s[I.min]);
        if (!(min > 0)) continue;
        const [fgm, fga] = splitMA(s[I.fg]);
        const [fg3m, fg3a] = splitMA(s[I.fg3]);
        const [ftm, fta] = splitMA(s[I.ft]);
        rows.push({ min, pts: num(s[I.pts]), fg2m: fgm - fg3m, fg2a: fga - fg3a, fg3m, fg3a, ftm, fta, reb: num(s[I.reb]), ast: num(s[I.ast]), stl: num(s[I.stl]), blk: num(s[I.blk]), tov: num(s[I.tov]) });
      }
    }
  }
  return rows.length ? rows : null;
}
