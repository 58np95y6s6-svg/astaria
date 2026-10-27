// Comparaison modèle ↔ cotes : probabilité, espérance (EV), mise conseillée.
import { MARKETS, probLine, noVig, ev, kelly, blend, hitRate } from "./model.js";

export function normName(s = "") {
  return s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.'’`-]/g, " ")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const BOOK_LABEL = {
  winamax_fr: "Winamax", betclic_fr: "Betclic", betclic: "Betclic", unibet_fr: "Unibet",
  parionssport_fr: "Parions Sport", pmu_fr: "PMU", zebet_fr: "ZEbet",
  pinnacle: "Pinnacle", draftkings: "DraftKings", fanduel: "FanDuel", betmgm: "BetMGM",
  williamhill_us: "Caesars", betrivers: "BetRivers", bovada: "Bovada", manual: "Saisie",
};
export const FR_BOOKS = new Set(["winamax_fr", "betclic_fr", "betclic", "unibet_fr", "parionssport_fr", "pmu_fr", "zebet_fr", "manual"]);
const SHARP_WEIGHT = { pinnacle: 3, draftkings: 1.5, fanduel: 1.5 };

// Consensus de marché sans marge, pondéré (les books "sharp" pèsent plus).
export function marketConsensus(offers, line) {
  let w = 0, s = 0;
  for (const o of offers) {
    if (o.line !== line || o.book === "manual") continue;
    const nv = noVig(o.over, o.under);
    if (!nv) continue;
    const wt = SHARP_WEIGHT[o.book] || 1;
    w += wt; s += wt * nv.over;
  }
  return w ? s / w : null;
}

/**
 * statProj = projection d'une catégorie (model.project().stats[key])
 * offers = [{book, line, over, under}]
 * Retourne un pari par (bookmaker, ligne, côté), trié par EV décroissante.
 */
export function evaluate(key, statProj, offers, { wModel = 0.6 } = {}) {
  const picks = [];
  for (const o of offers) {
    const p = probLine(statProj.dist, o.line);
    const cons = marketConsensus(offers, o.line);
    const hrL10Over = hitRate(statProj.l10Values, o.line, "over");
    const hrSeasonOver = hitRate(statProj.seasonValues, o.line, "over");
    for (const side of ["over", "under"]) {
      const odds = o[side];
      if (!odds || odds <= 1) continue;
      const pModel = p[side];
      const pMarket = cons == null ? null : side === "over" ? cons : 1 - cons;
      // Le consensus est calculé hors remboursement : on le ramène sur la même base que le modèle.
      const pMk = pMarket == null ? null : pMarket * (1 - p.push);
      const pFinal = blend(pModel, pMk, wModel);
      const e = ev(pFinal, odds, p.push);
      picks.push({
        key, label: MARKETS[key]?.label || key, book: o.book, bookLabel: BOOK_LABEL[o.book] || o.book, fr: FR_BOOKS.has(o.book),
        line: o.line, side, odds, pModel, pMarket: pMk, pFinal, push: p.push, ev: e,
        fair: pFinal > 0 ? (1 - p.push) / pFinal : null,
        kelly: kelly(pFinal / (1 - p.push || 1), odds),
        mean: statProj.mean, median: statProj.median,
        hitL10: side === "over" ? hrL10Over : hrL10Over && { hits: hrL10Over.n - hrL10Over.hits - statProj.l10Values.filter((v) => v === o.line).length, n: hrL10Over.n },
        hitSeason: side === "over" ? hrSeasonOver : hrSeasonOver && { hits: hrSeasonOver.n - hrSeasonOver.hits - statProj.seasonValues.filter((v) => v === o.line).length, n: hrSeasonOver.n },
      });
    }
  }
  return picks.sort((a, b) => b.ev - a.ev);
}

// Étiquette d'un pari pour l'affichage.
export function tag(pick) {
  if (pick.ev >= 0.08 && pick.pFinal >= 0.5) return { cls: "great", text: "Value forte" };
  if (pick.ev >= 0.03) return { cls: "good", text: "Value" };
  if (pick.ev >= 0) return { cls: "neutral", text: "Juste" };
  return { cls: "bad", text: "Sans value" };
}
