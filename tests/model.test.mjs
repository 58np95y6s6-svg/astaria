import test from "node:test";
import assert from "node:assert/strict";
import { negBin, probLine, project, noVig, kelly, MARKETS } from "../js/model.js";
import { evaluate } from "../js/value.js";

test("loi binomiale négative : somme à 1 et bonne moyenne", () => {
  for (const [mu, phi] of [[24.3, 2], [5.2, 1.5], [0.8, 1.1], [1.7, 1]]) {
    const d = negBin(mu, phi);
    const s = d.reduce((a, b) => a + b, 0);
    const m = d.reduce((a, p, k) => a + p * k, 0);
    assert.ok(Math.abs(s - 1) < 1e-4, `somme ${s}`);
    assert.ok(Math.abs(m - mu) / mu < 0.01, `moyenne ${m} vs ${mu}`);
  }
});

test("probLine gère demi-lignes et lignes entières", () => {
  const d = negBin(10, 1.5);
  const a = probLine(d, 9.5);
  assert.equal(a.push, 0);
  assert.ok(Math.abs(a.over + a.under - 1) < 1e-9);
  const b = probLine(d, 10);
  assert.ok(b.push > 0.05 && Math.abs(b.over + b.under + b.push - 1) < 1e-9);
});

test("no-vig et Kelly", () => {
  const nv = noVig(1.9, 1.9);
  assert.ok(Math.abs(nv.over - 0.5) < 1e-9);
  assert.equal(kelly(0.5, 1.9), 0);
  assert.ok(kelly(0.6, 2.0) > 0 && kelly(0.6, 2.0) <= 0.03);
});

const mkLog = (i, o = {}) => ({ d: `202610${String(10 + i).padStart(2, "0")}`, min: 34, pts: 25, fg2m: 6, fg2a: 12, fg3m: 3, fg3a: 8, ftm: 4, fta: 5, reb: 6, oreb: 1, dreb: 5, ast: 7, stl: 1, blk: 1, tov: 3, ...o });

test("projection : moyenne cohérente et sensible à l'adversaire", () => {
  const logs = Array.from({ length: 12 }, (_, i) => mkLog(i, { pts: 20 + (i % 5) * 2 }));
  const base = project({ logs, factors: {}, pace: { team: 100, opp: 100 }, home: true });
  assert.ok(base.stats.pts.mean > 20 && base.stats.pts.mean < 30, `pts ${base.stats.pts.mean}`);
  assert.ok(Math.abs(base.minutesUsed - 34) < 0.5);
  const soft = project({ logs, factors: { fg3m: 1.2, fg2m: 1.1, ftm: 1.1 }, pace: { team: 100, opp: 104 }, home: true });
  assert.ok(soft.stats.pts.mean > base.stats.pts.mean * 1.08);
  const fewer = project({ logs, factors: {}, pace: { team: 100, opp: 100 }, home: true, minutesOverride: 25 });
  assert.ok(fewer.stats.pts.mean < base.stats.pts.mean * 0.8);
  const pra = base.stats.pra.mean;
  assert.ok(Math.abs(pra - (base.stats.pts.mean + base.stats.reb.mean + base.stats.ast.mean)) < 1e-6);
  for (const k of Object.keys(MARKETS)) assert.ok(base.stats[k].dist.length > 0);
});

test("projection : a priori saison passée en début de saison", () => {
  const prior = Array.from({ length: 60 }, (_, i) => mkLog(i, { pts: 30, min: 36 }));
  const logs = [mkLog(1, { pts: 10, min: 30 })];
  const p = project({ logs, prior, factors: {}, pace: { team: 100, opp: 100 } });
  assert.ok(p.stats.pts.mean > 20, "la saison passée doit dominer avec 1 seul match");
});

test("absents : minutes et usage en hausse", () => {
  const logs = Array.from({ length: 12 }, (_, i) => mkLog(i, { min: 28 }));
  const a = project({ logs, factors: {}, pace: { team: 100, opp: 100 } });
  const b = project({ logs, factors: {}, pace: { team: 100, opp: 100 }, injuries: { sameGroupMissingMin: 32, groupAvailableMin: 70, missingUsage: 20, availableUsage: 80, missingReb: 5, availableReb: 40, names: "X" } });
  assert.ok(b.minutesUsed > a.minutesUsed + 3);
  assert.ok(b.context.usageBoost > 1.05);
});

test("evaluate : value détectée quand la cote dépasse la cote juste", () => {
  const logs = Array.from({ length: 15 }, (_, i) => mkLog(i));
  const p = project({ logs, factors: {}, pace: { team: 100, opp: 100 }, home: true });
  const picks = evaluate("pts", p.stats.pts, [
    { book: "winamax_fr", line: 19.5, over: 1.9, under: 1.9 },
    { book: "pinnacle", line: 19.5, over: 1.35, under: 3.2 },
  ]);
  const best = picks[0];
  assert.equal(best.side, "over");
  assert.equal(best.book, "winamax_fr");
  assert.ok(best.ev > 0.1);
  assert.ok(best.pMarket > 0.6);
});

test("evaluate : paliers (Over seul, sans Under)", () => {
  const logs = Array.from({ length: 15 }, (_, i) => mkLog(i));
  const p = project({ logs, factors: {}, pace: { team: 100, opp: 100 }, home: true });
  const picks = evaluate("pts", p.stats.pts, [
    { book: "winamax_fr", line: 14.5, over: 1.01, under: null },
    { book: "winamax_fr", line: 24.5, over: 2.4, under: null },
  ]);
  assert.equal(picks.length, 2);
  assert.ok(picks.every((x) => x.side === "over" && x.pMarket == null));
  assert.equal(picks[0].line, 24.5, "le palier à 2.40 a plus de value que celui à 1.01");
});
