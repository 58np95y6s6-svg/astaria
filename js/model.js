// Modèle de projection — partagé entre le navigateur et les fonctions serveur.
// Principe : taux par minute (saison, 10 derniers, saison précédente) × minutes projetées
// × facteurs adversaire (ce que l'équipe adverse accorde au poste du joueur) × rythme × contexte.
// Chaque catégorie est ensuite modélisée par une loi binomiale négative (moyenne + dispersion
// observée), ce qui donne une probabilité pour chaque ligne Over/Under.

export const MARKETS = {
  pts: { label: "Points", short: "PTS", phi: 2.0, parts: ["pts"] },
  reb: { label: "Rebonds", short: "REB", phi: 1.5, parts: ["reb"] },
  ast: { label: "Passes décisives", short: "PD", phi: 1.5, parts: ["ast"] },
  fg3m: { label: "Paniers à 3 pts", short: "3PTS", phi: 1.25, parts: ["fg3m"] },
  stl: { label: "Interceptions", short: "INT", phi: 1.1, parts: ["stl"] },
  blk: { label: "Contres", short: "CTR", phi: 1.3, parts: ["blk"] },
  pra: { label: "Pts + Reb + PD", short: "P+R+PD", phi: 2.3, parts: ["pts", "reb", "ast"] },
  pr: { label: "Pts + Reb", short: "P+R", phi: 2.1, parts: ["pts", "reb"] },
  pa: { label: "Pts + PD", short: "P+PD", phi: 2.2, parts: ["pts", "ast"] },
  ra: { label: "Reb + PD", short: "R+PD", phi: 1.6, parts: ["reb", "ast"] },
  sb: { label: "Int + Contres", short: "INT+CTR", phi: 1.25, parts: ["stl", "blk"] },
};

const RATE_KEYS = ["pts", "fg2m", "fg2a", "fg3m", "fg3a", "ftm", "fta", "reb", "ast", "stl", "blk", "tov"];

const sum = (rows, k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
const avg = (rows, k) => (rows.length ? sum(rows, k) / rows.length : 0);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const valueOf = (row, key) => MARKETS[key] ? MARKETS[key].parts.reduce((s, p) => s + (row[p] || 0), 0) : row[key] || 0;

export function averages(rows) {
  const out = { gp: rows.length };
  for (const k of ["min", ...RATE_KEYS, "oreb", "dreb"]) out[k] = avg(rows, k);
  for (const k of Object.keys(MARKETS)) out[k] = rows.length ? rows.reduce((s, r) => s + valueOf(r, k), 0) / rows.length : 0;
  const fga = out.fg2a + out.fg3a;
  out.fgPct = fga ? (out.fg2m + out.fg3m) / fga : 0;
  out.fg3Pct = out.fg3a ? out.fg3m / out.fg3a : 0;
  out.ftPct = out.fta ? out.ftm / out.fta : 0;
  return out;
}

function perMinute(rows) {
  const m = sum(rows, "min");
  const r = {};
  for (const k of RATE_KEYS) r[k] = m > 0 ? sum(rows, k) / m : 0;
  return r;
}

// Répartition des points : à 2 pts, à 3 pts, aux lancers francs.
export function shotProfile(rows) {
  const pts = sum(rows, "pts") || 1;
  return {
    two: (2 * sum(rows, "fg2m")) / pts,
    three: (3 * sum(rows, "fg3m")) / pts,
    ft: sum(rows, "ftm") / pts,
  };
}

/**
 * ctx = {
 *   logs: [...] (saison en cours, ordre chronologique), prior: [...] | null,
 *   factors: {pts, fg2m, fg3m, ftm, reb, ast, stl, blk, ...} (adversaire, par poste),
 *   pace: { team, opp }, home: bool, b2b: bool, spread: number|null (du point de vue de l'équipe du joueur),
 *   injuries: { sameGroupMissingMin, groupAvailableMin, missingUsage, availableUsage, missingReb, availableReb, names },
 *   minutesOverride: number|null
 * }
 */
export function project(ctx) {
  const logs = ctx.logs || [];
  const prior = ctx.prior || [];
  const gp = logs.length;
  if (!gp && !prior.length) return null;
  const l10 = logs.slice(-10);

  // --- Taux par minute ---
  const rSeason = perMinute(logs);
  const rL10 = perMinute(l10);
  const rPrior = prior.length ? perMinute(prior) : null;
  const wPrior = rPrior ? (gp ? 8 / (8 + gp) : 1) : 0;
  const rates = {};
  for (const k of RATE_KEYS) {
    const cur = gp > 10 ? 0.55 * rL10[k] + 0.45 * rSeason[k] : rSeason[k];
    rates[k] = wPrior * (rPrior?.[k] || 0) + (1 - wPrior) * cur;
  }

  // --- Minutes ---
  const mSeason = avg(logs, "min");
  const mL10 = avg(l10, "min");
  const mPrior = prior.length ? avg(prior, "min") : 0;
  const curMin = gp > 10 ? 0.6 * mL10 + 0.4 * mSeason : mSeason;
  const wPm = prior.length ? (gp ? 4 / (4 + gp) : 1) : 0;
  const baseMin = wPm * mPrior + (1 - wPm) * curMin;
  const adj = [];
  let min = baseMin;
  if (ctx.b2b) { const d = -0.03 * min; adj.push({ label: "Back-to-back (joué la veille)", delta: d }); min += d; }
  const sp = Math.abs(ctx.spread ?? 0);
  if (sp >= 10 && baseMin >= 26) {
    const f = clamp(1 - 0.007 * (sp - 8), 0.93, 1);
    const d = (f - 1) * min; adj.push({ label: `Risque de large écart (écart prévu ${sp.toFixed(1)})`, delta: d }); min += d;
  }
  const inj = ctx.injuries || {};
  let usageBoost = 1, rebBoost = 1;
  if (inj.sameGroupMissingMin > 0 && inj.groupAvailableMin > 0) {
    const share = baseMin / inj.groupAvailableMin;
    const d = Math.min(8, inj.sameGroupMissingMin * share * 0.7);
    if (d > 0.2) { adj.push({ label: `Absents au même poste (${inj.names || ""})`, delta: d }); min += d; }
  }
  if (inj.missingUsage > 0 && inj.availableUsage > 0) usageBoost = 1 + Math.min(0.15, 0.4 * (inj.missingUsage / inj.availableUsage));
  if (inj.missingReb > 0 && inj.availableReb > 0) rebBoost = 1 + Math.min(0.12, 0.35 * (inj.missingReb / inj.availableReb));
  min = clamp(min, 0, 42);
  const minutes = { base: baseMin, proj: min, adjustments: adj, season: mSeason, l10: mL10, prior: mPrior };
  const useMin = ctx.minutesOverride != null ? ctx.minutesOverride : min;

  // --- Contexte ---
  const F = ctx.factors || {};
  const f = (k) => clamp(F[k] ?? 1, 0.75, 1.3);
  const paceTeam = ctx.pace?.team || 100;
  const paceOpp = ctx.pace?.opp || paceTeam;
  const pf = clamp((paceTeam + paceOpp) / 2 / paceTeam, 0.93, 1.07);
  const hf = ctx.home ? 1.015 : 0.985;

  const mean = {};
  mean.fg2m = rates.fg2m * useMin * pf * usageBoost * f("fg2m");
  mean.fg3m = rates.fg3m * useMin * pf * usageBoost * f("fg3m");
  mean.ftm = rates.ftm * useMin * pf * usageBoost * f("ftm");
  mean.pts = (2 * mean.fg2m + 3 * mean.fg3m + mean.ftm) * hf;
  mean.reb = rates.reb * useMin * pf * rebBoost * f("reb") * hf;
  mean.ast = rates.ast * useMin * pf * usageBoost * f("ast") * hf;
  mean.stl = rates.stl * useMin * pf * f("stl");
  mean.blk = rates.blk * useMin * pf * f("blk");
  mean.tov = rates.tov * useMin * usageBoost;

  // --- Distributions ---
  const hist = [...prior, ...logs];
  const stats = {};
  for (const [key, m] of Object.entries(MARKETS)) {
    const mu = m.parts.reduce((s, p) => s + mean[p], 0);
    const vals = hist.map((r) => valueOf(r, key));
    const phi = dispersion(vals, m.phi);
    const dist = negBin(mu, phi);
    stats[key] = {
      mean: mu, phi, median: quantile(dist, 0.5), p25: quantile(dist, 0.25), p75: quantile(dist, 0.75),
      dist, season: gp ? logs.reduce((s, r) => s + valueOf(r, key), 0) / gp : null,
      l10: l10.length ? l10.reduce((s, r) => s + valueOf(r, key), 0) / l10.length : null,
      l10Values: l10.map((r) => valueOf(r, key)), seasonValues: logs.map((r) => valueOf(r, key)),
    };
  }
  return {
    minutes, minutesUsed: useMin, rates, mean, stats,
    context: { pace: pf, home: hf, usageBoost, rebBoost, wPrior },
  };
}

function dispersion(vals, def) {
  const n = vals.length;
  if (n < 3) return def;
  const m = vals.reduce((a, b) => a + b, 0) / n;
  if (m <= 0.05) return def;
  const v = vals.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1);
  const obs = v / m;
  return clamp((n * obs + 12 * def) / (n + 12), 1, 5);
}

// Loi binomiale négative (moyenne mu, variance mu*phi). Retourne un tableau de probabilités.
export function negBin(mu, phi) {
  const out = [];
  if (!(mu > 0)) return [1];
  if (phi <= 1.0001) {
    let p = Math.exp(-mu);
    let c = 0;
    for (let k = 0; k < 200; k++) {
      if (k > 0) p = (p * mu) / k;
      out.push(p); c += p;
      if (k > mu && c > 0.99999) break;
    }
    return out;
  }
  const r = mu / (phi - 1);
  const q = 1 - 1 / phi;
  let p = Math.exp(r * Math.log(1 / phi));
  let c = 0;
  for (let k = 0; k < 250; k++) {
    if (k > 0) p = (p * (k - 1 + r) * q) / k;
    out.push(p); c += p;
    if (k > mu && c > 0.99999) break;
  }
  return out;
}

export function quantile(dist, q) {
  let c = 0;
  for (let k = 0; k < dist.length; k++) { c += dist[k]; if (c >= q) return k; }
  return dist.length - 1;
}

// Probabilités pour une ligne (gère les lignes entières avec remboursement).
export function probLine(dist, line) {
  let under = 0, push = 0;
  for (let k = 0; k < dist.length; k++) {
    if (k < line) under += dist[k];
    else if (k === line) push += dist[k];
  }
  const over = Math.max(0, 1 - under - push);
  return { over, under, push };
}

// Probabilité "sans marge" implicite d'un couple de cotes.
export function noVig(overOdds, underOdds) {
  if (!overOdds || !underOdds) return null;
  const a = 1 / overOdds, b = 1 / underOdds;
  return { over: a / (a + b), under: b / (a + b), margin: a + b - 1 };
}

// Espérance d'un pari : p × cote − 1 (remboursement neutre).
export function ev(p, odds, push = 0) {
  return p * odds + push - 1;
}

// Mise conseillée : Kelly fractionné (1/4) plafonné à 3 % de la bankroll.
export function kelly(p, odds, fraction = 0.25, cap = 0.03) {
  const b = odds - 1;
  if (b <= 0) return 0;
  const k = (p * b - (1 - p)) / b;
  return clamp(k * fraction, 0, cap);
}

export function hitRate(values, line, side = "over") {
  if (!values.length) return null;
  const hits = values.filter((v) => (side === "over" ? v > line : v < line)).length;
  return { hits, n: values.length };
}

// Probabilité finale : mélange modèle / marché (consensus sans marge), si le marché est dispo.
export function blend(pModel, pMarket, wModel = 0.6) {
  if (pMarket == null) return pModel;
  return wModel * pModel + (1 - wModel) * pMarket;
}
