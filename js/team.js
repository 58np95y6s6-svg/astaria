// Paris équipe : vainqueur, handicap (écart), total du match, total d'une équipe.
// Modèle : note offensive / défensive par 100 possessions (rétrécie vers la moyenne), rythme,
// avantage du terrain, puis mélange avec l'écart et le total du marché quand ils sont connus.
import { teamPace } from "./factors.js";
import { noVig, ev, kelly, blend } from "./model.js";
import { SHOWN_BOOKS, BOOK_LABEL } from "./value.js";

export const TEAM_MARKETS = {
  ml: "Vainqueur",
  lead: "Gagne ou mène de X pts",
  spread: "Handicap",
  total: "Total du match",
  teamtotal: "Total d'une équipe",
};
const SD = { margin: 12.5, total: 17, team: 11 };
const HOME_EDGE = 1.2; // points ajoutés à l'équipe à domicile (et retirés à l'extérieur)

// Fonction de répartition de la loi normale (approximation d'Abramowitz-Stegun).
export function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

function ratings(core, id) {
  const t = core.teams[id];
  const lgPoss = core.league?.poss || 0;
  const lg = lgPoss ? (core.league.off.pts / lgPoss) * 100 : 112;
  if (!t || !t.poss) return { off: lg, def: lg, lg, n: 0 };
  const allowed = Object.values(t.allowed).reduce((s, g) => s + (g.pts || 0), 0);
  const n = t.games.length;
  const w = n / (n + 8);
  return {
    off: lg + ((t.off.pts / t.poss) * 100 - lg) * w,
    def: lg + ((allowed / t.poss) * 100 - lg) * w,
    lg, n,
  };
}

// Écart et total du marché (ESPN) du point de vue de l'équipe à domicile.
function marketLine(game) {
  let margin = null;
  const m = /([A-Z]{2,4})\s*([-+]?\d+(\.\d+)?)/.exec(game.details || "");
  if (m) {
    const abs = Math.abs(Number(m[2]));
    margin = m[1] === game.home.abbr ? abs : m[1] === game.away.abbr ? -abs : null;
  }
  return { margin, total: Number.isFinite(game.total) ? game.total : null };
}

export function projectGame(core, game) {
  const H = ratings(core, game.home.id), A = ratings(core, game.away.id);
  const pace = (teamPace(core, game.home.id).pace + teamPace(core, game.away.id).pace) / 2;
  const lg = H.lg;
  let ptsH = (pace / 100) * ((H.off * A.def) / lg) + HOME_EDGE;
  let ptsA = (pace / 100) * ((A.off * H.def) / lg) - HOME_EDGE;
  const model = { margin: ptsH - ptsA, total: ptsH + ptsA };
  const mk = marketLine(game);
  // Le marché est très efficace sur l'écart et le total. Le modèle ne pèse qu'en fonction de son
  // échantillon : ≈9 % après 3 matchs, jusqu'à 40 % en pleine saison.
  const n = Math.min(H.n, A.n);
  const wm = 0.4 * (n / (n + 10));
  const margin = mk.margin != null ? wm * model.margin + (1 - wm) * mk.margin : model.margin;
  const total = mk.total != null ? wm * model.total + (1 - wm) * mk.total : model.total;
  ptsH = (total + margin) / 2;
  ptsA = (total - margin) / 2;
  return { ptsH, ptsA, margin, total, model, market: mk, pHome: normCdf(margin / SD.margin), games: n, modelWeight: wm };
}

// Probabilité qu'un pari équipe passe. bet = { market, teamId, side ("over"/"under" pour les totaux), line }.
export function teamProb(proj, game, bet) {
  const isHome = bet.teamId === game.home.id;
  const marginT = isHome ? proj.margin : -proj.margin;
  const ptsT = isHome ? proj.ptsH : proj.ptsA;
  switch (bet.market) {
    case "ml": return normCdf(marginT / SD.margin);
    case "lead": {
      // Victoire OU avance de X points à un moment du match. Mouvement brownien avec dérive :
      // P(perdre après avoir mené de X) = e^(2μX/σ²) · Φ((−2X − μ) / σ).
      const X = Math.abs(Number(bet.line)), s = SD.margin;
      return Math.min(1, normCdf(marginT / s) + Math.exp((2 * marginT * X) / (s * s)) * normCdf((-2 * X - marginT) / s));
    }
    case "spread": return normCdf((marginT + Number(bet.line)) / SD.margin);
    case "total": { const p = normCdf((proj.total - Number(bet.line)) / SD.total); return bet.side === "under" ? 1 - p : p; }
    case "teamtotal": { const p = normCdf((ptsT - Number(bet.line)) / SD.team); return bet.side === "under" ? 1 - p : p; }
    default: return null;
  }
}

// Libellé lisible d'un pari équipe.
export function teamLabel(bet, game) {
  const t = bet.teamId === game?.home?.id ? game.home : bet.teamId === game?.away?.id ? game.away : { abbr: bet.teamAbbr || "" };
  const ln = Number(bet.line);
  switch (bet.market) {
    case "ml": return `${t.abbr} vainqueur`;
    case "lead": return `${t.abbr} gagne ou mène de ${Math.abs(ln)} pts`;
    case "spread": {
      const x = Math.abs(ln);
      return ln > 0 ? `${t.abbr} gagne ou perd de moins de ${x} (+${x})` : ln < 0 ? `${t.abbr} gagne de plus de ${x} (−${x})` : `${t.abbr} handicap 0`;
    }
    case "total": return `Total match ${bet.side === "under" ? "Moins" : "Plus"} de ${ln}`;
    case "teamtotal": return `${t.abbr} ${bet.side === "under" ? "Moins" : "Plus"} de ${ln} pts`;
    default: return bet.market;
  }
}

// Résultat d'un pari équipe à partir du score final.
export function gradeTeam(bet, scoreT, scoreO) {
  const ln = Number(bet.line);
  let diff;
  switch (bet.market) {
    case "ml": diff = scoreT - scoreO; break;
    case "lead": if (scoreT > scoreO) return "won"; return "check"; // a-t-il mené de X ? à vérifier à la main
    case "spread": diff = scoreT + ln - scoreO; break;
    case "total": diff = (scoreT + scoreO - ln) * (bet.side === "under" ? -1 : 1); break;
    case "teamtotal": diff = (scoreT - ln) * (bet.side === "under" ? -1 : 1); break;
    default: return null;
  }
  return diff > 0 ? "won" : diff < 0 ? "lost" : "push";
}

const SHARP = { pinnacle: 3, betfair_ex_eu: 2, draftkings: 1.5, fanduel: 1.5 };

// Identifiant d'une issue, et de son « marché » (les deux issues opposées partagent le même marché).
function outcomeKey(o, game) {
  if (o.market === "ml") return { mk: "ml", side: o.teamId === game.home.id ? "H" : "A" };
  if (o.market === "spread") {
    const homeLine = o.teamId === game.home.id ? o.line : -o.line;
    return { mk: `spread|${homeLine}`, side: o.teamId === game.home.id ? "H" : "A" };
  }
  return { mk: `total|${o.line}`, side: o.side === "under" ? "U" : "O" };
}

/**
 * Évalue les cotes Winamax/Betclic d'un match. offers = sortie de getTeamOdds().offers.
 * Retourne [{ market, teamId, side, line, odds, book, bookLabel, label, pModel, pMarket, pFinal, ev, fair, kelly }] trié par value.
 */
export function evaluateTeam(proj, game, offers, { wModel = 0.5 } = {}) {
  // Consensus sans marge : pour chaque bookmaker ayant les deux issues d'un marché.
  const byBook = new Map();
  for (const o of offers) {
    const { mk, side } = outcomeKey(o, game);
    const k = `${o.book}|${mk}`;
    const r = byBook.get(k) || { book: o.book, mk, sides: {} };
    r.sides[side] = o.odds;
    byBook.set(k, r);
  }
  const cons = new Map(); // `${mk}|${side}` -> { w, s }
  for (const r of byBook.values()) {
    const sides = Object.keys(r.sides);
    if (sides.length !== 2) continue;
    const [a, b] = sides;
    const nv = noVig(r.sides[a], r.sides[b]);
    if (!nv) continue;
    const w = SHARP[r.book] || 1;
    for (const [sd, p] of [[a, nv.over], [b, nv.under]]) {
      const c = cons.get(`${r.mk}|${sd}`) || { w: 0, s: 0 };
      c.w += w; c.s += w * p;
      cons.set(`${r.mk}|${sd}`, c);
    }
  }
  const out = [];
  for (const o of offers) {
    if (!SHOWN_BOOKS.has(o.book) || !(o.odds > 1)) continue;
    const bet = { market: o.market, teamId: o.teamId, side: o.side || null, line: o.line ?? null };
    const pModel = teamProb(proj, game, bet);
    const { mk, side } = outcomeKey(o, game);
    const c = cons.get(`${mk}|${side}`);
    const pMarket = c ? c.s / c.w : null;
    const pFinal = blend(pModel, pMarket, wModel);
    out.push({ ...bet, odds: o.odds, book: o.book, bookLabel: BOOK_LABEL[o.book] || o.book, label: teamLabel(bet, game),
      pModel, pMarket, pFinal, ev: ev(pFinal, o.odds), fair: pFinal > 0 ? 1 / pFinal : null, kelly: kelly(pFinal, o.odds) });
  }
  return out.sort((a, b) => b.ev - a.ev);
}
