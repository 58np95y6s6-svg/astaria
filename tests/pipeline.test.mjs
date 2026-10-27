// Test de bout en bout : script de mise à jour (GitHub Actions) puis code du navigateur,
// avec de fausses réponses ESPN / The Odds API.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installMockFetch } from "./fixtures.mjs";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "astaria-"));
process.env.DATA_DIR = dir;
globalThis.ASTARIA_DATA_BASE = "https://data.test/";
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k), key: (i) => [...store.keys()][i], get length() { return store.size; },
};
Object.defineProperty(globalThis.localStorage, "keys", { value: () => [...store.keys()] });
installMockFetch(dir);

test("pipeline complet", async () => {
  await import("../scripts/update.mjs");
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
  assert.equal(meta.gamesTotal, 3);
  assert.ok(fs.existsSync(path.join(dir, "games/9004.json")), "match à venir préparé");
  assert.ok(fs.existsSync(path.join(dir, "prior/2026/101.json")), "saison précédente préparée");

  const data = await import("../js/data.js");
  const day = await data.getDay("20261027");
  assert.equal(day.games[0].id, "9004");

  const gd = await data.getGameData("9004");
  const bos = await data.teamRoster(gd, gd.game.home.id === "1" ? gd.game.home : gd.game.away);
  assert.equal(bos.length, 3);
  assert.equal(bos[0].gp, 2);
  const lal = await data.teamRoster(gd, gd.game.home);
  assert.equal(lal.find((p) => p.id === "203").status, "Out");

  const ctx = await data.buildContext(gd, "101", "1");
  assert.equal(ctx.logs.length, 2);
  assert.equal(ctx.player.group, "F");
  assert.equal(ctx.prior.length, 40);
  assert.equal(ctx.opp.games, 2);
  assert.equal(ctx.home, false);
  assert.equal(ctx.teamName, "Boston Celtics");

  const { project } = await import("../js/model.js");
  const proj = project(ctx);
  assert.ok(proj.stats.pts.mean > 10);

  const { getGameOdds } = await import("../js/odds.js");
  const o = await getGameOdds(gd.game, "test");
  assert.equal(o.available, true, JSON.stringify(o));
  assert.equal(o.players["jayson tatum"].markets.pts.length, 2);
  const again = await getGameOdds(gd.game, "test");
  assert.equal(again.cached, true, "2e ouverture = cache, pas de crédit consommé");
  assert.equal((await getGameOdds(gd.game, "")).reason, "no_key");

  const { evaluate } = await import("../js/value.js");
  const picks = evaluate("pts", proj.stats.pts, o.players["jayson tatum"].markets.pts);
  assert.equal(picks.length, 2, "seuls Winamax/Betclic sont conseillés (Pinnacle = référence)");
  assert.ok(picks.every((p) => p.book === "winamax_fr"));

  // Projections précalculées par la tâche GitHub + Top value
  assert.ok(fs.existsSync(path.join(dir, "proj/9004.json")), "projections précalculées");
  const picksMod = await import("../js/picks.js");
  const projFile = await picksMod.getProjections("9004");
  assert.ok(projFile.players["101"], "Tatum projeté");
  assert.ok(!projFile.players["203"], "joueur Out exclu");
  const sp = picksMod.statFromProj(projFile.players["101"], "pts");
  assert.ok(Math.abs(sp.mean - proj.stats.pts.mean) < 0.05, `projection identique à l'app (${sp.mean} vs ${proj.stats.pts.mean})`);
  const top = await picksMod.topValue("t", day.games, { oddsKey: "test", wModel: 0.6 });
  assert.ok(top.picks.length > 0 && top.picks[0].player === "Jayson Tatum");
  assert.equal(top.picks[0].book, "winamax_fr");
  const mu = await picksMod.topMatchups("m", day.games);
  assert.equal(mu.mode, "matchups");

  const j = await import("../js/journal.js");
  j.addBet({ eventId: "9002", season: 2027, playerId: "101", player: "Jayson Tatum", market: "pts", side: "over", line: 10.5, odds: 1.9, stake: 2 });
  j.addBet({ eventId: "9002", season: 2027, playerId: "999", player: "DNP Guy", market: "pts", side: "over", line: 0.5, odds: 1.9 });
  const bets = await j.settleAll();
  assert.equal(bets.find((b) => b.playerId === "101").status, "won");
  assert.equal(bets.find((b) => b.playerId === "999").status, "void");
  // Pari libre : retrouvé par le nom du joueur et la date
  j.addBet({ eventId: "manual", season: 0, gameDate: "20261024", playerId: "manual", player: "jayson tatum", market: "pts", side: "under", line: 99.5, odds: 1.8 });
  const b2 = await j.settleAll();
  const free = b2.find((b) => b.line === 99.5);
  assert.equal(free.status, "won");
  assert.equal(free.eventId, "9002");

  // Combiné : cote = produit, règlement par sélection, défaire
  const a1 = j.addBet({ eventId: "9002", season: 2027, playerId: "101", player: "Jayson Tatum", market: "pts", side: "over", line: 5.5, odds: 1.5, pFinal: 0.8 });
  const a2 = j.addBet({ eventId: "9002", season: 2027, playerId: "999", player: "DNP Guy", market: "pts", side: "over", line: 0.5, odds: 2 });
  const combo = j.createCombo([a1.id, a2.id], 10);
  assert.equal(combo.odds, 3);
  assert.equal(combo.legs.length, 2);
  const b3 = await j.settleAll();
  const c3 = b3.find((b) => b.id === combo.id);
  assert.equal(c3.status, "won", "Tatum gagné + DNP remboursé → gagné");
  assert.equal(c3.odds, 1.5, "la sélection remboursée compte pour 1");
  assert.deepEqual(j.comboOutcome([{ status: "won", odds: 2 }, { status: "lost", odds: 2 }]).status, "lost");
  const a3 = j.addBet({ eventId: "9999", season: 2027, playerId: "101", player: "X", market: "pts", side: "over", line: 1, odds: 1.8 });
  const a4 = j.addBet({ eventId: "9999", season: 2027, playerId: "102", player: "Y", market: "pts", side: "over", line: 1, odds: 1.9 });
  const c4 = j.createCombo([a3.id, a4.id], 5);
  j.splitCombo(c4.id);
  const b4 = j.loadBets();
  assert.ok(!b4.some((b) => b.id === c4.id) && b4.filter((b) => b.player === "X" || b.player === "Y").length === 2);
});
